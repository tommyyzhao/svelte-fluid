// Route-local GLSL only. MAC packing/sampling matches the verified ADR 0121 operators.
const common = `
precision highp float;
precision highp sampler2D;
varying vec2 vUv;
uniform sampler2D uFaces;
uniform sampler2D uPressure;
uniform sampler2D uApertures;
uniform sampler2D uColumns;
uniform vec2 uSize;
vec2 upack(vec2 q){return vec2(q.x<.5?uSize.x:q.x-1.,q.y);}
vec2 vpack(vec2 q){return vec2(q.x,q.y<.5?uSize.y:q.y-1.);}
vec2 uvface(vec2 q){return(q+.5)/(uSize+1.);}
float faceU(vec2 q){return texture2D(uFaces,uvface(upack(q))).r;}
float faceV(vec2 q){return texture2D(uFaces,uvface(vpack(q))).g;}
float component(vec2 q,int c){
 q=clamp(q,vec2(0),c==0?vec2(uSize.x,uSize.y-1.):vec2(uSize.x-1.,uSize.y));
 return c==0?faceU(q):faceV(q);
}
float sampleComponent(vec2 p,int c){
 vec2 q=p-(c==0?vec2(0,.5):vec2(.5,0)),b=floor(q),f=fract(q);
 return mix(mix(component(b,c),component(b+vec2(1,0),c),f.x),mix(component(b+vec2(0,1),c),component(b+vec2(1,1),c),f.x),f.y);
}
vec2 velocity(vec2 p){return vec2(sampleComponent(p,0),sampleComponent(p,1));}
`;

export const columnsShader =
	common +
	`
void main(){
 float x=floor(vUv.x*(uSize.x+1.)),sum=0.,maximum=0.,qmax=0.,invalid=0.;
 for(int y=0;y<512;y++){
  if(float(y)>=uSize.y)break;
  float u=faceU(vec2(x,float(y))),v=faceV(vec2(min(x,uSize.x-1.),float(y)));
  float q=texture2D(uPressure,(vec2(min(x,uSize.x-1.),float(y))+.5)/uSize).r;
  sum+=u; maximum=max(maximum,max(abs(u),abs(v)));qmax=max(qmax,abs(q));
  if(!(abs(u)<1.e30&&abs(v)<1.e30&&abs(q)<1.e30))invalid=1.;
 }
 gl_FragColor=vec4(sum,maximum,qmax,invalid);
}`;

export const spongeShader =
	common +
	`
uniform float uWidth;
uniform float dt;
uniform float uRate;
void main(){
 vec2 i=floor(vUv*(uSize+1.));
 float ux=i.x>uSize.x-.5?0.:i.x+1.;
 float du=min(ux,uSize.x-ux),dv=min(i.x+.5,uSize.x-i.x-.5);
 float au=exp(-dt*uRate*pow(max(0.,1.-du/uWidth),2.));
 float av=exp(-dt*uRate*pow(max(0.,1.-dv/uWidth),2.));
 float mean=texture2D(uColumns,vec2((ux+.5)/(uSize.x+1.),.5)).r/uSize.y;
 vec2 value=texture2D(uFaces,vUv).rg;
 gl_FragColor=vec4(vec2(mean+(value.r-mean)*au,value.g*av)*texture2D(uApertures,vUv).rg,0,1);
}`;

export const edgeShader =
	common +
	`
uniform float uDirection;
void main(){
 float x=vUv.x<.5?0.:uSize.x,sign=vUv.x<.5?-1.:1.;
 float incoming=0.,outgoing=0.,backflow=0.,volume=0.;
 for(int y=0;y<512;y++){
  if(float(y)>=uSize.y)break;
  vec2 p=vec2(x,float(y)+.5);float u=faceU(vec2(x,float(y))),v=sampleComponent(p,1);
  float ke=sign*u*.5*(u*u+v*v);
  incoming+=max(0.,-ke);outgoing+=max(0.,ke);
  if(sign*uDirection>0.){backflow+=max(0.,-ke);volume+=max(0.,-sign*u);}
 }
 gl_FragColor=vec4(incoming,outgoing,backflow,volume);
}`;

