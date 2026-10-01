import { afterAll,afterEach,beforeAll,beforeEach,describe,it,expect,vi } from 'vitest';
import { createDendriticGrowth,type DendriticGrowthExperiment } from './dendritic-growth.js';
import { advanceDendriteCpu,createDendriteCpu,dendriteSubsteps,dendriteTotals,DENDRITE_SIZE,DENDRITE_TIME_SCALE } from './dendritic-growth-model.js';
import type { LiquidInput } from './types.js';
let device:GPUDevice;
beforeAll(async()=>{const adapter=await navigator.gpu.requestAdapter();expect(adapter).not.toBeNull();device=await adapter!.requestDevice();});
beforeEach(()=>device.pushErrorScope('validation'));
afterEach(async()=>{try{await device.queue.onSubmittedWorkDone();expect(await device.popErrorScope()).toBeNull();}finally{vi.restoreAllMocks();}});
afterAll(()=>device?.destroy());
const idle:LiquidInput={x:.5,y:.5,vx:0,vy:0,active:false,tilt:0};
async function evolve(model:DendriticGrowthExperiment,seconds:number){
	const frames=Math.round(seconds*120);
	for(let start=0;start<frames;start+=120){const encoder=device.createCommandEncoder();for(let i=start;i<Math.min(start+120,frames);i++)model.step(encoder,1/120,idle);device.queue.submit([encoder.finish()]);}
	await device.queue.onSubmittedWorkDone();
}
async function pixels(model:DendriticGrowthExperiment,size:number){
	model.resize(size,size);const bytesPerRow=Math.ceil(size*4/256)*256;
	const target=device.createTexture({size:[size,size],format:'rgba8unorm',usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC}),read=device.createBuffer({size:bytesPerRow*size,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
	try{const encoder=device.createCommandEncoder();model.render(encoder,target.createView());encoder.copyTextureToBuffer({texture:target},{buffer:read,bytesPerRow},[size,size]);device.queue.submit([encoder.finish()]);await read.mapAsync(GPUMapMode.READ);const source=new Uint8Array(read.getMappedRange()),result=new Uint8Array(size*size*4);for(let y=0;y<size;y++)result.set(source.subarray(y*bytesPerRow,y*bytesPerRow+size*4),y*size*4);return result;}finally{target.destroy();read.destroy();}
}
function morphology(cells:Float32Array){let area=0,radius=0;for(let y=0;y<DENDRITE_SIZE;y++)for(let x=0;x<DENDRITE_SIZE;x++)if(cells[2*(y*DENDRITE_SIZE+x)]>=.5){area++;radius=Math.max(radius,Math.hypot((x+.5)/DENDRITE_SIZE-.5,(y+.5)/DENDRITE_SIZE-.5));}area/=DENDRITE_SIZE**2;return{area,radius,discFill:area/(Math.PI*radius*radius)};}

describe('native genuine dendritic melt growth',()=>{
	it('keeps a bounded time remainder, no per-step uploads, and readback metadata from the copied revision',async()=>{
		const model=await createDendriticGrowth(device,'rgba8unorm');try{
			const uploads=vi.spyOn(device.queue,'writeBuffer'),encoder=device.createCommandEncoder();model.step(encoder,.001,idle);model.step(encoder,.002,idle);device.queue.submit([encoder.finish()]);expect(uploads).not.toHaveBeenCalled();
			const pending=model.inspect();model.restart({angle:Math.PI/12});const old=await pending,current=await model.inspect();
			expect(old.details.steps).toBe(1);expect(old.details.seconds).toBeCloseTo(.003,12);expect(old.details.modelSeconds).toBeCloseTo(.001125,12);expect(old.details.remainderModelSeconds).toBeCloseTo(.000495,12);expect(old.details.angle).toBe(0);
			expect(current.details.steps).toBe(0);expect(current.details.angle).toBe(Math.PI/12);expect(current.details.checksum).not.toBe(old.details.checksum);
		}finally{model.dispose();}
	});
	it('computes the same mature specimen in one bounded still action as in ordinary animated growth',async()=>{
		const model=await createDendriticGrowth(device,'rgba8unorm');try{
			await evolve(model,6.5);const animated=await model.readState();model.restart();const start=performance.now();model.advanceStill(6.5);const still=await model.readState();
			expect(still).toEqual(animated);expect((await model.inspect()).details.modelSeconds).toBeCloseTo(3.51,12);expect(()=>model.advanceStill(7)).toThrow('snapshot');
			console.info('Dendrite finite mature still cost including queue drain',{milliseconds:performance.now()-start});
		}finally{model.dispose();}
	});
	it('captures different caller intervals in one encoder without borrowing the last uniform dt',async()=>{
		const model=await createDendriticGrowth(device,'rgba8unorm');try{
			const cpu=createDendriteCpu(),encoder=device.createCommandEncoder(),intervals=[1/120,1/60],fixedStep=DENDRITE_TIME_SCALE/480;
			for(const dt of intervals)model.step(encoder,dt,idle);device.queue.submit([encoder.finish()]);
			for(let i=0;i<12;i++)advanceDendriteCpu(cpu,fixedStep);
			const actual=await model.readState();let maxError=0;for(let i=0;i<actual.length;i++)maxError=Math.max(maxError,Math.abs(actual[i]-cpu.cells[i]));
			expect(maxError).toBeLessThan(3e-6);console.info('Dendrite mixed caller intervals',{maxError});
		}finally{model.dispose();}
	});
	it('cleans partial fixed resources and late scope rejection without replacing the primary failure',async()=>{
		for(const failAllocation of[false,true]){let allocations=0,pops=0;const destroyed:Array<ReturnType<typeof vi.spyOn>>=[],primary=new Error('Dendrite allocation failed'),late=new Error('Dendrite late scope rejection');
			const proxy=new Proxy(device,{get(target,key){if(key==='createBuffer')return(descriptor:GPUBufferDescriptor)=>{if(++allocations===2&&failAllocation)throw primary;const buffer=target.createBuffer(descriptor);destroyed.push(vi.spyOn(buffer,'destroy'));return buffer;};if(key==='popErrorScope')return()=>{const index=pops++;return target.popErrorScope().then(error=>{if(index===0)throw late;return error;});};const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}});
			await expect(createDendriticGrowth(proxy,'rgba8unorm')).rejects.toBe(failAllocation?primary:late);expect(pops).toBe(2);expect(destroyed).toHaveLength(failAllocation?1:4);destroyed.forEach(spy=>expect(spy).toHaveBeenCalledOnce());
		}
	});
	it('matches the CPU surface-energy operator and leaves an empty cold sample empty',async()=>{
		const model=await createDendriticGrowth(device,'rgba8unorm');try{
			const cpu=createDendriteCpu(),count=dendriteSubsteps(1/120),encoder=device.createCommandEncoder();model.step(encoder,1/120,idle);device.queue.submit([encoder.finish()]);
			for(let i=0;i<count;i++)advanceDendriteCpu(cpu,DENDRITE_TIME_SCALE/120/count);
			const actual=await model.readState();let maxError=0;for(let i=0;i<actual.length;i++)maxError=Math.max(maxError,Math.abs(actual[i]-cpu.cells[i]));expect(maxError).toBeLessThan(3e-6);
			model.reset();await evolve(model,2);const empty=dendriteTotals(await model.readState());expect(empty.phase).toBe(0);expect(empty.heat).toBe(-.5);expect(empty.finite).toBe(true);
			console.info('Dendrite CPU/GPU law',{count,maxError,emptyPhase:empty.phase});
		}finally{model.dispose();}
	});
	it('grows actual branched phase and conserves sealed enthalpy without phase clamping',async()=>{
		const model=await createDendriticGrowth(device,'rgba8unorm');try{
			const before=dendriteTotals(await model.readState());await evolve(model,6.5);const field=await model.readState(),after=dendriteTotals(field),shape=morphology(field);
			expect(after.finite).toBe(true);expect(after.min).toBeGreaterThanOrEqual(-1e-7);expect(after.max).toBeLessThanOrEqual(1+1e-6);expect(Math.abs(after.enthalpy-before.enthalpy)).toBeLessThan(8e-6);
			expect(shape.area).toBeGreaterThan(.21);expect(shape.area).toBeLessThan(.27);expect(shape.radius).toBeGreaterThan(.36);expect(shape.discFill).toBeLessThan(.6);expect(after.heat).toBeGreaterThan(before.heat+.2);
			console.info('Dendrite actual late growth',{...after,...shape,enthalpyDrift:after.enthalpy-before.enthalpy});
		}finally{model.dispose();}
	});
	it('rotates growth with the material and removing anisotropy changes the actual morphology',async()=>{
		const model=await createDendriticGrowth(device,'rgba8unorm');try{
			await evolve(model,4);const first=await model.readState(),a=dendriteTotals(first);model.restart({angle:Math.PI/12});await evolve(model,4);const rotated=await model.readState(),b=dendriteTotals(rotated);
			let difference=0;for(let i=0;i<first.length;i+=2)difference+=Math.abs(first[i]-rotated[i]);difference/=DENDRITE_SIZE**2;
			expect(difference).toBeGreaterThan(.015);expect(Math.abs(a.phase-b.phase)/a.phase).toBeLessThan(.04);
			model.restart({anisotropy:0,angle:0});await evolve(model,4);const round=morphology(await model.readState()),branched=morphology(first);expect(round.discFill).toBeGreaterThan(.85);expect(branched.discFill).toBeLessThan(.7);
			console.info('Dendrite material rotation / ablation',{phaseDifference:difference,massRotationError:Math.abs(a.phase-b.phase)/a.phase,round,branched});
		}finally{model.dispose();}
	});
	it('preserves actual phase and heat across fractional native2×/3× resize and covers the true contour',async()=>{
		const model=await createDendriticGrowth(device,'rgba8unorm');try{
			await evolve(model,4);const before=await model.readState(),memory=model.memoryBytes;
			for(const dpr of[2,3]){const size=Math.round(200.25*dpr),actual=await pixels(model,size),reference=await pixels(model,size*4);let fractional=0,solid=0,error=0,rimError=0,rimCount=0;
				for(let y=0;y<size;y++)for(let x=0;x<size;x++){const alpha=actual[(y*size+x)*4+3];if(alpha>0&&alpha<255)fractional++;if(alpha===255)solid++;let average=0;for(let dy=0;dy<4;dy++)for(let dx=0;dx<4;dx++)average+=reference[((y*4+dy)*size*4+x*4+dx)*4+3]/16;const delta=Math.abs(alpha-average);error+=delta;if(average>1&&average<254){rimError+=delta;rimCount++;}}
				expect(fractional).toBeGreaterThan(30);expect(solid).toBeGreaterThan(size*size*.08);expect(error/size**2).toBeLessThan(.25);expect(rimError/rimCount).toBeLessThan(20);expect(await model.readState()).toEqual(before);expect(model.memoryBytes).toBe(memory);
				console.info('Dendrite native contour',{dpr,size,meanError:error/size**2,rimError:rimError/rimCount,fractional,memory});
			}
			model.setHeatView(true);const thermal=await pixels(model,401);expect(thermal[3]).toBe(255);expect(await model.readState()).toEqual(before);expect(()=>model.resize(5000,5000)).toThrow('no downsampling');
		}finally{model.dispose();}
	});
});
