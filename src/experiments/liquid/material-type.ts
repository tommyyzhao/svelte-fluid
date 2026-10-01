import { brushPile, createPileField } from './velvet.js';
import { presentationSize } from './presentation-size.js';
import type { LiquidExperiment, LiquidInput, LiquidSnapshot } from './types.js';

export const TYPE_RADIUS = 0.28;
export const TYPE_MAX_PULL = 0.11;
const TYPE_COLUMNS = 96, TYPE_ROWS = 64;
export const TYPE_GLAZE_RADIUS = 0.11;
export const TYPE_GLAZE_LIGHT_WIDTH = 0.085;
/** Analytic convolution of a 1D reflected light with Gaussian slope spread.
 * Integrated light is independent of roughness; this is not a calibrated BRDF.
 */
export function typeGlazeReflection(coordinate: number, roughness: number): number {
	const width=Math.hypot(TYPE_GLAZE_LIGHT_WIDTH,roughness);
	return TYPE_GLAZE_LIGHT_WIDTH/width*Math.exp(-(((coordinate+0.025)/width)**2));
}
/** Persistent polishing exposure, integrated along the actual swept stroke. */
export function polishType(field: Float32Array, from: readonly number[], to: readonly number[], aspect: number): boolean {
	if(field.length!==TYPE_COLUMNS*TYPE_ROWS || ![...from,...to,aspect].every(Number.isFinite) || aspect<=0)return false;
	const dx=(to[0]-from[0])*aspect,dy=to[1]-from[1],length=Math.hypot(dx,dy),radius2=TYPE_GLAZE_RADIUS**2;
	if(!Number.isFinite(length)||length<1e-5)return false;
	let changed=false;
	for(let y=0;y<TYPE_ROWS;y++)for(let x=0;x<TYPE_COLUMNS;x++){
		const px=(x/(TYPE_COLUMNS-1)-from[0])*aspect,py=y/(TYPE_ROWS-1)-from[1];
		const projection=(px*dx+py*dy)/length,perpendicular2=Math.max(0,px*px+py*py-projection*projection);
		if(perpendicular2>=radius2)continue;
		const chord=Math.sqrt(radius2-perpendicular2),lo=Math.max(-projection,-chord),hi=Math.min(length-projection,chord);
		if(hi<=lo)continue;
		const a=1-perpendicular2/radius2;
		const integral=(s:number)=>a*a*s-2*a*s**3/(3*radius2)+s**5/(5*radius2**2);
		const exposure=1-Math.exp(-80*Math.max(0,integral(hi)-integral(lo))),i=y*TYPE_COLUMNS+x;
		field[i]+=(1-field[i])*exposure;changed=true;
	}
	return changed;
}
/** Global operator-norm bound for the Gaussian rank-one Jacobian perturbation. */
export const TYPE_JACOBIAN_BOUND = TYPE_MAX_PULL / (TYPE_RADIUS * Math.sqrt(Math.E));
export interface TypeDeformation { anchor: [number, number]; pull: [number, number]; velocity: [number, number] }
export const typeDeformation = (): TypeDeformation => ({ anchor: [0.5, 0.5], pull: [0, 0], velocity: [0, 0] });

/** Inverse material map, in a height-normalized sheet. No repeated image advection. */
export function typeMap(x: number, y: number, aspect: number, state: TypeDeformation) {
	const qx = (x - state.anchor[0]) * aspect, qy = y - state.anchor[1];
	const weight = Math.exp(-(qx * qx + qy * qy) / (2 * TYPE_RADIUS ** 2));
	const gx = -qx / TYPE_RADIUS ** 2 * weight, gy = -qy / TYPE_RADIUS ** 2 * weight;
	return { u: x * aspect - state.pull[0] * weight, v: y - state.pull[1] * weight,
		// Row-major inverse-map Jacobian in physical sheet coordinates.
		jacobian: [1 - state.pull[0] * gx, -state.pull[0] * gy, -state.pull[1] * gx, 1 - state.pull[1] * gy] };
}

