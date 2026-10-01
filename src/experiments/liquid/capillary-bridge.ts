import type { LiquidExperiment, LiquidSnapshot } from './types.js';

/** Fixed pinned contact disks; all lengths and volume are illustrative scene units. */
export const BRIDGE_RADIUS = 0.235;
export const BRIDGE_VOLUME = 0.067;
// This threshold follows this chosen polynomial family, NOT a universal capillary law.
export const BRIDGE_BREAK_GAP = 3 * BRIDGE_VOLUME / (Math.PI * BRIDGE_RADIUS ** 2);
export const BRIDGE_REST_EXTENT = BRIDGE_BREAK_GAP / 4;
export const BRIDGE_REJOIN_GAP = 2 * BRIDGE_REST_EXTENT;
export interface BridgeState { gap: number; joined: boolean; extent: number; fusion: number; breaks: number; joins: number }
export interface CapillaryBridgeExperiment extends LiquidExperiment { settleSeparation(separation: number): void }
export function initialBridge(): BridgeState {
	return { gap: 0.46, joined: true, extent: BRIDGE_REST_EXTENT, fusion: 1, breaks: 0, joins: 0 };
}
export function advanceBridge(state: BridgeState, dt: number, target: number): void {
	if (!Number.isFinite(dt) || dt <= 0 || !Number.isFinite(target)) return;
	const h = Math.min(dt, 0.05), goal = Math.max(0.3, Math.min(1.65, target));
	state.gap += (goal - state.gap) * (1 - Math.exp(-9 * h));
	if (state.joined && state.gap >= BRIDGE_BREAK_GAP) {
		state.joined = false; state.extent = BRIDGE_BREAK_GAP / 2; state.fusion = 0; state.breaks++;
	} else if (!state.joined && state.gap <= BRIDGE_REJOIN_GAP) {
		state.joined = true; state.fusion = 0; state.joins++;
	}
	if (state.joined) state.fusion += (1 - state.fusion) * (1 - Math.exp(-12 * h));
	else state.extent = BRIDGE_REST_EXTENT + (state.extent - BRIDGE_REST_EXTENT) * Math.exp(-10 * h);
}
/** Squared radius of the joined axisymmetric profile at t in [-1,1]. */
export function bridgeRadiusSquared(state: BridgeState, t: number): number {
	const u = Math.abs(Math.max(-1, Math.min(1, t))), r2 = BRIDGE_RADIUS ** 2;
	const neck2 = (3 * BRIDGE_VOLUME / (Math.PI * state.gap) - r2) / 2;
	const b = 6 * BRIDGE_VOLUME / (Math.PI * state.gap * r2) - 3;
	return (1 - state.fusion) * r2 * u * (1 + b * (1 - u)) + state.fusion * (neck2 + (r2 - neck2) * u * u);
}
/** One detached cap at axial fraction s in [0,1], from pinned disk to tip. */
export function bridgeCapRadiusSquared(extent: number, s: number): number {
	const u = Math.max(0, Math.min(1, s)), r2 = BRIDGE_RADIUS ** 2;
	const b = 3 * BRIDGE_VOLUME / (Math.PI * extent * r2) - 3;
	return Math.max(0, r2 * (1 - u) * (1 + b * u));
}
export function bridgeAccountedVolume(state: BridgeState): number {
	const r2 = BRIDGE_RADIUS ** 2;
	if (!state.joined) {
		const b = 3 * BRIDGE_VOLUME / (Math.PI * state.extent * r2) - 3;
		return 2 * Math.PI * state.extent * r2 * (3 + b) / 6;
	}
	const n2 = (3 * BRIDGE_VOLUME / (Math.PI * state.gap) - r2) / 2;
	const b = 6 * BRIDGE_VOLUME / (Math.PI * state.gap * r2) - 3;
	return Math.PI * state.gap * ((1 - state.fusion) * r2 * (3 + b) / 6 + state.fusion * (r2 + 2 * n2) / 3);
}

