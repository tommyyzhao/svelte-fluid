/* Simulation textures use y-down cell coordinates; only presentation flips y. */
export const FULLSCREEN = `#version 300 es
precision highp float;
void main() {
	vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
	gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const GRID = `
precision highp float;
precision highp int;
uniform ivec2 size;
uniform sampler2D terrain;
uniform sampler2D cells;
bool solid(ivec2 c) {
	return any(lessThan(c, ivec2(0))) || any(greaterThanEqual(c, size)) || texelFetch(terrain, c, 0).r > 0.0;
}
bool liquid(ivec2 c) {
	return !solid(c) && texelFetch(cells, c, 0).a > 0.0;
}
bool wallU(ivec2 c) { return solid(c - ivec2(1, 0)) || solid(c); }
bool wallV(ivec2 c) { return solid(c - ivec2(0, 1)) || solid(c); }
`;

export const FACE_SPLAT_VS = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D particleA;
uniform sampler2D particleB;
uniform ivec2 size;
out vec4 value;
void main() {
	int id = gl_VertexID / 8;
	int corner = gl_VertexID % 4;
	bool u = (gl_VertexID % 8) < 4;
	ivec2 at = ivec2(id % 256, id / 256);
	vec4 a = texelFetch(particleA, at, 0);
	vec4 b = texelFetch(particleB, at, 0);
	vec2 p = a.xy - (u ? vec2(0.0, 0.5) : vec2(0.5, 0.0));
	ivec2 cell = ivec2(floor(p)) + ivec2(corner & 1, corner >> 1);
	vec2 f = fract(p);
	vec2 w = mix(1.0 - f, f, vec2(float(corner & 1), float(corner >> 1)));
	float weight = w.x * w.y;
	value = u ? vec4(weight * a.z, weight, 0.0, 0.0) : vec4(0.0, 0.0, weight * a.w, weight);
	gl_Position = vec4((vec2(cell) + 0.5) / vec2(size + 1) * 2.0 - 1.0, 0.0, 1.0);
	if (b.y != 1.0 || any(lessThan(cell, ivec2(0))) || any(greaterThan(cell, size))) gl_Position = vec4(2.0, 2.0, 0.0, 1.0);
	gl_PointSize = 1.0;
}`;

export const VALUE_FS = `#version 300 es
precision highp float;
in vec4 value;
out vec4 result;
void main() { result = value; }`;

