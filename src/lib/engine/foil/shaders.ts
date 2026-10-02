/*
 * GLSL ES 3.00 for the foil switch (ADR-0096): a line-for-line port of the R&D
 * WGSL fragment (rd/webgpu-replacement, materials/snap-foil.ts, transparent
 * variant). Raw strings only. Model units: x right, y up, span ±FOIL_SPAN/2.
 */
import { SRGB_TRANSFER_GLSL } from '../shaders.js';
import { FOIL_RISE, FOIL_SPAN } from './model.js';

const f = (v: number) => (Number.isInteger(v) ? v.toFixed(1) : String(v));

export const FOIL_VS = /* glsl */ `#version 300 es
layout(location = 0) in vec2 aPosition;
out vec2 vUv;
void main () {
	vUv = aPosition * 0.5 + 0.5;
	gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

export const FOIL_FS = /* glsl */ `#version 300 es
precision highp float;
${SRGB_TRANSFER_GLSL}
in vec2 vUv;
uniform vec2 uDisplay;    // aspect fit: max(1, aspect), max(1, 1/aspect)
uniform vec4 uState;      // amplitude, hover y (0 top … 1 bottom), hover x, hovered
uniform vec2 uMetalBand;  // look.ts metalBand: dir (-1 cap, +1 lift), luminance bound
uniform float uKnee;      // look.ts METAL_KNEE
uniform sampler2D uDither;
out vec4 outColor;

float square (float v) { return v * v; }

// Studio: a soft strip overhead, a warm rim on the left, a cool floor bounce.
vec3 environment (vec3 r) {
	float strip = exp(-square((r.y - 0.32) / 0.09));
	float rim = exp(-square((r.x + 0.58) / 0.16));
	return vec3(0.10, 0.13, 0.2) + vec3(1.9, 2.2, 2.6) * strip + vec3(1.0, 0.44, 0.19) * rim +
		vec3(0.12, 0.19, 0.30) * smoothstep(-0.1, 0.9, r.z);
}

float roundedBox (vec2 q, vec2 hb, float radius) {
	vec2 d = abs(q) - hb + radius;
	return length(max(d, vec2(0.0))) + min(max(d.x, d.y), 0.0) - radius;
}

// Mirrors clampMetal in look.ts: soft cap above the knee (keeps hue and the
// highlight gradient) or a just-enough lift toward white.
vec3 clampMetal (vec3 lin) {
	float l = dot(lin, vec3(0.2126, 0.7152, 0.0722));
	float bound = uMetalBand.y;
	if (uMetalBand.x < 0.0) {
		float knee = uKnee * bound;
		if (l <= knee) return lin;
		float span = bound - knee;
		return lin * ((knee + span * (1.0 - exp(-(l - knee) / span))) / l);
	}
	if (l >= bound) return lin;
	return lin + (vec3(1.0) - lin) * clamp((bound - l) / max(1.0 - l, 1e-4), 0.0, 1.0);
}

void main () {
	vec2 point = (vUv - 0.5) * vec2(2.8 * uDisplay.x, 1.5 * uDisplay.y);
	float q = uState.x;
	float t = clamp(point.x / ${f(FOIL_SPAN / 2)}, -1.0, 1.0);
	float z = ${f(FOIL_RISE)} * q * (1.0 - t * t);
	float transverse = (point.y - 0.68 * z) / 0.74;
	float dist = max(abs(point.x) - ${f(FOIL_SPAN / 2)}, abs(transverse) - 0.14);
	float footprint = max(fwidth(dist), 0.00001);
	float coverage = 1.0 - smoothstep(-footprint * 0.5, footprint * 0.5, dist);
	float slope = -${f((4 * FOIL_RISE) / FOIL_SPAN)} * q * t;
	vec3 normal = normalize(vec3(-slope, 0.0, 1.0));
	vec3 view = normalize(vec3(-point.x * 0.06 + (uState.z - 0.5) * uState.w * 0.55, -0.68 + (uState.y - 0.5) * uState.w * 0.18, 0.74));
	vec3 reflected = reflect(-view, normal);
	float grainFootprint = fwidth(point.x * 900.0);
	float grain = sin(point.x * 900.0) * exp(-grainFootprint * grainFootprint * 0.2) * 0.012;
	float fresnel = 0.72 + 0.28 * pow(1.0 - clamp(dot(normal, view), 0.0, 1.0), 5.0);
	vec3 metal = environment(reflected) * fresnel + vec3(0.13 + grain);
	float rolled = pow(clamp(abs(transverse) / 0.14, 0.0, 1.0), 28.0);
	metal += vec3(0.7, 0.79, 0.9) * rolled;
	// R&D tone map 1 − e^−x, read as linear light; one exact encode (ADR-0081).
	vec3 metalSrgb = clamp(linearToSrgb(clampMetal(vec3(1.0) - exp(-metal))), 0.0, 1.0);

	float left = roundedBox(point - vec2(-${f(FOIL_SPAN / 2)}, 0.0), vec2(0.105, 0.235), 0.035);
	float right = roundedBox(point - vec2(${f(FOIL_SPAN / 2)}, 0.0), vec2(0.105, 0.235), 0.035);
	float pad = min(left, right);
	float padFootprint = max(fwidth(pad), 0.00001);
	float padCoverage = 1.0 - smoothstep(-padFootprint * 0.5, padFootprint * 0.5, pad);
	vec3 padColor = vec3(0.20, 0.155, 0.16) + vec3(0.25) * exp(-square((point.y - 0.20) / 0.024));

	// Premultiplied: metal over pad; nothing outside the foil's own footprint.
	float alpha = coverage + padCoverage * (1.0 - coverage);
	vec3 color = metalSrgb * coverage + padColor * padCoverage * (1.0 - coverage);
	float dither = (texture(uDither, gl_FragCoord.xy / 64.0).r * 2.0 - 1.0) / 255.0;
	outColor = vec4(clamp(color + dither * alpha, 0.0, alpha), alpha);
}
`;
