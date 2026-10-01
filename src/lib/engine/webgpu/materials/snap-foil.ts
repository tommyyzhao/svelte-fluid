import { materialResources, materialShader, materialRenderPipeline } from './cache.js';
import type { LiquidExperiment, LiquidSnapshot } from './types.js';

/** Illustrative one-mode buckling energy, not a calibrated shell model. */
export const FOIL_STIFFNESS = 42;
export const FOIL_SPAN = 1.94;
export const FOIL_RISE = 0.44;
export const FOIL_SNAP_LOAD = 2 * FOIL_STIFFNESS / (3 * Math.sqrt(3));
/** Authored response rate for the committed UI variant, not calibrated metal. */
export const COMMITTED_FOIL_TIME_SCALE = 8;
export interface FoilState { amplitude: number; velocity: number }
export interface SnapFoilExperiment extends LiquidExperiment {
	readonly settled: boolean;
	settleLoad(load: number): void;
	/** An explicit UI actuator. Undefined until requested; legacy free foil is unchanged. */
	setCommitted(selected: boolean, immediate?: boolean): void;
	setHover(x: number, y: number, active: boolean): void;
}
export function foilEnergy(amplitude: number, load = 0): number {
	return FOIL_STIFFNESS * (amplitude * amplitude - 1) ** 2 / 4 - load * amplitude;
}
export function advanceFoil(state: FoilState, dt: number, load: number): void {
	if (!Number.isFinite(dt) || dt <= 0 || !Number.isFinite(load)) return;
	const steps = Math.ceil(Math.min(dt, 0.1) * 240), h = Math.min(dt, 0.1) / steps;
	const force = Math.max(-30, Math.min(30, load));
	for (let i = 0; i < steps; i++) {
		const q = state.amplitude;
		state.velocity = (state.velocity + h * (force - FOIL_STIFFNESS * q * (q * q - 1))) * Math.exp(-8 * h);
		state.amplitude += h * state.velocity;
	}
}
/** A finite UI actuator crosses the material's energy barrier; the actuator is
 * removed once captured in the requested well. The combined driven potential
 * is not advertised as an uncontrolled hysteretic beam. Hover is a small load,
 * far below the static saddle. Retargeting never resets position or velocity.
 * Research boundary: https://blaire9989.github.io/assets/0_BistableBeam/paper.pdf
 */
export function advanceCommittedFoil(state: FoilState, dt: number, target: -1 | 1, actuated: boolean, hover = 0): boolean {
	if (!Number.isFinite(dt) || dt <= 0) return actuated;
	// The old mass=1 / damping=14 response spent ~570ms just crossing the
	// drag-limited middle (actuator capped at 40). Increasing stiffness alone
	// cannot remove that bottleneck. Scale time uniformly: inertia 1/s²,
	// damping 14/s, unchanged force/potential. This keeps wells and damping
	// ratio, but crosses in ~75ms and captures in ~200ms. qdot remains in
	// real seconds, so retargeting preserves actual momentum continuously.
	const speed = COMMITTED_FOIL_TIME_SCALE;
	const steps = Math.ceil(Math.min(dt, 0.1) * 240 * speed), h = Math.min(dt, 0.1) / steps;
	const decay = Math.exp(-14 * speed * h);
	for (let i = 0; i < steps; i++) {
		const q = state.amplitude;
		const force = actuated ? Math.max(-40, Math.min(40, 80 * (target - q))) : Math.max(-6, Math.min(6, Number.isFinite(hover) ? hover : 0));
		state.velocity = (state.velocity + h * speed * speed * (force - FOIL_STIFFNESS * q * (q * q - 1))) * decay;
		state.amplitude += h * state.velocity;
	}
	if (actuated && Math.abs(state.amplitude - target) < 0.002 && Math.abs(state.velocity) < 0.015 * speed) {
		state.amplitude = target; state.velocity = 0; return false;
	}
	return actuated;
}
/** Arc length of the authored equilibrium parabola: both signs have equal excess length. */
export function foilRestLength(): number {
	const k = 4 * FOIL_RISE / FOIL_SPAN;
	return FOIL_SPAN * (Math.sqrt(1 + k * k) + Math.asinh(k) / k) / 2;
}

