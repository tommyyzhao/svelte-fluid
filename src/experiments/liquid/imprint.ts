import type { LiquidExperiment } from './types.js';
import { IMPRINT_CAPACITY, IMPRINT_COMMANDS, IMPRINT_MARK_RADIUS, ImprintHistory, imprintAt, imprintDistanceProfile, imprintTool,
	type ImprintMask, type ImprintProfile, type ImprintTool } from './imprint-tools.js';

export interface ImprintExperiment extends LiquidExperiment {
	stamp(x: number, y: number, immediate?: boolean): boolean;
	smooth(immediate?: boolean): void;
	finish(): void;
	setTool(tool: Partial<ImprintTool>): void;
	updateMask(mask: ImprintMask): Promise<void>;
	readonly count: number;
	readonly marked: boolean;
}

const COMMAND_BYTES = IMPRINT_COMMANDS * 48;
const SOURCE = /* wgsl */ `
struct Impression { placement: vec4f, shape: vec4f, response: vec4f };
@group(0) @binding(0) var<storage,read> impressions: array<Impression>;
@group(0) @binding(1) var<uniform> display: vec4f;
@group(0) @binding(2) var signet: texture_2d<f32>;
struct Vertex { @builtin(position) position: vec4f, @location(0) uv: vec2f };
@vertex fn vertex(@builtin(vertex_index) index: u32) -> Vertex {
	let p=array<vec2f,3>(vec2f(-1,-1),vec2f(3,-1),vec2f(-1,3))[index];
	return Vertex(vec4f(p,0,1),p*vec2f(0.5,-0.5)+0.5);
}
fn sourceCell(q: vec2i, dimensions: vec2i) -> f32 { return textureLoad(signet,clamp(q,vec2i(0),dimensions-1),0).r; }
fn sourceProfile(uv: vec2f) -> vec3f {
	let dimensions=vec2i(textureDimensions(signet)); let size=vec2f(dimensions);
	let p=uv*size-0.5; let q=vec2i(floor(p)); let f=fract(p);
	let a=sourceCell(q,dimensions); let b=sourceCell(q+vec2i(1,0),dimensions);
	let c=sourceCell(q+vec2i(0,1),dimensions); let d=sourceCell(q+vec2i(1,1),dimensions);
	return vec3f(mix(mix(a,b,f.x),mix(c,d,f.x),f.y),mix(b-a,d-c,f.y)*size.x,mix(c-a,d-b,f.x)*size.y);
}
fn toolProfile(uv: vec2f, tool: Impression) -> vec3f {
	let delta=(uv-tool.placement.xy)/tool.placement.z;
	let c=tool.shape.y; let s=tool.shape.z;
	let p=vec2f(delta.x*c+delta.y*s,-delta.x*s+delta.y*c);
	if (any(abs(p)>vec2f(0.5)) || length(uv-0.5)>${IMPRINT_MARK_RADIUS}) { return vec3f(0); }
	let r=max(length(p),0.0000001); var distance=vec3f(0);
	if (tool.shape.x<1.5) { distance=sourceProfile(p+0.5); }
	else if (tool.shape.x<2.5) {
		let angle=atan2(p.y,p.x); let boundary=0.285+0.055*cos(8.0*angle);
		let dr=-0.44*sin(8.0*angle); let offset=r-boundary;
		let gradient=p/r-dr*vec2f(-p.y,p.x)/(r*r);
		distance=vec3f(0.024-abs(offset),-sign(offset)*gradient);
	} else if (tool.shape.x<3.5) {
		let tooth=(p.x+0.0375)-0.075*floor((p.x+0.0375)/0.075)-0.0375;
		distance=vec3f(0.011-abs(tooth),-sign(tooth),0);
		if (0.30-abs(p.y)<distance.x) { distance=vec3f(0.30-abs(p.y),0,-sign(p.y)); }
		if (0.31-abs(p.x)<distance.x) { distance=vec3f(0.31-abs(p.x),-sign(p.x),0); }
	} else { let offset=r-0.31; distance=vec3f(0.025-abs(offset),-sign(offset)*p/r); }
	if (0.5-abs(p.x)<distance.x) { distance=vec3f(0.5-abs(p.x),-sign(p.x),0); }
	if (0.5-abs(p.y)<distance.x) { distance=vec3f(0.5-abs(p.y),0,-sign(p.y)); }
	let bevel=max(tool.shape.w,1.25*max(1.0/display.x,1.0/display.y)/tool.placement.z);
	let t=clamp(0.5+distance.x/bevel,0.0,1.0);
	let depth=tool.placement.w*t*t*(3.0-2.0*t);
	let localGradient=tool.placement.w*6.0*t*(1.0-t)/bevel*distance.yz;
	let gradient=vec2f(localGradient.x*c-localGradient.y*s,localGradient.x*s+localGradient.y*c)/tool.placement.z;
	return vec3f(depth,gradient);
}
fn relief(uv: vec2f) -> vec3f {
	var rest=vec3f(0); var height=vec3f(0); var exact=true;
	for (var i=0u;i<u32(display.z);i++) {
		let tool=impressions[i]; var next=vec3f(0);
		if (tool.shape.x>0.5) { let depth=toolProfile(uv,tool); next=select(rest,depth,depth.x>rest.x); }
		height+=(next-rest)*tool.response.x; rest=next; exact=exact && tool.response.x==1.0;
	}
	return select(height,rest,exact);
}
fn radius(uv: vec2f) -> f32 {
	let a=atan2(uv.y-0.5,uv.x-0.5); return 0.385+0.008*sin(5.0*a)+0.004*sin(9.0*a);
}
@fragment fn fragment(in: Vertex) -> @location(0) vec4f {
	let r=length(in.uv-0.5)/radius(in.uv); let edge=radius(in.uv)-length(in.uv-0.5);
	let aa=max(fwidth(edge),0.0000001); let alpha=smoothstep(-aa,aa,edge);
	let base=0.045*sqrt(max(0.0,1.0-r*r));
	let baseGradient=vec2f(dpdx(base)*display.x,dpdy(base)*display.y);
	let mark=relief(in.uv); let normal=normalize(vec3f(-(baseGradient-0.012*mark.yz),1));
	let light=normalize(vec3f(-0.45,-0.65,1)); let view=normalize(vec3f((0.5-in.uv)*0.5,1.8));
	let nx=dpdx(normal); let ny=dpdy(normal);
	let variance=(dot(nx,nx)+dot(ny,ny))/12.0;
	let exponent=44.0/(1.0+44.0*variance);
	let gloss=pow(max(dot(normal,normalize(light+view)),0.0),exponent)*exponent/44.0;
	let body=vec3f(0.28,0.024,0.037)*(0.35+0.65*max(dot(normal,light),0.0));
	let radiance=body*(1.0-0.16*clamp(mark.x,0.0,1.0))+vec3f(0.9,0.68,0.53)*gloss*0.38;
	let color=pow(vec3f(1)-exp(-radiance*2.1),vec3f(1.0/2.2));
	return vec4f(color*alpha,alpha);
}
`;

