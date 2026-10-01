import { materialResources, materialShader, materialRenderPipeline, materialComputePipeline, materialBindGroupLayout, materialPipelineLayout } from './cache.js';
import type { LiquidExperiment, LiquidInput, LiquidSnapshot } from './types.js';
import { presentationSize } from './presentation-size.js';

export interface FilmOptions {
	width?: number;
	height?: number;
	initial?: Float32Array;
	/** Static grid geometry: 1 is solid, 0 is fluid. */
	solid?: Uint8Array;
	/** Independent, high-resolution presentation coverage: 0 transparent, 255 covered. */
	coverage?: { width: number; height: number; data: Uint8Array };
	/** Enamel relief: RG slope [-2,2], B rest thickness [0,1], A glyph coverage. */
	enamel?: { width: number; height: number; data: Uint8Array };
	transparent?: boolean;
	/** Material body color in sRGB, including black. */
	color?: [number, number, number];
	/** Brush radius in plate-height units. */
	brushRadius?: number;
}

export interface FilmExperiment extends LiquidExperiment {
	/** Compare enamel relief to flat shading without changing the simulation. */
	setRelief(enabled: boolean): void;
	setColor(color: [number, number, number]): void;
	/** Replace native optical relief only; deposited material and clock survive. */
	updateEnamelProfile(profile: NonNullable<FilmOptions['enamel']>): Promise<void>;
}

// A gravity-dominated, overdamped film on a closed plate. h is thickness/H.
// q = -(rho*g*H³/3muL²) cos(theta) h³ grad(h)
//     +(rho*g*H²/3muL) sin(theta) h³ e_y + h U_brush/2.
// The brush term approximates Couette drag above a no-slip substrate.
// Surface tension/contact-angle dynamics are deliberately omitted: explicit
// fourth-order capillarity at this grid needs a very different timestep/solver.
// This illustrative viscous material is not a measured or calibrated oil.
const MATERIAL = { length: 0.14, thickness: 0.003, density: 1000, viscosity: 0.5, gravity: 9.81 };
const HEIGHT_RATIO = MATERIAL.thickness / MATERIAL.length;
const LEVEL_MOBILITY = MATERIAL.density * MATERIAL.gravity * MATERIAL.thickness ** 3 /
	(3 * MATERIAL.viscosity * MATERIAL.length ** 2);
const TILT_MOBILITY = MATERIAL.density * MATERIAL.gravity * MATERIAL.thickness ** 2 /
	(3 * MATERIAL.viscosity * MATERIAL.length);
const UNIFORM_SLOTS = 4;
const UNIFORM_STRIDE = 256;

