// Passive collocated-grid port of the route-local ADR 0123 tracer kernels.
export const tracerTriangleVertex = `#version 300 es
out vec2 vUv;
void main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));vUv=p;gl_Position=vec4(p*2.-1.,0,1);}`;

const walls = `
uniform vec2 uSize;
uniform sampler2D uSolidMask;
uniform float uHasSolidMask;
uniform vec2 uMaskSize;
bool wet(vec2 uv){return all(greaterThanEqual(uv,vec2(0)))&&all(lessThan(uv,vec2(1)))&&(uHasSolidMask<.5||texture(uSolidMask,vec2(uv.x,1.-uv.y)).r<.5);}
bool segment(vec2 a,vec2 b){
 if(!wet(a)||!wet(b))return false;
 vec2 q=a*uMaskSize,r=b*uMaskSize,d=r-q,c=floor(q),end=floor(r),s=sign(d);
 vec2 delta=1./max(abs(d),vec2(1.e-20)),t=mix(q-c,c+1.-q,step(vec2(0),d))*delta;
 // ponytail: bounded traversal; reject unresolved travel, never tunnel. Increase only with measured need.
 for(int k=0;k<64;k++){
  if(!wet((c+.5)/uMaskSize))return false;
  if(all(equal(c,end)))return true;
  if(t.x==t.y){if(!wet((c+vec2(s.x,0)+.5)/uMaskSize)||!wet((c+vec2(0,s.y)+.5)/uMaskSize))return false;c+=s;t+=delta;}
  else if(t.x<t.y){c.x+=s.x;t.x+=delta.x;}else{c.y+=s.y;t.y+=delta.y;}
 }return false;
}`;

export const tracerUpdateShader = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
${walls}
uniform sampler2D uState;
uniform sampler2D uVelocity;
uniform int uCapacity,uStart,uCount,uSerial,uSourceCount;
uniform vec4 uSources[3];
uniform int uSpecies[3];
uniform float dt,uRate,uNewestAge;
uniform vec4 uOpenEdges;
out vec4 result;
vec2 velocity(vec2 uv){
 vec2 p=uv*uSize-.5,i=floor(p),f=fract(p);ivec2 hi=ivec2(uSize)-1;
 vec2 a=texelFetch(uVelocity,clamp(ivec2(i),ivec2(0),hi),0).xy;
 vec2 b=texelFetch(uVelocity,clamp(ivec2(i)+ivec2(1,0),ivec2(0),hi),0).xy;
 vec2 c=texelFetch(uVelocity,clamp(ivec2(i)+ivec2(0,1),ivec2(0),hi),0).xy;
 vec2 d=texelFetch(uVelocity,clamp(ivec2(i)+ivec2(1),ivec2(0),hi),0).xy;
 return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);
}
void main(){
 ivec2 ij=ivec2(gl_FragCoord.xy);int id=ij.y*512+ij.x;
 vec4 state=texelFetch(uState,ij,0);int relative=(id-uStart+uCapacity)%uCapacity;float duration=dt;
 if(relative<uCount){
  int serial=(uSerial+relative)%786432,source=serial%uSourceCount;
  vec4 line=uSources[source];float across=fract((float(serial/uSourceCount)+.5)*.61803398875);
  vec2 uv=mix(line.xy,line.zw,across),tangent=(line.zw-line.xy)*uSize;
  float incoming=abs(dot(velocity(uv),normalize(vec2(-tangent.y,tangent.x))));
  if(isnan(incoming)||isinf(incoming))incoming=0.;
  state=vec4(uv,incoming*length(tangent)*float(uSourceCount)/(uRate*uSize.x*uSize.y),float(uSpecies[source]));
  duration=min(dt,uNewestAge+float(uCount-1-relative)/uRate);
 }
 if(!(state.z>0.)||!wet(state.xy)){result=vec4(0);return;}
 int n=max(1,int(ceil(length(velocity(state.xy))*abs(duration)/.225)));
 if(n>32){result=state;return;}float h=duration/float(n);
 for(int k=0;k<32;k++){
  if(k>=n)break;
  vec2 a=state.xy,mid=a+.5*h*velocity(a)/uSize,b=a+h*velocity(mid)/uSize;
  if((b.x<0.&&uOpenEdges.x>.5)||(b.x>=1.&&uOpenEdges.y>.5)||(b.y>=1.&&uOpenEdges.z>.5)||(b.y<0.&&uOpenEdges.w>.5)){state.z=0.;break;}
  if(length((b-a)*uSize)>.45||!segment(a,mid)||!segment(a,b))break;
  state.xy=b;
 }result=state;
}`;

export const tracerSplatVertex = `#version 300 es
precision highp float;
precision highp sampler2D;
uniform sampler2D uState;
uniform vec2 uDyeSize,uSize;
uniform float uSigma;
uniform vec3 uAbsorbance[3];
out vec2 kernel;
flat out vec2 center;
flat out vec4 amplitude;
void main(){
 vec4 state=texelFetch(uState,ivec2(gl_InstanceID%512,gl_InstanceID/512),0);center=state.xy;
 if(!(state.z>0.)){gl_Position=vec4(2,2,0,1);kernel=vec2(0);amplitude=vec4(0);return;}
 vec2 corner=vec2(float(gl_VertexID&1),float((gl_VertexID>>1)&1))*2.-1.;kernel=corner*3.;
 gl_Position=vec4((state.xy+kernel*uSigma/uDyeSize)*2.-1.,0,1);
 vec2 sum=vec2(0),fraction=fract(state.xy*uDyeSize);
 for(int i=-4;i<=4;i++){vec2 q=(vec2(float(i)+.5)-fraction)/uSigma;sum+=exp(-.5*q*q)*step(abs(q),vec2(3));}
 float norm=state.z*uDyeSize.x*uDyeSize.y/max(sum.x*sum.y,1.e-30);
 amplitude=vec4(uAbsorbance[int(state.w)],1)*norm;
}`;

export const tracerSplatShader = `#version 300 es
precision highp float;
precision highp sampler2D;
${walls}
uniform vec2 uDyeSize;
in vec2 kernel;
flat in vec2 center;
flat in vec4 amplitude;
out vec4 result;
void main(){if(!segment(center,gl_FragCoord.xy/uDyeSize))discard;result=amplitude*exp(-.5*dot(kernel,kernel));}`;

export const tracerBlendProbeShader = `#version 300 es
precision highp float;
out vec4 result;
void main(){result=vec4(.25);}`;

/** Default source is returned verbatim; only the opt-in material variant changes. */
export function tracerDisplaySource(
	source: string,
	keywords: string[]
): string {
	if (!keywords.includes('TRACERS')) return source;
	return source
		.replace(
			'uniform sampler2D uTexture;',
			'uniform sampler2D uTexture;\nuniform sampler2D uTracerDepth;\nuniform float uTracersEnabled;'
		)
		.replace(
			'exp(-tau)',
			'exp(-tau - uTracersEnabled * texture2D(uTracerDepth, vUv).rgb)'
		);
}
