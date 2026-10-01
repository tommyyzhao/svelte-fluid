import type { LiquidExperiment, LiquidInput, LiquidSnapshot } from './types.js';

/** A coherent elastic curve with a round, lit surface. Not an inextensible rope. */
const nodes = 128;
const DOMAIN_WIDTH = 2.7;
const DOMAIN_HEIGHT = 1.36;
const RADIUS = 0.046;
const ATTACHMENT_BUDGET = 256 * 1024 * 1024;
const TRANSITION_BUDGET = 384 * 1024 * 1024;
const SAMPLES = 4;

const SOURCE = /* wgsl */ `
struct Node { position: vec4f, velocity: vec4f, anchor: vec4f };
struct Params { pointer: vec4f, step: vec4f, display: vec4f, mesh: vec4u };
@group(0) @binding(0) var<storage,read> current: array<Node>;
@group(0) @binding(1) var<storage,read_write> next: array<Node>;
@group(0) @binding(2) var<uniform> params: Params;
fn offset(i: u32) -> vec3f { return current[i].position.xyz-current[i].anchor.xyz; }
@compute @workgroup_size(64)
fn update(@builtin(global_invocation_id) id: vec3u) {
	if (id.x >= ${nodes}u) { return; }
	let i = id.x; let a = (i+${nodes - 1}u)%${nodes}u; let b = (i+1u)%${nodes}u;
	var node = current[i];
	let displacement = offset(i);
	let lap = offset(a)+offset(b)-2.0*displacement;
	let restoring = (28.0+600.0*dot(displacement,displacement))*displacement;
	let dt = params.step.x;
	var velocity = (node.velocity.xyz+dt*(320.0*lap-restoring))*exp(-6.0*dt);
	let delta = node.position.xy-params.pointer.xy;
	let influence = exp(-dot(delta,delta)/(2.0*0.17*0.17))*params.step.y;
	let speed = min(length(params.pointer.zw),3.0);
	let dragVelocity = vec3f(params.pointer.zw*0.72,speed*0.22);
	velocity = mix(velocity,dragVelocity,1.0-exp(-20.0*influence*dt));
	let velocityLength = length(velocity);
	if (velocityLength > 2.5) { velocity *= 2.5/velocityLength; }
	var position = node.position.xyz+dt*velocity;
	let moved = position-node.anchor.xyz;
	let distance = length(moved);
	// Emergency bound, not the normal constitutive response. Diagnostics expose
	// reaching it; a smooth hardening spring handles ordinary gestures.
	if (distance > 0.55) { position = node.anchor.xyz+moved*(0.55/distance); velocity *= 0.25; }
	node.position = vec4f(position,0); node.velocity = vec4f(velocity,0); next[i] = node;
}

fn cubic(f: f32) -> vec4f {
	let f2=f*f; let f3=f2*f; let r=1.0-f;
	return vec4f(r*r*r,3.0*f3-6.0*f2+4.0,-3.0*f3+3.0*f2+3.0*f+1.0,f3)/6.0;
}
fn derivative(f: f32) -> vec4f {
	return vec4f(-0.5*(1.0-f)*(1.0-f),1.5*f*f-2.0*f,-1.5*f*f+f+0.5,0.5*f*f);
}
struct Vertex { @builtin(position) clip: vec4f, @location(0) position: vec3f, @location(1) normal: vec3f, @location(2) along: f32 };
@vertex fn vertex(@builtin(vertex_index) id: u32) -> Vertex {
	let radial = params.mesh.y;
	let along = f32(id/radial)/f32(params.mesh.x);
	let u = along*${nodes}.0;
	let base = u32(floor(u)); let fraction = fract(u);
	let weights = cubic(fraction); let slopes = derivative(fraction);
	var center = vec3f(0); var direction = vec3f(0);
	for (var j=0u;j<4u;j++) {
		let point = current[(base+${nodes - 1}u+j)%${nodes}u].position.xyz;
		center += point*weights[j]; direction += point*slopes[j];
	}
	let tangent = normalize(direction+vec3f(0.0000001,0,0));
	// The reference-plane frame is continuous for this near-planar closed
	// curve. Circular sections carry no texture seam; a vertical tangent gets
	// a finite fallback frame instead of the Frenet frame's inflection flips.
	var side = vec3f(-tangent.y,tangent.x,0);
	if (dot(side,side)<0.000001) { side = vec3f(1,0,0)-tangent*tangent.x; }
	side = normalize(side);
	let up = normalize(cross(tangent,side));
	let angle = 6.28318530718*f32(id%radial)/f32(radial);
	let normal = side*cos(angle)+up*sin(angle);
	let position = center+${RADIUS}*normal;
	var out: Vertex;
	out.clip = vec4f(position.xy*vec2f(${2 / DOMAIN_WIDTH},${2 / DOMAIN_HEIGHT})/params.display.xy,0.5-position.z*0.4,1);
	out.position = position; out.normal = normal; out.along = along;
	return out;
}
fn studio(r: vec3f) -> vec3f {
	let keyDistance = r.xy-vec2f(-0.35,0.45);
	let key = exp(-dot(keyDistance*vec2f(2.8,4.0),keyDistance));
	let fillDistance = r.xy-vec2f(0.6,-0.15);
	let fill = exp(-dot(fillDistance*vec2f(4.0,2.0),fillDistance));
	let stripDistance = (r.y+0.38)/0.075;
	let strip = exp(-stripDistance*stripDistance)*smoothstep(-0.4,0.5,r.z);
	return vec3f(0.10,0.12,0.16)+vec3f(2.5,2.0,1.4)*key+vec3f(0.22,0.52,1.1)*fill+vec3f(1.0,1.3,1.8)*strip;
}
@fragment fn fragment(in: Vertex) -> @location(0) vec4f {
	let normal = normalize(in.normal);
	let view = normalize(vec3f(-in.position.xy*0.18,1.8));
	let reflected = reflect(-view,normal);
	let light = normalize(vec3f(-0.6,0.7,1.0));
	let halfVector = normalize(view+light);
	let facing = clamp(dot(normal,view),0.0,1.0);
	let fresnel = 0.09+0.91*pow(1.0-facing,5.0);
	let copper = vec3f(0.92,0.33,0.13);
	let material = mix(copper,vec3f(0.29,0.38,0.61),0.5+0.5*sin(in.along*6.28318530718+0.3));
	let diffuse = 0.08+0.22*max(dot(normal,light),0.0);
	let normalX=dpdx(normal); let normalY=dpdy(normal);
	let normalVariance=(dot(normalX,normalX)+dot(normalY,normalY))/12.0;
	let exponent=90.0/(1.0+90.0*normalVariance);
	let highlight=pow(clamp(dot(normal,halfVector),0.0,1.0),exponent)*exponent/90.0;
	let radiance = material*diffuse+studio(reflected)*mix(material,vec3f(1),0.28+0.72*fresnel)+vec3f(0.65)*highlight;
	let color=pow(vec3f(1)-exp(-max(radiance,vec3f(0))*1.15),vec3f(1.0/2.2));
	return vec4f(color,1);
}
`;

