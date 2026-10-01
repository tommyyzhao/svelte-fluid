import type { LiquidExperiment, LiquidSnapshot } from './types.js';
import { dewettingState, seedDewetting, advanceDewetting, finishDewetting, setDewettingSpreading,
	dewettingEnergy, dewettingProfile, DEWETTING_WIDTH, FILM_HEIGHT, RESIDUAL_HEIGHT, INNER_FRACTION,
	SHAPE_NORMALIZER } from './dewetting-model.js';

export interface DewettingExperiment extends LiquidExperiment {
	readonly moving: boolean;
	seed(x: number, y: number, immediate?: boolean): void;
	finish(): void;
	setSpreading(value: number): void;
	setViscosity(value: number): void;
	setDiagnostic(value: boolean): void;
}
const SHADER = /* wgsl */ `
struct Params { view: vec4f, hole: vec4f, profile: vec4f, options: vec4f };
@group(0) @binding(0) var<uniform> p: Params;
struct Vertex { @builtin(position) position: vec4f, @location(0) uv: vec2f };
@vertex fn vertex(@builtin(vertex_index) id: u32) -> Vertex {
	let q = vec2f(f32((id << 1u) & 2u), f32(id & 2u));
	var v: Vertex; v.position = vec4f(q * 2.0 - 1.0, 0, 1); v.uv = vec2f(q.x, 1.0 - q.y); return v;
}
@fragment fn fragment(v: Vertex) -> @location(0) vec4f {
	let point = (v.uv - 0.5) * p.view.zw + vec2f(0.9, 0.5);
	if (point.x < 0.0 || point.x > 1.8 || point.y < 0.0 || point.y > 1.0) { return vec4f(0); }
	let delta = point - p.hole.xy; let d = length(delta);
	let angle = atan2(delta.y, select(delta.x, 0.00000001, d < 0.00000001)); let phase = p.profile.y;
	let shape = (1.0 + 0.09 * cos(3.0 * angle + phase) + 0.04 * sin(5.0 * angle - phase)) / ${SHAPE_NORMALIZER};
	let derivative = (-0.27 * sin(3.0 * angle + phase) + 0.2 * cos(5.0 * angle - phase)) / ${SHAPE_NORMALIZER};
	let boundary = p.hole.z * shape; let angularBoundary = p.hole.z * derivative;
	var height = ${FILM_HEIGHT}; var radial = 0.0; var angular = 0.0;
	if (p.hole.z > 0.000001 && d < boundary) {
		let t = clamp((d / boundary - ${INNER_FRACTION}) / ${1 - INNER_FRACTION}, 0.0, 1.0);
		height = ${RESIDUAL_HEIGHT} + ${FILM_HEIGHT - RESIDUAL_HEIGHT} * t * t * (3.0 - 2.0 * t);
		let slope = ${FILM_HEIGHT - RESIDUAL_HEIGHT} * 6.0 * t * (1.0 - t) / ${1 - INNER_FRACTION};
		radial = slope / max(boundary, 0.000001); angular = -slope * d * angularBoundary / max(boundary * boundary, 0.000001);
	} else if (p.hole.z > 0.000001 && d < boundary + p.hole.w) {
		let t = (d - boundary) / p.hole.w;
		height += p.profile.x * 16.0 * t * t * (1.0 - t) * (1.0 - t);
		let slope = p.profile.x * 32.0 * t * (1.0 - t) * (1.0 - 2.0 * t) / p.hole.w;
		radial = slope; angular = -slope * angularBoundary;
	}
	if (p.options.x > 0.5) { return vec4f(vec3f(height / 0.12), 1); }
	let r = delta / max(d, 0.000001);
	let gradient = radial * r + angular / max(d, 0.000001) * vec2f(-r.y, r.x);
	let normal = normalize(vec3f(-gradient, 1.0));
	let light = normalize(vec3f(-0.45, -0.65, 1));
	let halfLight = normalize(light + vec3f(0, 0, 1));
	let highlight = pow(max(dot(normal, halfLight), 0.0), 65.0);
	let tilt = dot(normal.xy, vec2f(-0.75, 0.65));
	let pearl = mix(vec3f(0.37, 0.66, 0.68), vec3f(0.91, 0.55, 0.39), clamp(tilt * 1.5 + 0.5, 0.0, 1.0));
	let raised = clamp((height - ${FILM_HEIGHT}) / 0.035, 0.0, 1.0);
	let base = mix(vec3f(0.76, 0.69, 0.55), pearl, raised * 0.65);
	let color = base * (0.72 + 0.28 * max(dot(normal, light), 0.0)) + vec3f(0.8, 0.85, 0.74) * highlight * 0.75;
	let alpha = clamp((height - ${RESIDUAL_HEIGHT}) / ${FILM_HEIGHT - RESIDUAL_HEIGHT}, 0.0, 1.0);
	return vec4f(clamp(color, vec3f(0), vec3f(1)) * alpha, alpha);
}`;