function computeShader(WIDTH: number, HEIGHT: number, brushRadius: number, transparent: boolean, enamel: boolean): string {
	return /* wgsl */ `
const W: u32 = ${WIDTH}u;
const H: u32 = ${HEIGHT}u;
const INV_DX: f32 = ${HEIGHT}.0;
const ASPECT: f32 = ${WIDTH / HEIGHT};
struct Parameters { pointer: vec4f, step: vec4f${enamel ? ', contact: vec4f' : ''} };
@group(0) @binding(0) var<storage, read_write> height: array<f32>;
@group(0) @binding(1) var<storage, read_write> limitedTransfers: atomic<u32>;
@group(0) @binding(2) var<uniform> params: Parameters;
@group(0) @binding(3) var surface: texture_storage_2d<rgba16float, write>;
@group(0) @binding(4) var<storage, read> solid: array<u32>;
${enamel ? '@group(0) @binding(5) var<storage, read> rest: array<f32>;' : ''}

fn at(x: i32, y: i32, center: f32) -> f32 {
	let index = u32(clamp(y, 0, i32(H) - 1)) * W + u32(clamp(x, 0, i32(W) - 1));
	// A solid glyph boundary is not a cliff down to zero liquid height. Extend
	// the interior optical height there; the high-resolution mask draws its edge.
	if (${transparent} && solid[index] != 0u) { return center; }
	return height[index]${enamel ? '-rest[index]' : ''};
}

${enamel ? `fn contact_potential(cell: vec2u) -> f32 {
	let uv = (vec2f(cell)+0.5)/vec2f(f32(W),f32(H));
	let displacement = (uv-params.pointer.xy)*vec2f(ASPECT,1.0);
	return 0.6*params.contact.x*exp(-dot(displacement,displacement)/(2.0*${brushRadius}*${brushRadius}));
}` : ''}

@compute @workgroup_size(8, 8)
fn transfer(@builtin(global_invocation_id) id: vec3u) {
	if (id.x >= W || id.y >= H) { return; }
	let phase = u32(params.step.z);
	let horizontal = phase < 2u;
	var b = id.xy;
	if (horizontal) {
		if ((id.x & 1u) != phase || id.x + 1u >= W) { return; }
		b.x += 1u;
	} else {
		if ((id.y & 1u) != (phase - 2u) || id.y + 1u >= H) { return; }
		b.y += 1u;
	}
	let aIndex = id.y*W + id.x;
	let bIndex = b.y*W + b.x;
	if (solid[aIndex] != 0u || solid[bIndex] != 0u) { return; }
	let a = height[aIndex];
	let bh = height[bIndex];
	let mean = 0.5*(a+bh);
	${enamel ? `// A cosmetic gel restores its deposited profile through conservative
	// error-potential transport. Pressure raises local potential and pushes
	// material outward. No cell is reset to its rest thickness.
	let k = 0.006*INV_DX*INV_DX;
	let potentialDifference = (a-rest[aIndex])-(bh-rest[bIndex]) +
		contact_potential(id.xy)-contact_potential(b);
	let requestedLeveling = 0.5*potentialDifference*(1.0-exp(-2.0*k*params.step.x));
	let leveling = clamp(requestedLeveling,-bh,a);
	if (leveling != requestedLeveling) { atomicAdd(&limitedTransfers,1u); }` : `// Solve this edge's hydrostatic relaxation exactly. The pair's mean (and
	// thus its edge mobility) stays constant throughout the exchange. This is
	// positive and decreases gravitational energy for any timestep.
	let k = params.step.w*mean*mean*mean*INV_DX*INV_DX;
	let leveling = 0.5*(a-bh)*(1.0-exp(-2.0*k*params.step.x));`}
	let leveledA = a-leveling;
	let leveledB = bh+leveling;
	let uv = (vec2f(id.xy) + vec2f(b) + vec2f(1.0)) * 0.5 / vec2f(f32(W), f32(H));
	let displacement = (uv - params.pointer.xy) * vec2f(ASPECT, 1.0);
	let influence = exp(-dot(displacement, displacement)/(2.0*${brushRadius}*${brushRadius}));
	var velocity = 0.5*params.pointer.w*influence;
	if (horizontal) { velocity = 0.5*params.pointer.z*ASPECT*influence; }
	let donor = select(leveledB, leveledA, velocity >= 0.0);
	var gravityFlux = 0.0;
	if (!horizontal && ${!enamel}) {
		let gravityDonor = select(leveledB,leveledA,params.step.y >= 0.0);
		gravityFlux = params.step.y*gravityDonor*gravityDonor*gravityDonor;
	}
	let requested = params.step.x*INV_DX*(gravityFlux + velocity*donor);
	// Transport uses disjoint pairs: no concurrent reads/writes of a height cell.
	// Donor limiting changes transport speed under extreme forcing, never mass.
	let flux = clamp(requested, -0.45*leveledB, 0.45*leveledA);
	if (flux != requested) { atomicAdd(&limitedTransfers,1u); }
	height[aIndex] = leveledA-flux;
	height[bIndex] = leveledB+flux;
}

@compute @workgroup_size(8, 8)
fn make_surface(@builtin(global_invocation_id) id: vec3u) {
	if (id.x >= W || id.y >= H) { return; }
	let x = i32(id.x);
	let y = i32(id.y);
	let h = height[id.y*W+id.x];
	let opticalHeight = h${enamel ? '-rest[id.y*W+id.x]' : ''};
	var gradient = vec2f(at(x+1,y,opticalHeight)-at(x-1,y,opticalHeight), at(x,y+1,opticalHeight)-at(x,y-1,opticalHeight))*0.5*INV_DX;
	if (${transparent} && solid[id.y*W+id.x] != 0u) { gradient = vec2f(0.0); }
	textureStore(surface, vec2i(id.xy), vec4f(h, gradient, ${enamel ? 'opticalHeight' : '1.0'}));
}
`;
}

