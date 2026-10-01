import type { LiquidExperiment } from './types.js';
import { BRAID_NODES, BRAID_RADIUS, braidClearance, braidPoint, RopeDeposition, THREAD_HISTORY_CAPACITY, THREAD_RADIUS } from './thread-geometry.js';

export type ThreadStudyMode = 'deposition' | 'braid';
export interface ThreadStudyState { mode: ThreadStudyMode; feeding: boolean; full: boolean; count: number; error: string }
export interface ThreadStudyExperiment extends LiquidExperiment {
	setMode(mode: ThreadStudyMode): void;
	setFeeding(feeding: boolean): void;
	setControls(settings: { ratio?: number; feed?: number; spacing?: number; turns?: number }): void;
	depositSample(seconds?: number): void;
}
const SAMPLES = 4, DOMAIN_WIDTH = 3.2, DOMAIN_HEIGHT = 1.8;
const SOURCE = /* wgsl */ `
struct Params { display: vec4f, mesh: vec4u, style: vec4f };
@group(0) @binding(0) var<storage,read> points: array<vec4f>;
@group(0) @binding(1) var<uniform> p: Params;
fn cubic(f: f32) -> vec4f { let r=1.0-f; let f2=f*f; let f3=f2*f; return vec4f(r*r*r,3.0*f3-6.0*f2+4.0,-3.0*f3+3.0*f2+3.0*f+1.0,f3)/6.0; }
fn slope(f: f32) -> vec4f { return vec4f(-0.5*(1.0-f)*(1.0-f),1.5*f*f-2.0*f,-1.5*f*f+f+0.5,0.5*f*f); }
struct Vertex { @builtin(position) clip: vec4f, @location(0) position: vec3f, @location(1) normal: vec3f, @location(2) material: vec3f };
fn curvePoint(index: i32, strand: u32) -> vec3f {
	let offset=strand*${BRAID_NODES}u; let last=p.mesh.z-1u;
	if (index<0) { return 2.0*points[offset].xyz-points[offset+min(1u,last)].xyz; }
	if (index>i32(last)) { return 2.0*points[offset+last].xyz-points[offset+last-min(1u,last)].xyz; }
	return points[offset+u32(index)].xyz;
}
@vertex fn vertex(@builtin(vertex_index) id: u32, @builtin(instance_index) strand: u32) -> Vertex {
	let along=f32(id/p.mesh.y)/f32(p.mesh.w);
	let base=i32(floor(along)); let f=fract(along); let weights=cubic(f); let slopes=slope(f);
	var center=vec3f(0); var direction=vec3f(0);
	for (var j=0u;j<4u;j++) {
		let point=curvePoint(base-1+i32(j),strand);
		center+=point*weights[j]; direction+=point*slopes[j];
	}
	if (p.style.y<0.5) { center.x+=p.style.z-0.85; }
	let tangent=normalize(direction+vec3f(0.00000001,0,0));
	let side=normalize(vec3f(-tangent.y,tangent.x,0)); let up=normalize(cross(tangent,side));
	let angle=6.28318530718*f32(id%p.mesh.y)/f32(p.mesh.y);
	let normal=side*cos(angle)+up*sin(angle); let position=center+p.style.x*normal;
	var color=vec3f(0.94,0.41,0.16);
	if (p.style.y>0.5) {
		if (strand==1u) { color=vec3f(0.25,0.61,0.75); }
		if (strand==2u) { color=vec3f(0.74,0.76,0.72); }
	}
	return Vertex(vec4f(position.xy*vec2f(${2 / DOMAIN_WIDTH},${2 / DOMAIN_HEIGHT})/p.display.xy,0.5-position.z*0.8,1),position,normal,color);
}
fn studio(r: vec3f) -> vec3f {
	let a=(r.y-0.45)/0.12; let b=(r.x+0.5)/0.16;
	return vec3f(0.07,0.1,0.16)+vec3f(2.2,2.1,1.8)*exp(-a*a)+vec3f(0.4,0.7,1.4)*exp(-b*b);
}
@fragment fn fragment(v: Vertex) -> @location(0) vec4f {
	let normal=normalize(v.normal); let view=normalize(vec3f(-v.position.xy*0.12,2));
	let light=normalize(vec3f(-0.6,0.7,1)); let reflected=reflect(-view,normal);
	let facing=clamp(dot(normal,view),0.0,1.0); let fresnel=0.1+0.9*pow(1.0-facing,5.0);
	let variance=(dot(dpdx(normal),dpdx(normal))+dot(dpdy(normal),dpdy(normal)))/12.0;
	let exponent=80.0/(1.0+80.0*variance);
	let gloss=pow(clamp(dot(normal,normalize(view+light)),0.0,1.0),exponent)*exponent/80.0;
	let radiance=v.material*(0.08+0.2*max(dot(normal,light),0.0))+studio(reflected)*mix(v.material,vec3f(1),fresnel*0.75)+vec3f(gloss*0.65);
	return vec4f(pow(vec3f(1)-exp(-radiance*1.15),vec3f(1.0/2.2)),1);
}
`;

