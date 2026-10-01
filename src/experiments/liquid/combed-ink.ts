import type { LiquidExperiment, LiquidInput } from './types.js';

/*
 * Adaptive midpoint brush adapted to TypeScript/WGSL from MixwellBrush.glsl:
 * https://github.com/dougjam/mixwell-2026/blob/main/public/code/glsl/MixwellBrush.glsl
 * Retrieved 2026-09-11. Full Mixwell.glsl currently selects this SAME brush in
 * rdSegment(); its alternative Newton rdSegmentM call is commented out. The
 * tighter-step reference below is NOT a separate Newton/full-solver port.
 *
 * MIT License — Copyright (c) 2026 Doug L. James and Ethan James
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

export interface InkStroke { ax: number; ay: number; bx: number; by: number; radius: number }
export type InkAccuracy = 'brush' | 'reference';
const MAX_OPERATIONS = 16;
const DOMAIN_WIDTH = 1.8;
const MIN_RADIUS = 0.012;
const SOURCE = /* wgsl */ `
struct Params { size: vec2f, count: u32, stepSize: f32 };
struct Stroke { ends: vec4f, radius: vec4f };
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> strokes: array<Stroke>;
fn kernel(v: vec2f, radius: f32, db: vec2f) -> vec2f {
	let r2=dot(v,v); let e2=radius*radius;
	let invSqrt=inverseSqrt(r2+e2); let invD=invSqrt*invSqrt*invSqrt;
	let invR=inverseSqrt(max(r2,1e-20)); let r=r2*invR;
	let a=1.0-r*(r2+2.0*e2)*invD; let b=e2*invR*invD;
	return a*db+b*v*dot(v,db);
}
fn reverseBrush(point: vec2f, stroke: Stroke) -> vec2f {
	let a=stroke.ends.xy; var b=stroke.ends.zw;
	let travel=a-b; let distance=length(travel); let radius=stroke.radius.x;
	if (distance < 1e-8) { return point; }
	let projection=clamp(dot(point-a,b-a)/(distance*distance),0.0,1.0);
	let away=length(point-a-(b-a)*projection);
	if (away >= 10.0*radius) { return point; }
	let mask=1.0-smoothstep(5.0*radius,10.0*radius,away);
	let direction=travel/distance; var remaining=distance; var p=point;
	// Input validation bounds L/r <= 172. Reference factor .025 therefore
	// requires at most 6880 iterations, even at the minimum adaptive step.
	// This hard bound is a safety fence, NOT a silently truncated quality mode.
	for (var iteration=0u; iteration<8192u && remaining>1e-8; iteration++) {
		let v=p-b; let step=min(remaining,params.stepSize*max(radius,length(v)));
		let db=step*direction; let dp=kernel(v,radius,db);
		p += kernel(v+0.5*(dp-db),radius,db); b += db; remaining -= step;
	}
	return point+(p-point)*mask;
}
@vertex fn vertex(@builtin(vertex_index) id: u32) -> @builtin(position) vec4f {
	return vec4f(f32((id<<1u)&2u)*2.0-1.0, f32(id&2u)*2.0-1.0,0,1);
}
fn filteredCos(phase: f32, dx: f32, dy: f32) -> f32 {
	// A locally linear box footprint, evaluated AFTER the reverse warp.
	let x=0.5*dx; let y=0.5*dy;
	let sx=select(sin(x)/max(abs(x),1e-6)*sign(x),1.0,abs(x)<1e-4);
	let sy=select(sin(y)/max(abs(y),1e-6)*sign(y),1.0,abs(y)<1e-4);
	return cos(phase)*sx*sy;
}
@fragment fn fragment(@builtin(position) pixel: vec4f) -> @location(0) vec4f {
	let uv=pixel.xy/params.size;
	var p=uv*vec2f(${DOMAIN_WIDTH},1);
	for (var i=i32(params.count)-1; i>=0; i--) { p=reverseBrush(p,strokes[u32(i)]); }
	let phase=6.28318530718*(p.y*8.0+0.24*sin(p.x*5.0)+0.09*sin(p.x*12.0));
	let dx=dpdx(phase); let dy=dpdy(phase);
	// A finite Fourier palette makes compressed pigment bands filterable;
	// no post-warp hard threshold reintroduces infinitely narrow color edges.
	let wave=filteredCos(phase,dx,dy);
	let second=filteredCos(phase*2.0+0.7,dx*2.0,dy*2.0);
	let fine=filteredCos(phase*5.0-0.4,dx*5.0,dy*5.0);
	let cream=vec3f(0.94,0.9,0.79); let indigo=vec3f(0.075,0.16,0.24);
	let copper=vec3f(0.72,0.34,0.18);
	let blueWeight=clamp(0.45+0.4*wave+0.13*second,0.0,1.0);
	let copperWeight=clamp(0.15+0.14*filteredCos(phase+1.8,dx,dy)+0.08*fine,0.0,0.5);
	var color=mix(cream,indigo,blueWeight); color=mix(color,copper,copperWeight);
	// Quiet, screen-stationary paper lighting; it never becomes pigment state.
	color *= 0.96+0.04*cos((uv.x-0.3)*1.4)*cos((uv.y-0.3)*1.6);
	return vec4f(color,1);
}
`;

