import { mount, unmount } from 'svelte';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { enamelProfile } from './enamel-profile.js';
import { createMaterialType, smoothTypeProfile, type MaterialTypeExperiment } from './material-type.js';
import { presentationSize } from './presentation-size.js';
import MaterialType from './MaterialType.svelte';
import { LabSession } from './LabSession.js';

// Diagnostic evidence, not a latency gate. Every trial drains prior GPU work.
// Trial0 is first-call JavaScript at this size; repetitions share a GPUDevice.
// Browser/driver compilation caches are uncontrolled: never label this cold
// shader compilation. This fixture excludes fonts/network/DOM startup; literal
// localhost LongTask measurements are collected separately for that boundary.
let device: GPUDevice;
beforeAll(async () => {
	const adapter=await navigator.gpu.requestAdapter();expect(adapter).not.toBeNull();
	device=await adapter!.requestDevice();
	console.info('Native typography setup environment',JSON.stringify({userAgent:navigator.userAgent,vendor:adapter!.info.vendor,architecture:adapter!.info.architecture,devicePixelRatio:window.devicePixelRatio,cache:'First JS call and repeats; same GPUDevice; driver/shader cache uncontrolled; explicit queue drain before each trial.'}));
});
afterAll(()=>device?.destroy());

for(const delayedInitialObserver of [false,true])it(`builds each native target once, without suppressing font invalidation or resetting history${delayedInitialObserver?' when the initial resize observation arrives during startup':''}`,async()=>{
	let ratio=2,model:MaterialTypeExperiment|undefined;const queries:MediaQueryList[]=[];
	let deliverInitial: (()=>void)|undefined,observed:()=>void=()=>{};
	const initialObservation=new Promise<void>(resolve=>{observed=resolve;});
	if(delayedInitialObserver){
		const NativeResizeObserver=window.ResizeObserver;
		// This is a real measured browser observation, not a fabricated resize.
		// Its permitted late delivery must not repeat an already-owned CPU raster.
		vi.spyOn(window,'ResizeObserver').mockImplementation(function(callback:ResizeObserverCallback){
			let first=true;
			return new NativeResizeObserver((entries,observer)=>{
				if(first){first=false;deliverInitial=()=>callback(entries,observer);observed();}
				else callback(entries,observer);
			});
		});
	}
	const nativeMedia=window.matchMedia.bind(window),load=LabSession.prototype.load;
	vi.spyOn(window,'devicePixelRatio','get').mockImplementation(()=>ratio);
	vi.spyOn(window,'matchMedia').mockImplementation(source=>{const query=nativeMedia(source);if(source.startsWith('(resolution:'))queries.push(query);return query;});
	vi.spyOn(LabSession.prototype,'load').mockImplementation(async function(this:LabSession,factory){await load.call(this,async(gpu,format)=>{const candidate=await factory(gpu,format);model=candidate as MaterialTypeExperiment;if(delayedInitialObserver){await initialObservation;deliverInitial!();}return candidate;});});
	const host=document.createElement('div');host.style.width='420.375px';document.body.append(host);
	const component=mount(MaterialType,{target:host});
	const settle=async()=>{await vi.waitFor(()=>expect(host.querySelector('.material-type[data-ready=true]')).not.toBeNull());for(let i=0;i<5;i++)await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));};
	try{
		await settle();expect(model).toBeDefined();expect((await model!.inspect()).details.sourceUploads).toBe(1);
		model!.brush([.2,.5],[.8,.5]);const checksum=(await model!.inspect()).details.checksum;
		host.style.width='480.375px';await vi.waitFor(async()=>expect((await model!.inspect()).details.sourceWidth).toBe(961));await settle();
		expect((await model!.inspect()).details.sourceUploads).toBe(2);
		// A real subpixel CSS change can leave the native output rounded to the
		// same integer width. It still changes glyph placement and source aspect.
		host.style.width='480.4px';await vi.waitFor(async()=>expect((await model!.inspect()).details.sourceUploads).toBe(3));await settle();
		expect((await model!.inspect()).details.sourceWidth).toBe(961);
		expect((await model!.inspect()).details.aspect).toBeCloseTo(host.getBoundingClientRect().width/host.querySelector('canvas')!.getBoundingClientRect().height,6);
		ratio=3;queries.at(-1)!.dispatchEvent(new Event('change'));await vi.waitFor(async()=>expect((await model!.inspect()).details.sourceWidth).toBe(1441));await settle();
		expect((await model!.inspect()).details.sourceUploads).toBe(4);
		document.fonts.dispatchEvent(new Event('loadingdone'));await vi.waitFor(async()=>expect((await model!.inspect()).details.sourceUploads).toBe(5));await settle();
		expect((await model!.inspect()).details.sourceUploads).toBe(5);expect((await model!.inspect()).details.checksum).toBe(checksum);
	}finally{await unmount(component);host.remove();vi.restoreAllMocks();}
});

