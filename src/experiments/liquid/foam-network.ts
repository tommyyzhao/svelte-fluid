import type { LiquidExperiment, LiquidSnapshot } from './types.js';

export type FoamBranch = 'horizontal' | 'vertical';
export type FoamContact = 'BD' | 'AC' | 'fourfold';
export type FoamPoint = [number, number];
export const FOAM_CONTACTS = [[0, 1], [1, 2], [2, 3], [3, 0]] as const;
const ROOT3 = Math.sqrt(3);

/** Four fixed-for-each-step anchors bound four cells. This is an equal-tension
 * planar network proxy, not an area-conserving foam or a HOME-FREE LBM solver.
 * T1 means loss of one contact and gain of a distinct one:
 * https://www.nature.com/articles/s41467-025-64412-z
 * Real relaxation depends on film surface rheology, not our authored mobility:
 * https://arxiv.org/abs/cond-mat/0608426
 */
export function foamAnchors(strain: number): { a: number; b: number } {
	const value = Math.max(-1, Math.min(1, Number.isFinite(strain) ? strain : 0));
	return { a: 0.47 - 0.22 * value, b: 0.47 + 0.22 * value };
}

/** E = internal length 2q + four outer lengths. Constant equal film tension
 * is absorbed into the units. dE/dq=0 gives q=a-b/√3 on the horizontal branch,
 * hence 120-degree settled junctions without imposing angles on a moving T1.
 */
export function foamEnergy(q: number, along: number, across: number): number {
	return 2 * q + 4 * Math.hypot(along - q, across);
}
export function foamGradient(q: number, along: number, across: number): number {
	return 2 + 4 * (q - along) / Math.hypot(along - q, across);
}

export class FoamNetworkState {
	strain = -1;
	targetStrain = -1;
	branch: FoamBranch = 'horizontal';
	halfLength = 0;
	events = 0;
	steps = 0;
	moving = false;
	constructor(strain = -1) {
		if (!Number.isFinite(strain)) throw new RangeError('Initial foam strain must be finite.');
		this.setStrain(strain, true); this.events = 0;
	}
	get geometry() { return foamAnchors(this.strain); }
	get contact(): FoamContact { return this.halfLength > 0.000001 ? this.branch === 'horizontal' ? 'BD' : 'AC' : 'fourfold'; }
	get energy(): number {
		const { a, b } = this.geometry;
		return this.branch === 'horizontal' ? foamEnergy(this.halfLength, a, b) : foamEnergy(this.halfLength, b, a);
	}
	get adjacency(): number[][] {
		const matrix = Array.from({ length: 4 }, () => [0, 0, 0, 0]);
		const pairs: readonly (readonly number[])[] = this.contact === 'fourfold' ? FOAM_CONTACTS :
			[...FOAM_CONTACTS, this.contact === 'BD' ? [1, 3] : [0, 2]];
		for (const [from, to] of pairs) matrix[from][to] = matrix[to][from] = 1;
		return matrix;
	}
	setStrain(strain: number, immediate = false): void {
		if (!Number.isFinite(strain)) return;
		this.targetStrain = Math.max(-1, Math.min(1, strain));
		if (immediate) this.finish(); else this.moving = true;
	}
	adoptRest(value: { strain: number; branch: FoamBranch; events: number }): void {
		if (!Number.isFinite(value.strain) || !Number.isInteger(value.events) || value.events < 0 ||
			(value.branch !== 'horizontal' && value.branch !== 'vertical')) throw new RangeError('Invalid resting foam history.');
		this.branch = value.branch; this.events = value.events; this.setStrain(value.strain, true);
	}
	finish(): void {
		this.strain = this.targetStrain;
		const { a, b } = this.geometry;
		let equilibrium = this.branch === 'horizontal' ? a - b / ROOT3 : b - a / ROOT3;
		if (equilibrium < 0) {
			this.branch = this.branch === 'horizontal' ? 'vertical' : 'horizontal'; this.events++;
			equilibrium = this.branch === 'horizontal' ? a - b / ROOT3 : b - a / ROOT3;
		}
		this.halfLength = Math.max(0, equilibrium); this.moving = false;
	}
	advance(dt: number): void {
		if (!this.moving || !Number.isFinite(dt) || dt <= 0) return;
		const count = Math.ceil(Math.min(dt, 0.1) * 240), h = Math.min(dt, 0.1) / count;
		for (let step = 0; step < count; step++) {
			this.strain = this.targetStrain + (this.strain - this.targetStrain) * Math.exp(-h / 0.09);
			const { a, b } = this.geometry;
			const along = this.branch === 'horizontal' ? a : b, across = this.branch === 'horizontal' ? b : a;
			const gradient = foamGradient(this.halfLength, along, across);
			this.halfLength = Math.max(0, Math.min(along, this.halfLength - h * 5 * gradient));
			if (this.halfLength === 0 && gradient > 0.00000001) {
				// Both branches cannot have positive collapse forces at q=0:
				// a/r<1/2 and b/r<1/2 cannot hold together. Rewiring therefore
				// cannot cause infinite zero-edge ping-pong under fixed anchors.
				this.branch = this.branch === 'horizontal' ? 'vertical' : 'horizontal'; this.events++;
			}
		}
		this.steps++;
		const { a, b } = this.geometry;
		const equilibrium = this.branch === 'horizontal' ? a - b / ROOT3 : b - a / ROOT3;
		if (Math.abs(this.strain - this.targetStrain) < 0.00001 && Math.abs(this.halfLength - equilibrium) < 0.00001) this.finish();
	}
}

