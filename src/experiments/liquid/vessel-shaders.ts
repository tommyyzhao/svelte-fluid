/** Independent PBF study: Macklin & Müller 2013, equations 1, 11, 12 and XSPH.
 * Nonnegative pressure avoids pulling a deficient free-surface neighborhood inward.
 * There is no vorticity boost, dye decay, or legacy fluid shader in this experiment.
 */
export function vesselCompute(count: number, restKernel: number): string {
	return /* wgsl */ `
const N = ${count}u;
const H = 0.22;
const REST = ${restKernel};
const GRID = vec3u(17u, 13u, 11u);
const CELLS = 2431u;
const CAPACITY = 32u;
const LOWER = vec3f(-1.8, 0.055, -1.2);
const UPPER = vec3f(1.8, 2.7, 1.2);
const POLY = 315.0 / (64.0 * 3.14159265 * pow(H, 9.0));
const SPIKY = -45.0 / (3.14159265 * pow(H, 6.0));
struct Params { frame: vec4f, paddle: vec4f, viewport: vec4f, spare: vec4f }
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read_write> positions: array<vec4f>;
@group(0) @binding(2) var<storage, read_write> velocities: array<vec4f>;
@group(0) @binding(3) var<storage, read_write> predicted: array<vec4f>;
@group(0) @binding(4) var<storage, read_write> corrected: array<vec4f>;
@group(0) @binding(5) var<storage, read_write> lambdas: array<f32>;
@group(0) @binding(6) var<storage, read_write> counts: array<atomic<u32>>;
@group(0) @binding(7) var<storage, read_write> entries: array<u32>;
@group(0) @binding(8) var<storage, read_write> overflow: atomic<u32>;

fn cell(p: vec3f) -> vec3i {
	return clamp(vec3i(floor((p - vec3f(-1.8, 0.0, -1.2)) / H)), vec3i(0), vec3i(GRID) - 1);
}
fn cellIndex(c: vec3i) -> u32 { return u32(c.x) + GRID.x * (u32(c.y) + GRID.y * u32(c.z)); }
fn kernel(r2: f32) -> f32 { let q = max(H * H - r2, 0.0); return POLY * q * q * q; }
fn gradient(r: vec3f) -> vec3f {
	let d = length(r);
	if (d < 0.00001 || d >= H) { return vec3f(0.0); }
	return SPIKY * (H - d) * (H - d) * r / (d * REST);
}

@compute @workgroup_size(64)
fn predict(@builtin(global_invocation_id) id: vec3u) {
	let i = id.x; if (i >= N) { return; }
	let dt = params.frame.x;
	let angle = params.frame.z * 0.45;
	var v = velocities[i].xyz + dt * 9.81 * vec3f(sin(angle), -cos(angle), 0.0);
	let p = positions[i].xyz;
	if (params.frame.y > 0.5) {
		let offset = p.xz - params.paddle.xy;
		let height = (p.y - 0.6) / 0.8;
		let influence = exp(-dot(offset, offset) / 0.15) * exp(-height * height * height * height);
		let paddleVelocity = vec3f(params.paddle.z, 0.0, params.paddle.w);
		v += (paddleVelocity - v) * (1.0 - exp(-20.0 * dt)) * influence;
	}
	predicted[i] = vec4f(clamp(p + dt * v, LOWER, UPPER), 1.0);
}

@compute @workgroup_size(64)
fn clearGrid(@builtin(global_invocation_id) id: vec3u) {
	if (id.x < CELLS) { atomicStore(&counts[id.x], 0u); }
}
@compute @workgroup_size(64)
fn buildGrid(@builtin(global_invocation_id) id: vec3u) {
	let i = id.x; if (i >= N) { return; }
	let c = cellIndex(cell(predicted[i].xyz));
	let slot = atomicAdd(&counts[c], 1u);
	if (slot < CAPACITY) { entries[c * CAPACITY + slot] = i; }
	else { atomicMax(&overflow, slot + 1u - CAPACITY); }
}

@compute @workgroup_size(64)
fn density(@builtin(global_invocation_id) id: vec3u) {
	let i = id.x; if (i >= N) { return; }
	let p = predicted[i].xyz; let c = cell(p);
	var rho = 0.0; var gradSum = vec3f(0.0); var denominator = 0.0;
	for (var z = max(c.z - 1, 0); z <= min(c.z + 1, i32(GRID.z) - 1); z++) {
		for (var y = max(c.y - 1, 0); y <= min(c.y + 1, i32(GRID.y) - 1); y++) {
			for (var x = max(c.x - 1, 0); x <= min(c.x + 1, i32(GRID.x) - 1); x++) {
				let bucket = cellIndex(vec3i(x, y, z)); let end = min(atomicLoad(&counts[bucket]), CAPACITY);
				for (var k = 0u; k < end; k++) {
					let j = entries[bucket * CAPACITY + k]; let r = p - predicted[j].xyz;
					let g = gradient(r); rho += kernel(dot(r, r));
					gradSum += g; denominator += dot(g, g);
				}
			}
		}
	}
	lambdas[i] = -max(rho / REST - 1.0, 0.0) / (denominator + dot(gradSum, gradSum) + 4.0);
}

@compute @workgroup_size(64)
fn project(@builtin(global_invocation_id) id: vec3u) {
	let i = id.x; if (i >= N) { return; }
	let p = predicted[i].xyz; let c = cell(p); var delta = vec3f(0.0);
	for (var z = max(c.z - 1, 0); z <= min(c.z + 1, i32(GRID.z) - 1); z++) {
		for (var y = max(c.y - 1, 0); y <= min(c.y + 1, i32(GRID.y) - 1); y++) {
			for (var x = max(c.x - 1, 0); x <= min(c.x + 1, i32(GRID.x) - 1); x++) {
				let bucket = cellIndex(vec3i(x, y, z)); let end = min(atomicLoad(&counts[bucket]), CAPACITY);
				for (var k = 0u; k < end; k++) {
					let j = entries[bucket * CAPACITY + k];
					delta += (lambdas[i] + lambdas[j]) * gradient(p - predicted[j].xyz);
				}
			}
		}
	}
	corrected[i] = vec4f(clamp(p + delta, LOWER, UPPER), 1.0);
}

@compute @workgroup_size(64)
fn reconstruct(@builtin(global_invocation_id) id: vec3u) {
	let i = id.x; if (i >= N) { return; }
	velocities[i] = vec4f((predicted[i].xyz - positions[i].xyz) / params.frame.x, 0.0);
}

@compute @workgroup_size(64)
fn viscosity(@builtin(global_invocation_id) id: vec3u) {
	let i = id.x; if (i >= N) { return; }
	let p = predicted[i].xyz; let c = cell(p); let v = velocities[i].xyz;
	var dv = vec3f(0.0);
	for (var z = max(c.z - 1, 0); z <= min(c.z + 1, i32(GRID.z) - 1); z++) {
		for (var y = max(c.y - 1, 0); y <= min(c.y + 1, i32(GRID.y) - 1); y++) {
			for (var x = max(c.x - 1, 0); x <= min(c.x + 1, i32(GRID.x) - 1); x++) {
				let bucket = cellIndex(vec3i(x, y, z)); let end = min(atomicLoad(&counts[bucket]), CAPACITY);
				for (var k = 0u; k < end; k++) {
					let j = entries[bucket * CAPACITY + k]; let r = p - predicted[j].xyz;
					dv += (velocities[j].xyz - v) * kernel(dot(r, r)) / REST;
				}
			}
		}
	}
	var result = v + (1.0 - exp(-2.5 * params.frame.x)) * dv;
	if (p.y < LOWER.y + 0.003) { result = vec3f(result.x * exp(-3.0 * params.frame.x), max(result.y, 0.0), result.z * exp(-3.0 * params.frame.x)); }
	if (p.x <= LOWER.x + 0.0001) { result.x = max(result.x, 0.0); }
	if (p.x >= UPPER.x - 0.0001) { result.x = min(result.x, 0.0); }
	if (p.z <= LOWER.z + 0.0001) { result.z = max(result.z, 0.0); }
	if (p.z >= UPPER.z - 0.0001) { result.z = min(result.z, 0.0); }
	if (p.y >= UPPER.y - 0.0001) { result.y = min(result.y, 0.0); }
	// corrected is scratch here; velocity reads and writes never race.
	corrected[i] = vec4f(result, 0.0); positions[i] = vec4f(p, 1.0);
}
`;
}