function timedDevice(timings: Record<string,number>): GPUDevice {
	const queue=new Proxy(device.queue,{get(target,key){
		if(key==='writeTexture')return(...args:Parameters<GPUQueue['writeTexture']>)=>{const started=performance.now();try{return target.writeTexture(...args);}finally{timings.writeTextureCpuMs=(timings.writeTextureCpuMs??0)+performance.now()-started;}};
		const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
	}});
	return new Proxy(device,{get(target,key){
		if(key==='queue')return queue;
		if(key==='createShaderModule')return(descriptor:GPUShaderModuleDescriptor)=>{const started=performance.now();const result=target.createShaderModule(descriptor);timings.shaderModuleCpuMs=performance.now()-started;return result;};
		if(key==='createRenderPipelineAsync')return async(descriptor:GPURenderPipelineDescriptor)=>{const started=performance.now();const result=await target.createRenderPipelineAsync(descriptor);timings.pipelineAwaitMs=performance.now()-started;return result;};
		if(key==='popErrorScope')return async()=>{const started=performance.now();const result=await target.popErrorScope();timings.concurrentScopeWaitMaxMs=Math.max(timings.concurrentScopeWaitMaxMs??0,performance.now()-started);return result;};
		const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
	}});
}

for(const [cssWidth,cssHeight] of [[420.375,260.625],[900,520]])for(const dpr of [2,3]){
	it(`splits native type setup ${cssWidth}×${cssHeight}CSS ${dpr}×`,async()=>{
		const {width,height}=presentationSize(cssWidth,cssHeight,dpr,device.limits.maxTextureDimension2D);
		for(let trial=0;trial<4;trial++){
			await device.queue.onSubmittedWorkDone();device.pushErrorScope('validation');
			const timings:Record<string,number>={},start=performance.now();
			const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
			const ctx=canvas.getContext('2d',{willReadFrequently:true})!;ctx.scale(width/cssWidth,height/cssHeight);
			ctx.fillStyle='white';ctx.font=`bold ${cssHeight*.72}px Georgia`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('Soft',cssWidth*.5,cssHeight*.52,cssWidth*.86);
			timings.canvasAllocationAndRasterCpuMs=performance.now()-start;
			let at=performance.now();const rgba=ctx.getImageData(0,0,width,height).data;timings.rasterReadbackCpuMs=performance.now()-at;
			at=performance.now();const coverage=new Uint8Array(width*height);for(let i=0;i<coverage.length;i++)coverage[i]=rgba[i*4+3];timings.coverageExtractionCpuMs=performance.now()-at;
			at=performance.now();const native=enamelProfile(coverage,width,height);timings.enamelProfileCpuMs=performance.now()-at;
			at=performance.now();const profile=smoothTypeProfile(native);timings.normalReconstructionCpuMs=performance.now()-at;
			timings.totalSourceCpuMs=performance.now()-start;
			at=performance.now();const engine=await createMaterialType(timedDevice(timings),'rgba8unorm',{...profile,aspect:cssWidth/cssHeight});timings.factoryWallMs=performance.now()-at;
			try{
				at=performance.now();await device.queue.onSubmittedWorkDone();timings.postFactoryQueueDrainMs=performance.now()-at;
				timings.sourceFactoryAndDrainWallMs=performance.now()-start;
				engine.resize(width,height);const state=await engine.inspect();
				let alphaMismatches=0;for(let i=0;i<coverage.length;i++)if(profile.data[i*4+3]!==coverage[i])alphaMismatches++;
				expect(alphaMismatches).toBe(0);expect(state.details.profileBytes).toBe(width*height*4);expect(state.details.pendingBytes).toBe(0);
				console.info('Native typography setup trial',JSON.stringify({cssWidth,cssHeight,dpr,width,height,trial,cache:trial?'repeated JS/device':'first trial at size',timings,gpuSourceBytes:state.details.profileBytes,gpuFixedBytes:state.details.fixedBytes,
					cpuExplicitBytes:{coverage:coverage.byteLength,canvasReadback:rgba.byteLength,packedProfile:profile.data.byteLength,enamelPeakScratch:width*height*8,normalScratch:width*height*2+width*8,canvasBackingEstimate:width*height*4},
					notes:'CPU scratch peaks are separate function-liveness estimates, not measured process memory or a promise of immediate GC. Concurrent scope waits overlap; do not add them twice. Pipeline wall includes scheduling/driver work, not isolated compiler CPU.'}));
			}finally{engine.dispose();expect(await device.popErrorScope()).toBeNull();}
		}
	});
}
