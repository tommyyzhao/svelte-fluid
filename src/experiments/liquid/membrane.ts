import type { LiquidExperiment } from './types.js';

/** A damped height-field with a three-band thin-film optical approximation. */
export async function createMembrane(device: GPUDevice, format: GPUTextureFormat,
	{ gridSize = 192 }: { gridSize?: number } = {}): Promise<LiquidExperiment> {
	if (!Number.isInteger(gridSize) || gridSize < 64 || gridSize > 256 || gridSize % 8) {
		throw new Error('Membrane grid must be a multiple of 8 between 64 and 256.');
	}
	const count = gridSize * gridSize;
	const computeModule = device.createShaderModule({ label: 'Membrane waves', code: /* wgsl */ `
struct Sample { h: f32, v: f32 };
struct Params { pointer: vec4f, step: vec4f };
@group(0) @binding(0) var<storage,read> previous: array<Sample>;
@group(0) @binding(1) var<storage,read_write> next: array<Sample>;
@group(0) @binding(2) var<uniform> params: Params;
fn height(p: vec2i) -> f32 {
	let q = clamp(p,vec2i(0),vec2i(${gridSize - 1}));
	return previous[u32(q.y)*${gridSize}u+u32(q.x)].h;
}
@compute @workgroup_size(8,8)
fn update(@builtin(global_invocation_id) id: vec3u) {
	if (id.x >= ${gridSize}u || id.y >= ${gridSize}u) { return; }
	let i = id.y*${gridSize}u+id.x;
	if (id.x < 2u || id.y < 2u || id.x > ${gridSize - 3}u || id.y > ${gridSize - 3}u) {
		next[i] = Sample(0,0); return;
	}
	let p = vec2i(id.xy); let s = previous[i];
	let aspect = params.step.y;
	let lap = ((height(p+vec2i(1,0))+height(p-vec2i(1,0))-2.0*s.h)/(aspect*aspect)
		+height(p+vec2i(0,1))+height(p-vec2i(0,1))-2.0*s.h)*${gridSize * gridSize}.0;
	let uv = (vec2f(id.xy)+0.5)/${gridSize}.0;
	let q = (uv-params.pointer.xy)*vec2f(aspect,1);
	let velocity = params.pointer.zw*vec2f(aspect,1);
	let rawSpeed = length(velocity);
	let speed = min(rawSpeed,2.5);
	let direction = velocity/max(rawSpeed,0.001);
	let impulse = -18.0*speed*exp(-dot(q,q)/0.0045)*(0.6+9.0*dot(q,direction));
	let dt = params.step.x;
	// A hardening restoring response resists large displacement smoothly.
	// A linear spring alone let ordinary gestures hit the emergency height
	// clamp, creating a flat-topped crease whose reflection looked pixelated.
	let restoring = 18.0*s.h+60000.0*s.h*s.h*s.h;
	let v = clamp((s.v+dt*(0.0324*lap-restoring+impulse))*exp(-7.0*dt),-2.0,2.0);
	let h = clamp(s.h+dt*v,-0.09,0.09);
	next[i] = Sample(h,v);
}
` });
	const renderModule = device.createShaderModule({ label: 'Three-band interference membrane', code: /* wgsl */ `
struct Sample { h: f32, v: f32 };
struct Params { pointer: vec4f, step: vec4f };
@group(0) @binding(0) var<storage,read> field: array<Sample>;
@group(0) @binding(2) var<uniform> params: Params;
struct Vertex { @builtin(position) position: vec4f, @location(0) uv: vec2f };
@vertex fn vertex(@builtin(vertex_index) i: u32) -> Vertex {
	let p = array<vec2f,3>(vec2f(-1,-1),vec2f(3,-1),vec2f(-1,3))[i];
	return Vertex(vec4f(p,0,1),p*vec2f(0.5,-0.5)+0.5);
}
fn cell(p: vec2i) -> f32 {
	let q = clamp(p,vec2i(0),vec2i(${gridSize - 1}));
	return field[u32(q.y)*${gridSize}u+u32(q.x)].h;
}
fn cubic(f: f32) -> vec4f {
	let f2 = f*f; let f3 = f2*f; let one = 1.0-f;
	return vec4f(one*one*one,3.0*f3-6.0*f2+4.0,-3.0*f3+3.0*f2+3.0*f+1.0,f3)/6.0;
}
fn cubicDerivative(f: f32) -> vec4f {
	return vec4f(-0.5*(1.0-f)*(1.0-f),1.5*f*f-2.0*f,-1.5*f*f+f+0.5,0.5*f*f);
}
// Read 16 field values once, reconstructing height and its two derivatives.
// The previous five bilinear evaluations read 20 values and exposed C0
// derivative kinks in highlights when a simulation cell spanned many pixels.
fn reconstruct(uv: vec2f) -> vec3f {
	let p = uv*${gridSize}.0-0.5; let base = vec2i(floor(p))-1; let f = fract(p);
	let wx = cubic(f.x); let wy = cubic(f.y);
	let dx = cubicDerivative(f.x); let dy = cubicDerivative(f.y);
	var result = vec3f(0.0);
	for (var y = 0; y < 4; y++) {
		for (var x = 0; x < 4; x++) {
			result += cell(base+vec2i(x,y))*vec3f(wx[x]*wy[y],dx[x]*wy[y],wx[x]*dy[y]);
		}
	}
	return result*vec3f(1.0,${gridSize}.0,${gridSize}.0);
}
fn drapeGradient(uv: vec2f) -> vec2f {
	let p = uv-0.5;
	return 0.035*cos(4.6*p.x+1.5*p.y)*vec2f(4.6,1.5)
		+0.018*cos(8.0*p.y-2.0*p.x)*vec2f(-2.0,8.0)
		+0.011*cos(13.0*p.x+7.0*p.y)*vec2f(13.0,7.0);
}
@fragment fn fragment(in: Vertex) -> @location(0) vec4f {
	let uv = in.uv;
	let aspect = params.step.y;
	let field = reconstruct(uv);
	let slope = (drapeGradient(uv)+field.yz)*vec2f(1.0/aspect,1.0);
	let n = normalize(vec3f(-slope*2.4,1));
	let view = normalize(vec3f((vec2f(0.5)-uv)*vec2f(aspect,1)*0.4,1.3));
	let light = normalize(vec3f(-0.55,-0.65,1.4));
	let halfVector = normalize(view+light);
	let cosine = clamp(dot(n,halfVector),0.0,1.0);
	// Optical path length drives the color. This is a three-wavelength visual
	// approximation, NOT Belcour's spectrally integrated microfacet BRDF.
	let thickness = 390.0+160.0*sin(uv.x*4.4+uv.y*3.2)+90.0*sin(uv.y*6.5-uv.x*1.5)+field.x*2300.0;
	let phase = 12.5663706*1.33*max(thickness,60.0)*sqrt(max(0.0,1.0-(1.0-cosine*cosine)/(1.33*1.33)))/vec3f(650,530,460);
	// Average unresolved phase variation over a display-pixel footprint. This
	// Gaussian footprint approximation damps aliasing, not simulated waves.
	let phaseX = dpdx(phase); let phaseY = dpdy(phase);
	let phaseVisibility = exp(-(phaseX*phaseX+phaseY*phaseY)/24.0);
	let interference = 0.5+0.5*cos(phase+vec3f(0.4,0.2,0))*phaseVisibility;
	let reflection = reflect(-view,n);
	// Broad studio strips give the sheet legible luminance structure as well
	// as hue changes. No moving lights, time noise, bloom, or image assets.
	let stripDistance = (reflection.y+0.16)/max(0.11,2.0*fwidth(reflection.y));
	let strip = exp(-stripDistance*stripDistance);
	let band = reflection.x-reflection.y*0.35-0.28;
	let bandDistance = band/max(0.055,2.0*fwidth(band));
	let narrow = exp(-bandDistance*bandDistance);
	let specular = pow(cosine,70.0);
	let fresnel = 0.05+0.95*pow(1.0-clamp(dot(n,view),0.0,1.0),5.0);
	let radiance = vec3f(0.012,0.016,0.024)+interference*(0.18+0.72*strip+0.9*fresnel)
		+vec3f(0.82,0.91,1)*(0.55*strip+0.45*narrow+0.35*specular);
	let color = pow(vec3f(1)-exp(-radiance*1.25),vec3f(1.0/2.2));
	let margin = min(min(uv.x,1.0-uv.x),min(uv.y,1.0-uv.y));
	let vignette = smoothstep(0.0,0.13,margin);
	return vec4f(mix(vec3f(0.012,0.015,0.025),color,0.35+0.65*vignette),1);
}
` });
	for (const module of [computeModule, renderModule]) {
		const errors = (await module.getCompilationInfo()).messages.filter((m) => m.type === 'error');
		if (errors.length) throw new Error(errors.map((m) => m.message).join('\n'));
	}
	const compute = await device.createComputePipelineAsync({ layout: 'auto', compute: { module: computeModule, entryPoint: 'update' } });
	const render = await device.createRenderPipelineAsync({ layout: 'auto', vertex: { module: renderModule, entryPoint: 'vertex' },
		fragment: { module: renderModule, entryPoint: 'fragment', targets: [{ format }] } });
	const fields = [0, 1].map(() => device.createBuffer({ size: count * 8,
		usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST }));
	const uniform = device.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
	const data = new Float32Array(8); data[5] = 1.6;
	device.queue.writeBuffer(uniform, 0, data);
	const computeGroups = fields.map((field, i) => device.createBindGroup({ layout: compute.getBindGroupLayout(0), entries: [
		{ binding: 0, resource: { buffer: field } }, { binding: 1, resource: { buffer: fields[1 - i] } }, { binding: 2, resource: { buffer: uniform } }
	] }));
	const renderGroups = fields.map((field) => device.createBindGroup({ layout: render.getBindGroupLayout(0), entries: [
		{ binding: 0, resource: { buffer: field } }, { binding: 2, resource: { buffer: uniform } }
	] }));
	let index = 0, disposed = false;
	return {
		memoryBytes: count * 16 + 32,
		resize(width, height) {
			if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return;
			data[5] = Math.max(0.0001, width / height);
			if (!disposed) device.queue.writeBuffer(uniform, 0, data);
		},
		reset() { if (!disposed) { const zero = new Float32Array(count * 2); fields.forEach((f) => device.queue.writeBuffer(f, 0, zero)); index = 0; } },
		step(encoder, dt, input) {
			if (disposed || !Number.isFinite(dt) || dt <= 0) return;
			data[0] = Number.isFinite(input.x) ? input.x : 0.5; data[1] = Number.isFinite(input.y) ? input.y : 0.5;
			data[2] = input.active && Number.isFinite(input.vx) ? Math.max(-3, Math.min(3, input.vx)) : 0;
			data[3] = input.active && Number.isFinite(input.vy) ? Math.max(-3, Math.min(3, input.vy)) : 0;
			// CFL bound uses actual portrait/landscape cell dimensions. Ordinary
			// layouts need one step; narrow surfaces need substeps, not a stretched
			// square field. Bound pathological aspect work instead of growing it.
			// Include the maximum tangent stiffness of the hardening spring at
			// the emergency height bound, not only spatial wave propagation.
			const maxSpringStiffness = 18 + 3 * 60000 * 0.09 ** 2;
			const stableDt = 0.8 / Math.sqrt(0.18 ** 2 * gridSize ** 2 * (1 + 1 / data[5] ** 2) + maxSpringStiffness / 4);
			const elapsed = Math.min(dt, 1 / 120, stableDt * 8);
			const substeps = Math.max(1, Math.ceil(elapsed / stableDt));
			data[4] = elapsed / substeps;
			device.queue.writeBuffer(uniform, 0, data);
			for (let step = 0; step < substeps; step++) {
				const pass = encoder.beginComputePass(); pass.setPipeline(compute); pass.setBindGroup(0, computeGroups[index]);
				pass.dispatchWorkgroups(gridSize / 8, gridSize / 8); pass.end(); index = 1 - index;
			}
		},
		render(encoder, target) {
			if (disposed) return;
			const pass = encoder.beginRenderPass({ colorAttachments: [{ view: target, loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }] });
			pass.setPipeline(render); pass.setBindGroup(0, renderGroups[index]); pass.draw(3); pass.end();
		},
		async inspect() {
			if (disposed) throw new Error('Membrane disposed.');
			const read = device.createBuffer({ size: count * 8, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
			try {
				const encoder = device.createCommandEncoder(); encoder.copyBufferToBuffer(fields[index], 0, read, 0, count * 8);
				device.queue.submit([encoder.finish()]); await read.mapAsync(GPUMapMode.READ);
				const values = new Float32Array(read.getMappedRange());
				let square = 0, kinetic = 0, maxAbsHeight = 0, heightLimitCells = 0, finite = true;
				for (let i = 0; i < values.length; i += 2) {
					finite &&= Number.isFinite(values[i]) && Number.isFinite(values[i + 1]);
					square += values[i] ** 2; kinetic += values[i + 1] ** 2; maxAbsHeight = Math.max(maxAbsHeight, Math.abs(values[i]));
					if (Math.abs(values[i]) >= 0.089999) heightLimitCells++;
				}
				return { finite, mass: 0, initialMass: 0, min: -maxAbsHeight, max: maxAbsHeight, kinetic: kinetic / count,
					details: { heightRms: Math.sqrt(square / count), maxAbsHeight, heightLimitCells, gridSize } };
			} finally { read.destroy(); }
		},
		dispose() { if (!disposed) { disposed = true; fields.forEach((f) => f.destroy()); uniform.destroy(); } }
	};
}