/** Central edge first, then four outer films, clockwise from the top-left.
 * The same explicit graph is used by the renderer and topology assertions.
 */
export function foamSegments(state: FoamNetworkState): [FoamPoint, FoamPoint][] {
	return foamReportSegments(foamReport(state));
}
export function foamReportSegments(report: FoamReport): [FoamPoint, FoamPoint][] {
	const { a, b, halfLength: q, branch } = report;
	const first: FoamPoint = branch === 'horizontal' ? [-q, 0] : [0, -q];
	const second: FoamPoint = branch === 'horizontal' ? [q, 0] : [0, q];
	const corners: FoamPoint[] = [[-a, -b], [a, -b], [a, b], [-a, b]];
	return [[first, second], ...corners.map((corner, index): [FoamPoint, FoamPoint] =>
		[corner, branch === 'horizontal' ? index === 0 || index === 3 ? first : second : index < 2 ? first : second])];
}

export interface FoamReport { a: number; b: number; halfLength: number; branch: FoamBranch; contact: FoamContact; events: number; moving: boolean; strain: number }
export function foamReport(state: FoamNetworkState): FoamReport {
	return { ...state.geometry, halfLength: state.halfLength, branch: state.branch, contact: state.contact,
		events: state.events, moving: state.moving, strain: state.strain };
}
export function foamLabels(report: FoamReport): FoamPoint[] {
	const { a, b, halfLength: q, branch } = report;
	// Actual polygon centroids. Both branches agree at the fourfold junction,
	// so native labels do not jump to unrelated locations during the exchange.
	const x = branch === 'horizontal' ? -(2 * a + q) / 3 : -a * (2 * b + q) / (3 * (b + q));
	const y = branch === 'vertical' ? -(2 * b + q) / 3 : -b * (2 * a + q) / (3 * (a + q));
	return [[x, 0], [0, y], [-x, 0], [0, -y]];
}
export interface FoamNetwork extends LiquidExperiment {
	setStrain(value: number, immediate?: boolean): void;
	/** Adopt the latest still fallback after asynchronous shader/device startup. */
	adoptRest(value: { strain: number; branch: FoamBranch; events: number }): void;
	finish(): void;
}

