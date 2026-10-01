import type { LiquidExperiment, LiquidInput, LiquidSnapshot } from './types.js';

/** Private cosmetic feedback model; these blobs are not fluid parcels. */
export interface SelectionExperiment extends LiquidExperiment {
	setSelection(index: number, immediate?: boolean): void;
}

const COUNT = 7;
const SHADER = /* wgsl */ `
struct Parameters { destination: f32, dt: f32, unused: vec2f };
@group(0) @binding(0) var<storage, read_write> blobs: array<vec4f>;
@group(0) @binding(1) var<uniform> params: Parameters;

@compute @workgroup_size(8)
fn advance(@builtin(global_invocation_id) id: vec3u) {
	if (id.x >= 7u) { return; }
	let i = f32(id.x);
	let offset = vec2f((i-3.0)*0.07, 0.62+0.015*sin(i*2.1));
	let destination = vec2f(params.destination+offset.x, offset.y);
	// A small trailing pair and a faster body can form and lose a neck. This is
	// intentionally art-directed lag, not a claim of surface-tension dynamics.
	let stiffness = select(8.0+i*4.0,90.0+(i-2.0)*18.0,id.x >= 2u);
	let damping = 1.45*sqrt(stiffness);
	let b = blobs[id.x];
	// Ordinary Chrome rejects multi-component swizzle assignment. Construct the
	// whole vector instead of depending on the unsafe-WebGPU test flag.
	let velocity = clamp((b.zw + (destination-b.xy)*stiffness*params.dt) /
		(1.0+damping*params.dt), vec2f(-3.5), vec2f(3.5));
	let position = clamp(b.xy+velocity*params.dt, vec2f(0.17,0.48), vec2f(2.83,0.91));
	blobs[id.x] = vec4f(position,velocity);
}

struct Vertex { @builtin(position) position: vec4f, @location(0) uv: vec2f };
@vertex fn vertex(@builtin(vertex_index) id: u32) -> Vertex {
	let uv = vec2f(f32((id<<1u)&2u),f32(id&2u));
	return Vertex(vec4f(uv*vec2f(2.0,-2.0)+vec2f(-1.0,1.0),0.0,1.0),uv);
}

fn field(p: vec2f) -> vec3f {
	var density = 0.0;
	var gradient = vec2f(0.0);
	for (var i = 0u; i < 7u; i++) {
		let delta = (p-blobs[i].xy)*vec2f(1.0,0.82);
		let value = exp(-dot(delta,delta)/0.037);
		density += value;
		gradient += -2.0*delta*vec2f(1.0,0.82)*value/0.037;
	}
	return vec3f(density,gradient);
}

@fragment fn fragment(in: Vertex) -> @location(0) vec4f {
	let sample = field(in.uv*vec2f(3.0,1.0));
	let edgeWidth = max(fwidth(sample.x),0.018);
	let coverage = smoothstep(0.86-edgeWidth,0.86+edgeWidth,sample.x);
	let normal = normalize(vec3f(-sample.yz*0.11,1.0));
	let light = normalize(vec3f(-0.25,-0.65,1.0));
	let diffuse = max(dot(normal,light),0.0);
	let highlight = pow(max(dot(normal,normalize(light+vec3f(0.0,0.0,1.0))),0.0),26.0);
	let body = vec3f(0.62,0.74,0.31)*(0.6+0.65*diffuse);
	let rim = exp(-abs(sample.x-1.06)*5.0)*0.11;
	let color = min(body + vec3f(0.53,0.53,0.32)*highlight + vec3f(rim),vec3f(1.0));
	return vec4f(color*coverage,coverage);
}
`;

