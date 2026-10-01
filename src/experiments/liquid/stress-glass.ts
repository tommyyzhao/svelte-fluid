import type { LiquidExperiment } from './types.js';

/** Hung & Ma, Experimental Mechanics 43 (2003), Eq. 23: finite, uniform
 * radial pressure on opposing arcs. Coordinates/radius and pressure normalized.
 * https://scholars.lib.ntu.edu.tw/bitstreams/8d5df83d-88fe-4ef1-bbf1-e244e0f92967/download
 * This is the in-plane principal-stress DIFFERENCE, not 3D maximum shear.
 */
export const GLASS_CONTACT_HALF_ANGLE = 0.2;
export function glassStressDifference(x: number, y: number, pressure: number, alpha = GLASS_CONTACT_HALF_ANGLE): number {
	if (![x, y, pressure, alpha].every(Number.isFinite) || pressure < 0 || alpha <= 0 || alpha > Math.PI / 2) throw new Error('Invalid glass stress parameters.');
	// Displayed edge bevel excludes the discontinuity at the arc endpoints.
	// Sample its interior limit instead of allowing an exact boundary 0/0.
	const radius = Math.hypot(x, y), scale = Math.min(1, (1 - 1e-6) / Math.max(radius, 1e-12));
	x *= scale; y *= scale;
	const r2 = x * x + y * y, a = 1 - r2;
	const cos = Math.cos(alpha), sin = Math.sin(alpha);
	const plus = a * a + 4 * (x * cos + y * sin) ** 2;
	const minus = a * a + 4 * (x * cos - y * sin) ** 2;
	return 4 * pressure / Math.PI * a * Math.sin(2 * alpha) / Math.sqrt(Math.max(plus * minus, 1e-24));
}

export interface StressGlass extends LiquidExperiment { setLoad(pressure: number): void; setOrientation(radians: number): void; }

const SOURCE = /* wgsl */ `
struct Params { display: vec4f, state: vec4f };
@group(0) @binding(0) var<uniform> params: Params;
struct Vertex { @builtin(position) clip: vec4f, @location(0) uv: vec2f };
@vertex fn vertex(@builtin(vertex_index) i: u32) -> Vertex {
	let p=array<vec2f,3>(vec2f(-1,-1),vec2f(3,-1),vec2f(-1,3))[i];
	return Vertex(vec4f(p,0,1),p*vec2f(0.5,-0.5)+0.5);
}
fn gap(point: vec2f) -> f32 {
	let p=point*min(1.0,0.999999/max(length(point),0.000001));
	let r2=dot(p,p); let a=1.0-r2;
	let c=cos(${GLASS_CONTACT_HALF_ANGLE}); let s=sin(${GLASS_CONTACT_HALF_ANGLE});
	let u=p.x*c+p.y*s; let v=p.x*c-p.y*s;
	let d1=a*a+4.0*u*u; let d2=a*a+4.0*v*v;
	return 1.2732395447*params.state.x*a*sin(${2 * GLASS_CONTACT_HALF_ANGLE})/sqrt(max(d1*d2,0.000000000001));
}
fn box(p: vec2f, b: vec2f, radius: f32) -> f32 {
	let q=abs(p)-b+radius; return length(max(q,vec2f(0)))+min(max(q.x,q.y),0.0)-radius;
}
fn square(x: f32) -> f32 { return x*x; }
@fragment fn fragment(in: Vertex) -> @location(0) vec4f {
	let size=min(params.display.x,params.display.y); let pixel=2.0/size;
	let world=(in.uv-0.5)*params.display.xy/size*2.0;
	// Rotate the entire boundary/load frame, including both visible pads.
	// This is still the same disk solution, not an interior point-force field.
	let c=cos(params.state.y); let s=sin(params.state.y);
	let p=vec2f(c*world.x+s*world.y,-s*world.x+c*world.y);
	let r=length(p); let radius=0.72; let q=p/radius;
	let coverage=1.0-smoothstep(radius-pixel,radius+pixel,r);
	let stress=gap(q);
	// Circular dark-field polariscope: I(lambda)=sin²(pi*C*t*deltaSigma/lambda).
	// Three wavelength bands are an illustration, not a spectral camera model.
	let phase=6.28318530718*stress*vec3f(5.8,7.15,8.3);
	let gx=dpdx(phase); let gy=dpdy(phase);
	let visibility=exp(-(gx*gx+gy*gy)/24.0);
	let transmitted=0.5-0.5*cos(phase)*visibility;
	let edge=exp(-square((r-radius+0.008)/0.016));
	let inside=vec3f(0.018,0.03,0.034)+transmitted*vec3f(0.8,0.91,0.97);
	let rim=vec3f(0.36,0.55,0.54)*edge*(0.45+0.55*clamp(0.5-p.x-p.y,0.0,1.0));
	var color=vec3f(0.026,0.041,0.047)+vec3f(0.012)*exp(-dot(p,p)*1.7);
	let grid=max(exp(-square(p.x/pixel)),exp(-square(p.y/pixel)))*0.009;
	color+=grid;
	color=mix(color,inside+rim,coverage);
	// Broad radial pads visibly delimit the ±alpha boundary traction. Their
	// tiny travel is an illustration; this is not a displacement solution.
	let padCenter=0.835-0.023*params.state.x;
	let pad=box(vec2f(p.x,abs(p.y)-padCenter),vec2f(0.175,0.11),0.025);
	let padCoverage=1.0-smoothstep(-pixel,pixel,pad);
	let padLight=0.2+0.22*smoothstep(-0.1,0.1,abs(p.y)-padCenter);
	let padColor=vec3f(0.48,0.54,0.53)*padLight+vec3f(0.09)*exp(-square((pad+0.014)/0.009));
	color=mix(color,padColor,padCoverage);
	return vec4f(pow(max(color,vec3f(0)),vec3f(1.0/2.2)),1);
}
`;

