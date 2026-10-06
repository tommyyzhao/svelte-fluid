/*
 * GLSL ES 3.00 for PigmentEngine (ADR-0090). Raw strings only; compilation
 * goes through the gl-host program cache. Units: velocity in sim texels per
 * step, water depth in "brush loads" (1 = fully flooded), pigment in
 * unit-layer concentrations. Resists arrive as a jump-flood signed distance
 * (ADR-0084) in mask texels, negative inside the dry region.
 */

/** Shared quad (gl-host): position at location 0. */
export const VERT = `#version 300 es
layout(location = 0) in vec2 aPosition;
out vec2 vUv;
void main() {
	vUv = aPosition * 0.5 + 0.5;
	gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

const HEAD = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
uniform vec2 texel;
`;

/**
 * Resist coverage from the SDF. uResistScale = output texels per mask texel,
 * so the edge ramp is one output texel: a sim cell in the solver, a device
 * pixel on screen.
 */
const RESIST = `
uniform sampler2D uResist;
uniform float uResistScale;
float resistAt(vec2 uv) { return clamp(0.5 - texture(uResist, uv).r * uResistScale, 0.0, 1.0); }
`;

const NOISE = `
float hash12(vec2 p) {
	vec3 p3 = fract(vec3(p.xyx) * 0.1031);
	p3 += dot(p3, p3.yzx + 33.33);
	return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	vec2 u = f * f * (3.0 - 2.0 * f);
	return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
	float s = 0.0;
	float a = 0.5;
	for (int i = 0; i < 4; i++) {
		s += a * vnoise(p);
		p = mat2(1.6, 1.2, -1.2, 1.6) * p + 17.0;
		a *= 0.5;
	}
	return s / 0.9375;
}
// Cold-press paper: a rounded tooth (felt marks, ~7 CSS px) plus short, fine
// fibres. Each fibre layer's direction wanders with position (domain-warped
// angle) so no family of parallel strokes forms; a fixed angle reads as hatching.
float paperHeight(vec2 css, float seed) {
	float tooth = fbm(css / 7.0 + seed);
	float fibres = 0.0;
	for (int k = 0; k < 4; k++) {
		float th = 6.2832 * vnoise(css / 23.0 + float(k) * 7.3 + seed);
		vec2 dir = vec2(cos(th), sin(th));
		vec2 q = vec2(dot(css, dir), dot(css, vec2(-dir.y, dir.x)));
		float n = vnoise(q * vec2(0.16, 1.4) + float(k) * 31.7 + seed);
		fibres += pow(1.0 - abs(2.0 * n - 1.0), 14.0);
	}
	return clamp(0.86 * tooth + 0.05 * fibres + 0.05, 0.0, 1.0);
}
`;

/**
 * Paper texture: r = height, gb = slope (encoded), a = capillary permeability.
 * Sampled in CSS px from the top-left so the grain stays put under resize.
 */
export const PAPER = `${HEAD}${NOISE}
uniform vec2 cssPerTexel;
uniform float cssHeight;
uniform float seed;
out vec4 o;
void main() {
	vec2 css = vec2(gl_FragCoord.x * cssPerTexel.x, cssHeight - gl_FragCoord.y * cssPerTexel.y);
	float e = max(cssPerTexel.x, 0.5);
	float h = paperHeight(css, seed);
	float hx = paperHeight(css + vec2(e, 0.0), seed);
	float hy = paperHeight(css - vec2(0.0, e), seed);
	vec2 slope = vec2(hx - h, hy - h) / e;
	// Sizing is uneven at the felt-mark scale: water feathers along clumps.
	float perm = 0.35 + 1.3 * fbm(css / 13.0 + seed * 3.1);
	o = vec4(h, clamp(slope * 0.5 + 0.5, 0.0, 1.0), clamp(perm / 1.7, 0.0, 1.0));
}`;

export const MAX_SPLATS = 32;

