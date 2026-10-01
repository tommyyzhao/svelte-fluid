import { afterAll,afterEach,beforeAll,beforeEach,describe,expect,it,vi } from 'vitest';
import { createMaterialType,smoothTypeProfile,typeMap,typeDeformation,type MaterialTypeExperiment,type MaterialTypeSource } from './material-type.js';
import { enamelProfile } from './enamel-profile.js';

let device:GPUDevice;
beforeAll(async()=>{const adapter=await navigator.gpu.requestAdapter();expect(adapter).not.toBeNull();device=await adapter!.requestDevice();});
beforeEach(()=>device.pushErrorScope('validation'));
afterEach(async()=>{await device.queue.onSubmittedWorkDone();expect(await device.popErrorScope()).toBeNull();});
afterAll(()=>device?.destroy());

function source(width:number,height:number,aspect=width/height):MaterialTypeSource{
	const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
	const ctx=canvas.getContext('2d',{willReadFrequently:true})!;ctx.font=`bold ${height*.76}px Georgia`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='white';ctx.fillText('Soft',width*.5,height*.48);
	const rgba=ctx.getImageData(0,0,width,height).data,coverage=new Uint8Array(width*height);for(let i=0;i<coverage.length;i++)coverage[i]=rgba[i*4+3];
	return {...smoothTypeProfile(enamelProfile(coverage,width,height)),aspect};
}
async function pixels(engine:MaterialTypeExperiment,width:number,height:number){
	const row=Math.ceil(width*4/256)*256;
	const target=device.createTexture({size:[width,height],format:'rgba8unorm',usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC});
	const read=device.createBuffer({size:row*height,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
	try{const encoder=device.createCommandEncoder();engine.render(encoder,target.createView());encoder.copyTextureToBuffer({texture:target},{buffer:read,bytesPerRow:row},[width,height]);device.queue.submit([encoder.finish()]);await read.mapAsync(GPUMapMode.READ);const mapped=new Uint8Array(read.getMappedRange()),result=new Uint8Array(width*height*4);for(let y=0;y<height;y++)result.set(mapped.subarray(y*row,y*row+width*4),y*width*4);return result;}finally{target.destroy();read.destroy();}
}
function difference(a:Uint8Array,b:Uint8Array){let sum=0;for(let i=0;i<a.length;i++)sum+=Math.abs(a[i]-b[i]);return sum/(a.length/4);}

describe('native material typography',()=>{
	it('restores a sparse stroke after force idle exactly once, in stationary and bent material coordinates',async()=>{
		const native=source(640,320),engine=await createMaterialType(device,'rgba8unorm',native),reference=await createMaterialType(device,'rgba8unorm',native);
		const point=(x:number,y:number,details:Record<string,number>)=>{
			if(!details.geometryMotion)return [x,y];
			const state=typeDeformation();state.anchor=[details.anchorX,details.anchorY];state.pull=[details.pullX,details.pullY];const mapped=typeMap(x,y,native.aspect,state);
			return [mapped.u/native.aspect,mapped.v];
		};
		try{
			for(const bending of [false,true]){
				for(const model of [engine,reference]){model.reset();model.resize(640,320);model.setFinish('enamel');model.setGeometryMotion(bending);model.endInput?.();model.step(device.createCommandEncoder(),1/120,{x:.3,y:.5,vx:0,vy:0,active:false,tilt:0});if(bending)model.setDeformation(.065,-.025,.5,.5);}
				const from=point(.3,.5,(await engine.inspect()).details);engine.primeInput(.3,.5);
				const input={x:.7,y:.51,vx:1.3,vy:.04,active:true,tilt:0};
				for(const model of [engine,reference])model.step(device.createCommandEncoder(),1/120,input);
				const state=await engine.inspect(),to=point(input.x,input.y,state.details);reference.brush(from,to);
				expect(difference(await pixels(engine,640,320),await pixels(reference,640,320))).toBe(0);
				expect(state.details.brushCount).toBe(1);expect(state.details.polishSum).toBeGreaterThan(0);
				engine.step(device.createCommandEncoder(),1/120,input);engine.step(device.createCommandEncoder(),1/120,input);
				expect((await engine.inspect()).details.polishSum).toBe(state.details.polishSum);expect((await engine.inspect()).details.brushCount).toBe(1);
				engine.endInput?.();engine.step(device.createCommandEncoder(),1/120,{...input,x:.12,y:.2});
				expect((await engine.inspect()).details.polishSum).toBe(state.details.polishSum);
			}
		}finally{engine.dispose();reference.dispose();}
	});
	it('pointer-polishes a visible light-responsive glaze while every outline pixel stays fixed by default',async()=>{
		const native=source(900,450),engine=await createMaterialType(device,'rgba8unorm',native);
		try{
			engine.resize(900,450);engine.setFinish('enamel');const original=await pixels(engine,900,450);
			const encoder=device.createCommandEncoder();
			for(let i=0;i<=16;i++){
				const input={x:.1+.8*i/16,y:.5,vx:2,vy:0,active:true,tilt:0};
				engine.step(encoder,1/120,input);engine.step(encoder,1/120,input);
			}
			engine.endInput?.();const brushed=await pixels(engine,900,450),state=await engine.inspect();
			let alphaError=0,covered=0,visible=0,rgbDifference=0;
			for(let i=0;i<original.length;i+=4){
				alphaError=Math.max(alphaError,Math.abs(original[i+3]-brushed[i+3]));
				if(original[i+3]<240)continue;
				const delta=(Math.abs(original[i]-brushed[i])+Math.abs(original[i+1]-brushed[i+1])+Math.abs(original[i+2]-brushed[i+2]))/3;
				covered++;rgbDifference+=delta;if(delta>12)visible++;
			}
			expect(alphaError).toBe(0);expect(rgbDifference/covered).toBeGreaterThan(8);expect(visible/covered).toBeGreaterThan(.18);
			expect(state.details.geometryMotion).toBe(0);expect(state.max).toBe(0);expect(state.details.polishedCells).toBeGreaterThan(300);expect(state.details.brushCount).toBe(16);
			const still=await pixels(engine,900,450);expect(difference(brushed,still)).toBe(0);
			engine.setLight(.35);const brushedLight=await pixels(engine,900,450);expect((await engine.inspect()).details.polishSum).toBe(state.details.polishSum);
			engine.setBaseline(true);const baseline=await pixels(engine,900,450);expect(difference(brushedLight,baseline)).toBeGreaterThan(1);expect((await engine.inspect()).details.polishSum).toBe(state.details.polishSum);
			engine.setBaseline(false);engine.reset();const originalLight=await pixels(engine,900,450);
			let materialLightCoupling=0;
			for(let i=0;i<original.length;i+=4)if(original[i+3]>=240)for(let channel=0;channel<3;channel++)materialLightCoupling+=Math.abs((brushed[i+channel]-original[i+channel])-(brushedLight[i+channel]-originalLight[i+channel]));
			expect(materialLightCoupling/(covered*3)).toBeGreaterThan(3);expect((await engine.inspect()).details.polishSum).toBe(0);
			engine.setLight(-2.25);expect(difference(original,await pixels(engine,900,450))).toBe(0);
		}finally{engine.dispose();}
	});
	it('keeps nap inside native glyph coverage and changes light without painting or changing history',async()=>{
		const native=source(800,400);const engine=await createMaterialType(device,'rgba8unorm',native);
		try{engine.resize(800,400);const original=await pixels(engine,800,400);engine.brush([.12,.5],[.88,.5]);const brushed=await pixels(engine,800,400),state=await engine.inspect();
			expect(state.details.changedCells).toBeGreaterThan(0);expect(difference(original,brushed)).toBeGreaterThan(1);
			let alphaError=0,outside=0;for(let i=0;i<native.width*native.height;i++){alphaError=Math.max(alphaError,Math.abs(brushed[i*4+3]-native.data[i*4+3]));if(native.data[i*4+3]===0)outside=Math.max(outside,brushed[i*4],brushed[i*4+1],brushed[i*4+2]);}
			expect(alphaError).toBeLessThanOrEqual(1);expect(outside).toBeLessThanOrEqual(1);
			engine.setLight(0.3);const lit=await pixels(engine,800,400);expect(difference(brushed,lit)).toBeGreaterThan(2);expect((await engine.inspect()).details.checksum).toBe(state.details.checksum);
			engine.setBaseline(true);const baseline=await pixels(engine,800,400);expect(difference(lit,baseline)).toBeGreaterThan(1);expect((await engine.inspect()).details.checksum).toBe(state.details.checksum);
		}finally{engine.dispose();}
	});
	it('moves glyph and finish together; native source-only replacement preserves deformation and nap',async()=>{
		const aspect=401.375/220.625;const engine=await createMaterialType(device,'rgba8unorm',source(803,441,aspect));
		try{engine.resize(803,441);engine.setFinish('enamel');engine.brush([.1,.5],[.9,.5]);const rest=await pixels(engine,803,441);engine.setGeometryMotion(true);engine.setDeformation(.1,-.025,.52,.47);const moved=await pixels(engine,803,441);expect(difference(rest,moved)).toBeGreaterThan(2);
			const repeated=await pixels(engine,803,441);expect(difference(moved,repeated)).toBeLessThan(0.01);const frozen=await engine.inspect();
			engine.resize(1204,662);await engine.updateSource(source(1204,662,aspect));const after=await engine.inspect();
			for(const key of ['checksum','polishSum','pullX','pullY','anchorX','anchorY','aspect','geometryMotion'])expect(after.details[key]).toBe(frozen.details[key]);expect(after.kinetic).toBe(frozen.kinetic);
			expect(after.details.sourceWidth).toBe(1204);expect(after.details.sourceHeight).toBe(662);expect(after.details.profileBytes).toBe(1204*662*4);expect(after.details.fixedBytes).toBe(frozen.details.fixedBytes);
			const high=await pixels(engine,1204,662);let partial=0;for(let i=3;i<high.length;i+=4)if(high[i]>0&&high[i]<255)partial++;expect(partial).toBeGreaterThan(1000);
		}finally{engine.dispose();}
	});
	it('preserves a valid pending source when a newer source fails preflight',async()=>{
		let hold=false,release:()=>void=()=>{};const gate=new Promise<void>(resolve=>release=resolve);const textures:GPUTexture[]=[];
		const gpu=new Proxy(device,{get(target,key){if(key==='popErrorScope')return()=>{const result=target.popErrorScope();return hold?gate.then(()=>result):result;};if(key==='createTexture')return(descriptor:GPUTextureDescriptor)=>{const texture=target.createTexture(descriptor);textures.push(texture);vi.spyOn(texture,'destroy');return texture;};const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}});
		const engine=await createMaterialType(gpu,'rgba8unorm',source(80,40));engine.resize(80,40);
		try{hold=true;const first=engine.updateSource(source(120,60));const candidate=textures.at(-1)!;
			await expect(engine.updateSource({width:4096,height:4096,aspect:1,data:new Uint8Array(4096*4096*4)})).rejects.toThrow('transition budget');
			expect(candidate.destroy).not.toHaveBeenCalled();hold=false;release();await first;
			expect((await engine.inspect()).details.sourceWidth).toBe(120);await pixels(engine,80,40);
		}finally{hold=false;release();engine.dispose();vi.restoreAllMocks();}
	});
	it('preflights combined live source and resized output before changing dimensions',async()=>{
		const engine=await createMaterialType(device,'rgba8unorm',{width:4096,height:4093,aspect:1,data:new Uint8Array(4096*4093*4)});
		try{engine.resize(4096,4093);const before=await engine.inspect();expect(()=>engine.resize(4096,4096)).toThrow('source/output budget');expect((await engine.inspect()).details.height).toBe(before.details.height);}
		finally{engine.dispose();}
	});
});
