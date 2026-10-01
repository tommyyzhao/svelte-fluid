/** Illustrative supercooled MELT growth, not vapor snow or calibrated ice.
 * Kobayashi1993 Eq3/5: https://doi.org/10.1016/0167-2789(93)90120-P
 * Executable reference: https://pages.nist.gov/fipy/en/stable/generated/examples.phase.anisotropy.html
 * Gradient energy f(g)=epsilon² a(theta)² |g|²/2; q=df/dg.
 * We approximate div(q)=D²f(g):Hessian(phi) with a positive9-point stencil.
 * This is NOT a discrete variational/conservative phase operator and carries
 * no unconditional free-energy theorem. Heat diffusion IS conservative; its
 * actual L*deltaPhase coupling conserves sealed enthalpy T-L*phi.
 */
export const DENDRITE_SIZE=192;
export const DENDRITE_EPSILON=.003352272552;
export const DENDRITE_TAU=.009;
export const DENDRITE_DIFFUSIVITY=3*DENDRITE_EPSILON**2/DENDRITE_TAU;
export const DENDRITE_LATENT=1;
export const DENDRITE_COLD=-.5;
export const DENDRITE_ANISOTROPY=.02;
export const DENDRITE_TIME_SCALE=.54;
/** One immutable GPU microstep; four per120Hz update. A CPU remainder absorbs
 * arbitrary caller intervals, so queued steps never borrow a later uniform dt. */
export const DENDRITE_STEP=DENDRITE_TIME_SCALE/480;
export interface DendriteOptions { anisotropy:number; angle:number }
export const dendriteOptions=():DendriteOptions=>({anisotropy:DENDRITE_ANISOTROPY,angle:0});
export function validateDendriteOptions(options:DendriteOptions){
	if(!Number.isFinite(options.anisotropy)||options.anisotropy<0||options.anisotropy>DENDRITE_ANISOTROPY||!Number.isFinite(options.angle)||Math.abs(options.angle)>2*Math.PI)throw new Error('Dendrite surface energy must stay in the positive-stiffness regime with an angle in[-2pi,2pi].');
}
/** Surface stiffness a+a''=1-35delta*cos6theta >=.3. Positive stiffness alone
 * does not ensure the rotated9-point coefficients are positive. With
 * a in[.98,1.02], |a'|<=.12 and |d=a'^2+a*a''|<=.7488, their uniform bound is
 * amin²-dmax/2-sqrt(dmax²+4amax²aprimeMax²)/sqrt2 >.0289.
 * Total neighbor weight<=2trace(A)<=5.688<6 (epsilon² factored out).
 */
export function dendriteWeightLowerBound(){
	const aMin=.98,aMax=1.02,bMax=.12,dMax=bMax*bMax+aMax*.72;
	return aMin*aMin-dMax/2-Math.sqrt(dMax*dMax+4*aMax*aMax*bMax*bMax)/Math.SQRT2;
}
export function dendriteMaxStep(size:number){
	if(!Number.isInteger(size)||size<32||size>384)throw new Error('Dendrite grid must be an integer from32 to384.');
	// Reaction is bounded by .95*phase and .95*(1-phase), since |bias|<.45.
	return .8/Math.max((6*DENDRITE_EPSILON**2*size*size+.95)/DENDRITE_TAU,4*DENDRITE_DIFFUSIVITY*size*size);
}
export function dendriteSubsteps(dt:number,size=DENDRITE_SIZE){
	if(!Number.isFinite(dt)||dt<=0||dt>.1)throw new Error('Dendrite frame dt must lie in(0,.1].');
	return Math.ceil(dt*DENDRITE_TIME_SCALE/Math.min(DENDRITE_STEP,dendriteMaxStep(size)));
}
/** Normal/tangent Hessian B=[[a²,aa'],[aa',a²+a'²+aa'']]. Return rotated
 * diagonal weights and the signed diagonal-pair weight, epsilon² excluded.
 * Polynomial cos/sin6 avoids atan2 and signed-base pow portability traps.
 */