/** Adds brush water, pigment and drag impulse. MRT: velocity, water, suspended. */
export const SPLAT = `${HEAD}${RESIST}
uniform sampler2D uVel, uWater, uSusp, uPaper;
uniform vec4 uA[${MAX_SPLATS}]; // x, y (uv), radius (uv y), water
uniform vec4 uB[${MAX_SPLATS}]; // pigment per channel
uniform vec4 uC[${MAX_SPLATS}]; // vx, vy (texels/step), hardness, -
uniform int uCount;
uniform float uAspect;
layout(location = 0) out vec2 oVel;
layout(location = 1) out float oWater;
layout(location = 2) out vec4 oSusp;
void main() {
	vec2 vel = texture(uVel, vUv).xy;
	float water = texture(uWater, vUv).r;
	vec4 susp = texture(uSusp, vUv);
	float h = texture(uPaper, vUv).r;
	float free = 1.0 - resistAt(vUv);
	for (int i = 0; i < ${MAX_SPLATS}; i++) {
		if (i >= uCount) break;
		vec2 d = vUv - uA[i].xy;
		d.x *= uAspect;
		// Bristles leave a ragged edge: the paper tooth catches the brush.
		float r = length(d) / (uA[i].z * (0.9 + 0.25 * h));
		float f = (1.0 - smoothstep(uC[i].z, 1.0, r)) * free;
		vel += uC[i].xy * f;
		water += uA[i].w * f;
		susp += uB[i] * f;
	}
	oVel = vel;
	oWater = min(water, 1.6);
	oSusp = susp;
}`;

export const ADVECT_VEL = `${HEAD}${RESIST}
uniform sampler2D uVel, uWater;
uniform float uDamp;
out vec2 o;
void main() {
	vec2 v = texture(uVel, vUv).xy;
	vec2 a = texture(uVel, vUv - v * texel).xy * uDamp;
	float w = texture(uWater, vUv).r;
	// Water only flows where the sheet is wet; dry paper is a no-slip floor.
	o = a * smoothstep(0.03, 0.2, w) * (1.0 - resistAt(vUv));
}`;

export const CURL = `${HEAD}
uniform sampler2D uVel;
out float o;
void main() {
	float L = texture(uVel, vUv - vec2(texel.x, 0.0)).y;
	float R = texture(uVel, vUv + vec2(texel.x, 0.0)).y;
	float B = texture(uVel, vUv - vec2(0.0, texel.y)).x;
	float T = texture(uVel, vUv + vec2(0.0, texel.y)).x;
	o = 0.5 * (R - L - T + B);
}`;

export const VORTICITY = `${HEAD}
uniform sampler2D uVel, uCurl;
uniform float uStrength;
out vec2 o;
void main() {
	float L = texture(uCurl, vUv - vec2(texel.x, 0.0)).r;
	float R = texture(uCurl, vUv + vec2(texel.x, 0.0)).r;
	float B = texture(uCurl, vUv - vec2(0.0, texel.y)).r;
	float T = texture(uCurl, vUv + vec2(0.0, texel.y)).r;
	float C = texture(uCurl, vUv).r;
	vec2 f = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
	f = f / (length(f) + 1e-4) * uStrength * C;
	f.y = -f.y;
	o = texture(uVel, vUv).xy + f;
}`;

export const DIVERGENCE = `${HEAD}
uniform sampler2D uVel;
out float o;
void main() {
	float L = texture(uVel, vUv - vec2(texel.x, 0.0)).x;
	float R = texture(uVel, vUv + vec2(texel.x, 0.0)).x;
	float B = texture(uVel, vUv - vec2(0.0, texel.y)).y;
	float T = texture(uVel, vUv + vec2(0.0, texel.y)).y;
	o = 0.5 * (R - L + T - B);
}`;

export const JACOBI = `${HEAD}
uniform sampler2D uP, uDiv;
uniform float uScale;
out float o;
void main() {
	float L = texture(uP, vUv - vec2(texel.x, 0.0)).r;
	float R = texture(uP, vUv + vec2(texel.x, 0.0)).r;
	float B = texture(uP, vUv - vec2(0.0, texel.y)).r;
	float T = texture(uP, vUv + vec2(0.0, texel.y)).r;
	o = 0.25 * ((L + R + B + T) * uScale - texture(uDiv, vUv).r);
}`;