export const explicitViscosityShader =
	common +
	`
uniform float uAlpha;
float aperture(vec2 q,int c){return c==0?texture2D(uApertures,uvface(upack(q))).r:texture2D(uApertures,uvface(vpack(q))).g;}
float neighbor(vec2 q,vec2 o,int c,float center){
 vec2 n=q+o,limit=c==0?vec2(uSize.x,uSize.y-1.):vec2(uSize.x-1.,uSize.y);
 bool tangent=c==0?abs(o.y)>.5:abs(o.x)>.5;
 if(any(lessThan(n,vec2(0)))||any(greaterThan(n,limit)))return tangent?-center:center;
 if(aperture(n,c)<.5)return tangent?-center:0.;
 return component(n,c);
}
float diffuse(vec2 q,int c){
 float center=component(q,c);
 float sum=neighbor(q,vec2(-1,0),c,center)+neighbor(q,vec2(1,0),c,center)+neighbor(q,vec2(0,-1),c,center)+neighbor(q,vec2(0,1),c,center);
 return center+uAlpha*(sum-4.*center);
}
void main(){
 vec2 i=floor(vUv*(uSize+1.));
 vec2 qu=vec2(i.x>uSize.x-.5?0.:i.x+1.,i.y),qv=vec2(i.x,i.y>uSize.y-.5?0.:i.y+1.);
 gl_FragColor=vec4(vec2(diffuse(qu,0),diffuse(qv,1))*texture2D(uApertures,vUv).rg,0,1);
}`;

export const disturbanceShader =
	common +
	`
uniform float dt;
uniform float uNoiseTime;
uniform float uNoiseTau;
uniform float uNoiseScale;
uniform float uNoiseAcceleration;
uniform float uNoiseCenter;
uniform float uNoiseHalfWidth;
uniform float uSeed;
float random(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453123)*2.-1.;}
vec2 noise(vec2 p,float t){
 vec2 b=floor(p),f=fract(p);f=f*f*(3.-2.*f);
 float a=mix(mix(random(vec3(b,t)),random(vec3(b+vec2(1,0),t)),f.x),mix(random(vec3(b+vec2(0,1),t)),random(vec3(b+vec2(1,1),t)),f.x),f.y);
 float c=mix(mix(random(vec3(b,t+193.)),random(vec3(b+vec2(1,0),t+193.)),f.x),mix(random(vec3(b+vec2(0,1),t+193.)),random(vec3(b+vec2(1,1),t+193.)),f.x),f.y);
 return vec2(a,c)*2.12;
}
vec2 kick(vec2 p){
 float r=abs(p.x-uNoiseCenter)/uNoiseHalfWidth;
 float envelope=r<1.?pow(cos(r*1.57079632679),2.):0.;
 float t=uNoiseTime/uNoiseTau,b=floor(t),f=fract(t);f=f*f*(3.-2.*f);
 return mix(noise(p/uNoiseScale,b+uSeed),noise(p/uNoiseScale,b+uSeed+1.),f)*envelope*uNoiseAcceleration*dt;
}
void main(){
 vec2 i=floor(vUv*(uSize+1.));
 vec2 pu=vec2(i.x>uSize.x-.5?0.:i.x+1.,i.y+.5),pv=vec2(i.x+.5,i.y>uSize.y-.5?0.:i.y+1.);
 vec2 delta=vec2(kick(pu).x,kick(pv).y);
 gl_FragColor=vec4((texture2D(uFaces,vUv).rg+delta)*texture2D(uApertures,vUv).rg,0,1);
}`;