export function typeWaveWeight(kx: number, ky: number, jacobian: readonly number[], width: number, height: number, aspect: number): number {
	const tx = jacobian[0] * kx + jacobian[2] * ky, ty = jacobian[1] * kx + jacobian[3] * ky;
	const smooth = (a: number, b: number, value: number) => { const t = Math.max(0, Math.min(1, (value - a) / (b - a))); return t * t * (3 - 2 * t); };
	const frequency = Math.hypot(tx, ty);
	const envelope = smooth(180, 420, frequency) * (1 - smooth(1550, 2700, frequency));
	const dx = tx * aspect / width, dy = ty / height;
	return envelope * Math.exp(-(dx * dx + dy * dy) / 24) * (1 - smooth(1.5, 3, Math.max(Math.abs(dx), Math.abs(dy))));
}

export interface MaterialTypeSource { width: number; height: number; data: Uint8Array<ArrayBuffer>; aspect: number }
/** Local shading-normal reconstruction; native height and coverage stay exact. */
export function smoothTypeProfile<T extends { width: number; height: number; data: Uint8Array<ArrayBuffer> }>(profile: T): T {
	const { width,height,data }=profile;
	// Two box convolutions form a compact tent kernel. Its support is .02 of
	// sheet height, independently of DPR; the old profile's fixed pixel kernel
	// exposed raster/chamfer direction ridges under a coherent clear-coat light.
	const radius=Math.max(1,Math.round(height*.005)),span=radius*2+1;
	const scratch=new Uint8Array(width*height*2);
	const columns=new Int32Array(width*2);
	for(let pass=0;pass<2;pass++){
		for(let y=0;y<height;y++)for(let channel=0;channel<2;channel++){
			let sum=0;
			for(let offset=-radius;offset<=radius;offset++)sum+=data[(y*width+Math.max(0,Math.min(width-1,offset)))*4+channel];
			for(let x=0;x<width;x++){
				scratch[(y*width+x)*2+channel]=Math.round(sum/span);
				sum+=data[(y*width+Math.min(width-1,x+radius+1))*4+channel]-data[(y*width+Math.max(0,x-radius))*4+channel];
			}
		}
		// Visit contiguous rows instead of striding down every column. Exact
		// integer window sums preserve the existing rounding at both passes.
		columns.fill(0);
		for(let offset=-radius;offset<=radius;offset++){
			const row=Math.max(0,Math.min(height-1,offset))*width*2;
			for(let i=0;i<columns.length;i++)columns[i]+=scratch[row+i];
		}
		for(let y=0;y<height;y++){
			const target=y*width*4,enter=Math.min(height-1,y+radius+1)*width*2,leave=Math.max(0,y-radius)*width*2;
			for(let x=0;x<width;x++)for(let channel=0;channel<2;channel++){
				const i=x*2+channel;
				data[target+x*4+channel]=Math.round(columns[i]/span);
				columns[i]+=scratch[enter+i]-scratch[leave+i];
			}
		}
	}
	return profile;
}
export interface MaterialTypeExperiment extends LiquidExperiment {
	updateSource(source: MaterialTypeSource): Promise<void>;
	setFinish(finish: 'velvet' | 'enamel'): void;
	setLight(angle: number): void;
	setBaseline(baseline: boolean): void;
	setGeometryMotion(enabled: boolean): void;
	/** Restore a known in-surface endpoint after force idle, without painting. */
	primeInput(x: number, y: number): void;
	setDeformation(pullX: number, pullY: number, x?: number, y?: number): void;
	brush(from: readonly number[], to: readonly number[]): void;
}