const SOURCE = /* wgsl */ `
struct Params { display: vec4f, state: vec4f };
@group(0) @binding(0) var<uniform> p: Params;
struct Vertex { @builtin(position) position: vec4f, @location(0) uv: vec2f };
@vertex fn vertex(@builtin(vertex_index) i: u32) -> Vertex {
	let xy=vec2f(f32((i<<1u)&2u),f32(i&2u));
	return Vertex(vec4f(xy*2.0-1.0,0,1),vec2f(xy.x,1.0-xy.y));
}
fn roundedBox(q: vec2f, half: vec2f, radius: f32) -> f32 {
	let d=abs(q)-half+radius; return length(max(d,vec2f(0)))+min(max(d.x,d.y),0.0)-radius;
}
fn square(value: f32) -> f32 { return value*value; }
fn studio(r: vec3f) -> vec3f {
	let broad=exp(-square((r.y-0.5)/0.14));
	let strip=exp(-square((r.x+0.45)/0.065));
	return vec3f(0.05,0.15,0.20)+vec3f(1.1,2.0,2.1)*broad+vec3f(1.7,1.1,0.60)*strip+
		vec3f(0.08,0.27,0.40)*(1.0-smoothstep(-0.7,0.3,r.y));
}
@fragment fn fragment(v: Vertex) -> @location(0) vec4f {
	let point=(v.uv-0.5)*vec2f(2.8*p.display.x,-1.5*p.display.y);
	let gap=p.state.x; let extent=p.state.z; let fusion=p.state.w;
	let r2=${BRIDGE_RADIUS ** 2};
	var squared=0.0; var slope=0.0; var axial=0.0;
	if (p.state.y>0.5) {
		let u=clamp(abs(point.x)*2.0/gap,0.0,1.0);
		let n2=(${3 * BRIDGE_VOLUME / Math.PI}/gap-r2)*0.5;
		let b=${6 * BRIDGE_VOLUME / Math.PI}/(gap*r2)-3.0;
		let split=r2*u*(1.0+b*(1.0-u));
		let joined=n2+(r2-n2)*u*u;
		squared=mix(split,joined,fusion);
		slope=mix(r2*(1.0+b-2.0*b*u),2.0*(r2-n2)*u,fusion)*sign(point.x)*2.0/gap;
		axial=abs(point.x)-gap*0.5;
	} else {
		let distance=gap*0.5-abs(point.x);
		let s=clamp(distance/extent,0.0,1.0);
		let b=${3 * BRIDGE_VOLUME / Math.PI}/(extent*r2)-3.0;
		squared=r2*(1.0-s)*(1.0+b*s);
		slope=-sign(point.x)*r2*(b-1.0-2.0*b*s)/extent;
		axial=max(-distance,distance-extent);
	}
	let radius=sqrt(max(squared,0.0));
	let distance=max(axial,abs(point.y)-radius);
	let footprint=max(fwidth(distance),0.00001);
	let coverage=1.0-smoothstep(-0.5*footprint,0.5*footprint,distance);
	let z=sqrt(max(squared-point.y*point.y,0.00000001));
	let normal=normalize(vec3f(-0.5*slope,point.y,z));
	let reflected=reflect(vec3f(0,0,-1),normal);
	let fresnel=0.045+0.955*pow(1.0-clamp(normal.z,0.0,1.0),5.0);
	let transmitted=vec3f(0.04,0.54,0.59)*exp(-z*vec3f(4.0,0.8,0.5));
	let rim=pow(1.0-clamp(normal.z,0.0,1.0),2.0)*vec3f(0.12,0.60,0.66);
	var liquid=transmitted*(0.4+0.6*normal.z)+studio(reflected)*(0.3+0.7*fresnel)+rim;
	liquid=pow(vec3f(1)-exp(-max(liquid,vec3f(0))),vec3f(1.0/2.2));
	let glow=exp(-dot(point*vec2f(0.7,1.0),point*vec2f(0.7,1.0))*1.4);
	var color=vec3f(0.025,0.075,0.095)+vec3f(0.015,0.085,0.095)*glow;
	let pad=roundedBox(vec2f(abs(point.x)-gap*0.5-0.11,point.y),vec2f(0.11,0.38),0.06);
	let padFootprint=max(fwidth(pad),0.00001);
	let padCoverage=1.0-smoothstep(-padFootprint*0.5,padFootprint*0.5,pad);
	let padColor=vec3f(0.20,0.30,0.32)+vec3f(0.26,0.30,0.28)*exp(-square((point.y-0.31)/0.05));
	color=mix(color,padColor,padCoverage); color=mix(color,liquid,coverage);
	return vec4f(color,1);
}
`;

