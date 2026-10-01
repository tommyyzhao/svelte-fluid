import { VORTICITY_ADAPTIVE_HI, VORTICITY_ADAPTIVE_LO } from '../vorticity-constants.js';

const FULLSCREEN_VERTEX = /* wgsl */ `
struct FullscreenVertexOut {
	@builtin(position) position: vec4f,
	@location(0) uv: vec2f,
};

@vertex
fn vs_main(@builtin(vertex_index) index: u32) -> FullscreenVertexOut {
	var positions = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
	var uvs = array<vec2f, 3>(vec2f(0.0, 1.0), vec2f(2.0, 1.0), vec2f(0.0, -1.0));
	var output: FullscreenVertexOut;
	output.position = vec4f(positions[index], 0.0, 1.0);
	output.uv = uvs[index];
	return output;
}
`;

const COMMON = /* wgsl */ `
fn clamped_coord(coord: vec2i, size: vec2u) -> vec2i {
	return clamp(coord, vec2i(0), vec2i(size) - vec2i(1));
}

fn load_scalar(source: texture_2d<f32>, coord: vec2i) -> f32 {
	return textureLoad(source, clamped_coord(coord, textureDimensions(source)), 0).r;
}

fn load_vector(source: texture_2d<f32>, coord: vec2i) -> vec2f {
	return textureLoad(source, clamped_coord(coord, textureDimensions(source)), 0).xy;
}

fn pixel_coord(uv: vec2f, size: vec2u) -> vec2i {
	return vec2i(clamp(floor(uv * vec2f(size)), vec2f(0.0), vec2f(size) - 1.0));
}

fn safe_normalize(value: vec2f) -> vec2f {
	let magnitude = length(value);
	if (magnitude <= 0.00001) { return vec2f(0.0); }
	return value / magnitude;
}

fn solid_pattern(mask: texture_2d<f32>, coord: vec2i) -> u32 {
	return u32(round(textureLoad(mask, clamped_coord(coord, textureDimensions(mask)), 0).r * 255.0));
}

fn pattern_solid(pattern: u32, bit: u32) -> bool {
	return (pattern & (1u << bit)) != 0u;
}

fn solid_at(mask: texture_2d<f32>, coord: vec2i) -> f32 {
	return select(0.0, 1.0, pattern_solid(solid_pattern(mask, coord), 0u));
}

fn solid_at_uv(mask: texture_2d<f32>, uv: vec2f) -> f32 {
	return solid_at(mask, pixel_coord(uv, textureDimensions(mask)));
}

fn sticky_at(mask: texture_2d<f32>, coord: vec2i) -> f32 {
	return textureLoad(mask, clamped_coord(coord, textureDimensions(mask)), 0).a;
}

fn mask_sample_level(mask: texture_2d<f32>, nearest_sampler: sampler, uv: vec2f) -> vec4f {
	return textureSampleLevel(mask, nearest_sampler, uv, 0.0);
}
`;

const shader = (fragment: string, includeCommon = true): string =>
	`${FULLSCREEN_VERTEX}\n${includeCommon ? COMMON : ''}\n${fragment}`;