/** Two iterations; clamp inner positions to reproduce the intermediate texture's edge. */
export const JACOBI2 = `${HEAD}
uniform sampler2D uP, uDiv;
uniform float uScale;
out float o;
float inner(vec2 uv) {
	float L = texture(uP, uv - vec2(texel.x, 0.0)).r;
	float R = texture(uP, uv + vec2(texel.x, 0.0)).r;
	float B = texture(uP, uv - vec2(0.0, texel.y)).r;
	float T = texture(uP, uv + vec2(0.0, texel.y)).r;
	return 0.25 * ((L + R + B + T) * uScale - texture(uDiv, uv).r);
}
vec2 center(vec2 uv) { return clamp(uv, 0.5 * texel, vec2(1.0) - 0.5 * texel); }
void main() {
	float L = inner(center(vUv - vec2(texel.x, 0.0)));
	float R = inner(center(vUv + vec2(texel.x, 0.0)));
	float B = inner(center(vUv - vec2(0.0, texel.y)));
	float T = inner(center(vUv + vec2(0.0, texel.y)));
	o = 0.25 * (L + R + B + T - texture(uDiv, vUv).r);
}`;

/*
 * Projection plus Curtis et al.'s outward flow: subtracting eta * grad(water)
 * pushes water from the thick centre of a wash toward its thin, drying rim.
 * The pigment it carries is what darkens watercolour edges.
 */
export const GRADIENT = `${HEAD}
uniform sampler2D uP, uVel, uWater;
uniform float uEta;
out vec2 o;
void main() {
	vec2 dx = vec2(texel.x, 0.0);
	vec2 dy = vec2(0.0, texel.y);
	vec2 gp = 0.5 * vec2(texture(uP, vUv + dx).r - texture(uP, vUv - dx).r, texture(uP, vUv + dy).r - texture(uP, vUv - dy).r);
	vec2 gw = 0.5 * vec2(texture(uWater, vUv + dx).r - texture(uWater, vUv - dx).r, texture(uWater, vUv + dy).r - texture(uWater, vUv - dy).r);
	float w = texture(uWater, vUv).r;
	o = (texture(uVel, vUv).xy - gp - uEta * gw) * smoothstep(0.03, 0.2, w);
}`;

/*
 * Water and pigment transport, MRT: water, suspended, deposited.
 * 1. Semi-Lagrangian advection of water and suspended pigment.
 * 2. Capillary spread: water above the paper's holding capacity diffuses through
 *    fibres at a rate set by local permeability; suspended pigment rides along at
 *    the upwind concentration, so blooms push pigment to their fronts.
 * 3. Evaporation, uniform per area, so thin rims dry first.
 * 4. Adsorption (wet -> deposited): pigment settles at a per-pigment rate, faster
 *    into paper valleys for granulating pigments, and all of it lands as the cell
 *    dries. Rewetting lifts a fraction of non-staining deposits back into
 *    suspension.
 */
