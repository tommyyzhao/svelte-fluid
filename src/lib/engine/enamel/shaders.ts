/*
 * GLSL ES 3.00 for compliant enamel (ADR-0097). Raw strings only.
 * Fine textures are device px, coarse textures are model cells; both GL
 * y-up (row 0 at the canvas bottom). The SDF holds signed device-px distance,
 * negative inside (ADR-0084). The coarse rest texture stores -1 for solid
 * cells, so one R32F texture carries both rest height and geometry.
 */
import { SRGB_TRANSFER_GLSL, TONE_MAP_GLSL } from '../shaders.js';

export const ENAMEL_VS = /* glsl */ `#version 300 es
layout(location = 0) in vec2 aPosition;
void main () {
	gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

/**
 * Rest profile at device resolution, one separable Gaussian pass. FROM_SDF
 * evaluates the quarter-sine ramp from the Euclidean SDF (mirror:
 * restProfile in profile.ts) and blurs along x; without it, the pass blurs
 * the previous result along y. Smoothing the rest surface softens the medial
 * ridge of thin strokes; the silhouette comes from coverage and never blurs.
 */
export const ENAMEL_REST_FS = /* glsl */ `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D uSource;   // FROM_SDF: SDF (device px); else the x-blurred rest
uniform float uDpr;
uniform float uPlateau;      // CSS px
uniform float uPeak;
uniform float uSigma;        // device px
uniform ivec2 uDir;
out vec4 outRest;
float rest (ivec2 c) {
	ivec2 n = textureSize(uSource, 0);
	c = clamp(c, ivec2(0), n - 1);
#ifdef FROM_SDF
	float d = -texelFetch(uSource, c, 0).r / uDpr;
	return d <= 0.0 ? 0.0 : uPeak * sin(min(d / uPlateau, 1.0) * 1.5707963);
#else
	return texelFetch(uSource, c, 0).r;
#endif
}
void main () {
	ivec2 c = ivec2(gl_FragCoord.xy);
	int radius = int(ceil(3.0 * uSigma));
	float sum = 0.0;
	float weight = 0.0;
	for (int k = -radius; k <= radius; k++) {
		float w = exp(-float(k * k) / (2.0 * uSigma * uSigma));
		sum += w * rest(c + k * uDir);
		weight += w;
	}
	outRest = vec4(sum / weight, 0.0, 0.0, 1.0);
}
`;

/**
 * Coarse rest and geometry: a 4×4 sample average of fine rest × coverage
 * over each cell's footprint. Cells under 8% glyph coverage are solid (-1).
 */
export const ENAMEL_COARSE_FS = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D uRestFine;
uniform sampler2D uCoverage;
uniform vec2 uCss;           // canvas CSS px
uniform float uCell;         // CSS px
uniform float uSolidBelow;
out vec4 outRest;
void main () {
	vec2 cell = floor(gl_FragCoord.xy);
	float rest = 0.0;
	float coverage = 0.0;
	for (int j = 0; j < 4; j++) {
		for (int i = 0; i < 4; i++) {
			vec2 uv = (cell + (vec2(i, j) + 0.5) / 4.0) * uCell / uCss;
			float c = texture(uCoverage, uv).r;
			rest += texture(uRestFine, uv).r * c;
			coverage += c;
		}
	}
	outRest = vec4(coverage / 16.0 < uSolidBelow ? -1.0 : rest / 16.0, 0.0, 0.0, 1.0);
}
`;