export async function createCapillaryBridge(device: GPUDevice, format: GPUTextureFormat,
	separation: () => number = () => 0.46): Promise<CapillaryBridgeExperiment> {
	const module = device.createShaderModule({ label: 'Volume-accounted bridge / analytic native surface', code: SOURCE });
	const pipeline = await device.createRenderPipelineAsync({ layout: 'auto', vertex: { module, entryPoint: 'vertex' },
		fragment: { module, entryPoint: 'fragment', targets: [{ format }] }, primitive: { topology: 'triangle-list' } });
	const uniform = device.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
	const group = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: uniform } }] });
	const state = initialBridge(), data = new Float32Array(8);
	let width = 0, height = 0, disposed = false;
	return {
		memoryBytes: 32,
		settleSeparation(value) {
			if (disposed || !Number.isFinite(value)) return;
			const gap = Math.max(0.3, Math.min(1.65, value));
			if (state.joined && gap >= BRIDGE_BREAK_GAP) { state.joined = false; state.breaks++; }
			else if (!state.joined && gap <= BRIDGE_REJOIN_GAP) { state.joined = true; state.joins++; }
			state.gap = gap; state.extent = BRIDGE_REST_EXTENT; state.fusion = Number(state.joined);
		},
		resize(w, h) {
			if (disposed) return;
			if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1 || w > device.limits.maxTextureDimension2D ||
				h > device.limits.maxTextureDimension2D || w * h > 16_777_216) throw new RangeError('Native bridge size exceeds the explicit presentation budget.');
			width = w; height = h;
		},
		reset() { Object.assign(state, initialBridge()); },
		step(_encoder, dt) {
			if (disposed) return;
			advanceBridge(state, dt, separation());
		},
		render(encoder, target) {
			if (disposed) return;
			if (!width || !height) throw new Error('Size bridge before rendering.');
			const aspect = width / height / (2.8 / 1.5);
			data.set([Math.max(1, aspect), Math.max(1, 1 / aspect), width, height, state.gap, Number(state.joined), state.extent, state.fusion]);
			device.queue.writeBuffer(uniform, 0, data);
			const pass = encoder.beginRenderPass({ colorAttachments: [{ view: target, loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }] });
			pass.setPipeline(pipeline); pass.setBindGroup(0, group); pass.draw(3); pass.end();
		},
		async inspect(): Promise<LiquidSnapshot> {
			const mass = bridgeAccountedVolume(state);
			return { finite: Object.values(state).every((value) => typeof value === 'boolean' || Number.isFinite(value)), mass, initialMass: BRIDGE_VOLUME,
				min: 0, max: state.joined ? Math.sqrt(Math.max(0, bridgeRadiusSquared(state, 0))) : BRIDGE_RADIUS, kinetic: 0,
				details: { gap: state.gap, joined: Number(state.joined), extent: state.extent, fusion: state.fusion, breaks: state.breaks, joins: state.joins,
					contactRadius: BRIDGE_RADIUS, breakGap: BRIDGE_BREAK_GAP, rejoinGap: BRIDGE_REJOIN_GAP, width, height, stateBytes: 32, resolvedCanvasBytes: width * height * 4 } };
		},
		dispose() { if (!disposed) { disposed = true; uniform.destroy(); } }
	};
}