const SOURCE = /* wgsl */ `
struct Params { display: vec4f, bounds: vec4f, segments: array<vec4f,5> };
@group(0) @binding(0) var<uniform> p: Params;
struct Vertex { @builtin(position) position: vec4f, @location(0) uv: vec2f };
@vertex fn vertex(@builtin(vertex_index) i: u32) -> Vertex {
	let xy=vec2f(f32((i<<1u)&2u),f32(i&2u));
	return Vertex(vec4f(xy*2.0-1.0,0,1),vec2f(xy.x,1.0-xy.y));
}
fn square(value: f32) -> f32 { return value*value; }
fn coverage(distance: f32) -> f32 {
	let width=max(fwidth(distance),0.000001);
	return 1.0-smoothstep(-width*0.5,width*0.5,distance);
}
fn segment(point: vec2f, ends: vec4f) -> f32 {
	let a=ends.xy; let delta=ends.zw-a;
	return length(point-a-delta*clamp(dot(point-a,delta)/max(dot(delta,delta),0.00000001),0.0,1.0));
}
fn sinc(value: vec3f) -> vec3f {
	let magnitude=max(abs(value),vec3f(0.00001)); return sin(magnitude)/magnitude;
}
@fragment fn fragment(v: Vertex) -> @location(0) vec4f {
	let point=(v.uv-0.5)*p.display.xy/(min(p.display.x,p.display.y)/1.64);
	let a=p.bounds.x; let b=p.bounds.y; let q=p.bounds.z;
	let frame=max(abs(point.x)-a,abs(point.y)-b);
	var nearest=100.0;
	for(var index=0u;index<5u;index++){nearest=min(nearest,segment(point,p.segments[index]));}
	var cell=0.0;
	if(p.bounds.w<0.5){
		if(point.x < -q && abs(point.y)<b*(-point.x-q)/max(a-q,0.000001)){cell=0.0;}
		else if(point.x > q && abs(point.y)<b*(point.x-q)/max(a-q,0.000001)){cell=2.0;}
		else {cell=select(3.0,1.0,point.y<0.0);}
	}else{
		if(point.y < -q && abs(point.x)<a*(-point.y-q)/max(b-q,0.000001)){cell=1.0;}
		else if(point.y > q && abs(point.x)<a*(point.y-q)/max(b-q,0.000001)){cell=3.0;}
		else {cell=select(2.0,0.0,point.x<0.0);}
	}
	// Authored thickness, three representative wavelengths, normal incidence.
	// Linear phase is box-filtered over the actual pixel: no low-resolution map.
	// Display colors are illustrative, not a calibrated spectral measurement.
	let thickness=335.0+76.0*sin(point.x*3.1)+60.0*point.y+cell*17.0;
	let phase=4.0*3.14159265*1.33*thickness/vec3f(650,510,450);
	let interference=vec3f(0.5)-0.5*cos(phase)*sinc(dpdx(phase)*0.5)*sinc(dpdy(phase)*0.5);
	var color=vec3f(0.041,0.049,0.077)+vec3f(0.025,0.025,0.035)*exp(-dot(point,point)*1.3);
	let inside=coverage(frame);
	let film=vec3f(0.05,0.063,0.08)+interference*0.15+
		vec3f(0.018)*sin(point.x*13.0+point.y*3.0)*cos(point.y*11.0);
	color=mix(color,film,inside);
	let border=coverage(abs(frame)-0.009);
	color=mix(color,vec3f(0.33,0.38,0.44),border);
	let halo=exp(-square(nearest/0.025))*inside;
	color+=interference*halo*0.24;
	let core=coverage(nearest-0.0047)*inside;
	color=mix(color,vec3f(0.33)+interference*0.72,core);
	let central=coverage(segment(point,p.segments[0])-0.003)*select(0.0,1.0,q>0.000001)*inside;
	let contactColor=select(vec3f(0.87,0.51,0.75),vec3f(0.42,0.86,0.73),p.bounds.w>0.5);
	color=mix(color,contactColor,central*0.68);
	let pinDistance=length(abs(point)-vec2f(a,b));
	let pin=coverage(pinDistance-0.017);
	color=mix(color,vec3f(0.68,0.69,0.72),pin);
	return vec4f(color,1);
}
`;