export const CELL_SPLAT_VS = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D particleA;
uniform sampler2D particleB;
uniform ivec2 size;
out vec4 value;
out vec4 flux;
void main() {
	ivec2 at = ivec2(gl_VertexID % 256, gl_VertexID / 256);
	vec4 a = texelFetch(particleA, at, 0);
	vec4 b = texelFetch(particleB, at, 0);
	value = vec4(equal(ivec3(int(b.x)), ivec3(0, 1, 2)), 1.0);
	flux = vec4(a.zw, 0.0, 0.0);
	gl_Position = vec4((floor(a.xy) + 0.5) / vec2(size) * 2.0 - 1.0, 0.0, 1.0);
	if (b.y != 1.0) gl_Position = vec4(2.0, 2.0, 0.0, 1.0);
	gl_PointSize = 1.0;
}`;

export const CELL_SPLAT_FS = `#version 300 es
precision highp float;
in vec4 value;
in vec4 flux;
layout(location=0) out vec4 countOut;
layout(location=1) out vec4 fluxOut;
void main() { countOut = value; fluxOut = flux; }`;

export const NORMALIZE_FS = `#version 300 es
precision highp float;
uniform sampler2D source;
out vec4 result;
void main() {
	vec4 s = texelFetch(source, ivec2(gl_FragCoord.xy), 0);
	result = vec4(s.x / max(s.y, 1e-10), s.z / max(s.w, 1e-10), float(s.y > 1e-8), float(s.w > 1e-8));
}`;

export const FORCE_FS = `#version 300 es
${GRID}
uniform sampler2D source;
uniform float acceleration;
out vec4 result;
void main() {
	ivec2 c = ivec2(gl_FragCoord.xy);
	vec4 v = texelFetch(source, c, 0);
	bool u = !wallU(c) && (liquid(c) || liquid(c - ivec2(1, 0)));
	bool w = !wallV(c) && (liquid(c) || liquid(c - ivec2(0, 1)));
	result = vec4(wallU(c) ? 0.0 : v.x, wallV(c) ? 0.0 : v.y + (w ? acceleration : 0.0), float(u), float(w));
}`;

export const DIVERGENCE_FS = `#version 300 es
${GRID}
uniform sampler2D velocity;
uniform float densityCorrection;
out vec4 result;
void main() {
	ivec2 c = ivec2(gl_FragCoord.xy);
	vec2 v = texelFetch(velocity, c, 0).xy;
	float div = texelFetch(velocity, c + ivec2(1, 0), 0).x - v.x + texelFetch(velocity, c + ivec2(0, 1), 0).y - v.y;
	float density = 0.0;
	float weight = 0.0;
	for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
		ivec2 q = c + ivec2(x, y);
		if (solid(q)) continue;
		float w = float((2 - abs(x)) * (2 - abs(y)));
		density += texelFetch(cells, q, 0).a * w;
		weight += w;
	}
	// A tent filter and dead band prevent one-way expansion from marker sampling noise.
	float excess = max(0.0, density / max(weight, 1.0) * 0.25 - 1.15);
	result = vec4(liquid(c) ? div - densityCorrection * min(excess, 3.0) : 0.0, 0.0, 0.0, 0.0);
}`;

export const PRESSURE_FS = `#version 300 es
${GRID}
uniform sampler2D pressure;
uniform sampler2D divergence;
uniform int parity;
uniform float omega;
out vec4 result;
void main() {
	ivec2 c = ivec2(gl_FragCoord.xy);
	float p = texelFetch(pressure, c, 0).r;
	if (!liquid(c)) { result = vec4(0.0); return; }
	if (((c.x + c.y) & 1) != parity) { result = vec4(p, 0.0, 0.0, 0.0); return; }
	float sum = 0.0;
	float n = 0.0;
	for (int i = 0; i < 4; i++) {
		ivec2 d = i == 0 ? ivec2(-1, 0) : i == 1 ? ivec2(1, 0) : i == 2 ? ivec2(0, -1) : ivec2(0, 1);
		ivec2 q = c + d;
		if (!solid(q)) {
			n += 1.0;
			if (liquid(q)) sum += texelFetch(pressure, q, 0).r;
		}
	}
	float next = (sum - texelFetch(divergence, c, 0).r) / max(n, 1.0);
	result = vec4(mix(p, next, omega), 0.0, 0.0, 0.0);
}`;

export const PROJECT_FS = `#version 300 es
${GRID}
uniform sampler2D source;
uniform sampler2D pressure;
out vec4 result;
float p(ivec2 c) { return liquid(c) ? texelFetch(pressure, c, 0).r : 0.0; }
void main() {
	ivec2 c = ivec2(gl_FragCoord.xy);
	vec4 v = texelFetch(source, c, 0);
	if (wallU(c)) v.x = 0.0;
	else if (v.z > 0.0) v.x -= p(c) - p(c - ivec2(1, 0));
	if (wallV(c)) v.y = 0.0;
	else if (v.w > 0.0) v.y -= p(c) - p(c - ivec2(0, 1));
	result = v;
}`;

export const EXTRAPOLATE_FS = `#version 300 es
${GRID}
uniform sampler2D source;
out vec4 result;
void main() {
	ivec2 c = ivec2(gl_FragCoord.xy);
	vec4 v = texelFetch(source, c, 0);
	vec2 sum = vec2(0.0);
	vec2 n = vec2(0.0);
	for (int i = 0; i < 4; i++) {
		ivec2 q = c + (i == 0 ? ivec2(-1, 0) : i == 1 ? ivec2(1, 0) : i == 2 ? ivec2(0, -1) : ivec2(0, 1));
		if (any(lessThan(q, ivec2(0))) || any(greaterThan(q, size))) continue;
		vec4 s = texelFetch(source, q, 0);
		sum += s.xy * s.zw;
		n += s.zw;
	}
	if (v.z == 0.0 && n.x > 0.0 && !wallU(c)) { v.x = sum.x / n.x; v.z = 1.0; }
	if (v.w == 0.0 && n.y > 0.0 && !wallV(c)) { v.y = sum.y / n.y; v.w = 1.0; }
	result = v;
}`;

export const ADVECT_FS = `#version 300 es
${GRID}
uniform sampler2D particleA;
uniform sampler2D particleB;
uniform sampler2D velocity;
uniform sampler2D oldVelocity;
uniform sampler2D wind;
uniform bool hasWind;
uniform float dt;
uniform float maxSpeed;
uniform float flipRatio;
uniform float acceleration;
uniform int drainCount;
uniform vec4 drainRects[16];
layout(location=0) out vec4 nextA;
layout(location=1) out vec4 nextB;
vec2 sampleGrid(sampler2D grid, vec2 p) {
	vec2 result = vec2(0.0);
	for (int axis = 0; axis < 2; axis++) {
		vec2 q = p - (axis == 0 ? vec2(0.0, 0.5) : vec2(0.5, 0.0));
		ivec2 base = ivec2(floor(q));
		vec2 f = fract(q);
		float sum = 0.0;
		float weight = 0.0;
		for (int i = 0; i < 4; i++) {
			ivec2 d = ivec2(i & 1, i >> 1);
			vec2 w = mix(1.0 - f, f, vec2(d));
			vec4 v = texelFetch(grid, clamp(base + d, ivec2(0), size), 0);
			float k = w.x * w.y * v[axis + 2];
			sum += v[axis] * k;
			weight += k;
		}
		result[axis] = sum / max(weight, 1e-10);
	}
	return result;
}
// Cell-centred bilinear interpolation; wind rows already use the grid's y-down convention.
vec2 sampleWind(vec2 p) {
	ivec2 n = textureSize(wind, 0);
	vec2 q = p / vec2(size) * vec2(n) - 0.5;
	ivec2 b = ivec2(floor(q));
	vec2 f = fract(q);
	vec2 lo = mix(texelFetch(wind, clamp(b, ivec2(0), n - 1), 0).xy,
		texelFetch(wind, clamp(b + ivec2(1, 0), ivec2(0), n - 1), 0).xy, f.x);
	vec2 hi = mix(texelFetch(wind, clamp(b + ivec2(0, 1), ivec2(0), n - 1), 0).xy,
		texelFetch(wind, clamp(b + ivec2(1, 1), ivec2(0), n - 1), 0).xy, f.x);
	return mix(lo, hi, f.y);
}
float airWeight(vec2 p) {
	ivec2 c = ivec2(floor(p));
	ivec2 below = c + ivec2(0, 1);
	// Approximate support, not a surface reconstruction: a falling column below
	// cannot support a pour. Slow dense liquid and solids still shield a pool.
	if (solid(below)) return 0.0;
	float belowVy = sampleGrid(velocity, vec2(below) + 0.5).y;
	if (texelFetch(cells, below, 0).a >= 3.0 && belowVy < 15.0) return 0.0;
	float falling = smoothstep(15.0, 40.0, sampleGrid(velocity, p).y);
	float rho = 0.0, weight = 0.0;
	for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
		ivec2 q = c + ivec2(x, y);
		if (solid(q)) continue;
		float w = float((2 - abs(x)) * (2 - abs(y)));
		rho += w * texelFetch(cells, q, 0).a;
		weight += w;
	}
	return max(falling, 1.0 - smoothstep(0.25, 0.9, rho / max(weight, 1.0) / 4.0));
}
vec2 airDrag(vec2 v, vec2 p) {
	if (!hasWind) return v;
	float a = airWeight(p);
	if (a == 0.0) return v;
	return mix(v, sampleWind(p), 1.0 - exp(-6.0 * a * dt));
}
void main() {
	ivec2 at = ivec2(gl_FragCoord.xy);
	vec4 a = texelFetch(particleA, at, 0);
	vec4 b = texelFetch(particleB, at, 0);
	nextA = a;
	nextB = b;
	if (b.y != 1.0) return;
	vec2 p = clamp(a.xy, vec2(0.001), vec2(size) - 0.001);
	bool pushed = false;
	if (solid(ivec2(floor(p)))) {
		float best = 1e10;
		vec2 target = p;
		ivec2 c = ivec2(floor(p));
		for (int y = -6; y <= 6; y++) for (int x = -6; x <= 6; x++) {
			ivec2 q = c + ivec2(x, y);
			if (solid(q)) continue;
			vec2 candidate = clamp(p, vec2(q) + 0.05, vec2(q) + 0.95);
			float d = dot(candidate - p, candidate - p);
			if (d < best) { best = d; target = candidate; }
		}
		p = target;
		pushed = true;
		a.zw = vec2(0.0);
		if (best == 1e10) { nextA = vec4(p, a.zw); return; }
	}
	vec2 pic = pushed ? vec2(0.0, acceleration) : sampleGrid(velocity, p);
	vec2 flip = pushed ? pic : a.zw + pic - sampleGrid(oldVelocity, p);
	// Weak physical drag damps the plug-flow mode that PIC alone cannot dissipate.
	vec2 v = airDrag(mix(pic, flip, flipRatio) * exp(-0.45 * dt), p);
	float speed = length(v);
	v *= min(1.0, maxSpeed / max(speed, 1e-8));
	vec2 mid = clamp(p + 0.5 * dt * v, vec2(0.001), vec2(size) - 0.001);
	// Correct midpoint transport too; changing only marker velocity delays displacement.
	vec2 transport = pushed ? v : airDrag(sampleGrid(velocity, mid), mid);
	transport *= min(1.0, maxSpeed / max(length(transport), 1e-8));
	vec2 delta = transport * dt;
	int steps = max(1, int(ceil(length(delta) / 0.4)));
	vec2 stride = delta / float(steps);
	for (int i = 0; i < 32; i++) {
		if (i >= steps) break;
		vec2 q = clamp(p + stride, vec2(0.001), vec2(size) - 0.001);
		if (!solid(ivec2(floor(q)))) { p = q; continue; }
		// Axis-separated continuation slides along walls without crossing corners.
		vec2 px = vec2(q.x, p.y);
		if (!solid(ivec2(floor(px)))) p = px;
		else { stride.x = 0.0; v.x = 0.0; }
		vec2 py = vec2(p.x, q.y);
		if (!solid(ivec2(floor(py)))) p = py;
		else { stride.y = 0.0; v.y = 0.0; }
	}
	if (p.x <= 0.001 || p.x >= float(size.x) - 0.001) v.x = 0.0;
	if (p.y <= 0.001 || p.y >= float(size.y) - 0.001) v.y = 0.0;
	for (int i = 0; i < 16; i++) {
		if (i >= drainCount) break;
		vec4 r = drainRects[i];
		vec2 c = floor(p);
		if (all(greaterThanEqual(c, r.xy)) && all(lessThan(c, r.xy + r.zw))) { b.y = 2.0; b.z = float(i); break; }
	}
	nextA = vec4(p, v);
	nextB = b;
}`;

export const SENSOR_FS = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D counts;
uniform sampler2D flux;
uniform vec4 rects[32];
uniform int sensorCount;
layout(location=0) out vec4 countOut;
layout(location=1) out vec4 fluxOut;
void main() {
	int id = int(gl_FragCoord.x);
	countOut = vec4(0.0);
	fluxOut = vec4(0.0);
	if (id >= sensorCount) return;
	ivec4 r = ivec4(rects[id]);
	for (int y = 0; y < 160; y++) {
		if (y >= r.w) break;
		for (int x = 0; x < 256; x++) {
			if (x >= r.z) break;
			ivec2 c = r.xy + ivec2(x, y);
			countOut += texelFetch(counts, c, 0);
			fluxOut += texelFetch(flux, c, 0);
		}
	}
}`;