function renderShader(ASPECT: number, color: number[], transparent: boolean, enamel: boolean): string {
	return /* wgsl */ `
@group(0) @binding(0) var field: texture_2d<f32>;
@group(0) @binding(1) var fieldSampler: sampler;
@group(0) @binding(2) var presentationCoverage: texture_2d<f32>;
${enamel ? `@group(0) @binding(3) var enamelProfile: texture_2d<f32>;
@group(0) @binding(4) var<uniform> presentation: vec4f;` : ''}
struct Vertex { @builtin(position) position: vec4f, @location(0) uv: vec2f };
@vertex fn vertex(@builtin(vertex_index) index: u32) -> Vertex {
	let positions = array<vec2f,3>(vec2f(-1,-1),vec2f(3,-1),vec2f(-1,3));
	var out: Vertex;
	out.position = vec4f(positions[index],0,1);
	out.uv = positions[index]*vec2f(0.5,-0.5)+vec2f(0.5);
	return out;
}

fn environment(direction: vec3f) -> vec3f {
	let ceiling = smoothstep(-0.2,0.8,direction.z);
	var light = mix(vec3f(0.015,0.023,0.032),vec3f(0.11,0.16,0.18),ceiling);
	${enamel ? `// A satin clearcoat integrates broad light sources. Narrow mirror strips
	// amplified tiny normal quantization into pinprick highlights on the glyphs.
	let keyDelta = direction.xy-vec2f(-0.35,-0.45);
	let fillDelta = direction.xy-vec2f(0.4,0.15);
	let key = exp(-dot(keyDelta*vec2f(3.5,2.5),keyDelta));
	let fill = exp(-dot(fillDelta*vec2f(8.0,2.0),fillDelta));
	return light + key*vec3f(1.8,1.7,1.55) + fill*vec3f(0.7,0.85,0.95);` : `
	// Reflected area lights have readable boundaries. Gaussian lights alone made
	// a broad, shallow puddle indistinguishable from a blurred colored circle.
	let keyDelta = abs(direction.xy + vec2f(0.08,0.1));
	let key = (1.0-smoothstep(0.04,0.05,keyDelta.x)) *
		(1.0-smoothstep(0.12,0.15,keyDelta.y));
	let strip = (1.0-smoothstep(0.008,0.016,abs(direction.x-0.105))) *
		(1.0-smoothstep(0.15,0.18,abs(direction.y-0.04)));
	light += key*vec3f(4.0,4.4,4.5) + strip*vec3f(2.2,2.8,2.9);
	return light;`}
}

fn plateColor(uv: vec2f) -> vec3f {
	let centered = (uv-0.5)*vec2f(${ASPECT},1.0);
	let vignette = clamp(1.0-0.45*dot(centered,centered),0.45,1.0);
	// Sparse surface marks make optical displacement observable on the plate.
	let cell = fract(uv*vec2f(20.0,14.0))-0.5;
	let marks = 1.0-smoothstep(0.025,0.055,length(cell));
	return vec3f(0.024,0.028,0.027)*vignette - marks*0.006;
}

@fragment fn fragment(in: Vertex) -> @location(0) vec4f {
	let data = textureSample(field,fieldSampler,in.uv);
	${enamel ? `let profile = textureSample(enamelProfile,fieldSampler,in.uv);
	let h = max(profile.b+data.w,0.0);
	// The static profile is high resolution; the simulation contributes only
	// displacement from rest, so the rounded base is never counted twice.
	let slope = (profile.rg*2.0-1.0)*2.0*presentation.x + ${HEIGHT_RATIO}*data.yz;
	let normal = normalize(vec3f(-slope,1.0));` : `let h = max(data.x,0.0);
	let normal = normalize(vec3f(-${HEIGHT_RATIO}*data.yz,1.0));`}
	// A finite viewing position gives even a locally flat UI coating a coherent
	// reflected light source. No time-dependent or synthetic surface motion.
	let view = ${transparent ? `normalize(vec3f((0.48-in.uv.x)*${ASPECT},0.42-in.uv.y,2.2))` : 'vec3f(0,0,1)'};
	let plate = plateColor(in.uv);
	// A single refracted ray intersects the plate beneath the measured film.
	let ray = refract(-view,normal,1.0/1.333);
	let refractedUv = in.uv + ray.xy/max(-ray.z,0.1)*${HEIGHT_RATIO}*h/vec2f(${ASPECT},1.0);
	let transmitted = plateColor(refractedUv)*0.48*exp(-h*vec3f(3.2,1.0,1.5));
	let body = ${enamel ? 'presentation.yzw' : `vec3f(${color.join(',')})`}*${transparent ? '1.0' : '(1.0-exp(-3.2*h))'};
	let reflected = ${enamel ? `min(environment(reflect(-view,normal)),vec3f(2.0))` : 'environment(reflect(-view,normal))'};
	let fresnel = 0.045 + 0.955*pow(1.0-max(dot(normal,view),0.0),5.0);
	let illumination = ${enamel ? '0.3+0.7' : '0.72+0.28'}*max(dot(normal,normalize(vec3f(-0.5,-0.6,1.0))),0.0);
	let liquid = (${transparent ? 'body' : 'transmitted+body'})*illumination*(1.0-fresnel)+reflected*fresnel;
	let coverage = smoothstep(0.0008,0.0025,h)*${enamel ? 'min(profile.a,textureSample(presentationCoverage,fieldSampler,in.uv).r)' : 'textureSample(presentationCoverage,fieldSampler,in.uv).r'};
	let radiance = ${transparent ? 'liquid' : 'mix(plate,liquid,coverage)'};
	let mapped = 1.0-exp(-1.8*max(radiance,vec3f(0)));
	// Beer-Lambert pigment extinction: thin application transmits the native DOM;
	// a displaced ridge becomes opaque. The optical density is illustrative.
	let alpha = ${transparent ? 'coverage*(1.0-exp(-20.0*h))' : '1.0'};
	return vec4f(pow(mapped,vec3f(1.0/2.2))*alpha,alpha);
}
`;
}

