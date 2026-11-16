// GL-free two-level correction strings. A=-DG, b=-divergence.
export const residualShader = `
precision highp float;precision highp sampler2D;varying vec2 vUv;
uniform sampler2D uPressure,uDivergence,uApertures,uCells;uniform vec2 uSize;
vec2 upack(vec2 q){return vec2(q.x<.5?uSize.x:q.x-1.,q.y);}
vec2 vpack(vec2 q){return vec2(q.x,q.y<.5?uSize.y:q.y-1.);}
float au(vec2 q){return texture2D(uApertures,(upack(q)+.5)/(uSize+1.)).r;}
float av(vec2 q){return texture2D(uApertures,(vpack(q)+.5)/(uSize+1.)).g;}
float p(vec2 q){return texture2D(uPressure,(q+.5)/uSize).r;}
void main(){
 vec2 q=floor(vUv*uSize);vec4 a=vec4(au(q),au(q+vec2(1,0)),av(q),av(q+vec2(0,1)));
 vec4 inside=vec4(q.x>0.?1.:0.,q.x<uSize.x-1.?1.:0.,q.y>0.?1.:0.,q.y<uSize.y-1.?1.:0.);
 float aq=dot(a,2.-inside)*p(q)-dot(a*inside,vec4(p(q-vec2(1,0)),p(q+vec2(1,0)),p(q-vec2(0,1)),p(q+vec2(0,1))));
 gl_FragColor=vec4((-texture2D(uDivergence,vUv).r-aq)*texture2D(uCells,vUv).r,0,0,1);
}`;
export const restrictShader = `
precision highp float;precision highp sampler2D;varying vec2 vUv;
uniform sampler2D uResidual,uCellList;uniform vec2 uSize;uniform float uCount,uMaxCells;
void main(){float row=floor(vUv.x*uCount),sum=0.;
 for(int k=0;k<4096;k++){if(float(k)>=uMaxCells)break;float id=texture2D(uCellList,vec2((float(k)+.5)/uMaxCells,(row+.5)/uCount)).r;if(id<0.)break;
  vec2 q=vec2(mod(id,uSize.x),floor(id/uSize.x));sum+=texture2D(uResidual,(q+.5)/uSize).r;
 }gl_FragColor=vec4(sum,0,0,1);
}`;
export const coarseSolveShader = `
precision highp float;precision highp sampler2D;varying vec2 vUv;
uniform sampler2D uRestricted,uInverse;uniform float uCount;
void main(){float row=floor(vUv.x*uCount),sum=0.;
 for(int k=0;k<2048;k++){if(float(k)>=uCount)break;sum+=texture2D(uInverse,vec2((float(k)+.5)/uCount,(row+.5)/uCount)).r*texture2D(uRestricted,vec2((float(k)+.5)/uCount,.5)).r;}
 gl_FragColor=vec4(sum,0,0,1);
}`;
export const prolongShader = `
precision highp float;precision highp sampler2D;varying vec2 vUv;
uniform sampler2D uPressure,uAggregate,uCoarse;uniform float uCount;
void main(){float id=texture2D(uAggregate,vUv).r;float value=texture2D(uPressure,vUv).r;
 if(id>=0.)value+=texture2D(uCoarse,vec2((id+.5)/uCount,.5)).r;
 gl_FragColor=vec4(value,0,0,1);
}`;