export const TALLY_VS = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D particleA;
uniform sampler2D particleB;
out vec4 value;
void main() {
	ivec2 at = ivec2(gl_VertexID % 256, gl_VertexID / 256);
	vec4 a = texelFetch(particleA, at, 0);
	vec4 b = texelFetch(particleB, at, 0);
	int x = b.y == 2.0 ? int(b.z) + 1 : 0;
	value = vec4(equal(ivec3(int(b.x)), ivec3(0, 1, 2)), b.y == 1.0 ? length(a.zw) : 0.0);
	gl_Position = vec4((float(x) + 0.5) / 17.0 * 2.0 - 1.0, 0.0, 0.0, 1.0);
	if (b.y == 0.0) gl_Position = vec4(2.0, 2.0, 0.0, 1.0);
	gl_PointSize = 1.0;
}`;

export const OCCUPANCY_FS = `#version 300 es
precision highp float;
uniform sampler2D counts;
out vec4 result;
void main() { result = vec4(min(255.0, texelFetch(counts, ivec2(gl_FragCoord.xy), 0).a) / 255.0, 0.0, 0.0, 1.0); }`;

export const DENSITY_VS = `#version 300 es
${GRID}
uniform sampler2D particleA;
uniform sampler2D particleB;
uniform vec2 sceneSize;
uniform vec2 imageSize;
out vec4 value;
out vec2 centre;
out vec2 streak;
out float radius;
void main() {
	ivec2 at = ivec2(gl_VertexID % 256, gl_VertexID / 256);
	vec4 a = texelFetch(particleA, at, 0);
	vec4 b = texelFetch(particleB, at, 0);
	ivec2 c = clamp(ivec2(floor(a.xy)), ivec2(0), size - 1);
	ivec2 below = c + ivec2(0, 1);
	bool supported = solid(below) || (texelFetch(cells, below, 0).a >= 3.0 && a.w < 15.0);
	float airborne = !supported && (a.w > 15.0 || texelFetch(cells, c, 0).a < 1.5) ? 1.0 : 0.0;
	// The alpha channel retains the original speed signal; excess above RGB density
	// marks airborne coverage. Dense/resting markers keep their exact old footprint.
	value = vec4(equal(ivec3(int(b.x)), ivec3(0, 1, 2)), min(length(a.zw) / 100.0, 1.0) + mix(8.0, 3.0, step(2.0, texelFetch(cells, c, 0).a)) * airborne);
	gl_Position = vec4(a.x / sceneSize.x * 2.0 - 1.0, 1.0 - a.y / sceneSize.y * 2.0, 0.0, 1.0);
	if (b.y != 1.0) gl_Position = vec4(2.0, 2.0, 0.0, 1.0);
	centre = vec2(a.x / sceneSize.x, 1.0 - a.y / sceneSize.y) * imageSize;
	radius = max(2.0, 3.5 * imageSize.y / sceneSize.y) * 0.5;
	// Airborne cross-section is a bead, not the pool's broad density kernel.
	if (airborne > 0.0) radius *= 0.35;
	// Symmetric one-tick capsule closes the fast-fall gaps without temporal history.
	streak = vec2(a.z, -a.w) / sceneSize * imageSize / 60.0 * airborne;
	gl_PointSize = 2.0 * radius + max(abs(streak.x), abs(streak.y));
}`;

export const DENSITY_FS = `#version 300 es
precision highp float;
in vec4 value;
in vec2 centre;
in vec2 streak;
in float radius;
out vec4 result;
void main() {
	// Use true subpixel coordinates, not the rasterizer's snapped gl_PointCoord.
	vec2 p = gl_FragCoord.xy - centre;
	float t = clamp(dot(p, streak) / max(dot(streak, streak), 1e-8), -0.5, 0.5);
	p = (p - streak * t) / radius;
	float r = dot(p, p);
	if (r > 1.0) discard;
	result = value * (exp(-4.0 * r) - exp(-4.0)) * 0.22;
}`;

export const BLUR_FS = `#version 300 es
precision highp float;
uniform sampler2D source;
uniform vec2 direction;
out vec4 result;
void main() {
	vec2 uv = gl_FragCoord.xy / vec2(textureSize(source, 0));
	result = vec4(0.0);
	for (int i = -8; i <= 8; i++) {
		float x = float(i);
		result += texture(source, uv + direction * x) * exp(-0.5 * x * x / 6.25);
	}
	result /= 6.262;
}`;

// Separate from surface density: only slow, connected liquid exchanges display colour.
export const MIXTURE_SEED_FS = `#version 300 es
${GRID}
uniform sampler2D flux;
out vec4 result;
void main() {
	ivec2 c = ivec2(gl_FragCoord.xy);
	result = vec4(0.0);
	if (solid(c)) return;
	vec4 count = vec4(0.0);
	vec2 velocity = vec2(0.0);
	float weight = 0.0;
	for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
		ivec2 n = c + ivec2(x, y);
		if (solid(n) || solid(ivec2(n.x, c.y)) || solid(ivec2(c.x, n.y))) continue;
		float w = float((2 - abs(x)) * (2 - abs(y)));
		count += texelFetch(cells, n, 0) * w;
		velocity += texelFetch(flux, n, 0).xy * w;
		weight += w;
	}
	float speed = length(velocity) / max(count.a, 1e-6);
	float density = count.a / max(weight, 1.0);
	// Empty/spray cells cannot bridge pools; a resting surface remains connected.
	if (density < 0.25) return;
	// Dense submerged flow belongs to the body; only unsupported falling ribbons
	// are excluded. A hard speed cutoff inside a pool exposes the MAC grid.
	ivec2 below = c + ivec2(0, 1);
	vec4 belowCount = solid(below) ? vec4(0.0) : texelFetch(cells, below, 0);
	float belowVy = solid(below) ? 0.0 : texelFetch(flux, below, 0).y / max(belowCount.a, 1e-6);
	float support = solid(below) ? 1.0 : smoothstep(1.0, 3.0, belowCount.a) * (1.0 - smoothstep(10.0, 25.0, belowVy));
	float slow = mix(1.0 - smoothstep(15.0, 35.0, speed), 1.0, support);
	result = vec4(count.rgb / max(count.a, 1e-6), density * slow);
}`;

export const MIXTURE_BLUR_FS = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D source;
uniform ivec2 direction;
out vec4 result;
void main() {
	ivec2 c = ivec2(gl_FragCoord.xy);
	ivec2 size = textureSize(source, 0);
	result = vec4(0.0);
	if (texelFetch(source, c, 0).a < 0.25) return;
	vec4 local = texelFetch(source, c, 0);
	result = vec4(local.rgb * local.a, local.a);
	float weight = local.a;
	for (int side = -1; side <= 1; side += 2) {
		for (int i = 1; i <= 24; i++) {
			ivec2 n = c + direction * (side * i);
			if (any(lessThan(n, ivec2(0))) || any(greaterThanEqual(n, size))) break;
			// Walk every intervening cell: wide taps must never jump a wall or air gap.
			vec4 neighbour = texelFetch(source, n, 0);
			if (neighbour.a < 0.25) break;
			result.rgb += neighbour.rgb * neighbour.a;
			weight += neighbour.a;
		}
	}
	result.rgb /= weight;
	// Preserve eligibility exactly; only the RGB fraction travels between cells.
	result.a = texelFetch(source, c, 0).a;
}`;