export const TRANSPORT = `${HEAD}${RESIST}
uniform sampler2D uVel, uWater, uSusp, uDep, uPaper;
uniform float uDiffuse, uHold, uPin, uEvap, uEdgeEvap, uWetDry;
uniform vec4 uSettle, uGran, uLift;
layout(location = 0) out float oWater;
layout(location = 1) out vec4 oSusp;
layout(location = 2) out vec4 oDep;

float wAt(vec2 uv) { return texture(uWater, uv).r; }

void main() {
	vec2 v = texture(uVel, vUv).xy;
	vec2 back = vUv - v * texel;
	float w = texture(uWater, back).r;
	vec4 g = texture(uSusp, back);

	float wc = wAt(vUv);
	vec4 gc = texture(uSusp, vUv);
	vec4 pc = texture(uPaper, vUv);
	float rc = resistAt(vUv);
	vec4 cc = gc / max(wc, 0.02);
	float dw = 0.0;
	vec4 dg = vec4(0.0);
	// Isotropic 8-neighbour stencil (axis 4 : diagonal 1, same total rate as
	// the 4-neighbour one). With only axis neighbours, a diagonal cell sees
	// two wet neighbours and the pinned front outruns itself along diagonals:
	// blooms dry as squares.
	vec2 offs[8] = vec2[8](vec2(1.0, 0.0), vec2(-1.0, 0.0), vec2(0.0, 1.0), vec2(0.0, -1.0),
		vec2(1.0, 1.0), vec2(-1.0, 1.0), vec2(1.0, -1.0), vec2(-1.0, -1.0));
	for (int i = 0; i < 8; i++) {
		vec2 uv = vUv + offs[i] * texel;
		float k = i < 4 ? 0.8 : 0.2;
		float wn = wAt(uv);
		float perm = 0.5 * (pc.a + texture(uPaper, uv).a) * (1.0 - resistAt(uv)) * (1.0 - rc);
		// Contact-line pinning: water only invades dry paper under a real head
		// (uPin); inside the wet region it levels above the fibres' hold.
		float thr = min(wn, wc) < 0.005 ? uPin : uHold;
		float F = k * uDiffuse * perm * (max(wn - thr, 0.0) - max(wc - thr, 0.0));
		vec4 gn = texture(uSusp, uv);
		dw += F;
		dg += F > 0.0 ? F * gn / max(wn, 0.02) : F * cc;
	}
	// Deegan's coffee ring: evaporation flux peaks at a pinned contact line, so
	// cells near dry paper (or a resist) lose water faster; the interior levels
	// toward them and the pigment it carries stays at the rim.
	float edge = 0.0;
	for (int i = 0; i < 8; i++) {
		float a = float(i) * 0.7854;
		vec2 uv = vUv + 2.5 * texel * vec2(cos(a), sin(a));
		edge += max(step(wAt(uv), 0.005), resistAt(uv));
	}
	float evap = uEvap * (1.0 + uEdgeEvap * edge * 0.125);
	float wn = max(w + dw - evap, 0.0) * (1.0 - step(0.5, rc));
	g = max(g + dg, 0.0);

	vec4 d = texture(uDep, vUv);
	float h = pc.r;
	float dryness = 1.0 - smoothstep(0.0, uWetDry, wn);
	vec4 rate = clamp(uSettle * (1.0 + uGran * (0.5 - h) * 1.5) + dryness, 0.0, 1.0);
	vec4 down = g * rate;
	vec4 up = d * uLift * smoothstep(uWetDry, 0.5, wn);
	oWater = wn;
	oSusp = g - down + up;
	oDep = d + down - up;
}`;

/**
 * Resize resample in CSS space, anchored top-left (DOM content is): texels
 * that were outside the old surface come back empty, nothing stretches.
 */
export const RESAMPLE = `${HEAD}
uniform sampler2D uSrc;
uniform vec2 uScale, uOffset;
out vec4 o;
void main() {
	vec2 uv = vUv * uScale + uOffset;
	o = any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0))) ? vec4(0.0) : texture(uSrc, uv);
}`;

/*
 * Display: Kubelka–Munk in 12 spectral bands (3 x vec4). Deposited pigment is a
 * layer on the paper; the wet suspended pigment is a second layer glazed over
 * it, so a fresh wash over a dry one is a true K–M stack. Dried washes merge
 * into one deposit: for low-scattering watercolour the stacked and mixed
 * reflectances coincide (absorbances add), so nothing is lost.
 */