const SOURCE = /* wgsl */ `
struct Params { display: vec4f, state: vec4f };
@group(0) @binding(0) var<uniform> p: Params;
struct Vertex { @builtin(position) position: vec4f, @location(0) uv: vec2f };
@vertex fn vertex(@builtin(vertex_index) i: u32) -> Vertex {
	let xy=vec2f(f32((i<<1u)&2u),f32(i&2u));
	return Vertex(vec4f(xy*2.0-1.0,0,1),vec2f(xy.x,1.0-xy.y));
}
fn square(value: f32) -> f32 { return value*value; }
fn environment(r: vec3f) -> vec3f {
	let strip=exp(-square((r.y-0.32)/0.09));
	let rim=exp(-square((r.x+0.58)/0.16));
	return vec3f(0.10,0.13,0.2)+vec3f(1.9,2.2,2.6)*strip+vec3f(1.0,0.44,0.19)*rim+
		vec3f(0.12,0.19,0.30)*smoothstep(-0.1,0.9,r.z);
}
fn roundedBox(q: vec2f, half: vec2f, radius: f32) -> f32 {
	let d=abs(q)-half+radius; return length(max(d,vec2f(0)))+min(max(d.x,d.y),0.0)-radius;
}
@fragment fn fragment(v: Vertex) -> @location(0) vec4f {
	let point=(v.uv-0.5)*vec2f(2.8*p.display.x,-1.5*p.display.y);
	let q=p.state.x;
	let t=clamp(point.x/${FOIL_SPAN / 2},-1.0,1.0);
	let z=${FOIL_RISE}*q*(1.0-t*t);
	let transverse=(point.y-0.68*z)/0.74;
	let distance=max(abs(point.x)-${FOIL_SPAN / 2},abs(transverse)-0.14);
	let footprint=max(fwidth(distance),0.00001);
	let coverage=1.0-smoothstep(-footprint*0.5,footprint*0.5,distance);
	let slope=-${4 * FOIL_RISE / FOIL_SPAN}*q*t;
	let normal=normalize(vec3f(-slope,0,1));
	let view=normalize(vec3f(-point.x*0.06+(p.state.z-0.5)*p.state.w*0.55,-0.68+(p.state.y-0.5)*p.state.w*0.18,0.74));
	let reflected=reflect(-view,normal);
	let grainFootprint=fwidth(point.x*900.0);
	let grain=sin(point.x*900.0)*exp(-grainFootprint*grainFootprint*0.2)*0.012;
	let fresnel=0.72+0.28*pow(1.0-clamp(dot(normal,view),0.0,1.0),5.0);
	var metal=environment(reflected)*fresnel+vec3f(0.13+grain);
	let rolled=pow(clamp(abs(transverse)/0.14,0.0,1.0),28.0);
	metal+=vec3f(0.7,0.79,0.9)*rolled;
	metal=pow(vec3f(1)-exp(-metal),vec3f(1.0/2.2));
	let shadow=exp(-square((point.y+0.09)/0.14))*exp(-square(square(square(point.x/1.1))))*0.18;
	var color=vec3f(0.125,0.078,0.088)+vec3f(0.06,0.035,0.031)*exp(-dot(point,point)*0.8)-shadow*0.24;
	let left=roundedBox(point-vec2f(-${FOIL_SPAN / 2},0),vec2f(0.105,0.235),0.035);
	let right=roundedBox(point-vec2f(${FOIL_SPAN / 2},0),vec2f(0.105,0.235),0.035);
	let pad=min(left,right); let padFootprint=max(fwidth(pad),0.00001);
	let padCoverage=1.0-smoothstep(-padFootprint*0.5,padFootprint*0.5,pad);
	let padColor=vec3f(0.20,0.155,0.16)+vec3f(0.25)*exp(-square((point.y-0.20)/0.024));
	color=mix(color,padColor,padCoverage); color=mix(color,metal,coverage);
	return vec4f(color,1);
}
`;