function initialHeight(WIDTH: number, HEIGHT: number): Float32Array<ArrayBuffer> {
	const values = new Float32Array(WIDTH * HEIGHT);
	const puddles = [
		{ x: 0.33, y: 0.49, rx: 0.21, ry: 0.27, h: 0.9 },
		{ x: 0.7, y: 0.46, rx: 0.125, ry: 0.19, h: 0.72 },
		{ x: 0.64, y: 0.76, rx: 0.055, ry: 0.075, h: 0.65 }
	];
	for (let y = 0; y < HEIGHT; y++) {
		for (let x = 0; x < WIDTH; x++) {
			for (const p of puddles) {
				const radius2 = (((x + 0.5) / WIDTH - p.x) / p.rx) ** 2 +
					(((y + 0.5) / HEIGHT - p.y) / p.ry) ** 2;
				if (radius2 < 1) values[y * WIDTH + x] += p.h * (1 - radius2) ** 2;
			}
		}
	}
	return values;
}

async function checkedModule(device: GPUDevice, label: string, code: string) {
	const module = await materialShader(device, { label, code });
	return module;
}

export async function createFilm(device: GPUDevice, format: GPUTextureFormat, options: FilmOptions = {}): Promise<FilmExperiment> {
	const WIDTH = options.width ?? 160, HEIGHT = options.height ?? 112;
	if (![WIDTH, HEIGHT].every((size) => Number.isInteger(size) && size >= 2 && size <= 512)) {
		throw new Error('Film grid dimensions must be integers from 2 to 512.');
	}
	const CELLS = WIDTH * HEIGHT, ASPECT = WIDTH / HEIGHT;
	const EDGES = HEIGHT * (WIDTH - 1) + WIDTH * (HEIGHT - 1);
	const CELL_AREA = (MATERIAL.length / HEIGHT) ** 2;
	const brushRadius = options.brushRadius ?? 0.075;
	const enamel = options.enamel;
	if (enamel && (!options.initial || !options.transparent)) {
		throw new Error('Enamel requires a transparent surface and an initial rest profile.');
	}
	if (enamel && (![enamel.width, enamel.height].every((size) => Number.isInteger(size) && size > 0 && size <= device.limits.maxTextureDimension2D) ||
		enamel.data.length !== enamel.width * enamel.height * 4)) throw new Error('Enamel relief must be a valid packed RGBA image.');
	if (!Number.isFinite(brushRadius) || brushRadius <= 0 || brushRadius > 1) throw new Error('Film brush radius must be in (0, 1].');
	if (options.initial && options.initial.length !== CELLS) throw new Error('Initial film thickness must match the simulation grid.');
	if (options.solid && options.solid.length !== CELLS) throw new Error('Film solid mask must match the simulation grid.');
	const solids = Uint32Array.from(options.solid ?? new Uint8Array(CELLS), (value) => value ? 1 : 0);
	const initial = options.initial ? new Float32Array(options.initial) : initialHeight(WIDTH, HEIGHT);
	for (let i = 0; i < CELLS; i++) {
		if (solids[i]) initial[i] = 0;
		if (!Number.isFinite(initial[i]) || initial[i] < 0) throw new Error('Film thickness must be finite and nonnegative.');
	}
	const coverage = options.coverage ?? { width: 1, height: 1, data: new Uint8Array([255]) };
	if (![coverage.width, coverage.height].every((size) => Number.isInteger(size) && size > 0 && size <= device.limits.maxTextureDimension2D) ||
		coverage.data.length !== coverage.width * coverage.height) throw new Error('Film presentation coverage must be a valid one-channel image.');
	if (options.color && (options.color.length !== 3 || !options.color.every((channel) => Number.isFinite(channel) && channel >= 0 && channel <= 1))) {
		throw new Error('Film color must contain three sRGB channels in [0, 1].');
	}
	const color = options.color?.map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4) ?? [0.012, 0.28, 0.19];
	const [computeModule, renderModule] = await Promise.all([
		checkedModule(device, 'Thin-film conservative transport', computeShader(WIDTH, HEIGHT, brushRadius, options.transparent ?? false, !!enamel)),
		checkedModule(device, 'Thin-film optical surface', renderShader(ASPECT, color, options.transparent ?? false, !!enamel))
	]);
	const computeLayout = materialBindGroupLayout(device, {
		entries: [
			{ binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
			{ binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
			{ binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform', hasDynamicOffset: true } },
			{ binding: 3, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: 'write-only', format: 'rgba16float' } },
			{ binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
			...(enamel ? [{ binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' as const } }] : [])
		]
	});
	const pipelineLayout = materialPipelineLayout(device, { bindGroupLayouts: [computeLayout] });
	const [transfer, surfacePipeline] = await Promise.all(
		['transfer', 'make_surface'].map((entryPoint) => materialComputePipeline(device, {
			label: `Film ${entryPoint}`, layout: pipelineLayout, compute: { module: computeModule, entryPoint }
		}))
	);
	const renderPipeline = await materialRenderPipeline(device, {
		label: 'Film height-based reflection and transmission', layout: 'auto',
		vertex: { module: renderModule, entryPoint: 'vertex' },
		fragment: { module: renderModule, entryPoint: 'fragment', targets: [{ format,
			blend: options.transparent ? {
				color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
				alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' }
			} : undefined
		}] },
		primitive: { topology: 'triangle-list' }
	});
	return materialResources<FilmExperiment>(device, (own) => {
		const height = own(device.createBuffer({ label: 'Film thickness', size: CELLS * 4,
			usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC }));
		const limitedTransfers = own(device.createBuffer({ label: 'Film transport limiter count', size: 4,
			usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST }));
		const uniforms = own(device.createBuffer({ label: 'Film captured step uniforms', size: UNIFORM_SLOTS * UNIFORM_STRIDE,
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }));
		const solidBuffer = own(device.createBuffer({ label: 'Film static geometry', size: CELLS * 4,
			usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST }));
		const restBuffer = enamel ? own(device.createBuffer({ label: 'Enamel deposited rest profile', size: CELLS * 4,
			usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST })) : undefined;
		let enamelTexture = enamel ? own(device.createTexture({ label: 'Enamel high-resolution rounded relief', size: [enamel.width, enamel.height],
			format: 'rgba8unorm', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST })) : undefined;
		const presentationBuffer = enamel ? own(device.createBuffer({ label: 'Enamel relief comparison', size: 16,
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST })) : undefined;
		const surface = own(device.createTexture({ label: 'Film height and normal slopes', size: [WIDTH, HEIGHT],
			format: 'rgba16float', usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING }));
		const surfaceView = surface.createView();
		const coverageTexture = own(device.createTexture({ label: 'Film presentation coverage', size: [coverage.width, coverage.height],
			format: 'r8unorm', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST }));
		const computeGroup = device.createBindGroup({ layout: computeLayout, entries: [
			{ binding: 0, resource: { buffer: height } }, { binding: 1, resource: { buffer: limitedTransfers } },
			{ binding: 2, resource: { buffer: uniforms, size: enamel ? 48 : 32 } }, { binding: 3, resource: surfaceView },
			{ binding: 4, resource: { buffer: solidBuffer } },
			...(restBuffer ? [{ binding: 5, resource: { buffer: restBuffer } }] : [])
		] });
		const sampler = device.createSampler({ minFilter: 'linear', magFilter: 'linear' });
		function presentationGroup(profile: GPUTexture | undefined) { return device.createBindGroup({ layout: renderPipeline.getBindGroupLayout(0), entries: [
			{ binding: 0, resource: surfaceView },
			{ binding: 1, resource: sampler },
			{ binding: 2, resource: coverageTexture.createView() },
			...(profile && presentationBuffer ? [{ binding: 3, resource: profile.createView() },
				{ binding: 4, resource: { buffer: presentationBuffer } }] : [])
		] }); }
		let renderGroup = presentationGroup(enamelTexture);
		let profileBytes = enamel ? enamel.width * enamel.height * 4 : 0;
		let profileGeneration = 0;
		let cancelProfile = () => {};
		const initialMass = initial.reduce((sum, value) => sum + value, 0);
		let tick = 0;
		let angle = 0;
		let contactX = 0.5, contactY = 0.5;
		let disposed = false;
		device.queue.writeBuffer(height, 0, initial);
		if (restBuffer) device.queue.writeBuffer(restBuffer, 0, initial);
		if (presentationBuffer) device.queue.writeBuffer(presentationBuffer, 0, new Float32Array([1, ...color]));
		if (enamelTexture && enamel) device.queue.writeTexture({ texture: enamelTexture }, new Uint8Array(enamel.data),
			{ bytesPerRow: enamel.width * 4 }, [enamel.width, enamel.height]);
		device.queue.writeBuffer(solidBuffer, 0, solids);
		device.queue.writeTexture({ texture: coverageTexture }, new Uint8Array(coverage.data), { bytesPerRow: coverage.width }, [coverage.width, coverage.height]);
	
		return {
			get memoryBytes() { return CELLS * 16 + 4 + UNIFORM_SLOTS * UNIFORM_STRIDE + coverage.width * coverage.height +
				(enamel ? CELLS * 4 + profileBytes + 16 : 0); },
			resize() { /* The physical plate and resolution do not change with CSS size. */ },
			async updateEnamelProfile(profile) {
				if (disposed) return;
				if (!enamelTexture) throw new Error('Only an enamel specimen has an optical relief profile.');
				const native = presentationSize(profile.width, profile.height, 1, device.limits.maxTextureDimension2D);
				if (native.width !== profile.width || native.height !== profile.height || profile.data.length !== profile.width * profile.height * 4) {
					throw new Error('Enamel relief must be a valid packed RGBA image.');
				}
				const generation = ++profileGeneration;
				// At most one native candidate may await driver validation; rapid
				// monitor changes must not accumulate full-size optical textures.
				cancelProfile();
				let candidate: GPUTexture | undefined, group: GPUBindGroup | undefined, failure: unknown;
				const discard = () => { candidate?.destroy(); candidate = undefined; };
				cancelProfile = discard;
				device.pushErrorScope('validation'); device.pushErrorScope('out-of-memory');
				try {
					candidate = device.createTexture({ label: 'Enamel high-resolution rounded relief', size: [native.width, native.height],
						format: 'rgba8unorm', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
					group = presentationGroup(candidate);
					device.queue.writeTexture({ texture: candidate }, new Uint8Array(profile.data),
						{ bytesPerRow: native.width * 4 }, [native.width, native.height]);
				} catch (error) { failure = error; }
				// Pop synchronously before awaiting: scopes may not surround another
				// instance's work. Keep the previous valid profile until validation ends.
				let errors: Array<GPUError | null>;
				try { errors = await Promise.all([device.popErrorScope(), device.popErrorScope()]); }
				catch (error) { discard(); throw error; }
				if (disposed || generation !== profileGeneration) { discard(); return; }
				const gpuError = errors.find((error) => error !== null);
				if (failure || gpuError || !candidate || !group) {
					discard(); throw failure ?? new Error(gpuError?.message ?? 'Could not refresh enamel relief.');
				}
				const previous = enamelTexture;
				enamelTexture = candidate; renderGroup = group; profileBytes = native.width * native.height * 4;
				candidate = undefined; cancelProfile = () => {};
				previous.destroy();
			},
			setColor(rgb) {
				if (rgb.length !== 3 || !rgb.every((v) => Number.isFinite(v) && v >= 0 && v <= 1)) throw new Error('Material color must be three sRGB channels.');
				if (!disposed && presentationBuffer) device.queue.writeBuffer(presentationBuffer, 4, new Float32Array(rgb.map((v) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)));
			},
			setRelief(enabled: boolean) {
				if (!disposed && presentationBuffer) device.queue.writeBuffer(presentationBuffer, 0, new Float32Array([enabled ? 1 : 0]));
			},
			reset() {
				if (disposed) return;
				device.queue.writeBuffer(height, 0, initial);
				device.queue.writeBuffer(limitedTransfers, 0, new Uint32Array(1));
				tick = 0;
				angle = 0;
				contactX = contactY = 0.5;
			},
			step(encoder: GPUCommandEncoder, dt: number, input: LiquidInput) {
				if (disposed || !Number.isFinite(dt) || dt <= 0) return;
				// Exact pair leveling has no explicit diffusion restriction. Two small
				// advection steps keep ordinary brush/tilt transport below donor limits.
				const substeps = Math.ceil(dt / (1 / 240));
				const stepDt = dt / substeps;
				angle = Math.max(-1, Math.min(1, input.tilt)) * Math.PI / 6;
				contactX = input.x;
				contactY = input.y;
				const pass = encoder.beginComputePass({ label: 'Conservative film transport' });
				for (let substep = 0; substep < substeps; substep++) {
					pass.setPipeline(transfer);
					for (let p = 0; p < 4; p++) {
						// Alternating the traversal removes a persistent x/y ordering preference.
						const phase = tick % 2 === 0 ? p : 3 - p;
						// LabSession uses the same dt/input for all steps in one submission.
						// Four immutable phase identities suffice; no per-frame uniform ring.
						const offset = phase * UNIFORM_STRIDE;
						device.queue.writeBuffer(uniforms, offset, new Float32Array([
							input.x, input.y,
							input.active ? Math.max(-2, Math.min(2, input.vx)) : 0,
							input.active ? Math.max(-2, Math.min(2, input.vy)) : 0,
							stepDt, TILT_MOBILITY * Math.sin(angle), phase, LEVEL_MOBILITY * Math.cos(angle),
							...(enamel ? [Math.max(0, Math.min(1, input.press ?? 0)), 0, 0, 0] : [])
						]));
						pass.setBindGroup(0, computeGroup, [offset]);
						pass.dispatchWorkgroups(Math.ceil(WIDTH / 8), Math.ceil(HEIGHT / 8));
					}
					tick++;
				}
				pass.end();
			},
			render(encoder: GPUCommandEncoder, target: GPUTextureView) {
				if (disposed) return;
				const prepare = encoder.beginComputePass({ label: 'Film optical surface' });
				prepare.setPipeline(surfacePipeline);
				prepare.setBindGroup(0, computeGroup, [0]);
				prepare.dispatchWorkgroups(Math.ceil(WIDTH / 8), Math.ceil(HEIGHT / 8));
				prepare.end();
				const pass = encoder.beginRenderPass({ label: 'Film presentation', colorAttachments: [{
					view: target, loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: options.transparent ? 0 : 1 }
				}] });
				pass.setPipeline(renderPipeline);
				pass.setBindGroup(0, renderGroup);
				pass.draw(3);
				pass.end();
			},
			async inspect(): Promise<LiquidSnapshot> {
				if (disposed) throw new Error('The film experiment has been disposed.');
				const readback = device.createBuffer({ size: CELLS * 4 + 4, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
				try {
					const encoder = device.createCommandEncoder();
					encoder.copyBufferToBuffer(height, 0, readback, 0, CELLS * 4);
					encoder.copyBufferToBuffer(limitedTransfers, 0, readback, CELLS * 4, 4);
					device.queue.submit([encoder.finish()]);
					await readback.mapAsync(GPUMapMode.READ);
					const mapped = readback.getMappedRange();
					const values = new Float32Array(mapped, 0, CELLS);
					const limited = new Uint32Array(mapped, CELLS * 4, 1)[0];
					let mass = 0, min = Infinity, max = -Infinity, cx = 0, cy = 0, roughness = 0, wet = 0;
					let gravitationalEnergy = 0, solidMass = 0;
					let restError = 0, minRestDelta = Infinity, maxRestDelta = -Infinity;
					let localMin = Infinity, localMax = -Infinity, localSum = 0, localCount = 0;
					let finite = true;
					for (let i = 0; i < CELLS; i++) {
						const h = values[i];
						finite &&= Number.isFinite(h);
						mass += h;
						min = Math.min(min, h);
						max = Math.max(max, h);
						const x = i % WIDTH, y = Math.floor(i / WIDTH);
						if (enamel && !solids[i]) {
							const delta = h - initial[i];
							restError += delta * delta;
							minRestDelta = Math.min(minRestDelta, delta);
							maxRestDelta = Math.max(maxRestDelta, delta);
							if ((((x + 0.5) / WIDTH - contactX) * ASPECT) ** 2 + ((y + 0.5) / HEIGHT - contactY) ** 2 <= brushRadius ** 2) {
								localMin = Math.min(localMin, h); localMax = Math.max(localMax, h);
								localSum += h; localCount++;
							}
						}
						if (solids[i]) solidMass += h;
						const plateElevation = -(y + 0.5) / HEIGHT * MATERIAL.length * Math.sin(angle);
						gravitationalEnergy += MATERIAL.density * MATERIAL.gravity * CELL_AREA * MATERIAL.thickness * h *
							(plateElevation + 0.5 * MATERIAL.thickness * h * Math.cos(angle));
						cx += h * (x + 0.5) / WIDTH;
						cy += h * (y + 0.5) / HEIGHT;
						if (h > 0.009) wet++;
						if (x + 1 < WIDTH) roughness += (h - values[i + 1]) ** 2;
						if (y + 1 < HEIGHT) roughness += (h - values[i + WIDTH]) ** 2;
					}
					return { finite, mass, initialMass, min, max, kinetic: 0, details: {
						centroidX: mass ? cx / mass : 0.5, centroidY: mass ? cy / mass : 0.5, roughness: roughness / CELLS,
						wetArea: wet / CELLS, gridWidth: WIDTH, gridHeight: HEIGHT,
						gravitationalEnergy, limiterFraction: tick ? limited / (tick * EDGES) : 0,
						volumeMl: mass * MATERIAL.thickness * CELL_AREA * 1e6,
						maxDepthMm: max * MATERIAL.thickness * 1000, tiltDegrees: angle * 180 / Math.PI,
						solidMass,
						...(enamel ? { restError: restError / CELLS, minRestDelta: Number.isFinite(minRestDelta) ? minRestDelta : 0,
							maxRestDelta: Number.isFinite(maxRestDelta) ? maxRestDelta : 0,
							localMin: localCount ? localMin : 0, localMax: localCount ? localMax : 0,
							localMean: localCount ? localSum / localCount : 0 } : {})
					} };
				} finally { readback.destroy(); }
			},
			dispose() {
				if (disposed) return;
				disposed = true;
				cancelProfile();
				height.destroy(); limitedTransfers.destroy(); uniforms.destroy(); surface.destroy();
				solidBuffer.destroy(); coverageTexture.destroy();
				restBuffer?.destroy(); enamelTexture?.destroy(); presentationBuffer?.destroy();
			}
		};
	});
}
