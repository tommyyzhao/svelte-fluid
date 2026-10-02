/*
 * GLSL ES 3.00 for the height-field surface (ADR-0091). Raw strings only.
 * Coordinates: CSS px, x right, y UP (GL). Field row 0 is the canvas bottom.
 * SDF textures hold signed distance in device px (negative inside, ADR-0084).
 */
import { SRGB_TRANSFER_GLSL } from '../shaders.js';

export const SURFACE_VS = /* glsl */ `#version 300 es
layout(location = 0) in vec2 aPosition;
out vec2 vUv;
void main () {
	vUv = aPosition * 0.5 + 0.5;
	gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

const SHAPES = /* glsl */ `
float sdRoundRect (vec2 p, vec2 b, float r) {
	r = min(r, min(b.x, b.y));
	vec2 q = abs(p) - b + r;
	return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
`;

/** Coverage mask of the control: 1 inside the rounded rect, one device px AA. JFA input. */
export const SURFACE_MASK_FS = /* glsl */ `#version 300 es
precision highp float;
${SHAPES}
uniform vec4 uRect;   // centre, half extents (device px)
uniform float uRadius; // device px
out vec4 outColor;
void main () {
	float d = sdRoundRect(gl_FragCoord.xy - uRect.xy, uRect.zw, uRadius);
	outColor = vec4(clamp(0.5 - d, 0.0, 1.0), 0.0, 0.0, 1.0);
}
`;

/**
 * One leapfrog substep, identical to waveStep() in wave.ts plus forcing.
 * State: r = h, g = h_prev (dynamic deviation), b = displayed height
 * (h + lens equilibrium), all CSS px.
 */
export const SURFACE_STEP_FS = /* glsl */ `#version 300 es
precision highp float;
precision highp int;
${SHAPES}
uniform sampler2D uState;
uniform sampler2D uSdf;
uniform vec2 uCanvas;          // CSS px
uniform float uCell;           // CSS px per cell
uniform float uDpr;
uniform vec4 uCoef;            // r², γ, ν, m²
uniform vec4 uImpulse[8];      // x, y, amplitude, sigma (CSS px)
uniform int uImpulseCount;
uniform vec4 uLens;            // centre, half extents (CSS px)
uniform vec4 uLensOld;
uniform vec3 uLensShape;       // corner radius, amplitude, falloff (CSS px)
uniform float uInject;         // fraction of the equilibrium move released as a free wave
uniform float uStill;          // reduced motion or settle: drop the dynamic part, keep the lens
out vec4 outState;

vec2 cellPx (ivec2 c) { return (vec2(c) + 0.5) * uCell; }
float sdf (vec2 p) { return texture(uSdf, p / uCanvas).r / uDpr; }
bool inside (ivec2 c, ivec2 n) {
	return c.x >= 0 && c.y >= 0 && c.x < n.x && c.y < n.y && sdf(cellPx(c)) < 0.0;
}
float lens (vec2 p, vec4 l) {
	if (uLensShape.y == 0.0 || l.z <= 0.0) return 0.0;
	// C∞ edge (mirror: lensProfile() in wave.ts). smoothstep is only C¹: its curvature
	// jumps at the band ends and the caustic term drew that jump as a seam. Scale
	// f/1.5 keeps smoothstep's peak slope (0.75·A/f), so the resting lens catches
	// the same light as before.
	return uLensShape.y * 0.5 * (1.0 - tanh(sdRoundRect(p - l.xy, l.zw, uLensShape.x) / (uLensShape.z / 1.5)));
}
vec2 state (ivec2 c) {
	vec2 s = texelFetch(uState, c, 0).rg;
	// Moving the equilibrium leaves the liquid where it was: the residual is a free wave.
	if (uInject != 0.0) s -= uInject * (lens(cellPx(c), uLens) - lens(cellPx(c), uLensOld));
	return s;
}

void main () {
	ivec2 c = ivec2(gl_FragCoord.xy);
	ivec2 n = textureSize(uState, 0);
	vec2 p = cellPx(c);
	// Reduced motion, or the frame that ends a settle: the equilibrium alone.
	if (uStill > 0.5) { outState = vec4(0.0, 0.0, inside(c, n) ? lens(p, uLens) : 0.0, 0.0); return; }
	if (!inside(c, n)) {
		// Outside: extrapolate the displayed height from the nearest interior cell so
		// the composite and the curvature kernel see a Neumann wall, not a cliff to zero.
		float d = sdf(p);
		vec2 e = vec2(uCell, 0.0);
		vec2 g = vec2(sdf(p + e.xy) - sdf(p - e.xy), sdf(p + e.yx) - sdf(p - e.yx));
		vec2 q = p - normalize(g + 1e-6) * (d + 0.75 * uCell);
		ivec2 qc = clamp(ivec2(floor(q / uCell)), ivec2(0), n - 1);
		outState = vec4(0.0, 0.0, d < 6.0 * uCell ? texelFetch(uState, qc, 0).b : 0.0, 0.0);
		return;
	}
	vec2 s = state(c);
	vec2 lap = vec2(0.0);
	ivec2 nb[4] = ivec2[4](ivec2(1, 0), ivec2(-1, 0), ivec2(0, 1), ivec2(0, -1));
	for (int i = 0; i < 4; i++) {
		ivec2 q = c + nb[i];
		// Mirror ghost cell: reflective (Neumann) wall on the control boundary.
		lap += (inside(q, n) ? state(q) : s) - s;
	}
	float h = s.r;
	float hp = s.g;
	float next = (2.0 * h - (1.0 - uCoef.y) * hp + uCoef.x * lap.r + uCoef.z * (lap.r - lap.g) - uCoef.w * h) / (1.0 + uCoef.y);
	// Impulses are displacement with zero velocity: both time levels move.
	float imp = 0.0;
	for (int i = 0; i < 8; i++) {
		if (i >= uImpulseCount) break;
		vec2 d = p - uImpulse[i].xy;
		imp += uImpulse[i].z * exp(-dot(d, d) / (2.0 * uImpulse[i].w * uImpulse[i].w));
	}
	outState = vec4(next + imp, h + imp, next + imp + lens(p, uLens), 0.0);
}
`;

/**
 * Hessian (xx, xy, yy; CSS px⁻¹) of the displayed height smoothed by a Gaussian
 * of σ = 2 cells, at cell resolution. Caustics read this, not the B-spline's
 * own second derivative: focusing then follows the wave scale, and 2–4-cell
 * residue (which the caustic depth amplifies ~9×) cannot mottle the floor.
 */
export const SURFACE_CURVATURE_FS = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D uState;
uniform float uCell;
out vec4 outCurv;
const float S2 = 4.0; // σ², cells²
void main () {
	ivec2 c = ivec2(gl_FragCoord.xy);
	ivec2 n = textureSize(uState, 0);
	float h0 = texelFetch(uState, c, 0).b;
	vec3 hess = vec3(0.0);
	for (int j = -6; j <= 6; j++) {
		for (int i = -6; i <= 6; i++) {
			float x = float(i);
			float y = float(j);
			// Relative to the centre: a constant field has exactly zero curvature
			// even though the truncated kernel does not sum to zero.
			float v = texelFetch(uState, clamp(c + ivec2(i, j), ivec2(0), n - 1), 0).b - h0;
			hess += v * exp(-(x * x + y * y) / (2.0 * S2)) * vec3(x * x - S2, x * y, y * y - S2);
		}
	}
	// ∂²G = G·(x² − σ²)/σ⁴ and G·xy/σ⁴ with G = exp(−r²/2σ²)/(2πσ²).
	outCurv = vec4(hess / (6.2831853 * S2 * S2 * S2 * uCell * uCell), 0.0);
}
`;

/** Bilinear resample of the old field onto a new grid (resize keeps the liquid). */
export const SURFACE_RESAMPLE_FS = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D uState;
uniform float uCell;     // new cell, CSS px
uniform float uOldCell;
out vec4 outState;
void main () {
	ivec2 n = textureSize(uState, 0);
	vec2 g = gl_FragCoord.xy * uCell / uOldCell - 0.5;
	ivec2 i = ivec2(floor(g));
	vec2 t = g - floor(g);
	vec4 a = texelFetch(uState, clamp(i, ivec2(0), n - 1), 0);
	vec4 b = texelFetch(uState, clamp(i + ivec2(1, 0), ivec2(0), n - 1), 0);
	vec4 c = texelFetch(uState, clamp(i + ivec2(0, 1), ivec2(0), n - 1), 0);
	vec4 d = texelFetch(uState, clamp(i + ivec2(1, 1), ivec2(0), n - 1), 0);
	outState = mix(mix(a, b, t.x), mix(c, d, t.x), t.y);
}
`;

/**
 * Display-resolution optics. Height is reconstructed with a cubic B-spline
 * (C² across cells, so normals and caustics carry no grid facets), the wall
 * meniscus comes from the JFA SDF, light is Schlick-Fresnel reflection of a
 * studio with hard-edged area lights, caustics are the area ratio of the
 * refracted grid (Jacobian of x + D·k·∇h).
 */
export const SURFACE_COMPOSITE_FS = /* glsl */ `#version 300 es
precision highp float;
precision highp int;
${SRGB_TRANSFER_GLSL}
uniform sampler2D uState;
uniform sampler2D uSdf;
uniform sampler2D uDither;
uniform sampler2D uCurv;      // smoothed wave Hessian, cell resolution
uniform vec2 uRes;           // canvas device px
uniform float uDpr;
uniform float uCell;
uniform vec3 uMeniscus;      // rise, capillary length, contact-line pin length (CSS px)
uniform float uDepth;        // liquid depth over the floor, CSS px (refraction)
uniform float uCausticDepth; // light-path depth for caustics, CSS px
uniform float uRefractCap;   // CSS px
uniform float uRefractGain;  // 1 − 1/n
uniform vec3 uFill;          // linear, top
uniform vec3 uFillLow;       // linear, bottom
uniform vec4 uFillRect;      // control bounds y0, y1, x0, x1 (CSS px, y up)
uniform vec3 uEnvLow;
uniform vec3 uEnvHigh;
uniform vec3 uLights;        // key, strips, bounce
uniform vec2 uCaustic;       // gain, darkenOnly (1 = light tone)
uniform vec3 uAbsorb;
uniform vec3 uScatter;
uniform float uFocus;        // 0–1
uniform vec3 uRing;          // sRGB
uniform vec2 uRingBand;      // gap, width (CSS px)
uniform vec2 uBand;          // label background luminance band lo, hi
uniform vec4 uLabels[8];     // x0, y0, x1, y1 (CSS px)
uniform int uLabelCount;
uniform vec4 uClimb;         // drop-zone drag: pointer (CSS px, y up), strength 0–1, along-wall spread
uniform vec3 uClimbShape;    // rise, length (CSS px), far-wall floor
uniform vec4 uOverlay;       // light-path depth (CSS px), contrast-clamped peak strength, sun blur (CSS px), edge fade (CSS px)
uniform vec3 uOverlayTint;   // sRGB the overlay blends toward (light: shade, dark: light)
out vec4 outColor;

const float F0 = 0.0204;     // ((1 − 1.333) / (1 + 1.333))²

// Long strip light in reflected-direction space: crisp across, anti-aliased by
// its own screen-space derivative; feathered along its length so a reflection
// never shows a cut end (a rectangle's ends read as clipped tabs at the rim).
float stripLight (float across, float along, float halfWidth, float reach) {
	float a = abs(across);
	// Diffuser shoulder (40% of the half-width, in reflected-direction units) widened
	// by one pixel's derivative. Where slopes change fast (ripple flanks) the shoulder
	// spans < 1 px and the line is crisp; where a broad region shares one slope it
	// spans many pixels, so the highlight shades instead of filling a cut-out.
	float aa = fwidth(a);
	float edge = 1.0 - smoothstep(halfWidth * 0.6 - aa, halfWidth + aa, a);
	return edge * (1.0 - smoothstep(0.3 * reach, reach, abs(along)));
}
// A real softbox is brighter toward its top. The gradient makes a reflection
// that traces an iso-slope contour read as a curved highlight, not a flat cut-out.
float keyLight (vec2 q) {
	float across = q.y - 0.3;
	return stripLight(across, q.x + 0.06, 0.06, 1.2) * (0.45 + 0.55 * clamp(across / 0.12 + 0.5, 0.0, 1.0));
}
vec3 studio (vec3 r) {
	vec2 q = r.xy / max(r.z, 0.05);
	vec3 c = mix(uEnvLow, uEnvHigh, smoothstep(-0.6, 0.6, q.y));
	float key = keyLight(q);
	float strips = stripLight(q.x + 0.4, q.y - 0.04, 0.018, 0.7) + stripLight(q.x - 0.4, q.y - 0.04, 0.018, 0.7);
	// The floor bounce sits where the wall meniscus already points (q.y ≈ −0.45 at
	// the bottom rim). A hard edge there turns any wave crest reaching the wall into
	// a lit block bounded by the meniscus iso-slope; a soft area light shades it.
	float bounce = exp(-pow((q.y + 0.75) / 0.22, 2.0)) * (1.0 - smoothstep(0.4, 1.2, abs(q.x)));
	return c + vec3(1.0, 0.98, 0.95) * (key * uLights.x + strips * uLights.y) + vec3(0.9, 0.95, 1.0) * bounce * uLights.z;
}

// Cubic B-spline weights, first and second derivatives.
void bspline (float t, out vec4 w, out vec4 dw, out vec4 ddw) {
	float t2 = t * t;
	float t3 = t2 * t;
	float s = 1.0 - t;
	w = vec4(s * s * s, 3.0 * t3 - 6.0 * t2 + 4.0, -3.0 * t3 + 3.0 * t2 + 3.0 * t + 1.0, t3) / 6.0;
	dw = vec4(-0.5 * s * s, 1.5 * t2 - 2.0 * t, -1.5 * t2 + t + 0.5, 0.5 * t2);
	ddw = vec4(s, 3.0 * t - 2.0, 1.0 - 3.0 * t, t);
}

float sdfPx (vec2 uv) { return texture(uSdf, uv).r; }

void main () {
	vec2 px = gl_FragCoord.xy;
	vec2 uv = px / uRes;
	vec2 p = px / uDpr;
	float dPx = sdfPx(uv);
	float coverage = clamp(0.5 - dPx, 0.0, 1.0);

	// Focus ring: a band outside the control that follows its SDF exactly.
	float ringIn = uRingBand.x * uDpr;
	float ringOut = (uRingBand.x + uRingBand.y) * uDpr;
	float ring = uFocus * clamp(dPx - ringIn + 0.5, 0.0, 1.0) * clamp(ringOut - dPx + 0.5, 0.0, 1.0);
	vec4 ringColor = vec4(uRing * ring, ring);
	// No early return: fwidth() in the lights needs uniform control flow, or the
	// quads straddling the rim get undefined derivatives.

	// Height: B-spline over 4×4 cells → h, ∇h, Hessian.
	ivec2 n = textureSize(uState, 0);
	vec2 g = p / uCell - 0.5;
	vec2 f = floor(g);
	vec4 wx, dwx, ddwx, wy, dwy, ddwy;
	bspline(g.x - f.x, wx, dwx, ddwx);
	bspline(g.y - f.y, wy, dwy, ddwy);
	ivec2 base = ivec2(f) - 1;
	float h = 0.0;
	vec2 grad = vec2(0.0);
	vec3 hess = vec3(0.0); // xx, xy, yy
	for (int j = 0; j < 4; j++) {
		for (int i = 0; i < 4; i++) {
			float v = texelFetch(uState, clamp(base + ivec2(i, j), ivec2(0), n - 1), 0).b;
			h += wx[i] * wy[j] * v;
			grad += vec2(dwx[i] * wy[j], wx[i] * dwy[j]) * v;
			hess += vec3(ddwx[i] * wy[j], dwx[i] * dwy[j], wx[i] * ddwy[j]) * v;
		}
	}
	grad /= uCell;
	hess /= uCell * uCell;
#ifdef BILINEAR_PROBE
	// The prototype's path: central differences per cell, bilinearly interpolated.
	{
		vec2 gc = p / uCell - 0.5;
		ivec2 c0 = ivec2(floor(gc));
		vec2 t = gc - floor(gc);
		vec3 q[4];
		for (int k = 0; k < 4; k++) {
			ivec2 c = clamp(c0 + ivec2(k & 1, k >> 1), ivec2(1), n - 2);
			float hc = texelFetch(uState, c, 0).b;
			q[k] = vec3(hc, texelFetch(uState, c + ivec2(1, 0), 0).b - texelFetch(uState, c - ivec2(1, 0), 0).b,
				texelFetch(uState, c + ivec2(0, 1), 0).b - texelFetch(uState, c - ivec2(0, 1), 0).b) / vec3(1.0, 2.0 * uCell, 2.0 * uCell);
		}
		vec3 r = mix(mix(q[0], q[1], t.x), mix(q[2], q[3], t.x), t.y);
		h = r.x;
		grad = r.yz;
	}
#endif
#ifdef SLOPE_PROBE
	// Test probe: the reconstructed field itself, before optics (float target).
	outColor = vec4(h, grad, hess.x + hess.z);
	return;
#endif
	float dither = (texture(uDither, px / 64.0).r * 2.0 - 1.0) / 255.0;
#ifdef OVERLAY
	// Caustics overlay (ADR-0094): light terms only, so the content beneath is never
	// resampled. No walls: the edge fades instead of climbing a meniscus.
	// Intensity is the area ratio of the refracted grid, I = 1/|J|, J = det(I + s·H)
	// (flux is conserved, so its area mean is 1). The singular folds are regularized by
	// the sun's angular size: a fold is blurred over uOverlay.z CSS px, i.e. by
	// |∇J|·blur in J, never less than one pixel's change of J. So lines taper and dim
	// where J crosses zero fast, and widen and brighten where it crosses slowly and at
	// the cusps where folds meet. No contour threshold, no fixed-width stroke.
	vec3 hcO = texture(uCurv, p / (vec2(n) * uCell)).rgb;
	float sO = uOverlay.x * uRefractGain;
	float J = (1.0 + sO * hcO.x) * (1.0 + sO * hcO.z) - sO * sO * hcO.y * hcO.y;
	float eps = max(fwidth(J) * uDpr * uOverlay.z, 1e-3);
	float I = min(inversesqrt(J * J + eps * eps), 12.0);
	float v;
	if (uCaustic.y > 0.5) {
		// Light tone: light cannot be added to near-white paper, so only the broad
		// defocused regions (I < 1) shade, softly. Foci stay page-bright.
		// Shading only follows a ripple and fades with it; the clamp bounds the peak.
		v = 0.7 * smoothstep(0.0, 0.8, 1.0 - I);
	} else {
		// Dark tone: the excess over the mean, tone-mapped; dim regions add nothing.
		// x²/(x + 0.25) eases in with zero slope at I = 1, so the boundary of the lit
		// region is C¹: a plain max(I − 1, 0) hinge drew any straight iso-line of I
		// (a plane wave's crest) as a visible straight edge.
		float x = max(I - 1.0, 0.0);
		x = x * x / (x + 0.25);
		v = x / (x + 2.5);
	}
	// Edge fade from the analytic rect, a smooth product over its four sides. Not
	// the SDF: the overlay's rect is the whole canvas, so its coverage mask has no
	// edge along the straight sides and the JFA SDF only measures distance to the
	// corner arcs. Light then ran full strength into the canvas edge: a hard cut.
	vec4 side = vec4(p.x - uFillRect.z, uFillRect.w - p.x, p.y - uFillRect.x, uFillRect.y - p.y);
	vec4 ramp = smoothstep(vec4(0.0), vec4(uOverlay.w), side);
	float fade = ramp.x * ramp.y * ramp.z * ramp.w;
	// Never above the contrast-clamped peak (look.ts overlayCap), dither included.
	float kO = clamp(uOverlay.y * clamp(v, 0.0, 1.0) * fade + dither * step(0.001, v * fade), 0.0, uOverlay.y);
	outColor = vec4(uOverlayTint * kO, kO);
	return;
#endif

	// Capillary meniscus: liquid climbs the wall over the capillary length.
	vec2 e = 1.0 / uRes;
	vec2 sg = vec2(sdfPx(uv + vec2(e.x, 0.0)) - sdfPx(uv - vec2(e.x, 0.0)), sdfPx(uv + vec2(0.0, e.y)) - sdfPx(uv - vec2(0.0, e.y)));
	vec2 wall = sg / max(length(sg), 1e-5);
	float dIn = max(-dPx / uDpr, 0.0);
	float men = uMeniscus.x * exp(-dIn / uMeniscus.y);
	// Pinned contact line: waves cannot move the wetted edge, so their displacement
	// fades to zero (with zero slope) at the wall. Unpinned, a crest's slope adds to
	// the steep meniscus and the key light traces meniscus iso-slope contours, which
	// run straight along the wall: a clipped tab.
	float u = dIn / uMeniscus.z;
	float pin = 1.0 - exp(-u * u);
	vec2 pinGrad = -wall * (2.0 * u / uMeniscus.z) * exp(-u * u);
	grad = pin * grad + h * pinGrad;
	h = pin * h;
	h += men;
	grad += (men / uMeniscus.y) * wall;
	vec3 menHess = (men / (uMeniscus.y * uMeniscus.y)) * vec3(wall.x * wall.x, wall.x * wall.y, wall.y * wall.y);
	// Drop-zone climb (mirror: climbHeight() in wave.ts): a taller meniscus, highest on
	// the wall nearest the dragged pointer. A sum over the four straight walls, not a
	// function of the SDF: the SDF has a crease along the medial axis of each corner,
	// and an 18 px climb reaches it (a pinched highlight). The sum is C∞ and rises a
	// little more into corners, as a real meniscus does. Analytic slope and curvature.
	if (uClimb.z > 0.0) {
		float amp = uClimbShape.x * uClimb.z;
		float L = uClimbShape.y;
		float f = uClimbShape.z;
		float s2 = uClimb.w * uClimb.w;
		vec2 lo = vec2(uFillRect.z, uFillRect.x);
		vec2 hi = vec2(uFillRect.w, uFillRect.y);
		for (int i = 0; i < 4; i++) {
			// Inward normal and the wall's offset along it.
			vec2 nI = i == 0 ? vec2(1.0, 0.0) : i == 1 ? vec2(-1.0, 0.0) : i == 2 ? vec2(0.0, 1.0) : vec2(0.0, -1.0);
			float w0 = i == 0 ? lo.x : i == 1 ? -hi.x : i == 2 ? lo.y : -hi.y;
			vec2 tI = vec2(-nI.y, nI.x);
			float d = max(dot(p, nI) - w0, 0.0);
			float a = dot(p - uClimb.xy, tI);
			float b = dot(uClimb.xy, nI) - w0;
			float N = exp(-(a * a + b * b) / (2.0 * s2));
			float E = exp(-d / L);
			float c = amp * (f + (1.0 - f) * N) * E;
			float dN = amp * (1.0 - f) * E * N;
			h += c;
			grad += -(c / L) * nI - dN * (a / s2) * tI;
			vec3 nn = vec3(nI.x * nI.x, nI.x * nI.y, nI.y * nI.y);
			vec3 tt = vec3(tI.x * tI.x, tI.x * tI.y, tI.y * tI.y);
			vec3 nt = vec3(2.0 * nI.x * tI.x, nI.x * tI.y + nI.y * tI.x, 2.0 * nI.y * tI.y);
			menHess += (c / (L * L)) * nn + (dN * a / (s2 * L)) * nt + dN * (a * a / (s2 * s2) - 1.0 / s2) * tt;
		}
	}
#ifdef HEIGHT_PROBE
	// Test probe: surface height including meniscus and climb (float target).
	outColor = vec4(h, grad, 0.0);
	return;
#endif

	vec3 nrm = normalize(vec3(-grad, 1.0));
	float fresnel = F0 + (1.0 - F0) * pow(1.0 - nrm.z, 5.0);
	vec3 refl = vec3(2.0 * nrm.z * nrm.xy, 2.0 * nrm.z * nrm.z - 1.0);

	// Floor seen through the liquid, displaced by refraction (capped for legibility).
	vec2 offset = uRefractGain * (uDepth + h) * grad;
	offset *= min(1.0, uRefractCap / max(length(offset), 1e-6));
	float fy = clamp((p.y + offset.y - uFillRect.x) / max(uFillRect.y - uFillRect.x, 1.0), 0.0, 1.0);
	vec3 floorColor = mix(uFillLow, uFill, fy);

	// Area-ratio caustics: flat area / refracted area = 1 / |det(I + s·H)|; crests focus.
	// H = smoothed wave curvature + the analytic meniscus curvature.
	vec3 hc = pin * texture(uCurv, p / (vec2(n) * uCell)).rgb + menHess;
	float s = uCausticDepth * uRefractGain;
	float det = (1.0 + s * hc.x) * (1.0 + s * hc.z) - s * s * hc.y * hc.y;
	float ratio = min(6.0, 1.0 / max(abs(det), 1.0 / 6.0));
	float excess = ratio - 1.0;
	float delta = uCaustic.x * (excess > 0.0 ? excess / (1.0 + 0.8 * excess) : excess);
	// Light tones: caustics shade (a darker net), they never add light.
	if (uCaustic.y > 0.5) delta = min(delta, 0.0);
	floorColor *= max(1.0 + delta, 0.0);

	// Beer–Lambert through the liquid column, toward its scatter colour.
	vec3 transmit = exp(-uAbsorb * 2.0 * max(h, 0.0));
	floorColor = floorColor * transmit + uScatter * (1.0 - transmit);

	vec3 color = floorColor * (1.0 - fresnel) + studio(refl) * fresnel;
	// Focus: a still, top-lit lift of the whole surface. Nothing moves.
	float top = clamp((p.y - uFillRect.x) / max(uFillRect.y - uFillRect.x, 1.0), 0.0, 1.0);
	color = color * (1.0 + 0.1 * uFocus) + uFocus * (0.004 + 0.012 * top) * vec3(1.0, 0.98, 0.95);

	// Label budget: under DOM label text the background luminance stays in band.
	float label = 0.0;
	for (int i = 0; i < 8; i++) {
		if (i >= uLabelCount) break;
		vec4 r = uLabels[i];
		vec2 dd = max(max(r.xy - p, p - r.zw), 0.0);
		label = max(label, 1.0 - smoothstep(1.0, 4.0, length(dd)));
	}
	if (label > 0.0) {
		float l = dot(color, vec3(0.2126, 0.7152, 0.0722));
		vec3 clamped = l > uBand.y ? color * (uBand.y / l) : l < uBand.x ? color + (uBand.x - l) : color;
		color = mix(color, clamped, label);
	}

	vec3 srgb = clamp(linearToSrgb(color) + dither, 0.0, 1.0);
	outColor = coverage > 0.0 ? vec4(srgb * coverage, coverage) + ringColor * (1.0 - coverage) : ringColor;
}
`;