export const VESSEL_VIEW_WIDTH = 7.2;
export const VESSEL_CENTER_Y = 1.15;

const camera = /* wgsl */ `
struct Params { frame: vec4f, paddle: vec4f, viewport: vec4f, spare: vec4f }
@group(0) @binding(0) var<uniform> params: Params;
const RIGHT = vec3f(0.8944272, 0.0, -0.4472136);
const UP = vec3f(-0.2581989, 0.8164966, -0.5163978);
const TOWARD = vec3f(0.3651484, 0.5773503, 0.7302967);
const CENTER = vec3f(0.0, ${VESSEL_CENTER_Y}, 0.0);
const VIEW_WIDTH = ${VESSEL_VIEW_WIDTH};
const RADIUS = 0.13;
const OPTICAL_VOLUME_SCALE = 3.0 * 0.001520875 / (4.0 * 3.14159265 * RADIUS * RADIUS * RADIUS);
fn viewSize() -> vec2f { return vec2f(VIEW_WIDTH, VIEW_WIDTH / params.viewport.z); }
fn worldAt(uv: vec2f, depth: f32) -> vec3f {
	let xy = (uv - 0.5) * viewSize() * vec2f(1.0, -1.0);
	return CENTER + xy.x * RIGHT + xy.y * UP + (6.0 - depth) * TOWARD;
}
fn boxInterval(uv: vec2f) -> vec2f {
	let origin = worldAt(uv, 0.0);
	let a = (origin - vec3f(1.8575, 2.7575, 1.2575)) / TOWARD;
	let b = (origin - vec3f(-1.8575, 0.0, -1.2575)) / TOWARD;
	return vec2f(max(max(a.x, a.y), a.z), min(min(b.x, b.y), b.z));
}
`;