const SHADER = /* wgsl */ `
struct Params { display: vec4f, warp: vec4f, optics: vec4f };
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> pile: array<vec2f>;
@group(0) @binding(2) var profile: texture_2d<f32>;
@group(0) @binding(3) var linearSampler: sampler;
@group(0) @binding(4) var<storage, read> polished: array<f32>;
struct Vertex { @builtin(position) position: vec4f, @location(0) uv: vec2f };
@vertex fn vertex(@builtin(vertex_index) i: u32) -> Vertex {
	let p = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
	var out: Vertex; out.position = vec4f(p * 2.0 - 1.0, 0, 1); out.uv = vec2f(p.x, 1.0 - p.y); return out;
}
fn cubic(f: f32) -> vec4f {
	let f2 = f*f; let f3 = f2*f; let r = 1.0-f;
	return vec4f(r*r*r, 3.0*f3-6.0*f2+4.0, -3.0*f3+3.0*f2+3.0*f+1.0, f3)/6.0;
}
fn materialStateAt(uv: vec2f) -> vec3f {
	let p = clamp(uv, vec2f(0), vec2f(1))*vec2f(95,63); let cell = vec2i(floor(p));
	let wx = cubic(fract(p.x)); let wy = cubic(fract(p.y)); var state = vec3f(0);
	for (var y = 0; y < 4; y++) { for (var x = 0; x < 4; x++) {
		let q = clamp(cell+vec2i(x-1,y-1), vec2i(0), vec2i(95,63));
		let i=u32(q.y*96+q.x); state += vec3f(pile[i],polished[i])*wx[x]*wy[y];
	} }
	return state;
}
fn square(x: f32) -> f32 { return x*x; }
@fragment fn fragment(in: Vertex) -> @location(0) vec4f {
	let aspect = params.display.z; let p = in.uv*vec2f(aspect,1);
	let q = p-params.warp.xy*vec2f(aspect,1); let radius2 = ${TYPE_RADIUS ** 2};
	let influence = exp(-dot(q,q)/(2.0*radius2));
	let pull = params.warp.zw*(1.0-params.optics.y)*params.optics.z;
	let material = p-pull*influence;
	let gradient = -q/radius2*influence;
	// B=du/dx. Thus I^-1=B B^T and a material k appears as B^T k.
	let bx = vec2f(1,0)-pull*gradient.x;
	let by = vec2f(0,1)-pull*gradient.y;
	let uv = material/vec2f(aspect,1);
	let uvDx = dpdx(uv); let uvDy = dpdy(uv);
	let source = textureSampleGrad(profile,linearSampler,uv,uvDx,uvDy);
	// Source coverage is rasterized at actual physical pixels. The bounded
	// warp changes its footprint only modestly; four subpixel taps cover it.
	var coverage = source.a;
	if (dot(pull,pull)>0.00000001) {
		coverage = 0.25*(textureSampleLevel(profile,linearSampler,uv+0.25*uvDx+0.25*uvDy,0).a
			+textureSampleLevel(profile,linearSampler,uv-0.25*uvDx+0.25*uvDy,0).a
			+textureSampleLevel(profile,linearSampler,uv+0.25*uvDx-0.25*uvDy,0).a
			+textureSampleLevel(profile,linearSampler,uv-0.25*uvDx-0.25*uvDy,0).a);
	}
	let inside = all(uv>=vec2f(0)) && all(uv<=vec2f(1));
	coverage *= select(0.0,1.0,inside);
	var finish = 0.0;
	// Finite-band illustration of Kalinov et al. 2026 §4.4, not their full
	// adaptive spectrum/isotropy algorithm. Phases stay in material space.
	for (var direction = 0; direction < 4; direction++) {
		let angle = f32(direction)*0.785398163+0.13;
		let axis = vec2f(cos(angle),sin(angle));
		for (var band = 0; band < 3; band++) {
			let frequency = 420.0*pow(2.33,f32(band)); let k = axis*frequency;
			let apparent = vec2f(dot(bx,k),dot(by,k)); let observed = length(apparent);
			let envelope = smoothstep(180.0,420.0,observed)*(1.0-smoothstep(1550.0,2700.0,observed));
			let phase = dot(k,material)+f32(direction*11+band*7)*1.6180339;
			let screen = vec2f(dpdx(phase),dpdy(phase));
			let footprint = exp(-dot(screen,screen)/24.0)*(1.0-smoothstep(1.5,3.0,max(abs(screen.x),abs(screen.y))));
			finish += sin(phase)*envelope*footprint/12.0;
		}
	}
	finish *= 1.0-params.optics.y;
	var materialState=vec3f(0,-0.62,0);
	if(params.optics.y<0.5){materialState=materialStateAt(uv);}
	let polish=clamp(materialState.z,0.0,1.0);
	let microSlope = vec2f(dpdx(finish)*params.display.x/aspect,dpdy(finish)*params.display.y)*0.00028;
	let profileSlope = (source.rg-vec2f(128.0/255.0))*4.0;
	let transportedSlope = vec2f(dot(bx,profileSlope),dot(by,profileSlope));
	let coatNormal = normalize(vec3f(-transportedSlope,1));
	let normal = normalize(vec3f(-transportedSlope-microSlope,1));
	let light = normalize(vec3f(cos(params.optics.x)*0.8,sin(params.optics.x)*0.8,0.8));
	let view = vec3f(0,0,1); let halfway = normalize(light+view);
	let lean = materialState.xy;
	let napNormal = normalize(vec3f(lean*1.2+normal.xy*0.35,0.85));
	let nap = pow(clamp(0.5+0.5*dot(napNormal,light),0.0,1.0),2.8);
	let velvet = vec3f(0.19,0.018,0.053)*(0.17+2.35*nap+finish*0.22)
		+vec3f(0.15,0.055,0.072)*pow(max(dot(normal,halfway),0.0),12.0)*0.18;
	// Polishing changes only micro-roughness, never color or glyph coverage.
	// The 1D reflected area light is analytically convolved with a Gaussian
	// slope spread: broad/dim when frosted, narrow/bright when polished.
	// Width * amplitude stays constant; this is illustrative, not a full BRDF.
	let reflection = reflect(-view,coatNormal);
	let lightAxis = normalize(light.xy);
	let reflectedCoordinate = dot(reflection.xy,lightAxis);
	let roughness=mix(0.44,0.045,polish);
	let stripWidth=sqrt(square(${TYPE_GLAZE_LIGHT_WIDTH})+square(roughness));
	let strip=${TYPE_GLAZE_LIGHT_WIDTH}/stripWidth*exp(-square((reflectedCoordinate+0.025)/stripWidth));
	let broad = exp(-square((reflectedCoordinate-0.32)/0.5));
	let fresnel = 0.08+0.92*pow(1.0-clamp(dot(coatNormal,view),0.0,1.0),5.0);
	let ceramic = vec3f(0.24,0.43,0.29)*(0.3+0.7*max(dot(normal,light),0.0))
		+vec3f(0.9,0.94,0.80)*pow(max(dot(normal,halfway),0.0),48.0)*0.08
		+vec3f(0.85,0.95,0.93)*strip*(1.25+fresnel*0.6)+vec3f(0.12,0.23,0.15)*broad;
	let radiance = mix(velvet,ceramic,params.display.w);
	let color = pow(vec3f(1)-exp(-max(radiance,vec3f(0))*1.15),vec3f(1.0/2.2));
	return vec4f(color*coverage,coverage);
}`;