export async function createFilament(device: GPUDevice, format: GPUTextureFormat): Promise<LiquidExperiment> {
	const module = device.createShaderModule({ label: 'Coherent lit filament', code: SOURCE });
	const compute = await device.createComputePipelineAsync({ label: 'Filament elastic curve', layout: 'auto', compute: { module, entryPoint: 'update' } });
	const render = await device.createRenderPipelineAsync({ label: 'Filament round geometry', layout: 'auto', vertex: { module, entryPoint: 'vertex' },
		fragment: { module, entryPoint: 'fragment', targets: [{ format }] },
		primitive: { topology: 'triangle-list', cullMode: 'none' },
		depthStencil: { format: 'depth16unorm', depthWriteEnabled: true, depthCompare: 'less' }, multisample: { count: SAMPLES } });
	const initial = new Float32Array(nodes * 12);
	for (let i = 0; i < nodes; i++) {
		const t = i / nodes * Math.PI * 2;
		const position = [0.98 * Math.sin(t), 0.4 * Math.sin(2 * t), 0.29 * Math.cos(t)];
		initial.set(position, i * 12); initial.set(position, i * 12 + 8);
	}
	const fields = [0, 1].map(() => device.createBuffer({ label: 'Filament nodes', size: initial.byteLength,
		usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC }));
	const uniform = device.createBuffer({ label: 'Filament input and projection', size: 64, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
	const parameters = new ArrayBuffer(64); const values = new Float32Array(parameters); const integers = new Uint32Array(parameters);
	const computeGroups = fields.map((field, i) => device.createBindGroup({ layout: compute.getBindGroupLayout(0), entries: [
		{ binding: 0, resource: { buffer: field } }, { binding: 1, resource: { buffer: fields[1 - i] } }, { binding: 2, resource: { buffer: uniform } }
	] }));
	const renderGroups = fields.map((field) => device.createBindGroup({ layout: render.getBindGroupLayout(0), entries: [
		{ binding: 0, resource: { buffer: field } }, { binding: 2, resource: { buffer: uniform } }
	] }));
	let index = 0, disposed = false, width = 0, height = 0, segments = 0, radial = 0, indexCount = 0;
	let color: GPUTexture | undefined, depth: GPUTexture | undefined, indices: GPUBuffer | undefined;
	let colorView: GPUTextureView | undefined, depthView: GPUTextureView | undefined;
	let scaleX = 1, scaleY = 1, attachmentBytes = 0, meshBytes = 0;
	const stateBytes = initial.byteLength * 2 + 64;
	const reset = () => { if (!disposed) { fields.forEach((field) => device.queue.writeBuffer(field, 0, initial)); index = 0; } };
	reset();
	return {
		get memoryBytes() { return stateBytes + attachmentBytes + meshBytes; },
		resize(nextWidth, nextHeight) {
			if (disposed || nextWidth === width && nextHeight === height) return;
			if (!Number.isInteger(nextWidth) || !Number.isInteger(nextHeight) || nextWidth < 1 || nextHeight < 1 ||
				nextWidth > device.limits.maxTextureDimension2D || nextHeight > device.limits.maxTextureDimension2D) throw new Error('Native filament dimensions exceed WebGPU limits.');
			const aspect = nextWidth / nextHeight / (DOMAIN_WIDTH / DOMAIN_HEIGHT);
			const sx = Math.max(1, aspect), sy = Math.max(1, 1 / aspect);
			const pixelsPerWorld = nextHeight / (DOMAIN_HEIGHT * sy);
			// Sagitta <0.15 physical pixel for the tube's circular cross-section.
			// Longitudinal tessellation uses a curvature heuristic for this tested
			// curve family, not a guaranteed error bound under every deformation.
			const nextRadial = Math.max(16, Math.ceil(Math.PI / Math.acos(Math.max(-1, 1 - 0.15 / (RADIUS * pixelsPerWorld))) / 4) * 4);
			const nextSegments = Math.max(256, Math.ceil(2 * Math.PI * Math.sqrt(12 * pixelsPerWorld / (8 * 0.15)) / 64) * 64);
			const nextCount = nextSegments * nextRadial * 6;
			const bytes = nextWidth * nextHeight * (SAMPLES * (4 + 2) + 4) + nextCount * 4 + stateBytes;
			if (bytes > ATTACHMENT_BUDGET) throw new Error(`Native filament needs ${(bytes / 1048576).toFixed(0)} MiB including MSAA and resolve; its safe budget is 256 MiB. No lower-resolution substitution was made.`);
			// Candidate allocation overlaps the old live renderer. Include both
			// target sets and both resolved frames in a separate transition bound.
			const transitionBytes = bytes + attachmentBytes + meshBytes + width * height * 4;
			if (transitionBytes > TRANSITION_BUDGET) throw new Error(`Native filament resize needs a ${(transitionBytes / 1048576).toFixed(0)} MiB transition; its transition budget is 384 MiB. No lower-resolution substitution was made.`);
			let candidateColor: GPUTexture | undefined, candidateDepth: GPUTexture | undefined, candidateIndices: GPUBuffer | undefined;
			try {
				candidateColor = device.createTexture({ label: 'Filament native 4x color', size: [nextWidth, nextHeight], format, sampleCount: SAMPLES, usage: GPUTextureUsage.RENDER_ATTACHMENT });
				candidateDepth = device.createTexture({ label: 'Filament native 4x depth', size: [nextWidth, nextHeight], format: 'depth16unorm', sampleCount: SAMPLES, usage: GPUTextureUsage.RENDER_ATTACHMENT });
				if (nextSegments !== segments || nextRadial !== radial) {
					const data = new Uint32Array(nextCount); let cursor = 0;
					for (let s = 0; s < nextSegments; s++) for (let r = 0; r < nextRadial; r++) {
						const a = s * nextRadial + r, b = s * nextRadial + (r + 1) % nextRadial;
						// Duplicate the procedural closing ring at along=1. Interpolating
						// .999 to 0 across a closing triangle created a false color seam.
						const c = (s + 1) * nextRadial + r, d = (s + 1) * nextRadial + (r + 1) % nextRadial;
						data.set([a, b, c, b, d, c], cursor); cursor += 6;
					}
					candidateIndices = device.createBuffer({ label: 'Filament display-tessellated mesh', size: data.byteLength, usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST });
					device.queue.writeBuffer(candidateIndices, 0, data);
				}
				const newColorView = candidateColor.createView(), newDepthView = candidateDepth.createView();
				color?.destroy(); depth?.destroy();
				color = candidateColor; depth = candidateDepth; colorView = newColorView; depthView = newDepthView;
				if (candidateIndices) { indices?.destroy(); indices = candidateIndices; }
				width = nextWidth; height = nextHeight; scaleX = sx; scaleY = sy; segments = nextSegments; radial = nextRadial; indexCount = nextCount;
				attachmentBytes = width * height * SAMPLES * (4 + 2); meshBytes = nextCount * 4;
				values[8] = scaleX; values[9] = scaleY; values[10] = width; values[11] = height;
				integers[12] = segments; integers[13] = radial; device.queue.writeBuffer(uniform, 0, parameters);
			} catch (error) { candidateColor?.destroy(); candidateDepth?.destroy(); candidateIndices?.destroy(); throw error; }
		},
		reset,
		step(encoder: GPUCommandEncoder, dt: number, input: LiquidInput) {
			if (disposed || !Number.isFinite(dt) || dt <= 0) return;
			values[0] = ((Number.isFinite(input.x) ? input.x : 0.5) - 0.5) * DOMAIN_WIDTH * scaleX;
			values[1] = (0.5 - (Number.isFinite(input.y) ? input.y : 0.5)) * DOMAIN_HEIGHT * scaleY;
			values[2] = input.active && Number.isFinite(input.vx) ? Math.max(-4, Math.min(4, input.vx * DOMAIN_WIDTH * scaleX)) : 0;
			values[3] = input.active && Number.isFinite(input.vy) ? Math.max(-4, Math.min(4, -input.vy * DOMAIN_HEIGHT * scaleY)) : 0;
			values[4] = Math.min(dt, 1 / 120); values[5] = input.active && Math.hypot(values[2], values[3]) > 0.002 ? 1 : 0;
			device.queue.writeBuffer(uniform, 0, parameters);
			const pass = encoder.beginComputePass({ label: 'Filament curve motion' });
			pass.setPipeline(compute); pass.setBindGroup(0, computeGroups[index]); pass.dispatchWorkgroups(Math.ceil(nodes / 64)); pass.end(); index = 1 - index;
		},
		render(encoder, target) {
			if (disposed) return;
			if (!colorView || !depthView || !indices) throw new Error('Size the filament before rendering.');
			const pass = encoder.beginRenderPass({ label: 'Filament native geometry and MSAA resolve', colorAttachments: [
				{ view: colorView, resolveTarget: target, clearValue: [0, 0, 0, 0], loadOp: 'clear', storeOp: 'discard' }
			], depthStencilAttachment: { view: depthView, depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'discard' } });
			pass.setPipeline(render); pass.setBindGroup(0, renderGroups[index]); pass.setIndexBuffer(indices, 'uint32'); pass.drawIndexed(indexCount); pass.end();
		},
		async inspect(): Promise<LiquidSnapshot> {
			if (disposed) throw new Error('Filament disposed.');
			const readback = device.createBuffer({ size: initial.byteLength, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
			try {
				const encoder = device.createCommandEncoder(); encoder.copyBufferToBuffer(fields[index], 0, readback, 0, initial.byteLength); device.queue.submit([encoder.finish()]);
				await readback.mapAsync(GPUMapMode.READ); const data = new Float32Array(readback.getMappedRange());
				let finite = true, squared = 0, maxDisplacement = 0, kinetic = 0, maxSpeed = 0, limitNodes = 0;
				for (let i = 0; i < nodes; i++) {
					const offset = i * 12;
					for (let j = 0; j < 12; j++) finite &&= Number.isFinite(data[offset + j]);
					const displacement = Math.hypot(data[offset] - initial[offset], data[offset + 1] - initial[offset + 1], data[offset + 2] - initial[offset + 2]);
					const speed = Math.hypot(data[offset + 4], data[offset + 5], data[offset + 6]);
					squared += displacement * displacement; kinetic += speed * speed; maxDisplacement = Math.max(maxDisplacement, displacement); maxSpeed = Math.max(maxSpeed, speed);
					if (displacement >= 0.54999) limitNodes++;
				}
				return { finite, mass: 0, initialMass: 0, min: 0, max: maxDisplacement, kinetic: kinetic / nodes,
					details: { nodes, rmsDisplacement: Math.sqrt(squared / nodes), maxDisplacement, maxSpeed, limitNodes, segments, radialSegments: radial, triangles: indexCount / 3, stateBytes, attachmentBytes, meshBytes, resolvedCanvasBytes: width * height * 4 } };
			} finally { readback.destroy(); }
		},
		dispose() { if (disposed) return; disposed = true; fields.forEach((field) => field.destroy()); uniform.destroy(); color?.destroy(); depth?.destroy(); indices?.destroy(); }
	};
}