export const COMPOSITE_FS = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D density;
uniform sampler2D mixture;
uniform sampler2D palette;
uniform sampler2D terrain;
uniform vec2 imageSize;
uniform vec2 sceneSize;
uniform float time;
uniform float glow;
out vec4 result;
float total(vec2 uv) { return dot(texture(density, uv).rgb, vec3(1.0)); }
vec3 srgb(vec3 c) { return mix(12.92 * c, 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c)); }
void main() {
	vec2 uv = gl_FragCoord.xy / imageSize;
	ivec2 cell = ivec2(vec2(uv.x, 1.0 - uv.y) * sceneSize);
	if (texelFetch(terrain, clamp(cell, ivec2(0), ivec2(sceneSize) - 1), 0).r > 0.0) { result = vec4(0.0); return; }
	vec4 d = texture(density, uv);
	float amount = dot(d.rgb, vec3(1.0));
	float edge = smoothstep(0.38, 0.67, amount);
	// Only the airborne excess supplies a floor: pool/rest density is unchanged.
	float airborneCoverage = smoothstep(0.15, 0.4, max(0.0, d.a - amount));
	edge = max(edge, airborneCoverage);
	if (edge < 0.001) { result = vec4(0.0); return; }
	vec2 texel = 1.0 / vec2(textureSize(density, 0));
	vec2 gradient = vec2(total(uv + vec2(texel.x, 0.0)) - total(uv - vec2(texel.x, 0.0)), total(uv + vec2(0.0, texel.y)) - total(uv - vec2(0.0, texel.y)));
	vec3 normal = normalize(vec3(-gradient * 3.0, 0.28));
	vec3 weights = d.rgb / max(amount, 1e-6);
	vec4 mixed = texture(mixture, vec2(uv.x, 1.0 - uv.y));
	float mixing = smoothstep(0.1, 0.8, mixed.a);
	weights = mix(weights, mixed.rgb / max(dot(mixed.rgb, vec3(1.0)), 1e-6), mixing);
	vec2 lut = (weights.yz * 63.0 + 0.5) / 64.0;
	vec3 pigment = texture(palette, lut).rgb;
	float thickness = smoothstep(0.6, 1.25, amount);
	// A short upward optical probe estimates depth beneath the meniscus without
	// reading simulation state or adding view-dependent colour to the KM mixture.
	float depth = 0.0;
	for (int i = 1; i <= 12; i++) {
		float reach = float(i) * 1.1;
		depth += smoothstep(0.2, 1.1, total(uv + vec2(0.0, reach / sceneSize.y)));
	}
	depth /= 12.0;
	// Beer–Lambert absorption changes depth, never the species fractions supplied to KM.
	vec3 absorption = -log(clamp(pigment, vec3(0.025), vec3(0.98)));
	vec3 colour = exp(-absorption * mix(0.88, 1.72, depth) * mix(0.96, 1.04, thickness));
	float luma = dot(colour, vec3(0.2126, 0.7152, 0.0722));
	colour = max(vec3(0.0), mix(vec3(luma), colour, 1.12));
	float up = max(0.0, -gradient.y / max(length(gradient), 1e-5));
	float distancePx = abs(amount - 0.55) / max(length(gradient) * 0.5, 0.005);
	float meniscus = exp(-distancePx * distancePx / 3.0) * up;
	float shoulder = exp(-distancePx * 0.45) * up * (1.0 - thickness);
	float specular = pow(max(dot(normal, normalize(vec3(-0.25, 0.75, 1.0))), 0.0), 48.0);
	float wave = sin(uv.x * sceneSize.x * 0.22 + time * 1.7 + sin(uv.y * 9.0 + time)) * 0.5 + 0.5;
	colour += vec3(0.70, 0.90, 0.92) * meniscus * 0.95;
	colour += vec3(0.08, 0.13, 0.14) * shoulder;
	float reflection = (1.0 - depth) * exp(-pow((depth - 0.35) * 5.0, 2.0));
	colour += vec3(0.09, 0.15, 0.16) * reflection * (0.55 + wave * 0.45);
	colour += vec3(0.32) * specular * (0.35 + wave * 0.65) * (1.0 - thickness);
	colour += pigment * 0.035 * min(d.a, amount) / max(amount, 0.1) * wave;
	colour = mix(colour, colour * 1.25, glow);
	float alpha = edge * mix(0.82, 0.98, thickness);
	result = vec4(clamp(srgb(colour), 0.0, 1.0) * alpha, alpha);
}`;