export const DISPLAY = `${HEAD}${RESIST}
uniform sampler2D uSusp, uDep, uWater, uPaperHi;
uniform vec4 uK[12];
uniform vec4 uS;
uniform vec4 uGran;
uniform vec4 uPaperR[3];
uniform vec4 uCmf[9];
uniform mat3 uXyzToRgb;
uniform vec3 uWhite; // per-channel correction: exact paper token / K–M paper
uniform vec2 uSimTexel;
out vec4 o;

const float WET_DARKEN = 0.06;
const float RELIEF = 0.07;
const float SHEEN = 0.05;

vec4 overPaper(vec4 K, float S, vec4 Rg) {
	float s = max(S, 1e-4);
	vec4 a = 1.0 + K / s;
	vec4 b = max(sqrt(a * a - 1.0), 1e-3);
	vec4 e = exp(-2.0 * b * s);
	vec4 t = (1.0 - e) / (1.0 + e);
	vec4 d = a * t + b;
	vec4 R = t / d;
	vec4 T = 2.0 * b * sqrt(e) / ((1.0 + e) * d);
	return R + T * T * Rg / (1.0 - R * Rg);
}

vec4 bandK(vec4 c, int j) {
	return c.x * uK[j] + c.y * uK[3 + j] + c.z * uK[6 + j] + c.w * uK[9 + j];
}

// Bicubic B-spline from 4 bilinear taps: the sim grid is coarser than the
// screen, and bilinear upsampling of concentration shows diamond artefacts.
vec4 cubic(sampler2D t, vec2 uv) {
	vec2 p = uv / uSimTexel - 0.5;
	vec2 f = fract(p);
	vec2 i = p - f;
	vec2 f2 = f * f;
	vec2 f3 = f2 * f;
	vec2 w0 = (1.0 - 3.0 * f + 3.0 * f2 - f3) / 6.0;
	vec2 w1 = (4.0 - 6.0 * f2 + 3.0 * f3) / 6.0;
	vec2 w2 = (1.0 + 3.0 * f + 3.0 * f2 - 3.0 * f3) / 6.0;
	vec2 w3 = f3 / 6.0;
	vec2 g0 = w0 + w1;
	vec2 g1 = w2 + w3;
	vec2 h0 = (i - 0.5 + w1 / g0) * uSimTexel;
	vec2 h1 = (i + 1.5 + w3 / g1) * uSimTexel;
	return g0.y * (g0.x * texture(t, h0) + g1.x * texture(t, vec2(h1.x, h0.y))) +
		g1.y * (g0.x * texture(t, vec2(h0.x, h1.y)) + g1.x * texture(t, h1));
}

float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }

void main() {
	// A resist edge is one device pixel wide whatever the sim grid: the bicubic
	// footprint must not bleed pigment under a dry control.
	float open = 1.0 - resistAt(vUv);
	vec4 gs = max(cubic(uSusp, vUv), 0.0) * open;
	vec4 gd = max(cubic(uDep, vUv), 0.0) * open;
	float w = max(cubic(uWater, vUv).r, 0.0) * open;
	vec4 ph = texture(uPaperHi, vUv);
	float h = ph.r;
	vec2 slope = ph.gb * 2.0 - 1.0;

	// Granulation: settled grains sit in the valleys of the tooth.
	vec4 gde = gd * clamp(1.0 + uGran * (0.5 - h) * 1.6, 0.45, 1.8);
	// Water fills the air gaps between fibres, cutting surface scatter: wet paper
	// reads slightly darker, and so does the pigment lying on it.
	float wet = smoothstep(0.02, 0.35, w);
	float paperScale = 1.0 - WET_DARKEN * wet;
	float Sd = dot(gde, uS);
	float Ss = dot(gs, uS);
	vec3 xyz = vec3(0.0);
	for (int j = 0; j < 3; j++) {
		vec4 Rd = overPaper(bandK(gde, j), Sd, uPaperR[j] * paperScale);
		vec4 R = overPaper(bandK(gs, j), Ss, Rd);
		xyz += vec3(dot(uCmf[j], R), dot(uCmf[3 + j], R), dot(uCmf[6 + j], R));
	}
	vec3 lin = max(uXyzToRgb * xyz, 0.0) * uWhite;

	// One soft raking light from the upper left over the paper relief.
	vec3 L = normalize(vec3(-0.55, 0.55, 0.62));
	vec3 n = normalize(vec3(-slope * 0.35, 1.0));
	lin *= 1.0 + RELIEF * (dot(n, L) - L.z) / L.z;
	// Standing water: a faint sheen where the meniscus tilts toward the light.
	vec2 gw = vec2(texture(uWater, vUv + vec2(uSimTexel.x, 0.0)).r - texture(uWater, vUv - vec2(uSimTexel.x, 0.0)).r,
		texture(uWater, vUv + vec2(0.0, uSimTexel.y)).r - texture(uWater, vUv - vec2(0.0, uSimTexel.y)).r);
	vec3 nw = normalize(vec3(-gw * 3.0 - slope * 0.15 * wet, 1.0));
	float spec = pow(max(dot(nw, normalize(L + vec3(0.0, 0.0, 1.0))), 0.0), 60.0);
	lin += SHEEN * wet * spec;

	vec3 c = clamp(lin, 0.0, 1.0);
	vec3 srgb = mix(12.92 * c, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
	srgb += (ign(gl_FragCoord.xy) - 0.5) / 255.0;
	o = vec4(srgb, 1.0);
}`;