export async function createStressGlass(device: GPUDevice, format: GPUTextureFormat): Promise<StressGlass> {
	const module = device.createShaderModule({ label: 'Finite-contact photoelastic disk', code: SOURCE });
	const pipeline = await device.createRenderPipelineAsync({ layout: 'auto', vertex: { module, entryPoint: 'vertex' }, fragment: { module, entryPoint: 'fragment', targets: [{ format }] } });
	const uniform = device.createBuffer({ label: 'Glass dimensions and pressure', size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
	const group = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: uniform } }] });
	const data = new Float32Array([1, 1, 0, 0, 0.52, 0, 0, 0]);
	let disposed = false, touched = false, width = 1, height = 1;
	const upload = () => device.queue.writeBuffer(uniform, 0, data);
	upload();
	return {
		memoryBytes: 32,
		setLoad(pressure) { if (disposed) return; if (!Number.isFinite(pressure) || pressure < 0 || pressure > 1) throw new Error('Glass load must be between 0 and 1.'); touched = false; if (data[4] === Math.fround(pressure)) return; data[4] = pressure; upload(); },
		setOrientation(radians) { if (disposed) return; if (!Number.isFinite(radians)) throw new Error('Glass orientation must be finite.'); const angle = Math.fround(Math.atan2(Math.sin(radians), Math.cos(radians))); if (data[5] === angle) return; data[5] = angle; upload(); },
		resize(w, h) {
			if (disposed) return;
			if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1 || w > device.limits.maxTextureDimension2D || h > device.limits.maxTextureDimension2D || w * h > 16_777_216) throw new Error('Native glass size exceeds its explicit output budget; no lower-resolution substitution.');
			width = w; height = h; data[0] = w; data[1] = h; upload();
		},
		reset() { if (!disposed) { data[4] = 0; touched = false; upload(); } },
		step(_encoder, dt, input) {
			if (disposed || !Number.isFinite(dt) || dt <= 0) return;
			if (input.active && Number.isFinite(input.x)) touched = true;
			if (!touched) return;
			const target = input.active && Number.isFinite(input.x) ? Math.max(0, 1 - 2 * Math.abs(input.x - 0.5)) : 0;
			data[4] += (target - data[4]) * (1 - Math.exp(-Math.min(dt, 1 / 60) * 12));
			if (Math.abs(data[4] - target) < 1e-5) data[4] = target;
			upload();
		},
		render(encoder, target) { if (disposed) return; const pass = encoder.beginRenderPass({ label: 'Native photoelastic glass', colorAttachments: [{ view: target, loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }] }); pass.setPipeline(pipeline); pass.setBindGroup(0, group); pass.draw(3); pass.end(); },
		async inspect() { if (disposed) throw new Error('Glass disposed.'); return { finite: data.every(Number.isFinite), mass: 0, initialMass: 0, min: 0, max: data[4], kinetic: 0, details: { pressure: data[4], orientation: data[5], centerStressDifference: glassStressDifference(0, 0, data[4]), contactHalfAngle: GLASS_CONTACT_HALF_ANGLE, width, height, stateBytes: 32, attachmentBytes: 0, resolvedCanvasBytes: width * height * 4 } }; },
		dispose() { if (!disposed) { disposed = true; uniform.destroy(); } }
	};
}