export const vesselParticles = camera + /* wgsl */ `
@group(0) @binding(1) var<storage, read> particles: array<vec4f>;
struct Vertex { @builtin(position) position: vec4f, @location(0) local: vec2f, @location(1) depth: f32 }
@vertex fn vertex(@builtin(vertex_index) v: u32, @builtin(instance_index) i: u32) -> Vertex {
	let corners = array<vec2f, 6>(vec2f(-1.0,-1.0),vec2f(1.0,-1.0),vec2f(-1.0,1.0),vec2f(-1.0,1.0),vec2f(1.0,-1.0),vec2f(1.0,1.0));
	let local = corners[v]; let p = particles[i].xyz - CENTER;
	let xy = vec2f(dot(p, RIGHT), dot(p, UP)) + local * RADIUS;
	let depth = 6.0 - dot(p, TOWARD);
	var out: Vertex; out.position = vec4f(2.0 * xy / viewSize(), depth / 12.0, 1.0); out.local = local; out.depth = depth;
	return out;
}
struct Depth { @builtin(frag_depth) depth: f32, @location(0) linear: f32 }
@fragment fn depthFragment(in: Vertex) -> Depth {
	let r2 = dot(in.local, in.local); if (r2 > 1.0) { discard; }
	let extent = RADIUS * sqrt(1.0 - r2);
	let interval = boxInterval(in.position.xy / params.viewport.xy);
	let depth = max(in.depth - extent, interval.x);
	if (depth > min(in.depth + extent, interval.y)) { discard; }
	var out: Depth; out.depth = depth / 12.0; out.linear = depth; return out;
}
@fragment fn thicknessFragment(in: Vertex) -> @location(0) f32 {
	let r2 = dot(in.local, in.local); if (r2 > 1.0) { discard; }
	let extent = RADIUS * sqrt(1.0 - r2);
	let interval = boxInterval(in.position.xy / params.viewport.xy);
	// Correct sphere overlap to the actual particle volume; this is an optical estimate.
	return max(0.0, min(in.depth + extent, interval.y) - max(in.depth - extent, interval.x)) * OPTICAL_VOLUME_SCALE;
}
`;