export async function createLiquidSelection(device: GPUDevice, format: GPUTextureFormat,
	initial = 0): Promise<SelectionExperiment> {
	let selected = 0;
	let disposed = false;
	const state = device.createBuffer({ label: 'selection / seven blobs', size: COUNT * 16,
		usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC });
	const parameters = device.createBuffer({ label: 'selection / target', size: 16,
		usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
	const readback = device.createBuffer({ label: 'selection / explicit diagnostic', size: COUNT * 16,
		usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
	device.pushErrorScope('validation');
	let compute: GPUComputePipeline;
	let render: GPURenderPipeline;
	let scopePopped = false;
	try {
		const module = device.createShaderModule({ label: 'selection / cosmetic metaballs', code: SHADER });
		const compilation = await module.getCompilationInfo();
		const errors = compilation.messages.filter((message) => message.type === 'error');
		if (errors.length) throw new Error(errors.map((message) => `${message.lineNum}: ${message.message}`).join('\n'));
		const layout = device.createBindGroupLayout({ entries: [
			{ binding: 0, visibility: GPUShaderStage.COMPUTE | GPUShaderStage.FRAGMENT, buffer: { type: 'storage' } },
			{ binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } }
		] });
		const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [layout] });
		[compute, render] = await Promise.all([
			device.createComputePipelineAsync({ layout: pipelineLayout, compute: { module, entryPoint: 'advance' } }),
			device.createRenderPipelineAsync({ layout: pipelineLayout, vertex: { module, entryPoint: 'vertex' },
				fragment: { module, entryPoint: 'fragment', targets: [{ format }] }, primitive: { topology: 'triangle-list' } })
		]);
		const error = await device.popErrorScope();
		scopePopped = true;
		if (error) throw new Error(error.message);
	} catch (error) {
		// Pop a scope left pending by pipeline creation failure.
		if (!scopePopped) await device.popErrorScope().catch(() => null);
		state.destroy(); parameters.destroy(); readback.destroy();
		throw error;
	}
	const group = device.createBindGroup({ layout: compute.getBindGroupLayout(0), entries: [
		{ binding: 0, resource: { buffer: state } }, { binding: 1, resource: { buffer: parameters } }
	] });
	function writeParameters(dt: number) {
		device.queue.writeBuffer(parameters, 0, new Float32Array([selected + 0.5, dt, 0, 0]));
	}
	function reset() {
		const data = new Float32Array(COUNT * 4);
		for (let i = 0; i < COUNT; i++) {
			data[i * 4] = selected + 0.5 + (i - 3) * 0.07;
			data[i * 4 + 1] = 0.62 + 0.015 * Math.sin(i * 2.1);
		}
		device.queue.writeBuffer(state, 0, data);
		writeParameters(1 / 120);
	}
	function setSelection(index: number, immediate = false) {
		selected = Number.isFinite(index) ? Math.max(0, Math.min(2, Math.round(index))) : 0;
		writeParameters(1 / 120);
		if (immediate) reset();
	}
	setSelection(initial, true);
	return {
		memoryBytes: COUNT * 32 + 16,
		resize() {}, reset, setSelection,
		step(encoder: GPUCommandEncoder, dt: number, _input: LiquidInput) {
			writeParameters(Number.isFinite(dt) ? Math.max(0, Math.min(1 / 60, dt)) : 0);
			const pass = encoder.beginComputePass({ label: 'selection / damped attraction' });
			pass.setPipeline(compute); pass.setBindGroup(0, group); pass.dispatchWorkgroups(1); pass.end();
		},
		render(encoder: GPUCommandEncoder, view: GPUTextureView) {
			const pass = encoder.beginRenderPass({ label: 'selection / surface', colorAttachments: [
				{ view, clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: 'clear', storeOp: 'store' }
			] });
			pass.setPipeline(render); pass.setBindGroup(0, group); pass.draw(3); pass.end();
		},
		async inspect(): Promise<LiquidSnapshot> {
			const encoder = device.createCommandEncoder();
			encoder.copyBufferToBuffer(state, 0, readback, 0, COUNT * 16);
			device.queue.submit([encoder.finish()]);
			await readback.mapAsync(GPUMapMode.READ);
			const values = new Float32Array(readback.getMappedRange()).slice();
			readback.unmap();
			let min = Infinity, max = -Infinity, kinetic = 0, centroid = 0, targetError = 0, maxSpeed = 0;
			for (let i = 0; i < COUNT; i++) {
				const x = values[i * 4], vx = values[i * 4 + 2], vy = values[i * 4 + 3];
				min = Math.min(min, x); max = Math.max(max, x); centroid += x / COUNT;
				kinetic += (vx * vx + vy * vy) / COUNT;
				maxSpeed = Math.max(maxSpeed, Math.hypot(vx, vy));
				targetError = Math.max(targetError, Math.abs(x - (selected + 0.5 + (i - 3) * 0.07)));
			}
			return { finite: values.every(Number.isFinite), mass: COUNT, initialMass: COUNT, min, max, kinetic,
				details: { target: selected + 0.5, centroid, maxSpeed, targetError, cosmeticBlobCount: COUNT } };
		},
		dispose() { if (!disposed) { disposed = true; state.destroy(); parameters.destroy(); readback.destroy(); } }
	};
}