export async function createMaterialType(device: GPUDevice, format: GPUTextureFormat, initial: MaterialTypeSource): Promise<MaterialTypeExperiment> {
	const module = device.createShaderModule({ label: 'Native material typography with fixed-phase finish', code: SHADER });
	const pipeline = await device.createRenderPipelineAsync({ label: 'Material glyph', layout: 'auto', vertex: { module, entryPoint: 'vertex' }, fragment: { module, entryPoint: 'fragment', targets: [{ format }] } });
	const pile = createPileField(), polish=new Float32Array(TYPE_COLUMNS*TYPE_ROWS), state = typeDeformation();
	const storage = device.createBuffer({ size: pile.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
	const polishStorage=device.createBuffer({size:polish.byteLength,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});
	const uniform = device.createBuffer({ size: 48, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
	const sampler = device.createSampler({ minFilter: 'linear', magFilter: 'linear' });
	const values = new Float32Array([1,1,initial.aspect,0,0.5,0.5,0,0,-2.25,0,0,0]);
	let profile: GPUTexture | undefined, group: GPUBindGroup | undefined;
	let width = 1, height = 1, sourceWidth = 0, sourceHeight = 0, generation = 0, disposed = false, profileBytes = 0;
	let pending: GPUTexture | undefined, pendingBytes = 0, brushCount = 0, renders = 0, sourceUploads = 0;
	let previous: { screen: number[]; material: number[] } | undefined;
	const fixedBytes = pile.byteLength + polish.byteLength + 48;
	const updateSource = async (source: MaterialTypeSource) => {
		if (disposed) return;
		presentationSize(source.width,source.height,1,device.limits.maxTextureDimension2D);
		if (source.data.length !== source.width*source.height*4 || !Number.isFinite(source.aspect) || source.aspect<=0) throw new Error('Invalid native material glyph source.');
		const candidateBytes = source.width*source.height*4;
		const outputBytes = Math.max(width*height,source.width*source.height)*4;
		if (fixedBytes+candidateBytes+outputBytes>128*1024*1024 || fixedBytes+profileBytes+candidateBytes+outputBytes>192*1024*1024) throw new Error('Native material typography exceeds its source/output transition budget; no downsampling was used.');
		// Reject before invalidating a valid in-flight source. A newer rejected
		// request must not leave the older promise adopting a destroyed texture.
		const token = ++generation;
		pending?.destroy(); pending = undefined; pendingBytes = 0;
		let candidate: GPUTexture | undefined;
		device.pushErrorScope('validation'); device.pushErrorScope('out-of-memory');
		let failure: unknown, candidateGroup: GPUBindGroup | undefined;
		try {
			candidate = device.createTexture({ label: 'Native glyph profile', size: [source.width,source.height], format: 'rgba8unorm', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
			pending = candidate; pendingBytes = candidateBytes;
			device.queue.writeTexture({ texture: candidate }, source.data, { bytesPerRow: source.width*4 }, [source.width,source.height]);
			candidateGroup = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: uniform } }, { binding: 1, resource: { buffer: storage } }, { binding: 2, resource: candidate.createView() }, { binding: 3, resource: sampler }, {binding:4,resource:{buffer:polishStorage}}] });
		} catch (error) { failure = error; }
		const errors = await Promise.all([device.popErrorScope(),device.popErrorScope()]);
		if (pending === candidate) { pending = undefined; pendingBytes = 0; }
		if (disposed || token!==generation) { candidate?.destroy(); return; }
		if (failure || errors.some(Boolean) || !candidate || !candidateGroup) { candidate?.destroy(); throw failure ?? new Error(errors.find(Boolean)?.message ?? 'Glyph source allocation failed.'); }
		profile?.destroy(); profile = candidate; group = candidateGroup; profileBytes = candidateBytes;
		sourceWidth = source.width; sourceHeight = source.height; values[2] = source.aspect; sourceUploads++;
	};
	const uploadPile = () => device.queue.writeBuffer(storage,0,pile);
	const uploadPolish=()=>device.queue.writeBuffer(polishStorage,0,polish);
	const inputPoint=(x:number,y:number)=>{
		const mapped=typeMap(x,y,values[2],state);
		return {screen:[x,y],material:values[10]?[mapped.u/values[2],mapped.v]:[x,y]};
	};
	const brush = (from: readonly number[], to: readonly number[]) => {
		if(disposed||values[9])return;
		if(values[3]){if(polishType(polish,from,to,values[2])){uploadPolish();brushCount++;}}
		else if(brushPile(pile,from,to,values[2])){uploadPile();brushCount++;}
	};
	uploadPile();uploadPolish();
	try { await updateSource(initial); } catch (error) { storage.destroy();polishStorage.destroy(); uniform.destroy(); throw error; }
	return {
		get memoryBytes() { return fixedBytes+profileBytes+pendingBytes; },
		updateSource,
		resize(w,h) {
			const size = presentationSize(w,h,1,device.limits.maxTextureDimension2D);
			const output=size.width*size.height*4;
			if(fixedBytes+Math.max(profileBytes,pendingBytes)+output>128*1024*1024 || fixedBytes+profileBytes+pendingBytes+output+width*height*4>192*1024*1024) throw new Error('Native material typography resize exceeds its source/output budget; no downsampling was used.');
			width=size.width;height=size.height;values[0]=width;values[1]=height;
		},
		setFinish(finish) { if(values[3]!==Number(finish==='enamel')){values[3]=Number(finish==='enamel');previous=undefined;} },
		setLight(angle) { if (Number.isFinite(angle)) values[8]=angle; },
		setBaseline(baseline) { if(values[9]!==Number(baseline)){values[9]=Number(baseline);previous=undefined;} },
		setGeometryMotion(enabled) { if(values[10]!==Number(enabled)){values[10]=Number(enabled);state.pull=[0,0];state.velocity=[0,0];previous=undefined;} },
		primeInput(x,y) { if(!disposed&&!values[9]&&[x,y].every(Number.isFinite))previous=inputPoint(x,y); },
		setDeformation(px,py,x=0.5,y=0.5) {
			if (![px,py,x,y].every(Number.isFinite)) return;
			const scale=Math.min(1,TYPE_MAX_PULL/Math.max(Math.hypot(px,py),1e-9));
			state.pull=[px*scale,py*scale]; state.anchor=[x,y]; state.velocity=[0,0];
		},
		brush,
		endInput() { previous=undefined; },
		reset() { pile.set(createPileField());polish.fill(0);uploadPile();uploadPolish(); state.pull=[0,0]; state.velocity=[0,0]; previous=undefined; brushCount=0; },
		step(_encoder: GPUCommandEncoder,dt: number,input: LiquidInput) {
			if (disposed || values[9] || !Number.isFinite(dt) || dt<=0) return;
			const elapsed=Math.min(dt,1/60); const active=input.active && [input.x,input.y,input.vx,input.vy].every(Number.isFinite);
			if (active) { const follow=1-Math.exp(-18*elapsed); state.anchor[0]+=(input.x-state.anchor[0])*follow; state.anchor[1]+=(input.y-state.anchor[1])*follow; }
			let tx=active&&values[10]?input.vx*values[2]*0.075:0, ty=active&&values[10]?input.vy*0.075:0;
			const scale=Math.min(1,TYPE_MAX_PULL/Math.max(Math.hypot(tx,ty),1e-9)); tx*=scale; ty*=scale;
			for (let i=0;i<2;i++) { const target=i===0?tx:ty; state.velocity[i]=(state.velocity[i]+elapsed*140*(target-state.pull[i]))/(1+elapsed*22); state.pull[i]+=elapsed*state.velocity[i]; }
			const length=Math.hypot(...state.pull); if (length>TYPE_MAX_PULL) { state.pull[0]*=TYPE_MAX_PULL/length; state.pull[1]*=TYPE_MAX_PULL/length; }
			if (!active) { previous=undefined; return; }
			if (!previous || previous.screen[0]!==input.x || previous.screen[1]!==input.y) {
				const current=inputPoint(input.x,input.y);
				if (previous) brush(previous.material,current.material);
				previous=current;
			}
		},
		render(encoder,target) {
			if (disposed || !group) return;
			values.set([...state.anchor,...state.pull],4); device.queue.writeBuffer(uniform,0,values);
			const pass=encoder.beginRenderPass({ label:'Native material lettering', colorAttachments:[{view:target,loadOp:'clear',storeOp:'store',clearValue:[0,0,0,0]}] });
			pass.setPipeline(pipeline); pass.setBindGroup(0,group); pass.draw(3); pass.end(); renders++;
		},
		async inspect(): Promise<LiquidSnapshot> {
			let checksum=0,changed=0; for(let i=0;i<pile.length;i+=2) { checksum+=pile[i]*(i+1)+pile[i+1]*(i+2); if(Math.abs(pile[i])+Math.abs(pile[i+1]+0.62)>0.01) changed++; }
			let polishSum=0,polishedCells=0;for(const value of polish){polishSum+=value;if(value>.01)polishedCells++;}
			return { finite:[...state.pull,...state.velocity,...state.anchor,checksum].every(Number.isFinite), mass:0,initialMass:0,min:1-TYPE_JACOBIAN_BOUND,max:Math.hypot(...state.pull),kinetic:state.velocity[0]**2+state.velocity[1]**2,
				details:{ checksum,changedCells:changed,polishSum,polishedCells,brushCount,renders,sourceUploads,sourceWidth,sourceHeight,profileBytes,pendingBytes,fixedBytes,light:values[8],baseline:values[9],geometryMotion:values[10],finish:values[3],width,height,aspect:values[2],pullX:state.pull[0],pullY:state.pull[1],anchorX:state.anchor[0],anchorY:state.anchor[1],jacobianBound:TYPE_JACOBIAN_BOUND,outputBytes:width*height*4 } };
		},
		dispose() { if(disposed)return; disposed=true;generation++;pending?.destroy();profile?.destroy();storage.destroy();polishStorage.destroy();uniform.destroy(); }
	};
}