export async function createThreadStudy(device: GPUDevice, format: GPUTextureFormat,
	changed?: (state: ThreadStudyState) => void): Promise<ThreadStudyExperiment> {
	const shader = device.createShaderModule({ label: 'Native continuous deposited thread / authored braid', code: SOURCE });
	const errors = (await shader.getCompilationInfo()).messages.filter((message) => message.type === 'error');
	if (errors.length) throw new Error(errors.map((message) => message.message).join('\n'));
	const pipeline = await device.createRenderPipelineAsync({ layout: 'auto', vertex: { module: shader, entryPoint: 'vertex' },
		fragment: { module: shader, entryPoint: 'fragment', targets: [{ format }] },
		depthStencil: { format: 'depth16unorm', depthWriteEnabled: true, depthCompare: 'less' }, multisample: { count: SAMPLES } });
	device.pushErrorScope('out-of-memory'); device.pushErrorScope('validation');
	const startup: { positions?: GPUBuffer; uniform?: GPUBuffer; group?: GPUBindGroup; error?: unknown } = {};
	try {
		startup.positions = device.createBuffer({ size: THREAD_HISTORY_CAPACITY * 16, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
		startup.uniform = device.createBuffer({ size: 48, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
		startup.group = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: startup.positions } }, { binding: 1, resource: { buffer: startup.uniform } }] });
	} catch (error) { startup.error = error; }
	const validation = device.popErrorScope(), oom = device.popErrorScope();
	const failures = await Promise.all([validation, oom]);
	if (startup.error || failures.some(Boolean)) {
		startup.positions?.destroy(); startup.uniform?.destroy();
		throw new Error(`Native thread startup failed: ${String(startup.error || failures.find(Boolean)?.message)}`);
	}
	const positions = startup.positions!, uniform = startup.uniform!, group = startup.group!;
	const data = new Float32Array(THREAD_HISTORY_CAPACITY * 4), params = new ArrayBuffer(48), f = new Float32Array(params), u = new Uint32Array(params);
	const rope = new RopeDeposition(); let mode: ThreadStudyMode = 'deposition', feeding = false, ratio = 0.35, feed = 0.55, spacing = 0.14, turns = 3;
	let width = 0, height = 0, radial = 0, subdivisions = 0, disposed = false, dirty = true, fault = '';
	let color: GPUTexture | undefined, depth: GPUTexture | undefined, indices: GPUBuffer | undefined;
	let colorView: GPUTextureView | undefined, depthView: GPUTextureView | undefined, indexBytes = 0, attachmentBytes = 0;
	let renders = 0, uploads = 0, positionUploadBytes = 0, uploadedCount = 0, uploadedMode: ThreadStudyMode | undefined, lastNotice = 0;
	function notify() { lastNotice = rope.points.length; try { changed?.({ mode, feeding, full: rope.full, count: mode === 'braid' ? BRAID_NODES * 3 : rope.points.length, error: fault }); } catch { /* UI is not a model owner. */ } }
	function seed(seconds: number) { for (let i = 0; i < Math.ceil(seconds * 120); i++) rope.advance(1 / 120, feed, ratio); dirty = true; notify(); }
	seed(3);
	function write() {
		if (!dirty) return;
		const count = mode === 'braid' ? BRAID_NODES : rope.points.length;
		// Deposits have immutable belt-material coordinates. Only append newly
		// arrived nodes; one uniform translates every older deposit with the belt.
		let first = mode === 'deposition' && uploadedMode === mode && uploadedCount <= count ? uploadedCount : 0;
		if (mode === 'braid') {
			for (let strand = 0; strand < 3; strand++) for (let i = 0; i < BRAID_NODES; i++) data.set([...braidPoint(strand, i / (BRAID_NODES - 1), spacing, turns), 0], (strand * BRAID_NODES + i) * 4);
		} else {
			for (let i = first; i < count; i++) { const point = rope.points[i]; data.set([point.x - point.belt, point.y, 0, point.s], i * 4); }
		}
		const aspect = width / height / (DOMAIN_WIDTH / DOMAIN_HEIGHT);
		f.set([Math.max(1, aspect), Math.max(1, 1 / aspect), width, height]);
		u.set([(count - 1) * subdivisions, radial, count, subdivisions], 4); f.set([mode === 'braid' ? BRAID_RADIUS : THREAD_RADIUS, Number(mode === 'braid'), rope.belt, 0], 8);
		const bytes = (count * (mode === 'braid' ? 3 : 1) - first) * 16;
		if (bytes) { device.queue.writeBuffer(positions, first * 16, data.buffer, first * 16, bytes); positionUploadBytes += bytes; }
		uploadedCount = count; uploadedMode = mode;
		device.queue.writeBuffer(uniform, 0, params); uploads++; dirty = false;
	}
	return {
		get memoryBytes() { return data.byteLength + 48 + indexBytes + attachmentBytes; },
		setMode(next) { if (disposed || !['braid', 'deposition'].includes(next)) return; mode = next; feeding = false; dirty = true; notify(); },
		setFeeding(next) { if (!disposed) { feeding = Boolean(next) && mode === 'deposition' && !rope.full; notify(); } },
		setControls(settings) {
			if (disposed) return;
			if (settings.ratio !== undefined && Number.isFinite(settings.ratio)) ratio = Math.max(0, Math.min(1, settings.ratio));
			if (settings.feed !== undefined && Number.isFinite(settings.feed)) feed = Math.max(0.15, Math.min(1.2, settings.feed));
			if (settings.spacing !== undefined && Number.isFinite(settings.spacing)) spacing = Math.max(0.075, Math.min(0.2, settings.spacing));
			if (settings.turns !== undefined && Number.isFinite(settings.turns)) turns = Math.max(1.5, Math.min(4, settings.turns));
			dirty = true;
		},
		depositSample(seconds = 1.5) { if (!disposed && Number.isFinite(seconds)) { feeding = false; seed(Math.max(0, Math.min(3, seconds))); } },
		resize(w, h) {
			if (disposed || w === width && h === height) return;
			if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1 || w > device.limits.maxTextureDimension2D || h > device.limits.maxTextureDimension2D || w * h > 16777216) throw new Error('Native thread presentation exceeds WebGPU dimensions.');
			const pixelsPerWorld = Math.min(w / DOMAIN_WIDTH, h / DOMAIN_HEIGHT);
			const nextRadial = Math.max(16, Math.ceil(Math.PI / Math.acos(Math.max(-1, 1 - 0.15 / (BRAID_RADIUS * pixelsPerWorld))) / 4) * 4);
			// Braid second derivative <= .2*(2*pi*4)^2 across its control ranges.
			// The chord-error bound M*du^2/8 therefore sets <=.15 native-pixel
			// centerline error. Refine geometry, never the retained physical history.
			const maxBraidSecondDerivative = 0.2 * (2 * Math.PI * 4) ** 2;
			const nextSubdivisions = Math.max(1, Math.ceil(Math.sqrt(maxBraidSecondDerivative * pixelsPerWorld / (8 * (BRAID_NODES - 1) ** 2 * 0.15))));
			const nextIndexBytes = (THREAD_HISTORY_CAPACITY - 1) * nextSubdivisions * nextRadial * 6 * 4;
			const live = w * h * 28 + nextIndexBytes + data.byteLength + 48;
			if (live > 256 * 1048576) throw new Error('Native thread MSAA/depth exceeds its 256 MiB live budget; no lower-resolution substitute.');
			if (live + attachmentBytes + indexBytes + width * height * 4 > 384 * 1048576) throw new Error('Native thread resize exceeds its 384 MiB transition budget.');
			device.pushErrorScope('out-of-memory'); device.pushErrorScope('validation');
			let nextColor: GPUTexture | undefined, nextDepth: GPUTexture | undefined, nextIndices: GPUBuffer | undefined;
			try {
				nextColor = device.createTexture({ size: [w, h], format, sampleCount: SAMPLES, usage: GPUTextureUsage.RENDER_ATTACHMENT });
				nextDepth = device.createTexture({ size: [w, h], format: 'depth16unorm', sampleCount: SAMPLES, usage: GPUTextureUsage.RENDER_ATTACHMENT });
				if (nextRadial !== radial || nextSubdivisions !== subdivisions) {
					const indexData = new Uint32Array(nextIndexBytes / 4); let cursor = 0;
					for (let row = 0; row < (THREAD_HISTORY_CAPACITY - 1) * nextSubdivisions; row++) for (let ring = 0; ring < nextRadial; ring++) {
						const a = row * nextRadial + ring, b = row * nextRadial + (ring + 1) % nextRadial, c = a + nextRadial, d = b + nextRadial;
						indexData.set([a, b, c, b, d, c], cursor); cursor += 6;
					}
					nextIndices = device.createBuffer({ size: nextIndexBytes, usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST }); device.queue.writeBuffer(nextIndices, 0, indexData);
				}
				const nextColorView = nextColor.createView(), nextDepthView = nextDepth.createView();
				color?.destroy(); depth?.destroy(); color = nextColor; depth = nextDepth; colorView = nextColorView; depthView = nextDepthView;
				if (nextIndices) { indices?.destroy(); indices = nextIndices; }
				width = w; height = h; radial = nextRadial; subdivisions = nextSubdivisions; indexBytes = nextIndexBytes; attachmentBytes = w * h * 24; dirty = true;
			} catch (error) { nextColor?.destroy(); nextDepth?.destroy(); nextIndices?.destroy(); throw error; }
			finally {
				const validation = device.popErrorScope(), oom = device.popErrorScope();
				void Promise.all([validation, oom]).then((errors) => { const failure = errors.find(Boolean); if (failure && !disposed) { fault = failure.message; feeding = false; notify(); } });
			}
		},
		reset() { if (!disposed) { rope.reset(); feeding = false; uploadedMode = undefined; dirty = true; notify(); } },
		step(_encoder, dt) {
			if (disposed || !feeding || mode !== 'deposition') return;
			rope.advance(dt, feed, ratio); dirty = true;
			if (rope.full) { feeding = false; notify(); }
			else if (rope.points.length - lastNotice >= 64) notify();
		},
		render(encoder, target) {
			if (disposed) return; if (fault) throw new Error(fault);
			if (!colorView || !depthView || !indices) throw new Error('Size the thread study before rendering.');
			write(); const pass = encoder.beginRenderPass({ colorAttachments: [{ view: colorView, resolveTarget: target, clearValue: [0, 0, 0, 0], loadOp: 'clear', storeOp: 'discard' }],
				depthStencilAttachment: { view: depthView, depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'discard' } });
			pass.setPipeline(pipeline); pass.setBindGroup(0, group); pass.setIndexBuffer(indices, 'uint32');
			pass.drawIndexed((mode === 'braid' ? BRAID_NODES - 1 : rope.points.length - 1) * subdivisions * radial * 6, mode === 'braid' ? 3 : 1); pass.end(); renders++;
		},
		async inspect() {
			const clearance = braidClearance(spacing, turns); let chordLength = 0;
			for (let i = 1; i < rope.points.length; i++) { const a = rope.position(i - 1), b = rope.position(i); chordLength += Math.hypot(a[0] - b[0], a[1] - b[1]); }
			return { finite: !fault && Object.values(rope.contact).every(Number.isFinite), mass: rope.length * Math.PI * THREAD_RADIUS ** 2, initialMass: 0, min: 0, max: rope.length, kinetic: 0,
				details: { mode: Number(mode === 'braid'), count: mode === 'braid' ? BRAID_NODES * 3 : rope.points.length, full: Number(rope.full), feeding: Number(feeding),
					feed, beltRatio: ratio, depositedLength: rope.length, renderedControlPolygonLength: chordLength, beltDistance: rope.belt,
					contactX: rope.contact.x, contactY: rope.contact.y, contactTheta: rope.contact.theta, spacing, turns, ...clearance,
					width, height, radialSegments: radial, subdivisions, stateBytes: data.byteLength + 48, indexBytes, attachmentBytes, outputBytes: width * height * 4, renders, uploads, positionUploadBytes } };
		},
		dispose() { if (!disposed) { disposed = true; positions.destroy(); uniform.destroy(); color?.destroy(); depth?.destroy(); indices?.destroy(); } }
	};
}