function smoothstep(a: number, b: number, value: number) { const t = Math.max(0, Math.min(1, (value - a) / (b - a))); return t * t * (3 - 2 * t); }
function validateStroke(stroke: InkStroke) {
	if (!Object.values(stroke).every(Number.isFinite) || stroke.radius < MIN_RADIUS || stroke.radius > 0.1 ||
		stroke.ax < 0 || stroke.bx < 0 || stroke.ax > DOMAIN_WIDTH || stroke.bx > DOMAIN_WIDTH ||
		stroke.ay < 0 || stroke.by < 0 || stroke.ay > 1 || stroke.by > 1) throw new Error('Ink stroke exceeds the bounded specimen domain/radius.');
}

/** CPU mirror for checkable integration error/work; no repeated image sampling. */
export function reverseInkPoint(point: readonly [number, number], program: readonly InkStroke[], stepSize = 0.1) {
	if (!point.every(Number.isFinite) || !Number.isFinite(stepSize) || stepSize < 0.00625 || stepSize > 0.2 || program.length > MAX_OPERATIONS) throw new Error('Invalid ink integration request.');
	let [x, y] = point; let iterations = 0;
	const kernel = (vx: number, vy: number, radius: number, dx: number, dy: number) => {
		const r2 = vx * vx + vy * vy, e2 = radius * radius, inv = 1 / Math.sqrt(r2 + e2), invD = inv * inv * inv;
		const invR = 1 / Math.sqrt(Math.max(r2, 1e-20)), a = 1 - r2 * invR * (r2 + 2 * e2) * invD;
		const b = e2 * invR * invD * (vx * dx + vy * dy);
		return [a * dx + b * vx, a * dy + b * vy];
	};
	for (let i = program.length - 1; i >= 0; i--) {
		const stroke = program[i]; validateStroke(stroke);
		let bx = stroke.bx, by = stroke.by;
		const tx = stroke.ax - bx, ty = stroke.ay - by, length = Math.hypot(tx, ty);
		if (length < 1e-8) continue;
		const projection = Math.max(0, Math.min(1, ((x - stroke.ax) * -tx + (y - stroke.ay) * -ty) / (length * length)));
		const away = Math.hypot(x - stroke.ax + tx * projection, y - stroke.ay + ty * projection);
		if (away >= 10 * stroke.radius) continue;
		const mask = 1 - smoothstep(5 * stroke.radius, 10 * stroke.radius, away);
		let remaining = length, px = x, py = y;
		while (remaining > 1e-10) {
			const vx = px - bx, vy = py - by, step = Math.min(remaining, stepSize * Math.max(stroke.radius, Math.hypot(vx, vy)));
			const dx = step * tx / length, dy = step * ty / length;
			const first = kernel(vx, vy, stroke.radius, dx, dy);
			const midpoint = kernel(vx + 0.5 * (first[0] - dx), vy + 0.5 * (first[1] - dy), stroke.radius, dx, dy);
			px += midpoint[0]; py += midpoint[1]; bx += dx; by += dy; remaining -= step; iterations++;
		}
		x += (px - x) * mask; y += (py - y) * mask;
	}
	return { point: [x, y] as const, iterations };
}

/** Stable prefix: 1/4/8/16 use exactly the same ordered input, not new seeds. */
export function inkProgram(count: number): InkStroke[] {
	if (!Number.isInteger(count) || count < 0 || count > MAX_OPERATIONS) throw new Error('Ink history is limited to 16 explicit operations.');
	return Array.from({ length: count }, (_, i) => {
		if (i === 0) return { ax: 0.12, ay: 0.16, bx: 1.68, by: 0.78, radius: 0.018 }; // long narrow stroke
		const column = i % 8, reverse = i % 2 === 1;
		return { ax: 0.2 + column * 0.195, bx: 0.26 + column * 0.18, ay: reverse ? 0.88 : 0.12, by: reverse ? 0.13 : 0.87, radius: 0.027 };
	});
}

export interface CombedInk extends LiquidExperiment {
	setProgram(program: readonly InkStroke[]): void;
	setAccuracy(accuracy: InkAccuracy): void;
	undo(): void;
	endInput(): void;
}

