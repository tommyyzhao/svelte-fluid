import type { LiquidExperiment, LiquidInput, LiquidSnapshot } from './types.js';
import { FROST_SIZE as N, FROST_EPSILON, FROST_TAU, FROST_DIFFUSIVITY, FROST_TIME_SCALE,
	FROST_BRUSH_RATE, FROST_MELT_RATE, FROST_COLD, frostOptions, frostSubsteps, frostSeed, frostTotals,
	validateFrostOptions, validateFrostCoverage, type FrostOptions } from './frost-phase-model.js';

const BYTES = N * N * 8;
const COMPUTE = /* wgsl */ `
struct Params { pointer: vec4f, settings: vec4f, rates: vec4f };
@group(0) @binding(0) var<storage, read> old: array<vec2f>;
@group(0) @binding(1) var<storage, read_write> next: array<vec2f>;
@group(0) @binding(2) var<uniform> p: Params;
fn at(q: vec2i) -> vec2f {
	let c=clamp(q,vec2i(0),vec2i(${N - 1})); return old[u32(c.y*${N}+c.x)];
}
fn mobility(g: vec2f) -> f32 {
	let length2=dot(g,g); if(length2<1e-20){return 1.0;}
	let q=g*g/length2; let x=q.x;let y=q.y;
	return 1.0+p.settings.w*(x*x*x-15.0*x*x*y+15.0*x*y*y-y*y*y);
}
@compute @workgroup_size(8,8)
fn advance(@builtin(global_invocation_id) id: vec3u) {
	if(id.x>=${N}u||id.y>=${N}u){return;}
	let q=vec2i(id.xy); let c=at(q); let l=at(q-vec2i(1,0));let r=at(q+vec2i(1,0));let d=at(q-vec2i(0,1));let u=at(q+vec2i(0,1));
	let lap=((l-c)+(r-c)+(d-c)+(u-c))*${N * N}.0;
	let bias=0.2864788975654116*atan(-10.0*c.y);
	let melt=${FROST_MELT_RATE}.0*smoothstep(0.02,0.32,c.y);
	let change=p.settings.x*(mobility(vec2f(r.x-l.x,u.x-d.x))/${FROST_TAU}*
		(${FROST_EPSILON ** 2}*lap.x+c.x*(1.0-c.x)*(c.x-0.5+bias))-melt*c.x);
	let phase=c.x+change;
	let offset=(vec2f(id.xy)+0.5)/${N}.0-p.pointer.xy;
	let weight=p.pointer.z*exp(-dot(offset,offset)/0.008);
	let heat=c.y+p.settings.x*(${FROST_DIFFUSIVITY}*lap.y+p.rates.x*(p.settings.y-c.y)+
		${FROST_BRUSH_RATE}.0*weight*(p.pointer.w-c.y))+p.settings.z*(phase-c.x);
	// No post-hoc phase clamp: the explicit timestep bound preserves [0,1].
	next[id.y*${N}u+id.x]=vec2f(phase,heat);
}`;
const SEED = /* wgsl */ `
@group(0) @binding(0) var<storage, read_write> cells: array<vec2f>;
@group(0) @binding(1) var<uniform> center: vec4f;
@compute @workgroup_size(8,8)
fn seed(@builtin(global_invocation_id) id: vec3u) {
	if(id.x>=${N}u||id.y>=${N}u){return;}
	let distance=length((vec2f(id.xy)+0.5)/${N}.0-center.xy);
	let t=clamp((${0.039 + FROST_EPSILON * 1.8}-distance)/${FROST_EPSILON * 3.6},0.0,1.0);
	let i=id.y*${N}u+id.x;let old=cells[i];let phase=max(old.x,t*t*(3.0-2.0*t));
	// A localized cold-material edit, not an unexplained global heat reset.
	cells[i]=vec2f(phase,mix(old.y,${FROST_COLD},phase-old.x));
}`;
const CONTENT_SEED = /* wgsl */ `
@group(0) @binding(0) var<storage, read_write> cells: array<vec2f>;
@group(0) @binding(1) var<storage, read> source: array<f32>;
@compute @workgroup_size(8,8)
fn seed(@builtin(global_invocation_id) id: vec3u) {
	if(id.x>=${N}u||id.y>=${N}u){return;}
	let i=id.y*${N}u+id.x;let old=cells[i];let phase=max(old.x,source[i]);
	// Only the newly planted phase carries cold material. No global heat edit.
	cells[i]=vec2f(phase,mix(old.y,${FROST_COLD},phase-old.x));
}`;
const RENDER = /* wgsl */ `
@group(0) @binding(0) var<storage, read> cells: array<vec2f>;
@group(0) @binding(1) var<uniform> display: vec4f;
struct Vertex { @builtin(position) clip: vec4f, @location(0) uv: vec2f };
@vertex fn vertex(@builtin(vertex_index) i: u32) -> Vertex {
	let p=vec2f(f32((i<<1u)&2u),f32(i&2u));
	return Vertex(vec4f(p*2.0-1.0,0,1),vec2f(p.x,1.0-p.y));
}
fn cubic(t: f32) -> vec4f {
	let q=1.0-t;let t2=t*t;let t3=t2*t;
	return vec4f(q*q*q,3.0*t3-6.0*t2+4.0,-3.0*t3+3.0*t2+3.0*t+1.0,t3)/6.0;
}
fn material(uv: vec2f) -> vec2f {
	let p=uv*${N}.0-0.5;let q=vec2i(floor(p));let wx=cubic(fract(p.x));let wy=cubic(fract(p.y));
	var value=vec2f(0);
	for(var y=0;y<4;y++){for(var x=0;x<4;x++){
		let c=clamp(q+vec2i(x-1,y-1),vec2i(0),vec2i(${N - 1}));
		value+=cells[u32(c.y*${N}+c.x)]*wx[x]*wy[y];
	}}return value;
}
@fragment fn fragment(in: Vertex) -> @location(0) vec4f {
	let value=material(in.uv);let phase=value.x;let temperature=value.y;
	if(display.z>0.5){
		let t=clamp(0.5+temperature*0.55,0.0,1.0);
		let cold=mix(vec3f(0.03,0.10,0.22),vec3f(0.31,0.73,0.82),t*2.0);
		let hot=mix(vec3f(0.31,0.73,0.82),vec3f(0.98,0.40,0.22),t*2.0-1.0);
		return vec4f(select(cold,hot,t>0.5),1);
	}
	// The visible edge is the actual phase=.5 contour. Its subpixel coverage,
	// gradients and highlights reconstruct at native pixels; no branch texture.
	let footprint=max(fwidth(phase),0.00001);
	let coverage=smoothstep(0.5-footprint*0.5,0.5+footprint*0.5,phase);
	let gradient=vec2f(dpdx(phase)*display.x,dpdy(phase)*display.y);
	let normal=normalize(vec3f(-gradient*0.013,1));
	let light=normalize(vec3f(-0.45,-0.65,1.2));let halfway=normalize(light+vec3f(0,0,1));
	let reflection=pow(max(dot(normal,halfway),0.0),40.0);
	let boundary=exp(-abs(phase-0.55)*14.0);
	let color=vec3f(0.47,0.75,0.85)*(0.66+0.34*max(dot(normal,light),0.0))+
		vec3f(0.32,0.35,0.31)*reflection+vec3f(0.26,0.26,0.20)*boundary;
	let alpha=coverage*(0.68+0.24*boundary);
	return vec4f(clamp(color,vec3f(0),vec3f(1))*alpha,alpha);
}`;