export const vesselSmooth = camera + /* wgsl */ `
override HORIZONTAL: bool = true;
@group(0) @binding(1) var inputDepth: texture_2d<f32>;
@group(0) @binding(2) var outputDepth: texture_storage_2d<r32float, write>;
@compute @workgroup_size(8, 8)
fn filterDepth(@builtin(global_invocation_id) id: vec3u) {
	let size = textureDimensions(inputDepth); if (any(id.xy >= size)) { return; }
	let p = vec2i(id.xy); let center = textureLoad(inputDepth, p, 0).r;
	if (center > 11.0) { textureStore(outputDepth, p, vec4f(12.0)); return; }
	let stride = max(1.0, RADIUS * f32(size.x) / VIEW_WIDTH / 4.0);
	var sum = 0.0; var weights = 0.0;
	for (var i = -4; i <= 4; i++) {
		let offset = select(vec2i(0, i32(round(f32(i) * stride))), vec2i(i32(round(f32(i) * stride)), 0), HORIZONTAL);
		let q = clamp(p + offset, vec2i(0), vec2i(size) - 1);
		let d = textureLoad(inputDepth, q, 0).r; let diff = d - center;
		if (abs(diff) < 0.24) {
			let weight = exp(-f32(i * i) * 0.07 - diff * diff * 100.0);
			sum += d * weight; weights += weight;
		}
	}
	textureStore(outputDepth, p, vec4f(sum / weights));
}
`;