export async function createFoamNetwork(device: GPUDevice, format: GPUTextureFormat,
	options: { strain?: number; report?: (value: FoamReport) => void } = {}): Promise<FoamNetwork> {
	const state = new FoamNetworkState(options.strain ?? -1);
	const report = () => {
		if (options.report) { try { options.report(foamReport(state)); } catch (error) { console.warn('Foam report callback failed:', error); } }
	};
	const module = device.createShaderModule({ label: 'Four-cell T1 / explicit native film graph', code: SOURCE });
	const errors = (await module.getCompilationInfo()).messages.filter((message) => message.type === 'error');
	if (errors.length) throw new Error(errors.map((message) => `Foam shader ${message.lineNum}: ${message.message}`).join('\n'));
	const pipeline = await device.createRenderPipelineAsync({ layout: 'auto', vertex: { module, entryPoint: 'vertex' },
		fragment: { module, entryPoint: 'fragment', targets: [{ format }] }, primitive: { topology: 'triangle-list' } });
	let uniform!: GPUBuffer, group!: GPUBindGroup;
	let creationFailure: { reason: unknown } | undefined;
	device.pushErrorScope('validation'); device.pushErrorScope('out-of-memory');
	try {
		uniform = device.createBuffer({ size: 112, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
		group = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: uniform } }] });
	} catch (reason) { creationFailure = { reason }; }
	try {
		const errors = await Promise.all([device.popErrorScope(), device.popErrorScope()]);
		if (creationFailure) throw creationFailure.reason;
		const failure = errors.find(Boolean); if (failure) throw new Error(`Foam resources: ${failure.message}`);
	} catch (reason) { uniform?.destroy(); throw reason; }
	const data = new Float32Array(28); let width = 0, height = 0, disposed = false;
	return {
		memoryBytes: 112,
		setStrain(value, immediate = false) { if (!disposed) { state.setStrain(value, immediate); report(); } },
		adoptRest(value) { if (!disposed) { state.adoptRest(value); report(); } },
		finish() { if (!disposed) { state.finish(); report(); } },
		reset() { if (!disposed) { state.finish(); report(); } },
		resize(w, h) {
			if (disposed) return;
			if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1 || w > device.limits.maxTextureDimension2D ||
				h > device.limits.maxTextureDimension2D || w * h > 16_777_216) throw new RangeError('Native foam output exceeds the explicit presentation budget.');
			width = w; height = h;
		},
		step(_encoder, dt) { if (!disposed) state.advance(dt); },
		render(encoder, target) {
			if (disposed) return;
			if (!width || !height) throw new Error('Size foam before rendering.');
			const { a, b } = state.geometry;
			data.set([width, height, 0, 0, a, b, state.halfLength, Number(state.branch === 'vertical')]);
			data.set(foamSegments(state).flat(2), 8);
			device.queue.writeBuffer(uniform, 0, data);
			const pass = encoder.beginRenderPass({ colorAttachments: [{ view: target, loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }] });
			pass.setPipeline(pipeline); pass.setBindGroup(0, group); pass.draw(3); pass.end(); report();
		},
		async inspect(): Promise<LiquidSnapshot> {
			const { a, b } = state.geometry;
			return { finite: [state.strain, state.halfLength, state.energy].every(Number.isFinite), mass: 0, initialMass: 0, min: 0, max: state.halfLength, kinetic: 0,
				details: { strain: state.strain, targetStrain: state.targetStrain, halfLength: state.halfLength, energy: state.energy,
					a, b, horizontal: Number(state.branch === 'horizontal'), contactBD: Number(state.contact === 'BD'), contactAC: Number(state.contact === 'AC'), fourfold: Number(state.contact === 'fourfold'),
					events: state.events, steps: state.steps, moving: Number(state.moving), width, height, stateBytes: 112, sourceBytes: 0, stagingBytes: 0, resolvedCanvasBytes: width * height * 4 } };
		},
		dispose() { if (!disposed) { disposed = true; uniform.destroy(); } }
	};
}
