import { describe,expect,it } from 'vitest';
import { TYPE_JACOBIAN_BOUND,TYPE_MAX_PULL,TYPE_RADIUS,TYPE_GLAZE_LIGHT_WIDTH,typeDeformation,typeMap,typeWaveWeight,smoothTypeProfile,polishType,typeGlazeReflection } from './material-type.js';
import { enamelProfile } from './enamel-profile.js';

function circularProfile(height:number){
	const coverage=new Uint8Array(height*height);
	for(let y=0;y<height;y++)for(let x=0;x<height;x++)coverage[y*height+x]=Math.max(0,Math.min(255,Math.round((height*.37-Math.hypot(x-height/2+.5,y-height/2+.5)+.5)*255)));
	return enamelProfile(coverage,height,height);
}
describe('bounded material-space typography',()=>{
	it('keeps native profile and reconstructed-normal bytes identical during setup optimization',async()=>{
		const sha=async(data:Uint8Array<ArrayBuffer>)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),byte=>byte.toString(16).padStart(2,'0')).join('');
		// Pre-optimization SHA-256 fixtures: thin/border, fractional rectangles,
		// partial coverage, counters and a component-scale native raster.
		const cases:[number,number,string,string][]=[
			[1,13,'c5cd26fffcf2121b8ba68130fce14aaca1c546b51cc09bf07eb5e48c5f7060dd','4bf7ccdad87383f0ea7ba7fea3d4082296eca9679092416505355c8b6f4b6098'],
			[37,29,'d03e0c51914f9d06da9c2b11b50358393c369f049ab7de656d9cd8001f708280','fece903bbab9f9e4e24d57c24588126ccc75b672bd1692d7bcc2e350e59e7bfd'],
			[257,193,'eabb93ddbee1b9cdfb86d58594922243f8192d7feb1e0a8186b93fa7e3c0bea1','80ca69f848a3d8f253dfac78c2a379c74bd62149941ffff6859709c512829fb0'],
			[1261,782,'4dfb378e08ae58c3aa299a9a2606d0c4033f8d09fb9b44dfe10e794d2e458698','e08f6db7ba45ecfe708730b7719345274e9e54c7098b1c5426054f78d41bc694']
		];
		for(const [width,height,rawHash,normalHash] of cases){
			const coverage=new Uint8Array(width*height);
			for(let y=0;y<height;y++)for(let x=0;x<width;x++){
				const covered=width===1||(x>width/9&&x<width*8/9&&y>height/11&&y<height*10/11&&(x<width*.4||y<height*.35||y>height*.7));
				coverage[y*width+x]=covered?(x%13===0&&y%17===0?127:255):0;
			}
			const profile=enamelProfile(coverage,width,height);
			expect(await sha(profile.data)).toBe(rawHash);
			smoothTypeProfile(profile);expect(await sha(profile.data)).toBe(normalHash);
		}
	});
	it('stores bounded polishing exposure independent of straight-stroke event subdivision',()=>{
		const one=new Float32Array(96*64),many=new Float32Array(one.length);
		expect(polishType(one,[.1,.5],[.9,.5],1.8)).toBe(true);
		for(let i=0;i<16;i++)polishType(many,[.1+.8*i/16,.5],[.1+.8*(i+1)/16,.5],1.8);
		let maxDifference=0,maximum=0,minimum=1;for(let i=0;i<one.length;i++){maxDifference=Math.max(maxDifference,Math.abs(one[i]-many[i]));maximum=Math.max(maximum,one[i]);minimum=Math.min(minimum,one[i]);}
		expect(maxDifference).toBeLessThan(1e-6);expect(maximum).toBeGreaterThan(.99);expect(maximum).toBeLessThanOrEqual(1);expect(minimum).toBe(0);
		const before=one.slice();expect(polishType(one,[.9,.5],[.9,.5],1.8)).toBe(false);expect(one).toEqual(before);
	});
	it('redistributes reflected light with roughness instead of multiplying a painted brightness mask',()=>{
		const expected=TYPE_GLAZE_LIGHT_WIDTH*Math.sqrt(Math.PI);
		for(const roughness of [.045,.2,.44]){
			let integral=0;const dx=.001;for(let x=-3;x<3;x+=dx)integral+=typeGlazeReflection(x+dx/2,roughness)*dx;
			expect(integral).toBeCloseTo(expected,8);
		}
		expect(typeGlazeReflection(-.025,.045)).toBeGreaterThan(typeGlazeReflection(-.025,.44)*4);
		expect(typeGlazeReflection(.5,.045)).toBeLessThan(typeGlazeReflection(.5,.44)*.01);
	});
	it('reconstructs bevel slopes at a material-space width without altering native coverage or height',()=>{
		const width=768,height=768,profile=circularProfile(height),original=profile.data.slice();
		const roughness=(data:Uint8Array)=>{
			let sum=0,count=0;
			for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++){
				const depth=height*.37-Math.hypot(x-width/2+.5,y-height/2+.5);
				if(depth<height*.015 || depth>height*.036)continue;
				for(let c=0;c<2;c++){const i=(y*width+x)*4+c;sum+=(data[i-4]-2*data[i]+data[i+4])**2+(data[i-width*4]-2*data[i]+data[i+width*4])**2;count++;}
			}
			return sum/count;
		};
		smoothTypeProfile(profile);
		expect(roughness(profile.data)).toBeLessThan(roughness(original)*.7);
		let exact=true;for(let i=0;i<width*height;i++)exact&&=profile.data[i*4+2]===original[i*4+2]&&profile.data[i*4+3]===original[i*4+3];
		expect(exact).toBe(true);
	});
	it('keeps matched material-space slopes consistent from 1× to 3× native profiles',()=>{
		const low=circularProfile(256),high=circularProfile(768);
		function difference(){
			let sum=0,max=0,count=0;
			for(let y=1;y<255;y++)for(let x=1;x<255;x++){
				const depth=256*.37-Math.hypot(x-128+.5,y-128+.5);
				if(depth<256*.015||depth>256*.036)continue;
				for(let c=0;c<2;c++){const error=Math.abs(low.data[(y*256+x)*4+c]-high.data[((y*3+1)*768+x*3+1)*4+c]);sum+=error;max=Math.max(max,error);count++;}
			}
			return {mean:sum/count,max};
		}
		const raw=difference();smoothTypeProfile(low);smoothTypeProfile(high);const filtered=difference();
		expect(filtered.mean).toBeLessThan(raw.mean*.8);
		expect(filtered.mean).toBeLessThan(1);expect(filtered.max).toBeLessThanOrEqual(4);
	});
	it('bounds the Jacobian over the entire Gaussian support, not just a tested grid',()=>{
		// max_r r exp(-r²/(2σ²))/σ² = 1/(σ√e), attained at r=σ.
		expect(TYPE_JACOBIAN_BOUND).toBe(TYPE_MAX_PULL/(TYPE_RADIUS*Math.sqrt(Math.E)));
		expect(TYPE_JACOBIAN_BOUND).toBeLessThan(0.24);
		const state=typeDeformation();state.pull=[TYPE_MAX_PULL,0];
		const worst=typeMap(0.5-TYPE_RADIUS,0.5,1,state).jacobian;
		expect(worst[0]).toBeCloseTo(1-TYPE_JACOBIAN_BOUND,10);
		expect(worst[0]*worst[3]-worst[1]*worst[2]).toBeGreaterThan(0.76);
	});
	it('matches the analytic inverse-map Jacobian to finite differences',()=>{
		const state=typeDeformation();state.anchor=[0.42,0.54];state.pull=[0.08,-0.045];
		const aspect=1.83,epsilon=1e-5;
		for(const [x,y] of [[0.2,0.4],[0.44,0.55],[0.7,0.62]]){
			const center=typeMap(x,y,aspect,state),a=typeMap(x+epsilon/aspect,y,aspect,state),b=typeMap(x-epsilon/aspect,y,aspect,state),c=typeMap(x,y+epsilon,aspect,state),d=typeMap(x,y-epsilon,aspect,state);
			expect((a.u-b.u)/(2*epsilon)).toBeCloseTo(center.jacobian[0],7);expect((c.u-d.u)/(2*epsilon)).toBeCloseTo(center.jacobian[1],7);
			expect((a.v-b.v)/(2*epsilon)).toBeCloseTo(center.jacobian[2],7);expect((c.v-d.v)/(2*epsilon)).toBeCloseTo(center.jacobian[3],7);
		}
	});
	it('returns exactly to original material coordinates with no deformation',()=>{
		const state=typeDeformation();
		for(const [x,y] of [[0.1,0.2],[0.7,0.9]]){const mapped=typeMap(x,y,1.7,state);expect(mapped.u).toBe(x*1.7);expect(mapped.v).toBe(y);expect(mapped.jacobian.map(value=>value+0)).toEqual([1,0,0,1]);}
	});
	it('separates strain-dependent material spectrum from physical pixel filtering',()=>{
		const identity=[1,0,0,1];
		expect(typeWaveWeight(1200,0,identity,128,128,1)).toBe(0);
		expect(typeWaveWeight(1200,0,identity,2048,2048,1)).toBeGreaterThan(0.9);
		const atRest=typeWaveWeight(2280,0,identity,4096,4096,1);
		const compressed=typeWaveWeight(2280,0,[1.2,0,0,1],4096,4096,1);
		expect(atRest).toBeGreaterThan(0.1);expect(compressed).toBe(0);
	});
});