export const vesselComposite = camera + /* wgsl */ `
@group(0) @binding(1) var liquidDepth: texture_2d<f32>;
@group(0) @binding(2) var liquidThickness: texture_2d<f32>;
struct Vertex { @builtin(position) position: vec4f, @location(0) uv: vec2f }
@vertex fn vertex(@builtin(vertex_index) i: u32) -> Vertex {
	let p = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
	var out: Vertex; out.position = vec4f(p * 2.0 - 1.0, 0.0, 1.0); out.uv = vec2f(p.x, 1.0 - p.y); return out;
}
fn floorColor(p: vec3f) -> vec3f {
	let inside = abs(p.x) < 1.88 && abs(p.z) < 1.28;
	if (!inside) { return vec3f(0.027, 0.045, 0.061) + 0.008 * exp(-length(p.xz) * 0.4); }
	let line = min(abs(fract(p.x * 2.0 + 0.5) - 0.5), abs(fract(p.z * 2.0 + 0.5) - 0.5));
	let grid = smoothstep(0.009, 0.025, line);
	var color = mix(vec3f(0.26, 0.36, 0.39), vec3f(0.36, 0.47, 0.48), grid);
	let rim = min(1.88 - abs(p.x), 1.28 - abs(p.z));
	color = mix(vec3f(0.72, 0.79, 0.78), color, smoothstep(0.015, 0.055, rim));
	return color;
}
fn background(uv: vec2f) -> vec3f {
	let origin = worldAt(uv, 0.0);
	let floor = origin - TOWARD * ((origin.y + 0.045) / TOWARD.y);
	return floorColor(floor);
}
fn projectWorld(p: vec3f) -> vec2f {
	let local = p - CENTER;
	return vec2f(0.5) + vec2f(dot(local, RIGHT), -dot(local, UP)) / viewSize();
}
fn edgeCoverage(uv: vec2f, a: vec3f, b: vec3f) -> f32 {
	let start = projectWorld(a) * params.viewport.xy;
	let endPoint = projectWorld(b) * params.viewport.xy;
	let segment = endPoint - start;
	let offset = uv * params.viewport.xy - start;
	let distance = length(offset - segment * clamp(dot(offset, segment) / dot(segment, segment), 0.0, 1.0));
	return 1.0 - smoothstep(0.3, 1.3, distance);
}
fn containerEdges(uv: vec2f) -> f32 {
	let corners = array<vec3f, 4>(vec3f(-1.8575, 0.0, -1.2575), vec3f(1.8575, 0.0, -1.2575), vec3f(1.8575, 0.0, 1.2575), vec3f(-1.8575, 0.0, 1.2575));
	var coverage = 0.0;
	for (var i = 0u; i < 4u; i++) {
		let a = corners[i]; let b = corners[(i + 1u) % 4u]; let top = vec3f(0.0, 2.7575, 0.0);
		coverage = max(coverage, edgeCoverage(uv, a, b) * 0.5);
		coverage = max(coverage, edgeCoverage(uv, a, a + top) * 0.15);
		coverage = max(coverage, edgeCoverage(uv, a + top, b + top) * 0.28);
	}
	return coverage;
}
@fragment fn fragment(in: Vertex) -> @location(0) vec4f {
	let size = vec2i(textureDimensions(liquidDepth));
	let p = clamp(vec2i(in.uv * vec2f(size)), vec2i(0), size - 1);
	let d = textureLoad(liquidDepth, p, 0).r;
	var color = background(in.uv);
	if (d < 11.0) {
		let a = textureLoad(liquidDepth, clamp(p + vec2i(-3,0), vec2i(0), size - 1), 0).r;
		let b = textureLoad(liquidDepth, clamp(p + vec2i(3,0), vec2i(0), size - 1), 0).r;
		let c = textureLoad(liquidDepth, clamp(p + vec2i(0,-3), vec2i(0), size - 1), 0).r;
		let e = textureLoad(liquidDepth, clamp(p + vec2i(0,3), vec2i(0), size - 1), 0).r;
		let dx = select(b - a, select(d - a, b - d, abs(b - d) < abs(a - d)) * 2.0, abs(b - a) > 0.25);
		let dy = select(e - c, select(d - c, e - d, abs(e - d) < abs(c - d)) * 2.0, abs(e - c) > 0.25);
		let nView = normalize(vec3f(dx / (6.0 * viewSize().x / f32(size.x)), -dy / (6.0 * viewSize().y / f32(size.y)), 1.0));
		let normal = normalize(RIGHT * nView.x + UP * nView.y + TOWARD * nView.z);
		let world = worldAt(in.uv, d);
		let thickness = max(textureLoad(liquidThickness, p, 0).r, 0.04);
		let transmission = exp(-vec3f(1.8, 0.40, 0.15) * thickness);
		let refracted = background(in.uv + nView.xy * vec2f(1.0, -1.0) * min(thickness, 1.0) * 0.025);
		let fresnel = 0.025 + 0.975 * pow(1.0 - max(nView.z, 0.0), 5.0);
		let reflection = reflect(-TOWARD, normal);
		let sky = mix(vec3f(0.08, 0.20, 0.27), vec3f(0.69, 0.85, 0.89), smoothstep(-0.2, 0.8, reflection.y));
		let light = normalize(vec3f(-0.5, 1.0, 0.5));
		let glint = pow(max(dot(normal, normalize(light + TOWARD)), 0.0), 48.0);
		color = mix(refracted * transmission + vec3f(0.01, 0.11, 0.15) * (1.0 - transmission), sky, fresnel);
		color += vec3f(1.0, 0.95, 0.83) * glint * 0.5;
		color += vec3f(0.03, 0.12, 0.15) * max(normal.y, 0.0);
		// The force footprint is shown only during contact; it never adds liquid.
		if (params.frame.y > 0.5) {
			let ringDistance = (length(world.xz - params.paddle.xy) - 0.22) * 75.0;
			let ring = exp(-ringDistance * ringDistance);
			color += ring * vec3f(0.3, 0.35, 0.25);
		}
	}
	color = mix(color, vec3f(0.63, 0.77, 0.78), containerEdges(in.uv));
	return vec4f(pow(max(color, vec3f(0.0)), vec3f(1.0 / 2.2)), 1.0);
}
`;
