// Bench-only GLSL. A = -DG; pressure stores the impulse, not physical pressure.
export { residualShader } from './coarse-shaders.js';

export const restrictShader = `
precision highp float;
precision highp sampler2D;
varying vec2 vUv;
uniform sampler2D uResidual, uList;
uniform vec2 uSize, uListSize;
uniform float uLength, uCount;
void main() {
 float row=floor(vUv.y*uCount), start=4.*floor(gl_FragCoord.x), sum=0.;
 for(int k=0;k<4;k++) {
  float j=start+float(k);
  if(j>=uListSize.x) break;
  vec2 entry=texture2D(uList,vec2((j+.5)/uListSize.x,(row+.5)/uCount)).rg;
  if(entry.y==0.) continue;
  vec2 q=vec2(mod(entry.x,uSize.x),floor(entry.x/uSize.x));
  sum+=entry.y*texture2D(uResidual,(q+.5)/uSize).r;
 }
 gl_FragColor=vec4(sum,0,0,1);
}`;

export const reduceShader = `
precision highp float;
precision highp sampler2D;
varying vec2 vUv;
uniform sampler2D uInput;
uniform float uLength, uCount;
void main() {
 float row=floor(vUv.y*uCount), start=4.*floor(gl_FragCoord.x), sum=0.;
 for(int k=0;k<4;k++) {
  float j=start+float(k);
  if(j<uLength) sum+=texture2D(uInput,vec2((j+.5)/uLength,(row+.5)/uCount)).r;
 }
 gl_FragColor=vec4(sum,0,0,1);
}`;

export const coarseShader = `
precision highp float;
precision highp sampler2D;
varying vec2 vUv;
uniform sampler2D uInput, uInverse;
uniform float uCount;
void main() {
 float row=floor(gl_FragCoord.x), sum=0.;
 for(int j=0;j<2048;j++) {
  if(float(j)>=uCount) break;
  sum+=texture2D(uInverse,vec2((float(j)+.5)/uCount,(row+.5)/uCount)).r
      *texture2D(uInput,vec2(.5,(float(j)+.5)/uCount)).r;
 }
 gl_FragColor=vec4(sum,0,0,1);
}`;

export const prolongShader = `
precision highp float;
precision highp sampler2D;
varying vec2 vUv;
uniform sampler2D uPressure, uRows, uCoarse;
uniform vec2 uSize;
uniform float uCount, uRowWidth;
void main() {
 vec2 q=floor(vUv*uSize);
 float value=texture2D(uPressure,(q+.5)/uSize).r;
 for(int k=0;k<16;k++) {
  if(float(k)>=uRowWidth) break;
  vec2 entry=texture2D(uRows,vec2((q.x*uRowWidth+float(k)+.5)/(uSize.x*uRowWidth),(q.y+.5)/uSize.y)).rg;
  if(entry.y!=0.) value+=entry.y*texture2D(uCoarse,vec2((entry.x+.5)/uCount,.5)).r;
 }
 gl_FragColor=vec4(value,0,0,1);
}`;