export async function createDewetting(device: GPUDevice, format: GPUTextureFormat): Promise<DewettingExperiment> {
	const module = device.createShaderModule({ label: 'Volume-accounted dewetting rim', code: SHADER });
	const pipeline = await device.createRenderPipelineAsync({ layout: 'auto', vertex: { module, entryPoint: 'vertex' }, fragment: { module, entryPoint: 'fragment', targets: [{ format }] } });
	let candidate: GPUBuffer | undefined, binding: GPUBindGroup | undefined, failure: unknown;
	device.pushErrorScope('validation'); device.pushErrorScope('out-of-memory');
	try {
		candidate = device.createBuffer({ size: 64, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
		binding = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: candidate } }] });
	} catch (error) { failure = error; }
	// Pop synchronously before awaiting so another shared-device factory cannot
	// accidentally nest inside this allocation's error scopes.
	const reports = await Promise.allSettled([device.popErrorScope(), device.popErrorScope()]);
	const rejection = reports.find((report) => report.status === 'rejected');
	const errors = reports.flatMap((report) => report.status === 'fulfilled' && report.value ? [report.value] : []);
	if (failure || rejection || errors.length || !candidate || !binding) {
		candidate?.destroy(); throw failure ?? (rejection?.status === 'rejected' ? rejection.reason : new Error(errors[0]?.message ?? 'Dewetting allocation failed.'));
	}
	const uniform = candidate, group = binding;
	let state = dewettingState(), width = 1, height = 1, disposed = false, renders = 0, diagnostic = false;
	const values = new Float32Array(16);
	return {
		memoryBytes: 64,
		get moving() { return state.moving; },
		seed(x, y, immediate = false) { if (disposed) return; seedDewetting(state, x, y); if (immediate) finishDewetting(state); },
		finish() { if (!disposed) finishDewetting(state); },
		setSpreading(value) { if (!disposed) setDewettingSpreading(state, value); },
		setViscosity(value) { if (!Number.isFinite(value) || value < 0.7 || value > 3) throw new RangeError('Viscosity must be in [0.7, 3].'); state.viscosity = value; },
		setDiagnostic(value) { diagnostic = value; },
		resize(w, h) {
			if (![w, h].every(Number.isInteger) || w < 1 || h < 1 || w > device.limits.maxTextureDimension2D || h > device.limits.maxTextureDimension2D || w * h > 16_777_216) throw new RangeError('Native dewetting output exceeds its budget; no downsampling was used.');
			width = w; height = h;
		},
		reset() { const spreading = state.spreading, viscosity = state.viscosity; state = dewettingState(); state.spreading = spreading; state.viscosity = viscosity; },
		step(_encoder, dt) { if (!disposed) advanceDewetting(state, dt); },
		render(encoder, target) {
			if (disposed) return;
			const profile = dewettingProfile(state), aspect = width / height / DEWETTING_WIDTH;
			values.set([width, height, DEWETTING_WIDTH * Math.max(1, aspect), Math.max(1, 1 / aspect),
				state.x, state.y, state.radius, profile.width, profile.amplitude, state.phase, 0, 0, Number(diagnostic), 0, 0, 0]);
			device.queue.writeBuffer(uniform, 0, values);
			const pass = encoder.beginRenderPass({ label: 'Analytic dewetting film and displaced rim', colorAttachments: [{ view: target, loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 0] }] });
			pass.setPipeline(pipeline); pass.setBindGroup(0, group); pass.draw(3); pass.end(); renders++;
		},
		async inspect(): Promise<LiquidSnapshot> {
			const profile = dewettingProfile(state), energy = dewettingEnergy(state), mass = DEWETTING_WIDTH * FILM_HEIGHT;
			return { finite: Object.values(state).every((value) => typeof value === 'boolean' || Number.isFinite(value)), mass, initialMass: mass,
				min: state.radius ? RESIDUAL_HEIGHT : FILM_HEIGHT, max: FILM_HEIGHT + profile.amplitude, kinetic: 0,
				details: { width, height, radius: state.radius, limit: state.limit, x: state.x, y: state.y, phase: state.phase,
					removedVolume: profile.removed, rimVolume: profile.amplitude * profile.rimIntegral, rimWidth: profile.width,
					energy, dissipated: state.dissipated, externalWork: state.work, energyResidual: energy + state.dissipated - state.work,
					spreading: state.spreading, viscosity: state.viscosity, elapsed: state.elapsed, steps: state.steps,
					nucleations: state.nucleations, moving: Number(state.moving), renders, uniformBytes: 64, sourceBytes: 0, outputBytes: width * height * 4 } };
		},
		dispose() { if (!disposed) { disposed = true; uniform.destroy(); } }
	};
}
