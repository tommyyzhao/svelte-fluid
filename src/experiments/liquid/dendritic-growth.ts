import type { LiquidExperiment, LiquidInput, LiquidSnapshot } from './types.js';
import { DENDRITE_SIZE as N,DENDRITE_EPSILON,DENDRITE_TAU,DENDRITE_DIFFUSIVITY,DENDRITE_TIME_SCALE,DENDRITE_STEP,
	createDendriteCpu,dendriteOptions,dendriteSubsteps,dendriteTotals,validateDendriteOptions,type DendriteOptions } from './dendritic-growth-model.js';

const BYTES=N*N*8;
const COMPUTE=/* wgsl */`
@group(0) @binding(0) var<storage,read> old:array<vec2f>;
@group(0) @binding(1) var<storage,read_write> next:array<vec2f>;
@group(0) @binding(2) var<uniform> settings:vec4f;
fn at(q:vec2i)->vec2f{let c=clamp(q,vec2i(0),vec2i(${N-1}));return old[u32(c.y*${N}+c.x)];}
fn weights(g:vec2f)->vec3f{
	let length2=dot(g,g);if(length2<1e-24||settings.y==0.0){return vec3f(1,1,0);}
	let v=g*inverseSqrt(length2);let c=v.x;let s=v.y;let c2=c*c-s*s;let s2=2.0*c*s;let c3=c2*c-s2*s;let s3=s2*c+c2*s;
	let cos6=c3*c3-s3*s3;let sin6=2.0*c3*s3;let C=cos6*settings.z+sin6*settings.w;let S=sin6*settings.z-cos6*settings.w;
	let a=1.0+settings.y*C;let b=-6.0*settings.y*S;let bb=-36.0*settings.y*C;
	let bnn=a*a;let bnt=a*b;let btt=a*a+b*b+a*bb;
	let axx=bnn*c*c-2.0*bnt*c*s+btt*s*s;let ayy=bnn*s*s+2.0*bnt*c*s+btt*c*c;let axy=(bnn-btt)*c*s+bnt*(c*c-s*s);
	return vec3f(axx-abs(axy),ayy-abs(axy),axy);
}
@compute @workgroup_size(8,8)
fn advance(@builtin(global_invocation_id) id:vec3u){
	if(id.x>=${N}u||id.y>=${N}u){return;}
	let q=vec2i(id.xy);let c=at(q);let l=at(q+vec2i(-1,0));let r=at(q+vec2i(1,0));let u=at(q+vec2i(0,-1));let d=at(q+vec2i(0,1));
	let w=weights(vec2f(r.x-l.x,d.x-u.x));
	let diagonal=select(at(q+vec2i(1,-1)).x+at(q+vec2i(-1,1)).x,at(q+vec2i(-1,-1)).x+at(q+vec2i(1,1)).x,w.z>=0.0);
	let lap=w.x*(l.x+r.x-2.0*c.x)+w.y*(u.x+d.x-2.0*c.x)+abs(w.z)*(diagonal-2.0*c.x);
	let bias=-0.2864788975654116*atan(20.0*c.y);
	let phase=c.x+settings.x*(${DENDRITE_EPSILON**2*N*N/DENDRITE_TAU}*lap+c.x*(1.0-c.x)*(c.x-0.5+bias)/${DENDRITE_TAU});
	let heat=c.y+settings.x*${DENDRITE_DIFFUSIVITY*N*N}*(l.y+r.y+u.y+d.y-4.0*c.y)+(phase-c.x);
	// Positive coefficients + explicit CFL, no after-the-fact phase clamp.
	// Actual rounded phase difference charges latent heat, including melting.
	next[id.y*${N}u+id.x]=vec2f(phase,heat);
}`;
const RENDER=/* wgsl */`
@group(0) @binding(0) var<storage,read> cells:array<vec2f>;
@group(0) @binding(1) var<uniform> display:vec4f;
struct Vertex{@builtin(position) clip:vec4f,@location(0) uv:vec2f};
@vertex fn vertex(@builtin(vertex_index) i:u32)->Vertex{let p=vec2f(f32((i<<1u)&2u),f32(i&2u));return Vertex(vec4f(p*2.0-1.0,0,1),vec2f(p.x,1.0-p.y));}
fn cubic(t:f32)->vec4f{let q=1.0-t;let t2=t*t;let t3=t2*t;return vec4f(q*q*q,3.0*t3-6.0*t2+4.0,-3.0*t3+3.0*t2+3.0*t+1.0,t3)/6.0;}
fn material(uv:vec2f)->vec2f{
	let p=uv*${N}.0-0.5;let q=vec2i(floor(p));let wx=cubic(fract(p.x));let wy=cubic(fract(p.y));var value=vec2f(0);
	for(var y=0;y<4;y++){for(var x=0;x<4;x++){let c=clamp(q+vec2i(x-1,y-1),vec2i(0),vec2i(${N-1}));value+=cells[u32(c.y*${N}+c.x)]*wx[x]*wy[y];}}return value;
}
@fragment fn fragment(in:Vertex)->@location(0) vec4f{
	let value=material(in.uv);
	if(display.z>0.5){let t=clamp((value.y+0.5)/0.65,0.0,1.0);return vec4f(mix(vec3f(0.06,0.09,0.15),vec3f(0.99,0.59,0.28),t),1);}
	// Native coverage of the actual reconstructed phi=.5 contour. No glossy
	// normal map, procedural branches, dilation or invented subcell detail.
	let pixel=max(fwidth(value.x),0.00001);let coverage=smoothstep(0.5-pixel*0.5,0.5+pixel*0.5,value.x);
	return vec4f(vec3f(0.93,0.94,0.88)*coverage,coverage);
}`;
export interface DendriticGrowthExperiment extends LiquidExperiment {
	/** Explicitly restart the whole supercooled sample, not a conserved edit. */
	restart(options?:Partial<DendriteOptions>):void;
	advanceStill(seconds?:number):void;
	setHeatView(value:boolean):void;
	readState():Promise<Float32Array<ArrayBuffer>>;
}
export async function createDendriticGrowth(device:GPUDevice,format:GPUTextureFormat):Promise<DendriticGrowthExperiment>{
	if(BYTES>device.limits.maxStorageBufferBindingSize)throw new Error('Dendrite fields exceed device storage limits.');
	const computeModule=device.createShaderModule({label:'Positive energy-anisotropy approximation',code:COMPUTE}),renderModule=device.createShaderModule({label:'Native actual dendritic phase',code:RENDER});
	const[compute,render]=await Promise.all([
		device.createComputePipelineAsync({layout:'auto',compute:{module:computeModule,entryPoint:'advance'}}),
		device.createRenderPipelineAsync({layout:'auto',vertex:{module:renderModule,entryPoint:'vertex'},fragment:{module:renderModule,entryPoint:'fragment',targets:[{format}]}})
	]);
	const owned:GPUBuffer[]=[];let states:GPUBuffer[],uniform:GPUBuffer,display:GPUBuffer,computeGroups:GPUBindGroup[],renderGroups:GPUBindGroup[];
	device.pushErrorScope('validation');device.pushErrorScope('out-of-memory');
	try{
		const buffer=(size:number,usage:GPUBufferUsageFlags)=>{const result=device.createBuffer({size,usage});owned.push(result);return result;};
		states=[0,1].map(()=>buffer(BYTES,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST|GPUBufferUsage.COPY_SRC));
		uniform=buffer(16,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST);display=buffer(16,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST);
		computeGroups=states.map((source,i)=>device.createBindGroup({layout:compute.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:source}},{binding:1,resource:{buffer:states[1-i]}},{binding:2,resource:{buffer:uniform}}]}));
		renderGroups=states.map(source=>device.createBindGroup({layout:render.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:source}},{binding:1,resource:{buffer:display}}]}));
	}catch(error){await Promise.allSettled([device.popErrorScope(),device.popErrorScope()]);owned.forEach(buffer=>buffer.destroy());throw error;}
	const scopes=await Promise.allSettled([device.popErrorScope(),device.popErrorScope()]),rejection=scopes.find(scope=>scope.status==='rejected'),errors=scopes.flatMap(scope=>scope.status==='fulfilled'&&scope.value?[scope.value]:[]);
	if(rejection||errors.length){owned.forEach(buffer=>buffer.destroy());throw(rejection?.status==='rejected'?rejection.reason:undefined)??new Error(errors[0]?.message??'Dendrite allocation failed.');}
	const options=dendriteOptions(),params=new Float32Array(4),pixels=new Float32Array(4);let current=0,disposed=false,width=0,height=0,steps=0,renders=0,seconds=0,remainder=0;
	function initialize(seeded:boolean){
		const source=new Float32Array(createDendriteCpu(N,seeded).cells);states.forEach(buffer=>device.queue.writeBuffer(buffer,0,source));
		params.set([DENDRITE_STEP,options.anisotropy,Math.cos(6*options.angle),Math.sin(6*options.angle)]);device.queue.writeBuffer(uniform,0,params);
		current=0;steps=0;seconds=0;remainder=0;
	}
	function advance(encoder:GPUCommandEncoder,dt:number,_input?:LiquidInput){
		if(disposed)return;dendriteSubsteps(dt);remainder+=dt*DENDRITE_TIME_SCALE;
		const count=Math.floor((remainder+DENDRITE_STEP*1e-10)/DENDRITE_STEP);remainder=Math.max(0,remainder-count*DENDRITE_STEP);
		for(let i=0;i<count;i++){const pass=encoder.beginComputePass({label:'Dendritic phase and conservative latent heat'});pass.setPipeline(compute);pass.setBindGroup(0,computeGroups[current]);pass.dispatchWorkgroups(N/8,N/8);pass.end();current=1-current;}steps+=count;seconds+=dt;
	}
	async function readState(){
		if(disposed)throw new Error('Dendrite material is disposed.');const read=device.createBuffer({size:BYTES,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
		try{const encoder=device.createCommandEncoder();encoder.copyBufferToBuffer(states[current],0,read,0,BYTES);device.queue.submit([encoder.finish()]);await read.mapAsync(GPUMapMode.READ);return new Float32Array(read.getMappedRange()).slice();}finally{read.destroy();}
	}
	try{initialize(true);}catch(error){owned.forEach(buffer=>buffer.destroy());throw error;}
	return{
		memoryBytes:2*BYTES+32,
		restart(update={}){if(disposed)return;const next={...options,...update};validateDendriteOptions(next);Object.assign(options,next);initialize(true);},
		advanceStill(duration=.4){
			if(disposed)return;if(!Number.isFinite(duration)||duration<=0||duration>6.5)throw new Error('A requested dendrite snapshot must lie in(0,6.5] seconds.');
			const encoder=device.createCommandEncoder({label:'Explicit finite dendrite snapshot'}),count=Math.ceil(duration/.1);
			for(let i=0;i<count;i++)advance(encoder,duration/count);device.queue.submit([encoder.finish()]);
		},
		setHeatView(value){pixels[2]=Number(value);},readState,
		resize(w,h){if(disposed)return;if(![w,h].every(Number.isInteger)||w<1||h<1||w>device.limits.maxTextureDimension2D||h>device.limits.maxTextureDimension2D||w*h>16_777_216)throw new Error('Native dendrite output exceeds the explicit budget; no downsampling was used.');width=w;height=h;pixels[0]=w;pixels[1]=h;},
		reset(){if(!disposed)initialize(false);},step:advance,
		render(encoder,target){if(disposed)return;if(!width||!height)throw new Error('Size dendrite output before rendering.');device.queue.writeBuffer(display,0,pixels);const pass=encoder.beginRenderPass({label:'Native reconstructed phase, not a branch overlay',colorAttachments:[{view:target,loadOp:'clear',storeOp:'store',clearValue:[0,0,0,0]}]});pass.setPipeline(render);pass.setBindGroup(0,renderGroups[current]);pass.draw(3);pass.end();renders++;},
		async inspect():Promise<LiquidSnapshot>{
			// Snapshot metadata in the same synchronous turn as the readback copy.
			// A later frame/restart must not relabel the already captured field.
			const metadata={width,height,grid:N,steps,renders,seconds,modelSeconds:steps*DENDRITE_STEP,remainderModelSeconds:remainder,anisotropy:options.anisotropy,angle:options.angle,heatView:pixels[2],stateBytes:2*BYTES,uniformBytes:32,outputBytes:width*height*4};
			const total=dendriteTotals(await readState());return{finite:total.finite,mass:0,initialMass:0,min:total.min,max:total.max,kinetic:0,details:{...metadata,phaseFraction:total.phase,visibleArea:total.area,meanTemperature:total.heat,enthalpy:total.enthalpy,checksum:total.checksum}};
		},
		dispose(){if(!disposed){disposed=true;owned.forEach(buffer=>buffer.destroy());}}
	};
}