export async function createCombedInk(device: GPUDevice, format: GPUTextureFormat, changed?: (count: number) => void): Promise<CombedInk> {
	const module = device.createShaderModule({ label: 'Mixwell brush / original-content ink', code: SOURCE });
	const pipeline = await device.createRenderPipelineAsync({ label: 'Native reverse-drift ink', layout: 'auto', vertex: { module, entryPoint: 'vertex' }, fragment: { module, entryPoint: 'fragment', targets: [{ format }] }, primitive: { topology: 'triangle-list' } });
	const uniform = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
	const history = device.createBuffer({ size: MAX_OPERATIONS * 32, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
	const bindGroup = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: uniform } }, { binding: 1, resource: { buffer: history } }] });
	const params = new ArrayBuffer(16), floats = new Float32Array(params), integers = new Uint32Array(params);
	let program = inkProgram(4), width = 0, height = 0, disposed = false, dirty = true, accuracy: InkAccuracy = 'brush';
	let current = -1, last: [number, number] | undefined, renders = 0, uploads = 0;
	function notify() { try { changed?.(program.length); } catch { /* UI callbacks do not own the material. */ } }
	function write() {
		if (!dirty) return;
		const data = new Float32Array(MAX_OPERATIONS * 8);
		program.forEach((stroke, i) => data.set([stroke.ax, stroke.ay, stroke.bx, stroke.by, stroke.radius, 0, 0, 0], i * 8));
		floats[0] = width; floats[1] = height; integers[2] = program.length; floats[3] = accuracy === 'reference' ? 0.025 : 0.1;
		device.queue.writeBuffer(history, 0, data); device.queue.writeBuffer(uniform, 0, params); uploads++; dirty = false;
	}
	const setProgram = (next: readonly InkStroke[]) => {
		if (disposed) return;
		if (next.length > MAX_OPERATIONS) throw new Error('Ink history is limited to 16 explicit operations; undo or start a new sheet.');
		next.forEach(validateStroke); program = next.map((stroke) => ({ ...stroke })); current = -1; last = undefined; dirty = true; notify();
	};
	notify();
	return {
		memoryBytes: 16 + MAX_OPERATIONS * 32,
		resize(nextWidth, nextHeight) {
			if (disposed || nextWidth === width && nextHeight === height) return;
			if (!Number.isInteger(nextWidth) || !Number.isInteger(nextHeight) || nextWidth < 1 || nextHeight < 1 || nextWidth > device.limits.maxTextureDimension2D || nextHeight > device.limits.maxTextureDimension2D || nextWidth * nextHeight > 16777216) throw new Error('Native ink size exceeds its explicit output budget; no lower-resolution substitution was made.');
			width = nextWidth; height = nextHeight; dirty = true;
		},
		setProgram,
		setAccuracy(next) { if (next !== 'brush' && next !== 'reference') throw new Error('Unknown ink accuracy.'); if (!disposed && accuracy !== next) { accuracy = next; dirty = true; } },
		undo() { setProgram(program.slice(0, -1)); },
		reset() { setProgram([]); },
		endInput() { current = -1; last = undefined; },
		step(_encoder, dt, input: LiquidInput) {
			if (disposed || !Number.isFinite(dt) || dt <= 0) return;
			if (!input.active || !Number.isFinite(input.x) || !Number.isFinite(input.y)) { current = -1; last = undefined; return; }
			const point: [number, number] = [Math.max(0, Math.min(1, input.x)) * DOMAIN_WIDTH, Math.max(0, Math.min(1, input.y))];
			if (!last) { last = point; return; }
			const distance = Math.hypot(point[0] - last[0], point[1] - last[1]);
			if (distance < 0.002) return;
			const stroke = program[current];
			if (stroke && Math.hypot(point[0] - stroke.ax, point[1] - stroke.ay) < 0.18) { stroke.bx = point[0]; stroke.by = point[1]; }
			else if (program.length < MAX_OPERATIONS) { program.push({ ax: last[0], ay: last[1], bx: point[0], by: point[1], radius: 0.035 }); current = program.length - 1; notify(); }
			else { current = -1; last = point; return; }
			last = point; dirty = true;
		},
		render(encoder, target) {
			if (disposed) return;
			if (!width || !height) throw new Error('Size the ink specimen before rendering.');
			write();
			const pass = encoder.beginRenderPass({ label: 'Original content through bounded reverse drift', colorAttachments: [{ view: target, clearValue: [0.94, 0.9, 0.79, 1], loadOp: 'clear', storeOp: 'store' }] });
			pass.setPipeline(pipeline); pass.setBindGroup(0, bindGroup); pass.draw(3); pass.end(); renders++;
		},
		async inspect() { return { finite: true, mass: 0, initialMass: 0, min: 0, max: program.length, kinetic: 0, details: { operations: program.length, maxOperations: MAX_OPERATIONS, stateBytes: 528, outputBytes: width * height * 4, width, height, integrationFactor: accuracy === 'reference' ? 0.025 : 0.1, renders, uploads, saturated: Number(program.length === MAX_OPERATIONS) } }; },
		dispose() { if (disposed) return; disposed = true; uniform.destroy(); history.destroy(); }
	};
}
