import type { LiquidExperiment } from './types.js';
import { advanceMeniscus, createMeniscusState, meniscusArea, meniscusScale, meniscusTarget, MENISCUS_MODES } from './magnetic-meniscus-model.js';

export interface MagneticMeniscus extends LiquidExperiment {
	setMagnet(x: number, y: number, active: boolean, immediate?: boolean): void;
	setStrength(value: number): void;
	finish(): void;
}
const SHADER = /* wgsl */ `
struct Params { display: vec4f, control: vec4f, modes: array<vec4f, ${MENISCUS_MODES / 2}> };
@group(0) @binding(0) var<uniform> p: Params;
struct Vertex { @builtin(position) position: vec4f, @location(0) uv: vec2f };
@vertex fn vertex(@builtin(vertex_index) i: u32) -> Vertex {
	let q = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
	return Vertex(vec4f(q * 2.0 - 1.0, 0, 1), vec2f(q.x, 1.0 - q.y));
}
@fragment fn fragment(v: Vertex) -> @location(0) vec4f {
	let xy = (v.uv - 0.5) * p.display.xy / min(p.display.x, p.display.y);
	let angle = atan2(xy.y, xy.x); var radius = 1.0; var slope = 0.0;
	for (var i = 0u; i < ${MENISCUS_MODES}u; i++) {
		let pair = p.modes[i / 2u]; let a = pair[(i % 2u) * 2u]; let b = pair[(i % 2u) * 2u + 1u];
		let n = f32(i + 1u); let c = cos(n * angle); let s = sin(n * angle);
		radius += a * c + b * s; slope += n * (-a * s + b * c);
	}
	radius *= p.control.x; slope *= p.control.x;
	let radial = length(xy); let d = radial - radius;
	// Radial distance is not a signed distance where modes make a steep edge.
	// Its actual native footprint includes that slope; a fixed pixel underfilters.
	let aa = max(fwidth(d), 0.5 / min(p.display.x, p.display.y));
	let rimWidth = 0.018;
	let outer = smoothstep(-aa, aa, d + rimWidth);
	let band = (1.0 - smoothstep(-aa, aa, d - rimWidth)) * outer;
	let radialNormal = vec2f(cos(angle), sin(angle));
	let tangent = vec2f(-radialNormal.y, radialNormal.x);
	let boundaryNormal = normalize(radialNormal - tangent * slope / max(radius, 0.001));
	let cross = clamp(d / rimWidth, -0.999, 0.999);
	let normal = normalize(vec3f(boundaryNormal * cross, sqrt(max(0.001, 1.0 - cross * cross))));
	let light = normalize(vec3f(-0.5, -0.7, 1.1));
	let spec = pow(max(0.0, dot(normal, normalize(light + vec3f(0, 0, 1)))), 45.0);
	let stripe = pow(max(0.0, dot(normal, normalize(vec3f(0.7, 0.1, 0.65)))), 16.0);
	let dark = vec3f(0.035, 0.05, 0.055);
	let metal = dark + vec3f(0.65, 0.81, 0.8) * spec + vec3f(0.24, 0.32, 0.33) * stripe;
	let background = vec3f(0.08, 0.11, 0.115);
	let outside = smoothstep(-aa, aa, d - rimWidth);
	let alpha = clamp(outside + band, 0.0, 1.0);
	return vec4f(mix(background, metal, band) * alpha, alpha);
}`;

export async function createMagneticMeniscus(device: GPUDevice, format: GPUTextureFormat): Promise<MagneticMeniscus> {
	const shader = device.createShaderModule({ code: SHADER, label: 'constant-area magnetic-inspired meniscus' });
	const pipeline = await device.createRenderPipelineAsync({ layout: 'auto', vertex: { module: shader, entryPoint: 'vertex' },
		fragment: { module: shader, entryPoint: 'fragment', targets: [{ format }] }, primitive: { topology: 'triangle-list' } });
	device.pushErrorScope('out-of-memory'); device.pushErrorScope('validation');
	let uniform: GPUBuffer | undefined, bind: GPUBindGroup;
	try {
		uniform = device.createBuffer({ size: 128, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
		bind = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: uniform } }] });
	} catch (reason) {
		// Pop synchronously before yielding: another instance shares this device.
		const scopes = [device.popErrorScope(), device.popErrorScope()];
		uniform?.destroy(); await Promise.all(scopes); throw reason;
	}
	const errors = await Promise.allSettled([device.popErrorScope(), device.popErrorScope()]);
	const failed = errors.find((result) => result.status === 'rejected' || result.value !== null);
	if (failed) {
		uniform.destroy();
		throw failed.status === 'rejected' ? failed.reason : new Error(failed.value!.message);
	}
	const buffer = uniform;
	const state = createMeniscusState(), values = new Float32Array(32);
	let width = 1, height = 1, mx = 0.5, my = 0.5, active = false, strength = 1;
	function target() {
		if (active) state.target.set(meniscusTarget((mx - 0.5) * width / Math.min(width, height), (my - 0.5) * height / Math.min(width, height), strength));
		else state.target.fill(0);
	}
	return {
		memoryBytes: 128,
		resize(w, h) { width = w; height = h; target(); },
		setMagnet(x, y, on, immediate = false) { mx = x; my = y; active = on; target(); if (immediate) state.modes.set(state.target); },
		setStrength(value) { strength = Math.max(0, Math.min(1.5, value)); target(); },
		finish() { state.modes.set(state.target); },
		reset() { active = false; state.target.fill(0); state.modes.fill(0); },
		step(_encoder, dt) {
			advanceMeniscus(state, dt);
			if (state.modes.every((v, i) => Math.abs(v - state.target[i]) < 1e-6)) state.modes.set(state.target);
		},
		render(encoder, view) {
			values.set([width, height, 0, 0, meniscusScale(state.modes), 0, 0, 0]); values.set(state.modes, 8); device.queue.writeBuffer(buffer, 0, values);
			const pass = encoder.beginRenderPass({ colorAttachments: [{ view, clearValue: [0, 0, 0, 0], loadOp: 'clear', storeOp: 'store' }] });
			pass.setPipeline(pipeline); pass.setBindGroup(0, bind); pass.draw(3); pass.end();
		},
		async inspect() {
			let kinetic = 0; const details: Record<string, number> = { width, height, active: +active, mx, my, strength, area: meniscusArea(state.modes) };
			state.modes.forEach((v, i) => { details['q' + i] = v; kinetic += (v - state.target[i]) ** 2; });
			return { finite: state.modes.every(Number.isFinite), mass: details.area, initialMass: Math.PI * 0.09, min: Math.min(...state.modes), max: Math.max(...state.modes), kinetic, details };
		},
		dispose() { buffer.destroy(); }
	};
}