export const NATIVE_WEBGPU_SHADERS = {
	splat: shader(
		/* wgsl */ `
struct SplatParams {
	point: vec2f,
	radius: f32,
	aspect: f32,
	value: vec4f,
}

@group(0) @binding(0) var<uniform> params: SplatParams;
@group(0) @binding(1) var source: texture_2d<f32>;
@group(0) @binding(2) var linear_sampler: sampler;
@group(0) @binding(3) var mask_texture: texture_2d<f32>;
@group(0) @binding(4) var nearest_sampler: sampler;

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
	var offset = uv - params.point;
	offset.x *= params.aspect;
	let sticky = mask_sample_level(mask_texture, nearest_sampler, uv).a;
	let influence = exp(-dot(offset, offset) / max(params.radius, 0.00001)) * (1.0 + sticky * params.value.w);
	return clamp(
		textureSampleLevel(source, linear_sampler, uv, 0.0) + vec4f(params.value.xyz, 0.0) * influence,
		vec4f(-1000.0),
		vec4f(1000.0),
	);
}
	`
	),
	flowSource: shader(
		/* wgsl */ `
struct FlowSourceEntry {
	kind_profile_radius_aspect: vec4f,
	from_to: vec4f,
	rect: vec4f,
	value: vec4f,
}

struct FlowSourceParams {
	header: vec4f,
	entries: array<FlowSourceEntry, 16>,
}

@group(0) @binding(0) var<uniform> params: FlowSourceParams;
@group(0) @binding(1) var source: texture_2d<f32>;
@group(0) @binding(2) var linear_sampler: sampler;
@group(0) @binding(3) var solid_mask: texture_2d<f32>;
@group(0) @binding(4) var nearest_sampler: sampler;

fn profile_weight(profile: f32, t: f32) -> f32 {
	if (profile < 0.5) { return 1.0; }
	let centered = t * 2.0 - 1.0;
	return max(0.0, 1.0 - centered * centered);
}

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
	var injected = vec4f(0.0);
	let mask_value = textureSampleLevel(solid_mask, nearest_sampler, uv, 0.0);
	let sticky = mask_value.a;
	for (var index = 0; index < 16; index += 1) {
		if (f32(index) >= params.header.x) { break; }
		let entry = params.entries[index];
		let kind = entry.kind_profile_radius_aspect.x;
		let profile = entry.kind_profile_radius_aspect.y;
		let radius = entry.kind_profile_radius_aspect.z;
		let aspect = entry.kind_profile_radius_aspect.w;
		var distance_squared = 0.0;
		var t = 0.5;
		if (kind < 0.5) {
			let delta = (uv - entry.from_to.xy) * vec2f(aspect, 1.0);
			distance_squared = dot(delta, delta);
		} else if (kind < 1.5) {
			let start = entry.from_to.xy;
			let finish = entry.from_to.zw;
			let point = (uv - start) * vec2f(aspect, 1.0);
			let segment = (finish - start) * vec2f(aspect, 1.0);
			t = clamp(dot(point, segment) / max(dot(segment, segment), 0.000001), 0.0, 1.0);
			let delta = point - segment * t;
			distance_squared = dot(delta, delta);
		} else {
			let minimum = entry.rect.xy;
			let maximum = minimum + entry.rect.zw;
			let closest = clamp(uv, minimum, maximum);
			let delta = (uv - closest) * vec2f(aspect, 1.0);
			distance_squared = dot(delta, delta);
			t = clamp((uv.y - minimum.y) / max(entry.rect.w, 0.000001), 0.0, 1.0);
		}
		let amount = exp(-distance_squared / max(radius, 0.000001)) * profile_weight(profile, t);
		injected += entry.value * amount * (1.0 + sticky * params.header.y);
	}
	let packed_solid = u32(round(mask_value.r * 255.0));
	let fluid = select(1.0, 0.0, (packed_solid & 1u) != 0u);
	return clamp(textureSampleLevel(source, linear_sampler, uv, 0.0) + injected, vec4f(-1000.0), vec4f(1000.0)) * fluid;
}
`,
		false
	),
	flowOutlet: shader(
		/* wgsl */ `
struct FlowOutletEntry {
	edge_from_to_width: vec4f,
	keep_pad: vec4f,
}

struct FlowOutletParams {
	header: vec4f,
	entries: array<FlowOutletEntry, 16>,
}

@group(0) @binding(0) var<uniform> params: FlowOutletParams;
@group(0) @binding(1) var source: texture_2d<f32>;
@group(0) @binding(2) var linear_sampler: sampler;

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
	var keep_product = 1.0;
	for (var index = 0; index < 16; index += 1) {
		if (f32(index) >= params.header.x) { break; }
		let entry = params.entries[index];
		let edge = entry.edge_from_to_width.x;
		let start = entry.edge_from_to_width.y;
		let finish = entry.edge_from_to_width.z;
		let width = max(entry.edge_from_to_width.w, 0.0001);
		let along = select(uv.x, 1.0 - uv.y, edge < 1.5);
		var normal = 1.0;
		if (edge < 0.5) { normal = 1.0 - smoothstep(0.0, width, uv.x); }
		else if (edge < 1.5) { normal = smoothstep(1.0 - width, 1.0, uv.x); }
		else if (edge < 2.5) { normal = 1.0 - smoothstep(0.0, width, uv.y); }
		else { normal = smoothstep(1.0 - width, 1.0, uv.y); }
		let gate = step(start, along) * step(along, finish) * normal;
		keep_product *= mix(1.0, entry.keep_pad.x, gate);
	}
	return textureSampleLevel(source, linear_sampler, uv, 0.0) * keep_product;
}
`,
		false
	),
	flowForce: shader(/* wgsl */ `
struct FlowForceParams {
	values: vec4f,
	buoyancy: vec4f,
}

@group(0) @binding(0) var<uniform> params: FlowForceParams;
@group(0) @binding(1) var velocity: texture_2d<f32>;
@group(0) @binding(2) var solid_mask: texture_2d<f32>;
@group(0) @binding(3) var scalar_field: texture_2d<f32>;

fn scalar_channel(value: vec4f, channel: f32) -> f32 {
	if (channel < 0.5) { return value.r; }
	if (channel < 1.5) { return value.g; }
	return value.b;
}

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
	let coord = pixel_coord(uv, textureDimensions(velocity));
	if (solid_at(solid_mask, coord) > 0.5) { return vec4f(0.0); }
	var force = params.values.yz;
	if (params.buoyancy.z != 0.0) {
		let scalar = scalar_channel(textureLoad(scalar_field, coord, 0), params.values.w);
		force += safe_normalize(params.buoyancy.xy) *
			(scalar - params.buoyancy.w) * params.buoyancy.z;
	}
	let next = load_vector(velocity, coord) + force * params.values.x;
	return vec4f(clamp(next, vec2f(-1000.0), vec2f(1000.0)), 0.0, 1.0);
}
`),
	advect: shader(
		/* wgsl */ `
struct AdvectParams {
	dt: f32,
	dissipation: f32,
	velocity_scale: f32,
	decay_mode: f32,
	velocity_texel_size: vec2f,
	sticky_strength: f32,
	sticky_mode: f32,
}

@group(0) @binding(0) var<uniform> params: AdvectParams;
@group(0) @binding(1) var source: texture_2d<f32>;
@group(0) @binding(2) var velocity: texture_2d<f32>;
@group(0) @binding(3) var linear_sampler: sampler;
@group(0) @binding(4) var solid_mask: texture_2d<f32>;
@group(0) @binding(5) var nearest_sampler: sampler;

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
	let flow = textureSampleLevel(velocity, linear_sampler, uv, 0.0).xy;
	let previous = clamp(
		uv - flow * params.velocity_texel_size * params.dt * params.velocity_scale,
		vec2f(0.001),
		vec2f(0.999),
	);
	let sticky = mask_sample_level(solid_mask, nearest_sampler, uv).a;
	var effective_dissipation = params.dissipation;
	if (params.sticky_mode > 0.5 && params.sticky_mode < 1.5) {
		effective_dissipation = mix(effective_dissipation, 1.0, sticky * clamp(params.sticky_strength, 0.0, 1.0));
	} else if (params.sticky_mode > 1.5) {
		effective_dissipation *= max(0.0, 1.0 - sticky * clamp(params.sticky_strength, 0.0, 1.0));
	}
	var advected = textureSampleLevel(source, linear_sampler, previous, 0.0);
	if (params.decay_mode > 0.5) {
		advected *= effective_dissipation;
	} else {
		advected /= 1.0 + max(effective_dissipation, 0.0) * params.dt;
	}
	let fluid = 1.0 - solid_at_uv(solid_mask, uv);
	return clamp(advected, vec4f(-1000.0), vec4f(1000.0)) * fluid;
}
`
	),
	advectScalar: shader(
		/* wgsl */ `
struct ScalarAdvectParams {
	values: vec4f,
	dissipation: vec4f,
}

@group(0) @binding(0) var<uniform> params: ScalarAdvectParams;
@group(0) @binding(1) var source: texture_2d<f32>;
@group(0) @binding(2) var velocity: texture_2d<f32>;
@group(0) @binding(3) var linear_sampler: sampler;
@group(0) @binding(4) var solid_mask: texture_2d<f32>;

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
	let flow = textureSampleLevel(velocity, linear_sampler, uv, 0.0).xy;
	let texel_size = 1.0 / vec2f(textureDimensions(velocity));
	let previous = clamp(uv - flow * texel_size * params.values.x, vec2f(0.001), vec2f(0.999));
	let sampled = textureSampleLevel(source, linear_sampler, previous, 0.0);
	let decay = vec3f(1.0) + max(params.dissipation.rgb, vec3f(0.0)) * params.values.x;
	let fluid = 1.0 - solid_at(solid_mask, pixel_coord(uv, textureDimensions(source)));
	return vec4f(clamp(sampled.rgb / decay, vec3f(-1000.0), vec3f(1000.0)) * fluid, 1.0);
}
`
	),
	prescribedField: shader(
		/* wgsl */ `
struct PrescribedParams {
	values: vec4f,
}

@group(0) @binding(0) var<uniform> params: PrescribedParams;
@group(0) @binding(1) var current_field: texture_2d<f32>;
@group(0) @binding(2) var grid: texture_2d<f32>;
@group(0) @binding(3) var linear_sampler: sampler;
@group(0) @binding(4) var solid_mask: texture_2d<f32>;

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
	let base = textureSampleLevel(current_field, linear_sampler, uv, 0.0);
	let encoded = textureSampleLevel(grid, linear_sampler, uv, 0.0);
	var field = vec4f(0.0, 0.0, 0.0, 1.0);
	if (params.values.z < 0.5) {
		field = vec4f(((encoded.rg * 255.0 - vec2f(128.0)) / 127.0) * params.values.x, 0.0, 1.0);
	} else {
		// Prescribed mode replaces only the named packed channel; hybrid mode
		// adds that channel. Other scalar channels survive sequential grid passes.
		field = select(base, vec4f(0.0), params.values.y > 0.5);
		let scalar = ((encoded.r * 255.0 - 128.0) / 127.0) * params.values.x;
		if (params.values.w < 0.5) { field.r = scalar; }
		else if (params.values.w < 1.5) { field.g = scalar; }
		else { field.b = scalar; }
	}
	let combined = select(field, base + field, params.values.y > 0.5);
	let fluid = 1.0 - solid_at(solid_mask, pixel_coord(uv, textureDimensions(current_field)));
	return clamp(combined, vec4f(-1000.0), vec4f(1000.0)) * fluid;
}
`
	),
	advectMacCormack: shader(
		/* wgsl */ `
struct MacCormackParams {
	values: vec4f,
	texel_size: vec2f,
	sticky_strength: f32,
	pad: f32,
	open_edges: vec4f,
}

@group(0) @binding(0) var<uniform> params: MacCormackParams;
@group(0) @binding(1) var velocity: texture_2d<f32>;
@group(0) @binding(2) var phi_hat_texture: texture_2d<f32>;
@group(0) @binding(3) var linear_sampler: sampler;
@group(0) @binding(4) var solid_mask: texture_2d<f32>;

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
	let dt = params.values.x;
	let dissipation = params.values.y;
	let size = textureDimensions(velocity);
	let phi_n = textureSampleLevel(velocity, linear_sampler, uv, 0.0).xy;
	let displacement = dt * phi_n * params.texel_size;
	let departure = uv - displacement;
	let phi_hat = textureSampleLevel(phi_hat_texture, linear_sampler, uv, 0.0).xy;
	let phi_bar = textureSampleLevel(phi_hat_texture, linear_sampler, uv + displacement, 0.0).xy;
	var corrected = phi_hat + 0.5 * (phi_n - phi_bar);

	let base = vec2i(floor(departure * vec2f(size) - 0.5));
	let s00 = load_vector(velocity, base);
	let s10 = load_vector(velocity, base + vec2i(1, 0));
	let s01 = load_vector(velocity, base + vec2i(0, 1));
	let s11 = load_vector(velocity, base + vec2i(1, 1));
	let lower = min(min(s00, s10), min(s01, s11));
	let upper = max(max(s00, s10), max(s01, s11));
	corrected = clamp(corrected, lower, upper);

	let trace_radius = ceil(max(abs(dt * phi_n.x), abs(dt * phi_n.y))) + 1.0;
	let mask_coord = pixel_coord(uv, size);
	let pattern = solid_pattern(solid_mask, mask_coord);
	let clearance = f32((pattern >> 5u) & 7u);
	if (clearance <= trace_radius) {
		corrected = phi_hat;
	}
	let edge = trace_radius * params.texel_size;
	let near_open_edge =
		(params.open_edges.x > 0.5 && uv.x <= edge.x) ||
		(params.open_edges.y > 0.5 && uv.x >= 1.0 - edge.x) ||
		(params.open_edges.z > 0.5 && uv.y >= 1.0 - edge.y) ||
		(params.open_edges.w > 0.5 && uv.y <= edge.y);
	if (near_open_edge) {
		corrected = phi_hat;
	}

	let sticky = textureLoad(solid_mask, mask_coord, 0).a;
	var effective_dissipation = dissipation;
	if (params.values.w > 0.5 && params.values.w < 1.5) {
		effective_dissipation = mix(effective_dissipation, 1.0, sticky * clamp(params.sticky_strength, 0.0, 1.0));
	} else if (params.values.w > 1.5) {
		effective_dissipation *= max(0.0, 1.0 - sticky * clamp(params.sticky_strength, 0.0, 1.0));
	}
	if (params.values.z > 0.5) {
		corrected *= effective_dissipation;
	} else {
		corrected /= 1.0 + max(effective_dissipation, 0.0) * dt;
	}
	let fluid = select(1.0, 0.0, pattern_solid(pattern, 0u));
	return vec4f(clamp(corrected, vec2f(-1000.0), vec2f(1000.0)), 0.0, 1.0) * fluid;
}
	`
	),
	viscosity: shader(/* wgsl */ `
struct ViscosityParams {
	values: vec4f,
}

@group(0) @binding(0) var<uniform> params: ViscosityParams;
@group(0) @binding(1) var velocity: texture_2d<f32>;
@group(0) @binding(2) var source: texture_2d<f32>;
@group(0) @binding(3) var solid_mask: texture_2d<f32>;

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
	let coord = pixel_coord(uv, textureDimensions(velocity));
	let pattern = solid_pattern(solid_mask, coord);
	if (pattern_solid(pattern, 0u)) { return vec4f(0.0); }
	let center = load_vector(velocity, coord);
	let left = select(load_vector(velocity, coord + vec2i(-1, 0)), center, pattern_solid(pattern, 1u));
	let right = select(load_vector(velocity, coord + vec2i(1, 0)), center, pattern_solid(pattern, 2u));
	let bottom = select(load_vector(velocity, coord + vec2i(0, -1)), center, pattern_solid(pattern, 3u));
	let top = select(load_vector(velocity, coord + vec2i(0, 1)), center, pattern_solid(pattern, 4u));
	let initial = load_vector(source, coord);
	let alpha = max(params.values.x, 0.0);
	let next = (initial + alpha * (left + right + bottom + top)) / (1.0 + 4.0 * alpha);
	return vec4f(clamp(next, vec2f(-1000.0), vec2f(1000.0)), 0.0, 1.0);
}
`),
	wallFriction: shader(/* wgsl */ `
struct WallFrictionParams {
	values: vec4f,
}

@group(0) @binding(0) var<uniform> params: WallFrictionParams;
@group(0) @binding(1) var velocity: texture_2d<f32>;
@group(0) @binding(2) var solid_mask: texture_2d<f32>;

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
	let coord = pixel_coord(uv, textureDimensions(velocity));
	let pattern = solid_pattern(solid_mask, coord);
	if (pattern_solid(pattern, 0u)) { return vec4f(0.0); }
	var edge = select(0.0, 1.0, (pattern & 30u) != 0u);
	if (params.values.y > 1.5) {
		edge = max(edge, 0.65 * solid_at(solid_mask, coord + vec2i(-2, 0)));
		edge = max(edge, 0.65 * solid_at(solid_mask, coord + vec2i(2, 0)));
		edge = max(edge, 0.65 * solid_at(solid_mask, coord + vec2i(0, -2)));
		edge = max(edge, 0.65 * solid_at(solid_mask, coord + vec2i(0, 2)));
	}
	let damping = clamp(1.0 - params.values.x * edge, 0.0, 1.0);
	return vec4f(load_vector(velocity, coord) * damping, 0.0, 1.0);
}
`),
	curl: shader(/* wgsl */ `
@group(0) @binding(0) var velocity: texture_2d<f32>;

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
	let coord = pixel_coord(uv, textureDimensions(velocity));
	let left = load_vector(velocity, coord + vec2i(-1, 0)).y;
	let right = load_vector(velocity, coord + vec2i(1, 0)).y;
	let bottom = load_vector(velocity, coord + vec2i(0, -1)).x;
	let top = load_vector(velocity, coord + vec2i(0, 1)).x;
	return vec4f(0.5 * (right - left - top + bottom), 0.0, 0.0, 1.0);
}
`),
	vorticity: shader(/* wgsl */ `
struct VorticityParams {
	values: vec4f,
}

@group(0) @binding(0) var<uniform> params: VorticityParams;
@group(0) @binding(1) var velocity: texture_2d<f32>;
@group(0) @binding(2) var curl_texture: texture_2d<f32>;
@group(0) @binding(3) var solid_mask: texture_2d<f32>;

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
	let coord = pixel_coord(uv, textureDimensions(velocity));
	let pattern = solid_pattern(solid_mask, coord);
	if (pattern_solid(pattern, 0u)) { return vec4f(0.0); }
	let left = abs(load_scalar(curl_texture, coord + vec2i(-1, 0)));
	let right = abs(load_scalar(curl_texture, coord + vec2i(1, 0)));
	let bottom = abs(load_scalar(curl_texture, coord + vec2i(0, -1)));
	let top = abs(load_scalar(curl_texture, coord + vec2i(0, 1)));
	let center = load_scalar(curl_texture, coord);
	let gradient = safe_normalize(0.5 * vec2f(top - bottom, right - left));
	let neighbor_solid = select(0.0, 1.0, (pattern & 30u) != 0u);
	let normalized_omega = abs(center) * 2.0 * params.values.w;
	let adaptive_weight = smoothstep(${VORTICITY_ADAPTIVE_LO}, ${VORTICITY_ADAPTIVE_HI}, normalized_omega);
	let confinement = mix(
		params.values.y * center,
		params.values.y * center * adaptive_weight,
		clamp(params.values.z, 0.0, 1.0),
	);
	let force = vec2f(gradient.x, -gradient.y) * confinement * (1.0 - step(0.5, neighbor_solid));
	let next = load_vector(velocity, coord) + force * params.values.x;
	return vec4f(clamp(next, vec2f(-1000.0), vec2f(1000.0)), 0.0, 1.0);
}
`),
	divergence: shader(/* wgsl */ `
struct BoundaryParams {
	open_edges: vec4f,
}

@group(0) @binding(0) var<uniform> params: BoundaryParams;
@group(0) @binding(1) var velocity: texture_2d<f32>;
@group(0) @binding(2) var solid_mask: texture_2d<f32>;

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
	let size = textureDimensions(velocity);
	let coord = pixel_coord(uv, size);
	let pattern = solid_pattern(solid_mask, coord);
	if (pattern_solid(pattern, 0u)) { return vec4f(0.0); }
	let center = load_vector(velocity, coord);
	var left = load_vector(velocity, coord + vec2i(-1, 0)).x;
	var right = load_vector(velocity, coord + vec2i(1, 0)).x;
	var bottom = load_vector(velocity, coord + vec2i(0, -1)).y;
	var top = load_vector(velocity, coord + vec2i(0, 1)).y;
	if (coord.x == 0 && params.open_edges.x < 0.5) { left = -center.x; }
	if (coord.x == i32(size.x) - 1 && params.open_edges.y < 0.5) { right = -center.x; }
	if (coord.y == 0 && params.open_edges.z < 0.5) { bottom = -center.y; }
	if (coord.y == i32(size.y) - 1 && params.open_edges.w < 0.5) { top = -center.y; }
	if (pattern_solid(pattern, 1u)) { left = -center.x; }
	if (pattern_solid(pattern, 2u)) { right = -center.x; }
	if (pattern_solid(pattern, 3u)) { bottom = -center.y; }
	if (pattern_solid(pattern, 4u)) { top = -center.y; }
	return vec4f(0.5 * (right - left + top - bottom), 0.0, 0.0, 1.0);
}
`),
	pressurePaired: shader(/* wgsl */ `
struct PressureParams {
	memory: f32,
	relaxation: f32,
	pad: vec2f,
}

@group(0) @binding(0) var<uniform> params: PressureParams;
@group(0) @binding(1) var pressure: texture_2d<f32>;
@group(0) @binding(2) var divergence: texture_2d<f32>;
@group(0) @binding(3) var solid_mask: texture_2d<f32>;

fn inner_iterate(coord: vec2i) -> f32 {
	let current_coord = clamped_coord(coord, textureDimensions(pressure));
	let pattern = solid_pattern(solid_mask, current_coord);
	if (pattern_solid(pattern, 0u)) { return 0.0; }
	let center = load_scalar(pressure, current_coord);
	let left = select(load_scalar(pressure, current_coord + vec2i(-1, 0)), center, pattern_solid(pattern, 1u));
	let right = select(load_scalar(pressure, current_coord + vec2i(1, 0)), center, pattern_solid(pattern, 2u));
	let bottom = select(load_scalar(pressure, current_coord + vec2i(0, -1)), center, pattern_solid(pattern, 3u));
	let top = select(load_scalar(pressure, current_coord + vec2i(0, 1)), center, pattern_solid(pattern, 4u));
	let div = load_scalar(divergence, current_coord);
	return ((left + right + bottom + top) * params.memory - div) * 0.25 + sticky_at(solid_mask, current_coord) * params.relaxation;
}

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
	let coord = pixel_coord(uv, textureDimensions(pressure));
	let pattern = solid_pattern(solid_mask, coord);
	if (pattern_solid(pattern, 0u)) { return vec4f(0.0); }
	let center = inner_iterate(coord);
	let left = select(inner_iterate(coord + vec2i(-1, 0)), center, pattern_solid(pattern, 1u));
	let right = select(inner_iterate(coord + vec2i(1, 0)), center, pattern_solid(pattern, 2u));
	let bottom = select(inner_iterate(coord + vec2i(0, -1)), center, pattern_solid(pattern, 3u));
	let top = select(inner_iterate(coord + vec2i(0, 1)), center, pattern_solid(pattern, 4u));
	let div = load_scalar(divergence, coord);
	let jacobi = (left + right + bottom + top - div) * 0.25 + sticky_at(solid_mask, coord) * params.relaxation;
	return vec4f(jacobi, 0.0, 0.0, 1.0);
}
`),
	pressureSingle: shader(/* wgsl */ `
struct PressureParams {
	memory: f32,
	relaxation: f32,
	pad: vec2f,
}

@group(0) @binding(0) var<uniform> params: PressureParams;
@group(0) @binding(1) var pressure: texture_2d<f32>;
@group(0) @binding(2) var divergence: texture_2d<f32>;
@group(0) @binding(3) var solid_mask: texture_2d<f32>;

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
	let coord = pixel_coord(uv, textureDimensions(pressure));
	let pattern = solid_pattern(solid_mask, coord);
	if (pattern_solid(pattern, 0u)) { return vec4f(0.0); }
	let center = load_scalar(pressure, coord);
	let left = select(load_scalar(pressure, coord + vec2i(-1, 0)), center, pattern_solid(pattern, 1u));
	let right = select(load_scalar(pressure, coord + vec2i(1, 0)), center, pattern_solid(pattern, 2u));
	let bottom = select(load_scalar(pressure, coord + vec2i(0, -1)), center, pattern_solid(pattern, 3u));
	let top = select(load_scalar(pressure, coord + vec2i(0, 1)), center, pattern_solid(pattern, 4u));
	let div = load_scalar(divergence, coord);
	let jacobi = ((left + right + bottom + top) * params.memory - div) * 0.25 + sticky_at(solid_mask, coord) * params.relaxation;
	return vec4f(jacobi, 0.0, 0.0, 1.0);
}
`),
	gradientSubtract: shader(/* wgsl */ `
@group(0) @binding(0) var pressure: texture_2d<f32>;
@group(0) @binding(1) var velocity: texture_2d<f32>;
@group(0) @binding(2) var solid_mask: texture_2d<f32>;

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
	let coord = pixel_coord(uv, textureDimensions(velocity));
	let pattern = solid_pattern(solid_mask, coord);
	if (pattern_solid(pattern, 0u)) { return vec4f(0.0); }
	let center = load_scalar(pressure, coord);
	let left = select(load_scalar(pressure, coord + vec2i(-1, 0)), center, pattern_solid(pattern, 1u));
	let right = select(load_scalar(pressure, coord + vec2i(1, 0)), center, pattern_solid(pattern, 2u));
	let bottom = select(load_scalar(pressure, coord + vec2i(0, -1)), center, pattern_solid(pattern, 3u));
	let top = select(load_scalar(pressure, coord + vec2i(0, 1)), center, pattern_solid(pattern, 4u));
	let next = load_vector(velocity, coord) - vec2f(right - left, top - bottom);
	return vec4f(next, 0.0, 1.0);
}
`),
	resample: shader(
		/* wgsl */ `
@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var linear_sampler: sampler;

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
	return textureSampleLevel(source, linear_sampler, uv, 0.0);
}
`,
		false
	),
	bloomPrefilter: shader(
		/* wgsl */ `
struct BloomParams {
	values: vec4f,
}

@group(0) @binding(0) var<uniform> params: BloomParams;
@group(0) @binding(1) var source: texture_2d<f32>;
@group(0) @binding(2) var linear_sampler: sampler;

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
	let color = max(textureSampleLevel(source, linear_sampler, uv, 0.0).rgb, vec3f(0.0));
	let brightness = max(color.r, max(color.g, color.b));
	let knee = max(params.values.y, 0.0001);
	let soft = clamp((brightness - params.values.x + knee) / (2.0 * knee), 0.0, 1.0);
	let contribution = max(brightness - params.values.x, 0.0) + soft * soft * knee;
	return vec4f(color * contribution / max(brightness, 0.0001), 1.0);
}
`,
		false
	),
	bloomBlurHorizontal: shader(
		/* wgsl */ `
@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var linear_sampler: sampler;

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
	let texel = vec2f(1.0 / f32(textureDimensions(source).x), 0.0);
	return textureSampleLevel(source, linear_sampler, uv, 0.0) * 0.4 +
		(textureSampleLevel(source, linear_sampler, uv - texel * 1.5, 0.0) + textureSampleLevel(source, linear_sampler, uv + texel * 1.5, 0.0)) * 0.24 +
		(textureSampleLevel(source, linear_sampler, uv - texel * 3.5, 0.0) + textureSampleLevel(source, linear_sampler, uv + texel * 3.5, 0.0)) * 0.06;
}
`,
		false
	),
	bloomBlurVertical: shader(
		/* wgsl */ `
@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var linear_sampler: sampler;

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
	let texel = vec2f(0.0, 1.0 / f32(textureDimensions(source).y));
	return textureSampleLevel(source, linear_sampler, uv, 0.0) * 0.4 +
		(textureSampleLevel(source, linear_sampler, uv - texel * 1.5, 0.0) + textureSampleLevel(source, linear_sampler, uv + texel * 1.5, 0.0)) * 0.24 +
		(textureSampleLevel(source, linear_sampler, uv - texel * 3.5, 0.0) + textureSampleLevel(source, linear_sampler, uv + texel * 3.5, 0.0)) * 0.06;
}
`,
		false
	),
	sunrays: shader(
		/* wgsl */ `
@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var linear_sampler: sampler;

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
	let direction = (vec2f(0.5) - uv) / 24.0;
	var sample_uv = uv;
	var illumination = 0.0;
	var decay = 1.0;
	for (var index = 0; index < 24; index += 1) {
		sample_uv += direction;
		let density = textureSampleLevel(source, linear_sampler, sample_uv, 0.0).rgb;
		illumination += (1.0 - clamp(max(density.r, max(density.g, density.b)), 0.0, 1.0)) * decay;
		decay *= 0.94;
	}
	return vec4f(clamp(illumination / 16.0, 0.0, 1.0), 0.0, 0.0, 1.0);
}
`,
		false
	),
	display: shader(
		/* wgsl */ `
struct DisplayParams {
	background: vec4f,
	options: vec4f,
	reveal_cover: vec4f,
	reveal_accent: vec4f,
	reveal_fringe: vec4f,
	obstruction_color: vec4f,
		flow_options: vec4f,
		flow_range: vec4f,
		flow_color: vec4f,
		post_options: vec4f,
		glass_options: vec4f,
		glass_light: vec4f,
		distortion_options: vec4f,
		distortion_layout: vec4f,
}

@group(0) @binding(0) var<uniform> params: DisplayParams;
@group(0) @binding(1) var dye: texture_2d<f32>;
@group(0) @binding(2) var linear_sampler: sampler;
@group(0) @binding(3) var allowed_mask: texture_2d<f32>;
@group(0) @binding(4) var velocity: texture_2d<f32>;
@group(0) @binding(5) var pressure: texture_2d<f32>;
@group(0) @binding(6) var scalar_field: texture_2d<f32>;
@group(0) @binding(7) var bloom_texture: texture_2d<f32>;
@group(0) @binding(8) var sunrays_texture: texture_2d<f32>;
@group(0) @binding(9) var distortion_texture: texture_2d<f32>;

fn selected_channel(value: vec4f, channel: f32) -> f32 {
	if (channel < 0.5) { return value.r; }
	if (channel < 1.5) { return value.g; }
	return value.b;
}

fn transfer_color(value: f32, kind: f32) -> vec3f {
	let t = clamp(value, 0.0, 1.0);
	if (kind < 0.5) {
		return mix(mix(vec3f(0.10, 0.025, 0.005), vec3f(1.0, 0.34, 0.04), smoothstep(0.0, 0.55, t)), vec3f(1.5, 1.1, 0.45), smoothstep(0.45, 1.0, t));
	}
	if (kind < 1.5) { return mix(vec3f(0.02, 0.07, 0.17), vec3f(0.25, 0.75, 1.0), t); }
	if (kind < 2.5) { return mix(vec3f(0.015, 0.018, 0.035), vec3f(0.07, 0.09, 0.45), t); }
	if (kind < 3.5) {
		return mix(mix(vec3f(0.07, 0.04, 0.25), vec3f(0.0, 0.56, 0.55), smoothstep(0.0, 0.55, t)), vec3f(0.98, 0.9, 0.18), smoothstep(0.45, 1.0, t));
	}
	let a = mix(vec3f(0.04, 0.08, 0.55), vec3f(0.0, 0.70, 0.95), smoothstep(0.0, 0.28, t));
	let b = mix(a, vec3f(0.05, 0.72, 0.22), smoothstep(0.22, 0.52, t));
	let c = mix(b, vec3f(1.0, 0.88, 0.05), smoothstep(0.48, 0.78, t));
	return mix(c, vec3f(0.90, 0.08, 0.02), smoothstep(0.72, 1.0, t));
}

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
	let mask = textureSampleLevel(allowed_mask, linear_sampler, uv, 0.0);
	let allowed = mask.g;
	let obstruction = mask.b;
	var density = max(textureSampleLevel(dye, linear_sampler, uv, 0.0).rgb, vec3f(0.0));
	if (params.distortion_options.x > 0.5) {
		let bleed = params.distortion_layout.zw;
		let visible_uv = (uv - bleed) / max(vec2f(0.0001), vec2f(1.0) - bleed * 2.0);
		let visible_ratio = params.distortion_options.w * (1.0 - bleed.x * 2.0) / max(1.0 - bleed.y * 2.0, 0.01);
		let image_ratio = max(params.distortion_options.z, 0.0001);
		var image_uv = visible_uv - 0.5;
		if (params.distortion_layout.y < 0.5) {
			if (visible_ratio > image_ratio) { image_uv.y *= image_ratio / visible_ratio; }
			else { image_uv.x *= visible_ratio / image_ratio; }
		} else {
			if (visible_ratio > image_ratio) { image_uv.x *= visible_ratio / image_ratio; }
			else { image_uv.y *= image_ratio / visible_ratio; }
		}
		image_uv /= max(params.distortion_layout.x, 0.01);
		image_uv += 0.5;
		let flow = textureSampleLevel(velocity, linear_sampler, uv, 0.0).xy;
		var flow_direction = vec2f(0.0);
		if (length(flow) > 0.00001) { flow_direction = normalize(flow); }
		let offset = textureSampleLevel(dye, linear_sampler, uv, 0.0).r;
		image_uv -= params.distortion_options.y * flow_direction * offset;
		let edge_width = 0.004;
		var edge_alpha = smoothstep(0.0, edge_width, image_uv.x) * (1.0 - smoothstep(1.0 - edge_width, 1.0, image_uv.x));
		edge_alpha *= smoothstep(0.0, edge_width, image_uv.y) * (1.0 - smoothstep(1.0 - edge_width, 1.0, image_uv.y));
		edge_alpha *= allowed;
		let image_sample = textureSampleLevel(distortion_texture, linear_sampler, clamp(image_uv, vec2f(0.0), vec2f(1.0)), 0.0);
		edge_alpha *= image_sample.a;
		return vec4f(image_sample.rgb * edge_alpha, edge_alpha);
	}
	if (params.flow_options.x > 0.5) {
		var raw = 0.0;
		if (params.flow_options.x < 1.5) { raw = length(textureSampleLevel(velocity, linear_sampler, uv, 0.0).xy); }
		else if (params.flow_options.x < 2.5) { raw = abs(textureSampleLevel(pressure, linear_sampler, uv, 0.0).r); }
		else { raw = selected_channel(textureSampleLevel(scalar_field, linear_sampler, uv, 0.0), params.flow_options.w); }
		let mapped = select(
			raw * params.flow_range.z,
			((raw - params.flow_range.x) / max(params.flow_range.y - params.flow_range.x, 0.000001)) * params.flow_range.z,
			params.flow_range.w > 0.5,
		);
		var flow_density = transfer_color(mapped, params.flow_options.y);
		if (params.flow_options.x > 2.5) { flow_density *= params.flow_color.rgb; }
		if (params.flow_options.z > 0.5) {
			let glow_value = select(
				mapped,
				length(textureSampleLevel(velocity, linear_sampler, uv, 0.0).xy) * params.flow_range.z,
				params.flow_options.z < 1.5,
			);
			flow_density += params.flow_color.rgb * clamp(glow_value, 0.0, 1.0) * 0.2;
		}
		let visual_size = textureDimensions(allowed_mask);
		let visual_coord = vec2i(clamp(floor(uv * vec2f(visual_size)), vec2f(0.0), vec2f(visual_size) - 1.0));
		let solid_stencil = u32(round(textureLoad(allowed_mask, visual_coord, 0).r * 255.0)) & 31u;
		let flow_visibility = select(0.0, 1.0, solid_stencil == 0u && allowed > 0.995 && obstruction < 0.005);
		density = max(density, flow_density * flow_visibility);
	}
	if (params.post_options.y > 0.5) {
		density += textureSampleLevel(bloom_texture, linear_sampler, uv, 0.0).rgb * params.post_options.x;
	}
	if (params.post_options.z > 0.5) {
		let rays = textureSampleLevel(sunrays_texture, linear_sampler, uv, 0.0).r;
		density *= mix(1.0, 0.55 + rays * 0.45, clamp(params.post_options.w, 0.0, 1.0));
	}
	if (params.glass_options.x > 0.5) {
		let offset = max(params.glass_options.y, 0.002);
		let gradient = vec2f(
			textureSampleLevel(allowed_mask, linear_sampler, uv + vec2f(offset, 0.0), 0.0).g -
				textureSampleLevel(allowed_mask, linear_sampler, uv - vec2f(offset, 0.0), 0.0).g,
			textureSampleLevel(allowed_mask, linear_sampler, uv + vec2f(0.0, offset), 0.0).g -
				textureSampleLevel(allowed_mask, linear_sampler, uv - vec2f(0.0, offset), 0.0).g,
		);
		let rim = clamp(length(gradient), 0.0, 1.0);
		let normal = gradient / max(length(gradient), 0.00001);
		let shift = normal * params.glass_options.z * 0.025 * rim;
		let chromatic = params.glass_options.w * 0.004 * rim;
		let refracted = vec3f(
			textureSampleLevel(dye, linear_sampler, clamp(uv + shift * (1.0 + chromatic), vec2f(0.0), vec2f(1.0)), 0.0).r,
			textureSampleLevel(dye, linear_sampler, clamp(uv + shift, vec2f(0.0), vec2f(1.0)), 0.0).g,
			textureSampleLevel(dye, linear_sampler, clamp(uv + shift * (1.0 - chromatic), vec2f(0.0), vec2f(1.0)), 0.0).b,
		);
		let local_dye = textureSampleLevel(dye, linear_sampler, uv, 0.0).rgb;
		density = max(density + (refracted - local_dye) * rim, vec3f(0.0));
		let light_delta = params.glass_light.yz - uv;
		let light_xy = light_delta / max(length(light_delta), 0.00001);
		let specular = pow(max(dot(normalize(vec3f(normal, 0.7)), normalize(vec3f(light_xy, 1.0))), 0.0), 18.0);
		let fluid_light = clamp(dot(refracted, vec3f(0.2126, 0.7152, 0.0722)), 0.0, 1.0);
		density += vec3f(specular * params.glass_light.x * fluid_light * rim);
	}
	if (params.options.y > 0.5) {
		let texel = 1.0 / vec2f(textureDimensions(dye));
		let left = textureSampleLevel(dye, linear_sampler, uv - vec2f(texel.x, 0.0), 0.0).rgb;
		let right = textureSampleLevel(dye, linear_sampler, uv + vec2f(texel.x, 0.0), 0.0).rgb;
		let top = textureSampleLevel(dye, linear_sampler, uv - vec2f(0.0, texel.y), 0.0).rgb;
		let bottom = textureSampleLevel(dye, linear_sampler, uv + vec2f(0.0, texel.y), 0.0).rgb;
		let dx = length(right) - length(left);
		let dy = length(top) - length(bottom);
		let normal = normalize(vec3f(dx, dy, length(texel)));
		density *= clamp(normal.z + 0.7, 0.7, 1.0);
	}
	density *= allowed;
	var alpha = max(density.r, max(density.g, density.b));
	if (params.options.z > 0.5) {
		let raw = clamp(alpha * params.reveal_cover.w, 0.0, 1.0);
		let reveal_amount = smoothstep(0.0, 0.5, pow(raw, params.reveal_accent.w));
		let reveal_alpha = (1.0 - reveal_amount) * allowed;
		let outer_blend = smoothstep(0.0, 0.15, reveal_amount);
		let inner_blend = smoothstep(0.15, 0.4, reveal_amount);
		let color = mix(
			mix(params.reveal_cover.rgb, params.reveal_fringe.rgb, outer_blend),
			params.reveal_accent.rgb,
			inner_blend,
		);
		return vec4f(color * reveal_alpha, reveal_alpha);
	}
	if (params.options.w > 0.5) {
		density = mix(density, params.obstruction_color.rgb, obstruction);
		alpha = max(alpha, obstruction);
	}
	if (params.options.x > 0.5) { return vec4f(density, alpha); }
	return vec4f(density + params.background.rgb * (1.0 - alpha), 1.0);
}
`,
		false
	)
} as const;