/** Height reset: deposited material equals rest (solid cells hold none). */
export const ENAMEL_RESET_FS = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D uRest;
out vec4 outHeight;
void main () {
	outHeight = vec4(max(texelFetch(uRest, ivec2(gl_FragCoord.xy), 0).r, 0.0), 0.0, 0.0, 1.0);
}
`;

/**
 * One disjoint-pair phase as a gather (mirror: transferPhase in profile.ts).
 * Phases 0/1 pair (x, x+1) starting at even/odd x, 2/3 pair (y, y+1). Each
 * texel finds its pair's A (left/bottom) cell from parity, and both texels
 * evaluate the identical ordered expression for the flux A→B, so A loses
 * exactly what B gains: mass is conserved to float rounding.
 */
export const ENAMEL_TRANSFER_FS = /* glsl */ `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D uHeight;
uniform sampler2D uRest;
uniform int uPhase;
uniform float uF;            // exchange fraction (profile.ts exchangeFraction)
uniform vec4 uContact;       // centre (cells, y up), strength, sigma (cells)
uniform float uContactGain;
out vec4 outHeight;
float contact (ivec2 c) {
	if (uContact.z <= 0.0) return 0.0;
	vec2 d = vec2(c) + 0.5 - uContact.xy;
	return uContactGain * uContact.z * exp(-dot(d, d) / (2.0 * uContact.w * uContact.w));
}
void main () {
	ivec2 n = textureSize(uHeight, 0);
	ivec2 self = ivec2(gl_FragCoord.xy);
	float h = texelFetch(uHeight, self, 0).r;
	bool horizontal = uPhase < 2;
	int coord = horizontal ? self.x : self.y;
	bool isA = (coord & 1) == (uPhase & 1);
	ivec2 axis = horizontal ? ivec2(1, 0) : ivec2(0, 1);
	ivec2 a = isA ? self : self - axis;
	ivec2 b = a + axis;
	outHeight = vec4(h, 0.0, 0.0, 1.0);
	if (a.x < 0 || a.y < 0 || b.x >= n.x || b.y >= n.y) return;
	float ra = texelFetch(uRest, a, 0).r;
	float rb = texelFetch(uRest, b, 0).r;
	if (ra < 0.0 || rb < 0.0) return;
	float ha = texelFetch(uHeight, a, 0).r;
	float hb = texelFetch(uHeight, b, 0).r;
	float requested = uF * ((ha - ra) - (hb - rb) + contact(a) - contact(b));
	// Donor-bounded: limiting changes speed under extreme forcing, never mass.
	float flux = min(ha, max(-hb, requested));
	outHeight.r = isA ? ha - flux : hb + flux;
}
`;

/** make_surface: deviation from rest per cell (0 on solid cells), the composite's only dynamic input. */
export const ENAMEL_SURFACE_FS = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D uHeight;
uniform sampler2D uRest;
out vec4 outSurface;
void main () {
	ivec2 c = ivec2(gl_FragCoord.xy);
	float rest = texelFetch(uRest, c, 0).r;
	outSurface = vec4(rest < 0.0 ? 0.0 : texelFetch(uHeight, c, 0).r - rest, 0.0, 0.0, 1.0);
}
`;

/**
 * Composite at device px: fine rest slope plus the B-spline-reconstructed
 * coarse deviation, lit as a glaze (diffuse body + broad soft-box reflection
 * with Schlick Fresnel), darkened by cavity occlusion, with a thin rim on
 * light-facing edges; tone-mapped, compressed into the glyph's contrast band
 * (mirror: clampGlyph in look.ts), sRGB-encoded with blue-noise dither and
 * premultiplied by glyph coverage. The soft box is a Gaussian area light: no
 * narrow strips, so slope quantisation never becomes glints. The rim is a
 * Gaussian across a level set of the smoothed rest surface (≥ 0.6 CSS px
 * wide): a smooth, anti-aliased line that follows curves without facets.
 */