/** Maximum-depth material memory; not a volume-conserving or calibrated wax solver. */
export async function createImprint(device: GPUDevice, format: GPUTextureFormat, mask: ImprintMask): Promise<ImprintExperiment> {
	const shader = device.createShaderModule({ label: 'Native ordered wax impressions', code: SOURCE });
	const errors = (await shader.getCompilationInfo()).messages.filter((message) => message.type === 'error');
	if (errors.length) throw new Error(errors.map((message) => message.message).join('\n'));
	const layout = device.createBindGroupLayout({ entries: [
		{ binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'read-only-storage' } },
		{ binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
		{ binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'unfilterable-float' } }
	] });
	const pipeline = await device.createRenderPipelineAsync({ layout: device.createPipelineLayout({ bindGroupLayouts: [layout] }), vertex: { module: shader, entryPoint: 'vertex' },
		fragment: { module: shader, entryPoint: 'fragment', targets: [{ format }] } });
	const commands = device.createBuffer({ size: COMMAND_BYTES, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
	const uniform = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
	const history = new ImprintHistory(), serialized = new Float32Array(IMPRINT_COMMANDS * 12);
	let profile: ImprintProfile | undefined, texture: GPUTexture | undefined, group: GPUBindGroup | undefined;
	let pending: GPUTexture | undefined, pendingBytes = 0, generation = 0;
	let width = 1, height = 1, disposed = false, dirty = true, renders = 0, uploads = 0;
	let tool = imprintTool(), sourceBuildMs = 0, sourceUploadMs = 0;
	const sourceBytes = () => profile ? profile.data.byteLength : 0;
	async function updateMask(next: ImprintMask) {
		if (disposed) return;
		if (next.width > device.limits.maxTextureDimension2D || next.height > device.limits.maxTextureDimension2D) throw new Error('Native signet source exceeds the device dimension limit.');
		const bytes = next.width * next.height * 4;
		if (bytes + width * height * 4 + COMMAND_BYTES + 16 > 128 * 1048576) throw new Error('Native imprint exceeds its 128 MiB source/output budget. No downsampled source was substituted.');
		if (bytes + sourceBytes() + width * height * 8 + COMMAND_BYTES + 16 > 256 * 1048576) throw new Error('Native imprint source transition exceeds 256 MiB. No downsampled source was substituted.');
		const id = ++generation; pending?.destroy(); pending = undefined; pendingBytes = 0;
		const start = performance.now(), candidateProfile = imprintDistanceProfile(next); sourceBuildMs = performance.now() - start;
		device.pushErrorScope('out-of-memory'); device.pushErrorScope('validation');
		let candidate: GPUTexture | undefined, candidateGroup: GPUBindGroup | undefined, synchronousError: unknown;
		const uploadStart = performance.now();
		try {
			candidate = device.createTexture({ label: 'Native signet signed-distance profile', size: [next.width, next.height], format: 'r32float', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
			pending = candidate; pendingBytes = bytes;
			device.queue.writeTexture({ texture: candidate }, candidateProfile.data, { bytesPerRow: next.width * 4 }, [next.width, next.height]);
			candidateGroup = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [
				{ binding: 0, resource: { buffer: commands } }, { binding: 1, resource: { buffer: uniform } }, { binding: 2, resource: candidate.createView() }
			] });
		} catch (error) { synchronousError = error; }
		const validation = device.popErrorScope(), oom = device.popErrorScope();
		const failures = await Promise.all([validation, oom]); sourceUploadMs = performance.now() - uploadStart;
		if (disposed || id !== generation) { candidate?.destroy(); return; }
		pending = undefined; pendingBytes = 0;
		if (synchronousError || failures.some(Boolean)) { candidate?.destroy(); throw new Error(`Native signet refresh failed: ${String(synchronousError || failures.find(Boolean)?.message)}`); }
		texture?.destroy(); texture = candidate; group = candidateGroup; profile = candidateProfile; dirty = true;
	}
	try { await updateMask(mask); } catch (error) { commands.destroy(); uniform.destroy(); pending?.destroy(); throw error; }
	function write() {
		if (!dirty) return;
		serialized.fill(0);
		history.impressions.forEach((item, i) => {
			const angle = item.rotation * Math.PI / 180;
			serialized.set([item.x, item.y, item.size, item.depth, item.clear ? 0 : ['signet', 'rosette', 'comb', 'ring'].indexOf(item.shape) + 1,
				Math.cos(angle), Math.sin(angle), item.bevel, item.response, 0, 0, 0], i * 12);
		});
		device.queue.writeBuffer(commands, 0, serialized); device.queue.writeBuffer(uniform, 0, new Float32Array([width, height, history.impressions.length, 0]));
		dirty = false; uploads++;
	}
	return {
		get memoryBytes() { return COMMAND_BYTES + 16 + sourceBytes() + pendingBytes; },
		get count() { return history.count; }, get marked() { return history.marked; },
		resize(w, h) {
			if (disposed) return;
			if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1 || w > device.limits.maxTextureDimension2D || h > device.limits.maxTextureDimension2D || w * h > 16_777_216 ||
				w * h * 4 + sourceBytes() + COMMAND_BYTES + 16 > 128 * 1048576) throw new Error('Native imprint presentation exceeds its explicit resource budget.');
			width = w; height = h; dirty = true;
		},
		setTool(next) { if (!disposed) tool = imprintTool({ ...tool, ...next }); }, updateMask,
		stamp(x, y, immediate = false) { if (disposed) return false; const applied = history.stamp(x, y, tool, immediate); dirty ||= applied; return applied; },
		smooth(immediate = false) { if (!disposed) { history.smooth(immediate); dirty = true; } },
		finish() { if (!disposed) { history.finish(); dirty = true; } },
		reset() { if (!disposed) { history.reset(); dirty = true; } },
		step(_encoder, dt) { if (!disposed && !history.settled) { history.advance(dt); dirty = true; } },
		render(encoder, target) {
			if (disposed || !group) return;
			write(); const pass = encoder.beginRenderPass({ label: 'Native ordered impression relief', colorAttachments: [{ view: target, loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 0] }] });
			pass.setPipeline(pipeline); pass.setBindGroup(0, group); pass.draw(3); pass.end(); renders++;
		},
		async inspect() {
			if (disposed || !profile) throw new Error('Imprint disposed.');
			let historyChecksum = 2166136261;
			for (const character of JSON.stringify(history.impressions)) historyChecksum = Math.imul(historyChecksum ^ character.charCodeAt(0), 16777619) >>> 0;
			const size = 192; let sum = 0, rest = 0, min = Infinity, max = 0, error = 0, finite = true;
			for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
				const value = imprintAt(history.impressions, (x + 0.5) / size, (y + 0.5) / size, profile);
				sum += value.height; rest += value.rest; min = Math.min(min, value.height); max = Math.max(max, value.height);
				error += (value.height - value.rest) ** 2; finite &&= Number.isFinite(value.height) && Number.isFinite(value.rest);
			}
			return { finite, mass: sum, initialMass: 0, min, max, kinetic: 0, details: { meanDepth: sum / size ** 2, plasticDepth: rest / size ** 2, restError: error / size ** 2,
				impressions: history.count, commands: history.impressions.length, historyChecksum, maxImpressions: IMPRINT_CAPACITY, width, height, sourceWidth: profile.width, sourceHeight: profile.height,
				gpuHistoryBytes: COMMAND_BYTES + 16, sourceBytes: sourceBytes(), retainedCpuProfileBytes: sourceBytes(), cpuSerializedBytes: serialized.byteLength,
				outputBytes: width * height * 4, pendingSourceBytes: pendingBytes, sourceBuildMs, sourceUploadMs, renders, uploads } };
		},
		dispose() { if (!disposed) { disposed = true; generation++; commands.destroy(); uniform.destroy(); texture?.destroy(); pending?.destroy(); } }
	};
}