export async function createSnapFoil(device: GPUDevice, format: GPUTextureFormat,
	load: () => number = () => 0, transparent = false): Promise<SnapFoilExperiment> {
	const module = await materialShader(device, { label: 'One-mode foil / analytic native surface', code: transparent ? SOURCE.replace('return vec4f(color,1);', 'let alpha=max(padCoverage,coverage); return vec4f(mix(padColor,metal,coverage)*alpha,alpha);') : SOURCE });
	const pipeline = await materialRenderPipeline(device, { layout: 'auto', vertex: { module, entryPoint: 'vertex' },
		fragment: { module, entryPoint: 'fragment', targets: [{ format }] }, primitive: { topology: 'triangle-list' } });
	return materialResources<SnapFoilExperiment>(device, (own) => {
		const uniform = own(device.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }));
		const group = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: uniform } }] });
		const data = new Float32Array(8), state: FoilState = { amplitude: 1, velocity: 0 };
		let width = 0, height = 0, disposed = false, appliedLoad = 0;
		let committed: -1 | 1 | undefined, actuated = false;
		let hoverX = 0.5, hoverY = 0.5, hovered = false;
		return {
			memoryBytes: 32,
			get settled() { return !actuated && Math.abs(state.velocity) < 0.002 && Math.abs((hovered ? 12 * (hoverY - 0.5) : 0) - FOIL_STIFFNESS * state.amplitude * (state.amplitude * state.amplitude - 1)) < 0.03; },
			setCommitted(selected, immediate = false) {
				if (disposed) return;
				committed = selected ? -1 : 1; actuated = !immediate;
				if (immediate) { state.amplitude = committed; state.velocity = 0; }
			},
			setHover(x, y, active) {
				if (disposed) return;
				hovered = active && Number.isFinite(x) && Number.isFinite(y);
				if (hovered) { hoverX = Math.max(0, Math.min(1, x)); hoverY = Math.max(0, Math.min(1, y)); }
			},
			settleLoad(force) {
				if (disposed || !Number.isFinite(force)) return;
				for (let i = 0; i < 1920; i++) advanceFoil(state, 1 / 240, force);
				appliedLoad = Math.max(-30, Math.min(30, force)); state.velocity = 0;
			},
			resize(w, h) {
				if (disposed) return;
				if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1 || w > device.limits.maxTextureDimension2D ||
					h > device.limits.maxTextureDimension2D || w * h > 16_777_216) throw new RangeError('Native foil size exceeds the explicit presentation budget.');
				width = w; height = h;
			},
			reset() { state.amplitude = committed ?? 1; state.velocity = 0; appliedLoad = 0; actuated = false; },
			step(_encoder, dt, input) {
				if (disposed) return;
				if (committed !== undefined) {
					appliedLoad = hovered ? 12 * (hoverY - 0.5) : 0;
					actuated = advanceCommittedFoil(state, dt, committed, actuated, appliedLoad); return;
				}
				const control = load();
				const moving = input.active && Number.isFinite(input.vy) && Number.isFinite(input.x) && Number.isFinite(input.y);
				const influence = moving ? Math.exp(-(((input.x - 0.5) / 0.3) ** 2) - ((input.y - 0.5) / 0.36) ** 2) : 0;
				appliedLoad = Math.max(-30, Math.min(30, (Number.isFinite(control) ? control : 0) - (moving ? input.vy * 35 * influence : 0)));
				advanceFoil(state, dt, appliedLoad);
			},
			render(encoder, target) {
				if (disposed) return;
				if (!width || !height) throw new Error('Size foil before rendering.');
				const aspect = width / height / (2.8 / 1.5);
				data.set([Math.max(1, aspect), Math.max(1, 1 / aspect), width, height, state.amplitude, state.velocity, appliedLoad, 0]);
				if (committed !== undefined) { data[5] = hoverY; data[6] = hoverX; data[7] = hovered ? 1 : 0; }
				device.queue.writeBuffer(uniform, 0, data);
				const pass = encoder.beginRenderPass({ colorAttachments: [{ view: target, loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }] });
				pass.setPipeline(pipeline); pass.setBindGroup(0, group); pass.draw(3); pass.end();
			},
			async inspect(): Promise<LiquidSnapshot> {
				const responseRate = committed === undefined ? 1 : COMMITTED_FOIL_TIME_SCALE;
				return { finite: Number.isFinite(state.amplitude) && Number.isFinite(state.velocity), mass: 0, initialMass: 0,
					min: state.amplitude, max: state.amplitude, kinetic: state.velocity ** 2 / (2 * responseRate ** 2),
					details: { amplitude: state.amplitude, velocity: state.velocity, load: appliedLoad, energy: foilEnergy(state.amplitude),
						snapLoad: FOIL_SNAP_LOAD, span: FOIL_SPAN, restLength: foilRestLength(), responseRate, committed: committed ?? 0, actuated: actuated ? 1 : 0, hovered: hovered ? 1 : 0, width, height, stateBytes: 32, resolvedCanvasBytes: width * height * 4 } };
			},
			dispose() { if (!disposed) { disposed = true; uniform.destroy(); } }
		};
	});
}