export function dendriteWeights(gx:number,gy:number,options:DendriteOptions):[number,number,number]{
	const length2=gx*gx+gy*gy;if(length2<1e-24||options.anisotropy===0)return[1,1,0];
	const inv=1/Math.sqrt(length2),c=gx*inv,s=gy*inv,c2=c*c-s*s,s2=2*c*s,c3=c2*c-s2*s,s3=s2*c+c2*s;
	const cos6=c3*c3-s3*s3,sin6=2*c3*s3,ca=Math.cos(6*options.angle),sa=Math.sin(6*options.angle);
	const C=cos6*ca+sin6*sa,S=sin6*ca-cos6*sa,a=1+options.anisotropy*C,b=-6*options.anisotropy*S,bb=-36*options.anisotropy*C;
	const bnn=a*a,bnt=a*b,btt=a*a+b*b+a*bb,axx=bnn*c*c-2*bnt*c*s+btt*s*s,ayy=bnn*s*s+2*bnt*c*s+btt*c*c,axy=(bnn-btt)*c*s+bnt*(c*c-s*s);
	return[axx-Math.abs(axy),ayy-Math.abs(axy),axy];
}
export interface DendriteCpu {size:number;cells:Float64Array;scratch:Float64Array}
export function createDendriteCpu(size=DENDRITE_SIZE,seeded=true):DendriteCpu{
	dendriteMaxStep(size);const cells=new Float64Array(size*size*2);
	for(let y=0;y<size;y++)for(let x=0;x<size;x++){
		const i=2*(y*size+x),radius=Math.hypot((x+.5)/size-.5,(y+.5)/size-.5);
		cells[i]=seeded?1/(1+Math.exp((radius-.025)/(Math.SQRT2*DENDRITE_EPSILON))):0;cells[i+1]=DENDRITE_COLD;
	}return{size,cells,scratch:new Float64Array(cells.length)};
}
export function advanceDendriteCpu(state:DendriteCpu,h:number,options=dendriteOptions()){
	validateDendriteOptions(options);if(!Number.isFinite(h)||h<=0||h>dendriteMaxStep(state.size)*1.000001)throw new Error('Dendrite step exceeds its positivity bound.');
	const n=state.size,source=state.cells,target=state.scratch,phaseRate=DENDRITE_EPSILON**2*n*n/DENDRITE_TAU,heatRate=DENDRITE_DIFFUSIVITY*n*n;
	for(let y=0;y<n;y++)for(let x=0;x<n;x++){
		const xm=Math.max(0,x-1),xp=Math.min(n-1,x+1),ym=Math.max(0,y-1),yp=Math.min(n-1,y+1),i=2*(y*n+x),l=2*(y*n+xm),r=2*(y*n+xp),u=2*(ym*n+x),d=2*(yp*n+x);
		const p=source[i],T=source[i+1],[wx,wy,diagonal]=dendriteWeights(source[r]-source[l],source[d]-source[u],options);
		const diagonalSum=diagonal>=0?source[2*(ym*n+xm)]+source[2*(yp*n+xp)]:source[2*(ym*n+xp)]+source[2*(yp*n+xm)];
		const lap=wx*(source[l]+source[r]-2*p)+wy*(source[u]+source[d]-2*p)+Math.abs(diagonal)*(diagonalSum-2*p),bias=-.9/Math.PI*Math.atan(20*T);
		const phase=p+h*(phaseRate*lap+p*(1-p)*(p-.5+bias)/DENDRITE_TAU);
		target[i]=phase;target[i+1]=T+h*heatRate*(source[l+1]+source[r+1]+source[u+1]+source[d+1]-4*T)+DENDRITE_LATENT*(phase-p);
	}state.cells=target;state.scratch=source;
}
export function dendriteTotals(cells:ArrayLike<number>){
	let phase=0,heat=0,enthalpy=0,min=Infinity,max=-Infinity,finite=true,checksum=0,area=0;
	for(let i=0;i<cells.length;i+=2){const p=cells[i],t=cells[i+1];phase+=p;heat+=t;enthalpy+=t-DENDRITE_LATENT*p;min=Math.min(min,p);max=Math.max(max,p);finite&&=Number.isFinite(p)&&Number.isFinite(t);checksum+=p*((i%127)+1)+t*((i%61)+1);area+=Number(p>=.5);}
	const count=cells.length/2;return{phase:phase/count,heat:heat/count,enthalpy:enthalpy/count,min,max,finite,checksum,area:area/count};
}