export const dyeShader =
	common +
	`
uniform sampler2D uDye;
uniform sampler2D uPhiHat;
uniform sampler2D uDyeMask;
uniform vec2 uDyeSize;
uniform float dt;
uniform float uCorrection;
uniform float uDirection;
uniform float uSourceX;
uniform float uSourceY;
uniform float uFilamentWidth;
uniform float uFilamentSpacing;
uniform float uCarrierConcentration;
vec3 at(sampler2D s,vec2 q){return texture2D(s,(clamp(q,vec2(0),uDyeSize-1.)+.5)/uDyeSize).rgb;}
vec3 sampleDye(sampler2D s,vec2 p){
 vec2 q=p*uDyeSize/uSize-.5,b=floor(q),f=fract(q);
 return mix(mix(at(s,b),at(s,b+vec2(1,0)),f.x),mix(at(s,b+vec2(0,1)),at(s,b+vec2(1,1)),f.x),f.y);
}
void main(){
 if(texture2D(uDyeMask,vUv).r<.5){gl_FragColor=vec4(0);return;}
 vec2 p=vUv*uSize,vel=velocity(p),departure=p-dt*vel;
 vec3 value=sampleDye(uDye,departure);
 if(uCorrection>.5){
  vec2 arrival=p+dt*vel;
  vec3 corrected=sampleDye(uPhiHat,p)+.5*(sampleDye(uDye,p)-sampleDye(uPhiHat,arrival));
  vec2 b=floor(departure*uDyeSize/uSize-.5);
  vec3 a=at(uDye,b),c=at(uDye,b+vec2(1,0)),d=at(uDye,b+vec2(0,1)),e=at(uDye,b+vec2(1,1));
  value=clamp(corrected,min(min(a,c),min(d,e)),max(max(a,c),max(d,e)));
 }
 // Fixed composition, not additive dye. Carrier fills incoming reservoir water.
 if((uDirection>0.&&p.x<1.)||(uDirection<0.&&p.x>uSize.x-1.))value=vec3(0,0,uCarrierConcentration);
 if(abs(p.x-uSourceX)<.5){
  float blue=step(abs(p.y-uSourceY+uFilamentSpacing*.5),uFilamentWidth*.5);
  float green=step(abs(p.y-uSourceY-uFilamentSpacing*.5),uFilamentWidth*.5);
  value=vec3(blue,green,uCarrierConcentration);
 }
 gl_FragColor=vec4(clamp(value,vec3(0),vec3(1,1,uCarrierConcentration)),1);
}`;

export const displayShader = `
precision highp float;
precision highp sampler2D;
varying vec2 vUv;
uniform sampler2D uDye;
uniform sampler2D uPlate;
uniform vec2 uSize;
uniform float uOffset;
uniform float uValveWidth;
uniform vec3 uBlue;
uniform vec3 uGreen;
uniform vec3 uCarrier;
vec3 srgb(vec3 x){return mix(12.92*x,1.055*pow(x,vec3(1./2.4))-.055,step(vec3(.0031308),x));}
void main(){
 vec4 plate=texture2D(uPlate,vUv);
 vec2 uv=vec2((uOffset+vUv.x*uValveWidth)/uSize.x,vUv.y);
 vec3 c=texture2D(uDye,uv).rgb;
 vec3 transmitted=srgb(exp(-(uBlue*c.r+uGreen*c.g+uCarrier*c.b)));
 gl_FragColor=vec4(mix(plate.rgb,transmitted,plate.a),1);
}`;

export const tracerTriangleVertex = `#version 300 es
out vec2 vUv;
void main(){
 vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));
 vUv=p;gl_Position=vec4(p*2.-1.,0,1);
}`;

const tracerWalls = `
uniform sampler2D uDyeMask;
uniform float uScale;
bool wet(vec2 p){
 return all(greaterThanEqual(p,vec2(0)))&&all(lessThan(p,uSize))&&texture(uDyeMask,p/uSize).r>.5;
}
// Exact mask-cell traversal, including corners; no endpoint-only tunnelling.
bool segment(vec2 a,vec2 b){
 vec2 q=a*uScale,r=b*uScale,d=r-q,c=floor(q),end=floor(r),stepper=sign(d);
 vec2 delta=1./max(abs(d),vec2(1.e-20));
 vec2 t=mix(q-c,c+1.-q,step(vec2(0),d))*delta;
 for(int k=0;k<12;k++){
  if(!wet((c+.5)/uScale))return false;
  if(all(equal(c,end)))return true;
  if(t.x<t.y){c.x+=stepper.x;t.x+=delta.x;}
  else {c.y+=stepper.y;t.y+=delta.y;}
 }
 return false;
}
`;

interface TracerShaderConstants {
	capacity: number;
	textureWidth: number;
	rate: number;
	maxTravel: number;
	substepTravel: number;
	maxSubsteps: number;
}
const glslFloat = (n: number) =>
	Number.isInteger(n) && !String(n).includes('e') ? `${n}.` : String(n);

