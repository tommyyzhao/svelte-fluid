import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from 'svelte';
import { userEvent } from 'vitest/browser';
import AnnularFlow from './AnnularFlow.svelte';
import { LabSession } from './LabSession.js';
import { createAnnularFlow, ANNULAR_INNER, ANNULAR_OUTER, type AnnularFlowExperiment } from './annular-flow.js';
import { loadCoverImage } from './living-cover.js';
import { presentationSize } from './presentation-size.js';
import { measureEffectPerformance } from './effects-performance.js';
import type { LiquidInput } from './types.js';
let device: GPUDevice, bitmap: ImageBitmap;
const format: GPUTextureFormat = 'rgba8unorm';
const idle: LiquidInput = { active: false, x: .5, y: .5, vx: 0, vy: 0, tilt: 0 };
beforeAll(async () => { const adapter = await navigator.gpu.requestAdapter(); expect(adapter).not.toBeNull(); device = await adapter!.requestDevice({ requiredFeatures: adapter!.features.has('timestamp-query') ? ['timestamp-query'] : [] }); bitmap = await loadCoverImage('/living-cover-arles.jpg'); });
beforeEach(() => device.pushErrorScope('validation'));
afterEach(async () => { vi.restoreAllMocks(); await device.queue.onSubmittedWorkDone(); expect(await device.popErrorScope()).toBeNull(); });
afterAll(() => { bitmap?.close(); device?.destroy(); });
async function pixels(engine: AnnularFlowExperiment, width: number, height: number) {
	const row = Math.ceil(width*4/256)*256, texture = device.createTexture({ size: [width,height], format, usage: GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC });
	const readback = device.createBuffer({ size: row*height, usage: GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ });
	try {
		const encoder=device.createCommandEncoder();engine.render(encoder,texture.createView());encoder.copyTextureToBuffer({texture},{buffer:readback,bytesPerRow:row},[width,height]);device.queue.submit([encoder.finish()]);
		await readback.mapAsync(GPUMapMode.READ);const source=new Uint8Array(readback.getMappedRange()), result=new Uint8Array(width*height*4);
		for(let y=0;y<height;y++)result.set(source.subarray(y*row,y*row+width*4),y*width*4);return result;
	} finally { readback.destroy();texture.destroy(); }
}
function regional(a:Uint8Array,b:Uint8Array,width:number,height=width) {
	let interior=0,exterior=0,annulus=0,count=0,changed=0;const edge=Math.min(width,height);
	for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
		const r=Math.hypot((x+.5-width*.5)/edge,(y+.5-height*.5)/edge),i=(y*width+x)*4;
		const d=Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2]);
		if(r<ANNULAR_INNER-1e-5)interior+=d;else if(r>ANNULAR_OUTER+1e-5)exterior+=d;else {annulus+=d;count++;changed+=Number(d>30);}
	}return {interior,exterior,mean:annulus/(3*count),changed:changed/count};
}
function tick(engine:AnnularFlowExperiment,count:number,input:LiquidInput=idle){const encoder=device.createCommandEncoder();for(let i=0;i<count;i++)engine.step(encoder,1/120,input);device.queue.submit([encoder.finish()]);}
function maxDifference(a:Uint8Array,b:Uint8Array){let max=0;for(let i=0;i<a.length;i++)max=Math.max(max,Math.abs(a[i]-b[i]));return max;}
function downsample(high:Uint8Array,width:number) {
	const result=new Uint8Array(width*width*4), decode=Array.from({length:256},(_,n)=>{const x=n/255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4;});
	const encode=(x:number)=>x<=.0031308?12.92*x:1.055*x**(1/2.4)-.055;
	for(let y=0;y<width;y++)for(let x=0;x<width;x++) {
		for(let c=0;c<3;c++){let sum=0;for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++)sum+=decode[high[((y*2+dy)*width*2+x*2+dx)*4+c]];result[(y*width+x)*4+c]=Math.round(encode(sum/4)*255);}result[(y*width+x)*4+3]=255;
	}return result;
}
async function nativeReference(engine:AnnularFlowExperiment,width:number) {
	engine.resize(width,width);const low=await pixels(engine,width,width);engine.resize(width*2,width*2);const reference=downsample(await pixels(engine,width*2,width*2),width);
	const histogram=new Uint32Array(256);let sum=0,count=0,max=0,n=0,p99=0;
	for(let y=0;y<width;y++)for(let x=0;x<width;x++) {
		const r=Math.hypot((x+.5)/width-.5,(y+.5)/width-.5);if(r<ANNULAR_INNER||r>ANNULAR_OUTER)continue;
		for(let c=0;c<3;c++){const i=(y*width+x)*4+c,d=Math.abs(low[i]-reference[i]);sum+=d;count++;max=Math.max(max,d);histogram[d]++;}
	}for(;p99<255;p99++){n+=histogram[p99];if(n>=count*.99)break;}return {mean:sum/count,max,p99};
}
describe('native circular protected-image circulation',()=>{
	it('moves a meaningful annulus in both directions but the actual protected and outer pixels remain identical at native2x/3x',async()=>{
		const engine=await createAnnularFlow(device,format,bitmap);
		try{for(const dpr of [2,3]){const {width}=presentationSize(420.375,420.375,dpr);engine.resize(width,width);engine.reset();const rest=await pixels(engine,width,width);
			for(const direction of [-1,1] as const){engine.hold(direction);const result=regional(rest,await pixels(engine,width,width),width);expect(result.interior).toBe(0);expect(result.exterior).toBe(0);expect(result.mean).toBeGreaterThan(12);expect(result.changed).toBeGreaterThan(.4);console.info('Annular true protected image / both directions',JSON.stringify({dpr,width,direction,...result}));}
			engine.setStill(true);expect(maxDifference(await pixels(engine,width,width),rest)).toBe(0);engine.setStill(false);engine.reset();expect(maxDifference(await pixels(engine,width,width),rest)).toBe(0);
		}}finally{engine.dispose();}
	});
	it('retains the scalar and original source across fractional native resize, rejects oversized output, and recovers exactly after ordinary torque',async()=>{
		const copy=await createImageBitmap(bitmap),engine=await createAnnularFlow(device,format,copy);copy.close();
		try{engine.hold(1);for(const dpr of [2,3]){const size=presentationSize(420.375,260.625,dpr);engine.resize(size.width,size.height);const state=await engine.inspect();expect(state.details.angle).toBe(.32);expect(state.details.held).toBe(1);expect(state.details.sourceWidth).toBe(3803);expect(state.details.sourceHeight).toBe(3162);expect(engine.memoryBytes).toBe(64123040);await pixels(engine,size.width,size.height);}
			expect(()=>engine.resize(4097,4097)).toThrow('Native annular image');engine.resize(641,641);engine.reset();const rest=await pixels(engine,641,641);
			tick(engine,60,{...idle,active:true,x:.815,y:.5,vy:2});expect((await engine.inspect()).details.angle).toBeGreaterThan(.25);expect(regional(rest,await pixels(engine,641,641),641).mean).toBeGreaterThan(10);
			tick(engine,200);expect(engine.settled).toBe(true);expect((await engine.inspect()).details.angle).toBe(0);expect(maxDifference(await pixels(engine,641,641),rest)).toBe(0);
		}finally{engine.dispose();}
	});
	it('validates the strongest annular native photo and analytic grid footprints against a2x-per-axis linear-light reference',async()=>{
		const engine=await createAnnularFlow(device,format,bitmap);
		try{for(const dpr of [2,3]){const {width}=presentationSize(420.375,420.375,dpr);engine.reset();const baseline=await nativeReference(engine,width);engine.hold(1);const warped=await nativeReference(engine,width);
			expect(warped.mean).toBeLessThan(4);expect(warped.p99).toBeLessThanOrEqual(27);expect(warped.mean).toBeLessThan(baseline.mean*1.6+.1);
			engine.setDiagnostic(true);const grid=await nativeReference(engine,width);engine.setDiagnostic(false);expect(grid.mean).toBeLessThan(.5);expect(grid.max).toBeLessThanOrEqual(4);
			console.info('Annular native footprint / local ring only',JSON.stringify({dpr,width,baseline,warped,grid,anisotropyBound:(await engine.inspect()).details.anisotropyBound}));
		}}finally{engine.dispose();}
	});
	it('measures one evolving annular map at all four existing native output sizes without reducing source or presentation',async()=>{
		const engine=await createAnnularFlow(device,format,bitmap), measurements=[];
		try{for(const [width,height] of [[841,521],[1261,782],[1800,1040],[2700,1560]]) {
			engine.reset();
			const result=await measureEffectPerformance(device,format,engine,width,height,(frame)=>{const a=frame*.05;return {...idle,active:frame<70,x:.5+.315*Math.cos(a)*height/width,y:.5+.315*Math.sin(a),vx:-.945*Math.sin(a)*height/width,vy:.945*Math.cos(a)};},1);
			expect(result.gpuMs).not.toBeNull();expect((await engine.inspect()).finite).toBe(true);measurements.push({width,height,result,state:(await engine.inspect()).details});
		}console.info('ANNULAR_BENCHMARK_JSON',JSON.stringify({kind:'one circular prescribed image map / output scaling, not cross-model physics equivalence',ownedBytes:engine.memoryBytes,measurements}));}finally{engine.dispose();}
	});
	for(const reduced of [false,true])it(`uses the first native controls and preserves the held image at actual fractional3x, reduced=${reduced}`,async()=>{
		let model:AnnularFlowExperiment|undefined;
		vi.spyOn(window,'devicePixelRatio','get').mockReturnValue(3);
		const media=window.matchMedia.bind(window);vi.spyOn(window,'matchMedia').mockImplementation((query)=>{const result=media(query);if(query.includes('prefers-reduced-motion'))Object.defineProperty(result,'matches',{value:reduced});return result;});
		const load=LabSession.prototype.load;vi.spyOn(LabSession.prototype,'load').mockImplementation(function(this:LabSession,factory){return load.call(this,async(device,format)=>{const result=await factory(device,format);model=result as AnnularFlowExperiment;return result;});});
		const host=document.createElement('div');host.style.width='358.375px';document.body.append(host);const component=mount(AnnularFlow,{target:host});
		try{
			await vi.waitFor(()=>expect(host.querySelector('.annular-proof')?.getAttribute('data-ready')).toBe('true'),{timeout:10000});
			const button=(text:string)=>[...host.querySelectorAll('button')].find((item)=>item.textContent===text)!;
			const check=(text:string)=>[...host.querySelectorAll('label')].find((item)=>item.textContent?.includes(text))!.querySelector('input')!;
			const canvas=host.querySelector('canvas')!,rect=canvas.getBoundingClientRect();expect(canvas.width).toBe(Math.round(rect.width*3));expect(canvas.height).toBe(Math.round(rect.height*3));
			await userEvent.click(button('Circle right'));expect((await model!.inspect()).details.angle).toBe(.32);
			await userEvent.click(check('Unchanged source'));expect((await model!.inspect()).details.still).toBe(1);
			await userEvent.click(check('Unchanged source'));expect((await model!.inspect()).details.still).toBe(0);
			await userEvent.click(check('Native grid'));expect((await model!.inspect()).details.diagnostic).toBe(1);
			await userEvent.click(check('Native grid'));expect((await model!.inspect()).details.diagnostic).toBe(0);
			host.style.width='420.375px';await vi.waitFor(()=>expect(canvas.width).toBe(1261));expect((await model!.inspect()).details.angle).toBe(.32);
			await new Promise((resolve)=>setTimeout(resolve,100));const renders=(await model!.inspect()).details.renders;await new Promise((resolve)=>setTimeout(resolve,180));expect((await model!.inspect()).details.renders).toBe(renders);
			await userEvent.click(button('Rest'));expect((await model!.inspect()).details.angle).toBe(0);
			if(!reduced){const material=host.querySelector('.material')!,r=canvas.getBoundingClientRect();for(let i=0;i<16;i++){const a=-.5+i*.05;material.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,isPrimary:true,clientX:r.left+r.width*(.5+.315*Math.cos(a)),clientY:r.top+r.height*(.5+.315*Math.sin(a))}));await new Promise((resolve)=>setTimeout(resolve,18));}
				expect(Math.abs((await model!.inspect()).details.angle)).toBeGreaterThan(.015);material.dispatchEvent(new PointerEvent('pointerleave',{isPrimary:true}));
				await vi.waitFor(()=>expect(host.querySelector('.material')?.getAttribute('data-sleeping')).toBe('true'),{timeout:3000});expect((await model!.inspect()).details.angle).toBe(0);
			}
		}finally{await unmount(component);host.remove();}
	});
});