export const ENAMEL_COMPOSITE_FS = /* glsl */ `#version 300 es
precision highp float;
precision highp int;
${SRGB_TRANSFER_GLSL}
${TONE_MAP_GLSL}
uniform sampler2D uCoverage;
uniform sampler2D uRestFine;
uniform sampler2D uSurface;
uniform sampler2D uDither;
uniform sampler2D uCavity;       // rest blurred at the occlusion scale
uniform float uDpr;
uniform float uCell;          // CSS px
uniform float uRelief;        // CSS px of height per rest unit (rest profile)
uniform float uDentRelief;    // CSS px of height per rest unit (press deviation)
uniform vec3 uBody;           // linear
uniform float uAmbient;
uniform vec3 uLight;
uniform vec3 uEnvLow;
uniform vec3 uEnvHigh;
uniform vec2 uKey;            // radiance, angular sigma
uniform vec4 uBand;           // side, lo, hi, knee
uniform float uOcclusion;     // strength 0–1
uniform float uPeak;          // rest units at the plateau
uniform vec3 uRim;            // radiance, rest level, half-width (CSS px)
out vec4 outColor;

const float F0 = 0.04;        // glaze, n ≈ 1.5

void bspline (float t, out vec4 w, out vec4 dw) {
	float t2 = t * t;
	float s = 1.0 - t;
	w = vec4(s * s * s, 3.0 * t2 * t - 6.0 * t2 + 4.0, -3.0 * t2 * t + 3.0 * t2 + 3.0 * t + 1.0, t2 * t) / 6.0;
	dw = vec4(-0.5 * s * s, 1.5 * t2 - 2.0 * t, -1.5 * t2 + t + 0.5, 0.5 * t2);
}
float softplus (float x) { return x > 30.0 ? x : log(1.0 + exp(x)); }
float compressLum (float l) {
	float k = uBand.w;
	if (uBand.x < 0.0) return clamp(uBand.z - k * softplus((uBand.z - l) / k), 0.0, uBand.z);
	return clamp(uBand.y + k * softplus((l - uBand.y) / k), uBand.y, 1.0);
}
vec3 clampGlyph (vec3 c) {
	c = max(c, vec3(0.0));
	float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
	float target = compressLum(l);
	if (l < 1e-6) return vec3(target);
	float peak = max(c.r, max(c.g, c.b));
	vec3 v = c * min(target / l, 1.0 / peak);
	float lv = dot(v, vec3(0.2126, 0.7152, 0.0722));
	float t = clamp((target - lv) / max(1.0 - lv, 1e-6), 0.0, 1.0);
	return min(v + (1.0 - v) * t, vec3(1.0));
}
vec3 studio (vec3 r) {
	vec2 q = r.xy / max(r.z, 0.05);
	vec3 room = mix(uEnvLow, uEnvHigh, smoothstep(-0.8, 0.8, q.y));
	vec2 dk = q - uLight.xy / uLight.z;
	return room + vec3(1.0, 0.98, 0.95) * uKey.x * exp(-dot(dk, dk) / (2.0 * uKey.y * uKey.y));
}

void main () {
	ivec2 c = ivec2(gl_FragCoord.xy);
	ivec2 n = textureSize(uRestFine, 0);
	float coverage = texelFetch(uCoverage, c, 0).r;
	if (coverage <= 0.0) {
		outColor = vec4(0.0);
		return;
	}
	float rl = texelFetch(uRestFine, clamp(c - ivec2(1, 0), ivec2(0), n - 1), 0).r;
	float rr = texelFetch(uRestFine, clamp(c + ivec2(1, 0), ivec2(0), n - 1), 0).r;
	float rb = texelFetch(uRestFine, clamp(c - ivec2(0, 1), ivec2(0), n - 1), 0).r;
	float rt = texelFetch(uRestFine, clamp(c + ivec2(0, 1), ivec2(0), n - 1), 0).r;
	vec2 grad = vec2(rr - rl, rt - rb) * 0.5 * uDpr;   // rest units per CSS px

	// Deviation: cubic B-spline over 4×4 cells, C² so the dent has no cell seams.
	ivec2 m = textureSize(uSurface, 0);
	vec2 g = gl_FragCoord.xy / uDpr / uCell - 0.5;
	vec2 f = floor(g);
	vec4 wx, dwx, wy, dwy;
	bspline(g.x - f.x, wx, dwx);
	bspline(g.y - f.y, wy, dwy);
	ivec2 base = ivec2(f) - 1;
	vec2 dgrad = vec2(0.0);
	for (int j = 0; j < 4; j++) {
		for (int i = 0; i < 4; i++) {
			float v = texelFetch(uSurface, clamp(base + ivec2(i, j), ivec2(0), m - 1), 0).r;
			dgrad += vec2(dwx[i] * wy[j], wx[i] * dwy[j]) * v;
		}
	}
	// The press keeps its own (shallower) relief: the deep rest profile would
	// steepen the dent into grazing Fresnel streaks.
	vec3 nrm = normalize(vec3(-(grad * uRelief + dgrad / uCell * uDentRelief), 1.0));
	// Cavity occlusion: how far the surrounding rest surface rises above this
	// one. A straight edge foot sees about half a plateau, a concave corner
	// more, so the smoothstep leaves edges lightly shaded and corners deep.
	float rest0 = texelFetch(uRestFine, c, 0).r;
	float cavity = (texelFetch(uCavity, c, 0).r - rest0) / uPeak;
	float occ = 1.0 - uOcclusion * smoothstep(0.15, 0.75, cavity);
	float diffuse = (uAmbient + (1.0 - uAmbient) * max(dot(nrm, uLight), 0.0) / uLight.z) * occ;
	vec3 r = reflect(vec3(0.0, 0.0, -1.0), nrm);
	float fresnel = F0 + (1.0 - F0) * pow(1.0 - nrm.z, 5.0);
	vec3 color = uBody * diffuse * (1.0 - fresnel) + studio(r) * fresnel * mix(1.0, occ, 0.5);
	// Rim: the glaze catching the key along the light-facing lip, drawn on a
	// level set of the smoothed rest surface (distance ≈ Δrest / |∇rest|), so
	// it is anti-aliased and follows curves with no SDF quantisation ticks.
	vec2 rg = vec2(rr - rl, rt - rb) * 0.5 * uDpr;
	float slope = length(rg);
	float facing = slope > 1e-4 ? max(dot(-rg / slope, normalize(uLight.xy)), 0.0) : 0.0;
	float rimT = (rest0 - uRim.y) / max(slope, 1e-4) / uRim.z;
	color += vec3(1.0, 0.98, 0.95) * uRim.x * exp(-0.5 * rimT * rimT) * facing * facing * occ;
	color = clampGlyph(toneMapNeutral(max(color, vec3(0.0))));

	vec2 px = gl_FragCoord.xy;
	float dither = (texture(uDither, px / 64.0).r * 2.0 - 1.0) / 255.0;
	vec3 srgb = clamp(linearToSrgb(color) + dither, 0.0, 1.0);
	outColor = vec4(srgb * coverage, coverage);
}
`;