export const tracerUpdateShader = (c: TracerShaderConstants) => `#version 300 es
${common
	.replace('varying vec2 vUv;', 'in vec2 vUv;')
	.replaceAll('texture2D', 'texture')}
${tracerWalls}
uniform sampler2D uState;
out vec4 result;
uniform float dt;
uniform int uStart;
uniform int uCount;
uniform int uSerial;
uniform vec4 uSource;
uniform float uDirection;
void main(){
 ivec2 ij=ivec2(gl_FragCoord.xy);int id=ij.y*${c.textureWidth}+ij.x;
 vec4 state=texelFetch(uState,ij,0);
 int relative=(id-uStart+${c.capacity})%${c.capacity};
 float duration=dt;
 if(relative<uCount){
  int serial=uSerial+relative;
  float species=(serial%2)==0?-1.:1.;
  float across=fract((float(serial/2)+.5)*.61803398875)-.5;
  state=vec4(uSource.x,uSource.y+species*uSource.w*.5+across*uSource.z,0,species);
  float incoming=max(0.,uDirection*velocity(state.xy).x);
  state.z=incoming*uSource.z*2./${glslFloat(c.rate)};
  duration=dt*(1.-(float(relative)+.5)/max(1.,float(uCount)));
 }
 if(state.z<=0.){result=vec4(0);return;}
 if(!wet(state.xy)){result=vec4(0);return;}
 int n=max(1,int(ceil(length(velocity(state.xy))*abs(duration)/${glslFloat(
		c.substepTravel
 )})));
 // ponytail: ${
		c.maxSubsteps
 } substeps; freeze excessive-CFL particles, never tunnel. Raise only with a measured need.
 if(n>${c.maxSubsteps}){result=state;return;}
 float h=duration/float(n);
 for(int k=0;k<${c.maxSubsteps};k++){
  if(k>=n)break;
  vec2 a=state.xy,mid=a+.5*h*velocity(a),b=a+h*velocity(mid);
  if(b.x<0.||b.x>=uSize.x){state.z=0.;break;}
  if(length(b-a)>${glslFloat(
		c.maxTravel
	)}||!segment(a,mid)||!segment(a,b))break;
  state.xy=b;
 }
 result=state;
}`;

export const tracerSplatVertex = (
	c: Pick<TracerShaderConstants, 'textureWidth'>
) => `#version 300 es
precision highp float;
precision highp sampler2D;
uniform sampler2D uState;
uniform vec2 uSize;
uniform float uScale;
uniform float uSigma;
uniform vec3 uBlue;
uniform vec3 uGreen;
out vec2 kernel;
flat out vec2 center;
flat out vec4 amplitude;
void main(){
 vec4 state=texelFetch(uState,ivec2(gl_InstanceID%${c.textureWidth},gl_InstanceID/${c.textureWidth}),0);
 center=state.xy;
 if(state.z<=0.){gl_Position=vec4(2,2,0,1);kernel=vec2(0);amplitude=vec4(0);return;}
 vec2 corner=vec2(float(gl_VertexID&1),float((gl_VertexID>>1)&1))*2.-1.;
 kernel=corner*3.;
 vec2 p=state.xy+kernel*uSigma;
 gl_Position=vec4(p/uSize*2.-1.,0,1);
 // Discrete pixel-centre normalization prevents phase-dependent particle mass.
 vec2 sum=vec2(0),fraction=fract(state.xy*uScale);
 for(int i=-4;i<=4;i++){
  vec2 q=(vec2(float(i)+.5)-fraction)/(uSigma*uScale);
  sum+=exp(-.5*q*q)*step(abs(q),vec2(3));
 }
 float norm=state.z*uScale*uScale/(sum.x*sum.y);
 amplitude=vec4(state.w<0.?uBlue:uGreen,1)*norm;
}`;

export const tracerSplatShader = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 kernel;
flat in vec2 center;
flat in vec4 amplitude;
uniform vec2 uSize;
${tracerWalls}
out vec4 result;
void main(){
 if(!segment(center,gl_FragCoord.xy/uScale))discard;
 result=amplitude*exp(-.5*dot(kernel,kernel));
}`;

export const tracerBlendProbeShader = `#version 300 es
precision highp float;
out vec4 result;
void main(){result=vec4(.25);}`;

export const tracerDisplayShader = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
uniform sampler2D uDepth;
uniform sampler2D uPlate;
uniform vec2 uSize;
uniform float uOffset;
uniform float uValveWidth;
uniform vec3 uCarrierDepth;
out vec4 result;
vec3 srgb(vec3 x){return mix(12.92*x,1.055*pow(x,vec3(1./2.4))-.055,step(vec3(.0031308),x));}
void main(){
 vec4 plate=texture(uPlate,vUv);
 vec2 uv=vec2((uOffset+vUv.x*uValveWidth)/uSize.x,vUv.y);
 vec3 transmitted=srgb(exp(-texture(uDepth,uv).rgb-uCarrierDepth));
 result=vec4(mix(plate.rgb,transmitted,plate.a),1);
}`;