export interface FrostPhaseExperiment extends LiquidExperiment {
	/** Repeat the retained content seed, or plant a circular nucleus by default. */
	seed(x?: number, y?: number): void;
	/** Available only when created with a content seed. Native source is reduced
	 * before this explicit local cold-material planting action, never on resize. */
	seedFromCoverage?(source: Float32Array<ArrayBuffer>): void;
	setOptions(options: Partial<FrostOptions>): void;
	setBrush(temperature: number): void;
	setHeatView(enabled: boolean): void;
	/** One explicitly requested finite still advance; never an idle timer. */
	advanceStill(): void;
	readState(): Promise<Float32Array<ArrayBuffer>>;
}

export async function createFrostPhase(device: GPUDevice, format: GPUTextureFormat,
	seedCoverage?: Float32Array<ArrayBuffer>): Promise<FrostPhaseExperiment> {
	if (seedCoverage) validateFrostCoverage(seedCoverage);
	// Snapshot before async pipeline work; callers retain no authority to mutate
	// a seed while its candidate is being created.
	let initialSource = seedCoverage?.slice();
	if (BYTES > device.limits.maxStorageBufferBindingSize) throw new Error('Frost fields exceed this device’s storage limit.');
	const computeModule=device.createShaderModule({label:'Positive two-field frost kinetics',code:COMPUTE});
	const seedModule=device.createShaderModule({label:'Explicit frost nucleus',code:initialSource?CONTENT_SEED:SEED});
	const renderModule=device.createShaderModule({label:'Native reconstructed ice front',code:RENDER});
	const [compute,seedPipeline,render]=await Promise.all([
		device.createComputePipelineAsync({layout:'auto',compute:{module:computeModule,entryPoint:'advance'}}),
		device.createComputePipelineAsync({layout:'auto',compute:{module:seedModule,entryPoint:'seed'}}),
		device.createRenderPipelineAsync({layout:'auto',vertex:{module:renderModule,entryPoint:'vertex'},fragment:{module:renderModule,entryPoint:'fragment',targets:[{format}]}})
	]);
	const owned:GPUBuffer[]=[];
	device.pushErrorScope('validation');device.pushErrorScope('out-of-memory');
	let states:GPUBuffer[],uniform:GPUBuffer,display:GPUBuffer,action:GPUBuffer|undefined,content:GPUBuffer|undefined;
	let computeGroups:GPUBindGroup[],seedGroups:GPUBindGroup[],renderGroups:GPUBindGroup[];
	try {
		const buffer=(size:number,usage:GPUBufferUsageFlags)=>{const value=device.createBuffer({size,usage});owned.push(value);return value;};
		states=[0,1].map(()=>buffer(BYTES,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST|GPUBufferUsage.COPY_SRC));
		uniform=buffer(48,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST);display=buffer(16,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST);
		if(initialSource)content=buffer(N*N*4,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST);
		else action=buffer(16,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST);
		computeGroups=states.map((source,i)=>device.createBindGroup({layout:compute.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:source}},{binding:1,resource:{buffer:states[1-i]}},{binding:2,resource:{buffer:uniform}}]}));
		seedGroups=states.map(source=>device.createBindGroup({layout:seedPipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:source}},{binding:1,resource:{buffer:content??action!}}]}));
		renderGroups=states.map(source=>device.createBindGroup({layout:render.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:source}},{binding:1,resource:{buffer:display}}]}));
	} catch(error) { await Promise.allSettled([device.popErrorScope(),device.popErrorScope()]);owned.forEach(value=>value.destroy());throw error; }
	const scopes=await Promise.allSettled([device.popErrorScope(),device.popErrorScope()]);
	const rejected=scopes.find(scope=>scope.status==='rejected');
	const errors=scopes.flatMap(scope=>scope.status==='fulfilled'&&scope.value?[scope.value]:[]);
	if(rejected||errors.length){owned.forEach(value=>value.destroy());throw (rejected?.status==='rejected'?rejected.reason:undefined)??new Error(errors[0]?.message??'Frost allocation validation failed.');}
	const options=frostOptions(),params=new Float32Array(12),pixels=new Float32Array(4);
	let current=0,width=0,height=0,disposed=false,brushTemperature=1.1,steps=0,renders=0,seeds=0,seconds=0;
	function initialize(seeded:boolean){
		const values=new Float32Array(N*N*2),nucleus=seeded?(initialSource??frostSeed(N)):undefined;
		for(let i=0;i<N*N;i++){values[i*2]=nucleus?.[i]??0;values[i*2+1]=options.bath;}
		states.forEach(buffer=>device.queue.writeBuffer(buffer,0,values));current=0;steps=0;seconds=0;seeds=seeded?1:0;
	}
	function plant(x=0.5,y=0.5){
		if(disposed)return;
		if(!content){
			if(![x,y].every(Number.isFinite)||x<0.08||x>0.92||y<0.08||y>0.92)throw new Error('Place a nucleus inside the glass.');
			device.queue.writeBuffer(action!,0,new Float32Array([x,y,0,0]));
		}
		const encoder=device.createCommandEncoder();const pass=encoder.beginComputePass({label:'Explicit nucleus, not spontaneous noise'});pass.setPipeline(seedPipeline);pass.setBindGroup(0,seedGroups[current]);pass.dispatchWorkgroups(N/8,N/8);pass.end();device.queue.submit([encoder.finish()]);seeds++;
	}
	function advance(encoder:GPUCommandEncoder,dt:number,input:LiquidInput){
		if(disposed)return;
		const count=frostSubsteps(dt),h=dt*FROST_TIME_SCALE/count;
		const active=input.active&&[input.x,input.y].every(Number.isFinite);
		params.set([active?input.x:0.5,active?input.y:0.5,Number(active),brushTemperature,h,options.bath,options.latent,options.anisotropy,options.bathRate,0,0,0]);
		device.queue.writeBuffer(uniform,0,params);
		for(let i=0;i<count;i++){
			const pass=encoder.beginComputePass({label:'Bounded phase / temperature advance'});pass.setPipeline(compute);pass.setBindGroup(0,computeGroups[current]);pass.dispatchWorkgroups(N/8,N/8);pass.end();current=1-current;
		}steps+=count;seconds+=dt;
	}
	async function readState(){
		if(disposed)throw new Error('Frost material is disposed.');
		const read=device.createBuffer({size:BYTES,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
		try{const encoder=device.createCommandEncoder();encoder.copyBufferToBuffer(states[current],0,read,0,BYTES);device.queue.submit([encoder.finish()]);await read.mapAsync(GPUMapMode.READ);return new Float32Array(read.getMappedRange()).slice();}finally{read.destroy();}
	}
	try {
		if(content&&initialSource)device.queue.writeBuffer(content,0,initialSource);
		initialize(true);
	} catch(error) { owned.forEach(value=>value.destroy());throw error; }
	initialSource=undefined;
	return {
		memoryBytes:BYTES*2+(content?N*N*4+64:80),
		seed:plant,
		...(content?{seedFromCoverage(source:Float32Array<ArrayBuffer>){if(disposed)return;validateFrostCoverage(source);device.queue.writeBuffer(content!,0,source);plant();}}:{}),
		setOptions(update){const next={...options,...update};validateFrostOptions(next);Object.assign(options,next);},
		setBrush(temperature){if(!Number.isFinite(temperature)||Math.abs(temperature)>1.2)throw new Error('Frost brush temperature is outside the illustrative range.');brushTemperature=temperature;},
		setHeatView(enabled){pixels[2]=Number(enabled);},
		advanceStill(){if(disposed)return;const input={x:0.5,y:0.5,vx:0,vy:0,active:false,tilt:0};const encoder=device.createCommandEncoder({label:'Requested finite frost snapshot'});for(let i=0;i<4;i++)advance(encoder,0.1,input);device.queue.submit([encoder.finish()]);},
		readState,
		resize(w,h){if(disposed)return;if(![w,h].every(Number.isInteger)||w<1||h<1||w>device.limits.maxTextureDimension2D||h>device.limits.maxTextureDimension2D||w*h>16_777_216)throw new Error('Native frost output exceeds the explicit pixel budget; no downsampling was used.');width=w;height=h;pixels[0]=w;pixels[1]=h;},
		reset(){if(!disposed)initialize(false);},
		step:advance,
		render(encoder,target){if(disposed)return;if(!width||!height)throw new Error('Size frost before rendering.');device.queue.writeBuffer(display,0,pixels);const pass=encoder.beginRenderPass({label:'Actual native ice front',colorAttachments:[{view:target,loadOp:'clear',storeOp:'store',clearValue:[0,0,0,0]}]});pass.setPipeline(render);pass.setBindGroup(0,renderGroups[current]);pass.draw(3);pass.end();renders++;},
		async inspect():Promise<LiquidSnapshot>{const total=frostTotals(await readState(),options.latent);return{finite:total.finite,mass:0,initialMass:0,min:total.min,max:total.max,kinetic:0,details:{phaseFraction:total.phase,meanTemperature:total.heat,enthalpy:total.enthalpy,checksum:total.checksum,width,height,grid:N,steps,renders,seeds,seconds,bath:options.bath,latent:options.latent,anisotropy:options.anisotropy,heatView:pixels[2],stateBytes:BYTES*2,uniformBytes:content?64:80,seedBytes:content?N*N*4:0,outputBytes:width*height*4}};},
		dispose(){if(!disposed){disposed=true;owned.forEach(value=>value.destroy());}}
	};
}
