/*
 * svelte-fluid — preset config registry (INTERNAL)
 *
 * Single source of truth for every preset's pinned `<Fluid>` configuration.
 * Each preset component imports its own `*_CONFIG` const and spreads it, so
 * the data exists in exactly one place. The demo site reads `PRESETS` to drive
 * Show Code, View-in-Playground, and the generated agent docs
 * (`/llms.txt`, `/llms-full.txt`, `/SKILL.md`).
 *
 * This module is NOT re-exported from `src/lib/index.ts`: it adds no public
 * API surface and no semver commitment. See ADR-0040.
 *
 * Boundaries:
 * - Forwarded/sizing props (width/height/class/style/seed/lazy/pointerInput/
 *   splatOnHover/aria-label/backColor override) stay component-level.
 * - Runtime behavior that is not config (e.g. Toroidal's re-injection
 *   interval) stays in the component.
 */

import type { FluidProps } from '../Fluid.svelte';
import type { ContainerShape, FlowConfig, Obstruction, PresetSplat, RGB } from '../engine/types.js';

/** Coarse grouping for the docs site and agent docs. */
export type PresetCategory = 'classic' | 'container' | 'flow';

/**
 * The exact, serializable set of `<Fluid>` props a preset wrapper pins,
 * including its default `backColor`. A subset of {@link FluidProps}.
 */
export type PresetConfig = Partial<FluidProps>;

export interface PresetDefinition {
	/** Stable id; matches the exported component name (e.g. `Karman`). */
	id: string;
	/** Human-readable display name. */
	name: string;
	category: PresetCategory;
	/** One-line description for cards, docs, and agent docs. */
	blurb: string;
	/** Canonical pinned config — the props the wrapper passes to `<Fluid>`. */
	config: PresetConfig;
}

// ----------------------------------------------------------------------------
// Classic stylistic presets
// ----------------------------------------------------------------------------

export const LAVA_LAMP_CONFIG: PresetConfig = {
	containerShape: { type: 'roundedRect', cx: 0.5, cy: 0.5, halfW: 0.38, halfH: 0.45, cornerRadius: 0.15 },
	glass: true,
	glassRefraction: 0.3,
	glassReflectivity: 0.08,
	glassChromatic: 0.1,
	curl: 5,
	densityDissipation: 0,
	initialDensityDissipation: 0.25,
	initialDensityDissipationDuration: 1.0,
	velocityDissipation: 0,
	pressure: 0.8,
	splatRadius: 0.75,
	splatForce: 2200,
	shading: true,
	colorful: false,
	bloom: false,
	sunrays: false,
	initialSplatCount: 0,
	backColor: { r: 222, g: 218, b: 215 },
	presetSplats: [
		{ x: 0.18, y: 0.06, dx: 8, dy: 180, color: { r: 1.7, g: 0.12, b: 0.08 } },
		{ x: 0.32, y: 0.1, dx: -5, dy: 160, color: { r: 1.8, g: 0.45, b: 0.08 } },
		{ x: 0.46, y: 0.04, dx: 12, dy: 210, color: { r: 1.7, g: 0.95, b: 0.18 } },
		{ x: 0.6, y: 0.12, dx: -8, dy: 180, color: { r: 1.8, g: 0.62, b: 0.12 } },
		{ x: 0.74, y: 0.06, dx: -15, dy: 200, color: { r: 1.7, g: 0.3, b: 0.22 } },
		{ x: 0.86, y: 0.1, dx: -10, dy: 170, color: { r: 1.6, g: 0.18, b: 0.4 } },
		{ x: 0.5, y: 0.18, dx: 4, dy: 140, color: { r: 1.7, g: 0.55, b: 0.05 } },
		{ x: 0.28, y: 0.16, dx: 10, dy: 150, color: { r: 1.5, g: 0.08, b: 0.18 } }
	]
};

export const PLASMA_CONFIG: PresetConfig = {
	curl: 40,
	densityDissipation: 0.12,
	initialDensityDissipation: 0.6,
	initialDensityDissipationDuration: 2.0,
	velocityDissipation: 0.08,
	pressure: 0.8,
	splatRadius: 0.35,
	splatForce: 5000,
	shading: true,
	colorful: true,
	colorUpdateSpeed: 8,
	bloom: true,
	bloomThreshold: 0.6,
	bloomIntensity: 1.5,
	sunrays: true,
	sunraysWeight: 0.5,
	initialSplatCount: 0,
	backColor: { r: 4, g: 2, b: 12 },
	presetSplats: [
		{ x: 0.5, y: 0.95, dx: 0, dy: -600, color: { r: 1.8, g: 0.05, b: 0.1 } },
		{ x: 0.83, y: 0.83, dx: -424, dy: -424, color: { r: 1.8, g: 0.7, b: 0.05 } },
		{ x: 0.95, y: 0.5, dx: -600, dy: 0, color: { r: 1.5, g: 1.5, b: 0.05 } },
		{ x: 0.83, y: 0.17, dx: -424, dy: 424, color: { r: 0.1, g: 1.8, b: 0.2 } },
		{ x: 0.5, y: 0.05, dx: 0, dy: 600, color: { r: 0.05, g: 1.5, b: 1.8 } },
		{ x: 0.17, y: 0.17, dx: 424, dy: 424, color: { r: 0.1, g: 0.15, b: 2.2 } },
		{ x: 0.05, y: 0.5, dx: 600, dy: 0, color: { r: 1.0, g: 0.05, b: 2.0 } },
		{ x: 0.17, y: 0.83, dx: 424, dy: -424, color: { r: 1.8, g: 0.05, b: 1.2 } }
	],
	autoSplatRate: 0.4,
	autoSplatCount: 4,
	autoSplatEvenX: false,
	autoSplatCenterY: 0.5
};

export const INK_IN_WATER_CONFIG: PresetConfig = {
	curl: 8,
	densityDissipation: 0.3,
	velocityDissipation: 0.15,
	pressure: 0.85,
	splatRadius: 0.12,
	splatForce: 800,
	shading: true,
	colorful: false,
	bloom: true,
	bloomIntensity: 0.6,
	bloomThreshold: 0.4,
	sunrays: false,
	autoSplatRate: 0.2,
	autoSplatColor: { r: 0.06, g: 0.07, b: 0.5 },
	autoSplatVelocityX: 0,
	autoSplatVelocityY: -180,
	autoSplatCenterY: 0.9,
	initialSplatCount: 0,
	backColor: { r: 6, g: 8, b: 20 },
	presetSplats: [
		{ x: 0.3, y: 0.9, dx: 15, dy: -180, color: { r: 0.08, g: 0.06, b: 0.55 } },
		{ x: 0.5, y: 0.94, dx: -10, dy: -220, color: { r: 0.04, g: 0.1, b: 0.5 } },
		{ x: 0.7, y: 0.88, dx: 12, dy: -200, color: { r: 0.12, g: 0.05, b: 0.45 } },
		{ x: 0.42, y: 0.85, dx: -8, dy: -160, color: { r: 0.03, g: 0.08, b: 0.48 } },
		{ x: 0.6, y: 0.92, dx: 5, dy: -190, color: { r: 0.06, g: 0.04, b: 0.52 } }
	]
};

export const FROZEN_SWIRL_CONFIG: PresetConfig = {
	containerShape: { type: 'circle', cx: 0.5, cy: 0.5, radius: 0.45 },
	curl: 50,
	densityDissipation: 0,
	velocityDissipation: 1.0,
	pressure: 0.95,
	splatRadius: 0.5,
	splatForce: 8000,
	shading: true,
	colorful: false,
	bloom: true,
	bloomIntensity: 1.0,
	sunrays: false,
	initialSplatCount: 0,
	backColor: { r: 4, g: 8, b: 24 },
	presetSplats: [
		{ x: 0.5, y: 0.5, dx: 1100, dy: 0, color: { r: 0.4, g: 0.85, b: 1.6 } },
		{ x: 0.35, y: 0.42, dx: -300, dy: 200, color: { r: 0.55, g: 0.95, b: 1.5 } },
		{ x: 0.62, y: 0.58, dx: 400, dy: -150, color: { r: 0.7, g: 1.1, b: 1.7 } }
	]
};

export const AURORA_CONFIG: PresetConfig = {
	curl: 40,
	densityDissipation: 0,
	velocityDissipation: 0.3,
	pressure: 0.85,
	splatRadius: 0.4,
	splatForce: 6000,
	shading: true,
	colorful: false,
	bloom: true,
	bloomIntensity: 1.5,
	sunrays: true,
	sunraysWeight: 1.4,
	initialSplatCount: 0,
	backColor: { r: 2, g: 4, b: 18 },
	presetSplats: [
		{ x: 0.15, y: 0.55, dx: 700, dy: 80, color: { r: 0.1, g: 1.6, b: 0.45 } },
		{ x: 0.45, y: 0.6, dx: 600, dy: -60, color: { r: 0.15, g: 1.4, b: 0.55 } },
		{ x: 0.78, y: 0.5, dx: -550, dy: 90, color: { r: 1.5, g: 0.25, b: 1.4 } },
		{ x: 0.3, y: 0.45, dx: 500, dy: 30, color: { r: 0.45, g: 0.9, b: 1.6 } },
		{ x: 0.65, y: 0.62, dx: -650, dy: -40, color: { r: 0.3, g: 1.5, b: 0.85 } }
	]
};

// ----------------------------------------------------------------------------
// Container-shape presets
// ----------------------------------------------------------------------------

export const CIRCULAR_FLUID_CONFIG: PresetConfig = {
	containerShape: { type: 'circle', cx: 0.5, cy: 0.5, radius: 0.45 },
	curl: 35,
	densityDissipation: 0.15,
	initialDensityDissipation: 0.5,
	initialDensityDissipationDuration: 2.0,
	velocityDissipation: 0.06,
	pressure: 0.8,
	splatRadius: 0.38,
	splatForce: 5000,
	shading: true,
	colorful: true,
	colorUpdateSpeed: 8,
	bloom: true,
	bloomThreshold: 0.6,
	bloomIntensity: 1.0,
	sunrays: false,
	initialSplatCount: 0,
	backColor: { r: 4, g: 2, b: 12 },
	presetSplats: [
		{ x: 0.5, y: 0.85, dx: 0, dy: -500, color: { r: 0.9, g: 0.03, b: 0.05 } },
		{ x: 0.64, y: 0.75, dx: -354, dy: -354, color: { r: 0.9, g: 0.35, b: 0.03 } },
		{ x: 0.69, y: 0.5, dx: -500, dy: 0, color: { r: 0.8, g: 0.8, b: 0.03 } },
		{ x: 0.64, y: 0.25, dx: -354, dy: 354, color: { r: 0.05, g: 0.9, b: 0.1 } },
		{ x: 0.5, y: 0.15, dx: 0, dy: 500, color: { r: 0.03, g: 0.75, b: 0.9 } },
		{ x: 0.36, y: 0.25, dx: 354, dy: 354, color: { r: 0.05, g: 0.08, b: 1.1 } },
		{ x: 0.31, y: 0.5, dx: 500, dy: 0, color: { r: 0.5, g: 0.03, b: 1.0 } },
		{ x: 0.36, y: 0.75, dx: 354, dy: -354, color: { r: 0.9, g: 0.03, b: 0.6 } }
	],
	autoSplatRate: 1.2,
	autoSplatCount: 1,
	autoSplatCenterY: 0.5,
	autoSplatBandHeight: 0.8,
	autoSplatSwirl: 500
};

export const FRAME_FLUID_CONFIG: PresetConfig = {
	// Base frame geometry; the component merges forwarded
	// innerCornerRadius/outerCornerRadius over this.
	containerShape: { type: 'frame', cx: 0.5, cy: 0.5, halfW: 0.25, halfH: 0.25 },
	curl: 30,
	densityDissipation: 0.08,
	initialDensityDissipation: 0.5,
	initialDensityDissipationDuration: 2.0,
	velocityDissipation: 0.06,
	pressure: 0.8,
	splatRadius: 0.42,
	splatForce: 5000,
	shading: true,
	colorful: true,
	colorUpdateSpeed: 8,
	bloom: true,
	bloomThreshold: 0.6,
	bloomIntensity: 0.9,
	sunrays: false,
	initialSplatCount: 0,
	backColor: { r: 0, g: 0, b: 0 },
	presetSplats: [
		{ x: 0.5, y: 0.92, dx: 400, dy: 0, color: { r: 0.9, g: 0.1, b: 0.1 } },
		{ x: 0.92, y: 0.5, dx: 0, dy: -400, color: { r: 0.1, g: 0.9, b: 0.1 } },
		{ x: 0.5, y: 0.08, dx: -400, dy: 0, color: { r: 0.1, g: 0.1, b: 0.9 } },
		{ x: 0.08, y: 0.5, dx: 0, dy: 400, color: { r: 0.9, g: 0.9, b: 0.1 } },
		{ x: 0.9, y: 0.9, dx: -300, dy: -300, color: { r: 0.9, g: 0.5, b: 0.1 } },
		{ x: 0.9, y: 0.1, dx: -300, dy: 300, color: { r: 0.1, g: 0.9, b: 0.5 } },
		{ x: 0.1, y: 0.1, dx: 300, dy: 300, color: { r: 0.5, g: 0.1, b: 0.9 } },
		{ x: 0.1, y: 0.9, dx: 300, dy: -300, color: { r: 0.9, g: 0.1, b: 0.9 } }
	],
	autoSplatRate: 0.5,
	autoSplatCount: 6,
	autoSplatCenterY: 0.5,
	autoSplatBandHeight: 2.0,
	autoSplatSwirl: 300
};

export const ANNULAR_FLUID_CONFIG: PresetConfig = {
	containerShape: { type: 'annulus', cx: 0.5, cy: 0.5, innerRadius: 0.15, outerRadius: 0.45 },
	curl: 35,
	densityDissipation: 0.08,
	initialDensityDissipation: 0.5,
	initialDensityDissipationDuration: 2.0,
	velocityDissipation: 0.06,
	pressure: 0.8,
	splatRadius: 0.38,
	splatForce: 5000,
	shading: true,
	colorful: true,
	colorUpdateSpeed: 8,
	bloom: true,
	bloomThreshold: 0.6,
	bloomIntensity: 1.0,
	sunrays: false,
	initialSplatCount: 0,
	backColor: { r: 4, g: 2, b: 12 },
	presetSplats: [
		{ x: 0.5, y: 0.8, dx: 400, dy: 0, color: { r: 0.9, g: 0.1, b: 0.1 } },
		{ x: 0.61, y: 0.71, dx: 283, dy: -283, color: { r: 0.9, g: 0.5, b: 0.1 } },
		{ x: 0.67, y: 0.5, dx: 0, dy: -400, color: { r: 0.8, g: 0.8, b: 0.1 } },
		{ x: 0.61, y: 0.29, dx: -283, dy: -283, color: { r: 0.1, g: 0.9, b: 0.2 } },
		{ x: 0.5, y: 0.2, dx: -400, dy: 0, color: { r: 0.1, g: 0.7, b: 0.9 } },
		{ x: 0.39, y: 0.29, dx: -283, dy: 283, color: { r: 0.1, g: 0.1, b: 0.9 } },
		{ x: 0.33, y: 0.5, dx: 0, dy: 400, color: { r: 0.6, g: 0.1, b: 0.9 } },
		{ x: 0.39, y: 0.71, dx: 283, dy: 283, color: { r: 0.9, g: 0.1, b: 0.6 } }
	],
	autoSplatRate: 0.5,
	autoSplatCount: 5,
	autoSplatCenterY: 0.5,
	autoSplatBandHeight: 0.8,
	autoSplatSwirl: 600
};

export const SVG_PATH_FLUID_CONFIG: PresetConfig = {
	containerShape: { type: 'svgPath', text: '&', font: 'bold 200px Georgia, serif', fillRule: 'evenodd' },
	curl: 30,
	densityDissipation: 0.3,
	velocityDissipation: 0.1,
	pressure: 0.8,
	splatRadius: 0.3,
	splatForce: 5000,
	shading: true,
	colorful: true,
	bloom: true,
	bloomIntensity: 0.9,
	sunrays: false,
	initialSplatCount: 8,
	backColor: { r: 2, g: 2, b: 8 },
	autoSplatRate: 0.8,
	autoSplatCount: 1,
	autoSplatBandHeight: 2.0,
	autoSplatSwirl: 400
};

// Toroidal's ring splats are derived; compute the literal array here so the
// config stays plain serializable data while preserving the derivation.
const TOROIDAL_R = 0.285; // mid-ring radius
const TOROIDAL_A = 1.3; // approximate aspect ratio for x correction
const TOROIDAL_V = 300; // strong tangential kick
const TOROIDAL_S = TOROIDAL_V * 0.707;
const TOROIDAL_SPLATS: PresetSplat[] = [
	{ x: 0.5 + TOROIDAL_R / TOROIDAL_A, y: 0.5, dx: 0, dy: TOROIDAL_V, color: { r: 1.8, g: 0.05, b: 0.1 } },
	{ x: 0.5 + (TOROIDAL_R / TOROIDAL_A) * 0.707, y: 0.5 + TOROIDAL_R * 0.707, dx: -TOROIDAL_S, dy: TOROIDAL_S, color: { r: 1.8, g: 0.7, b: 0.05 } },
	{ x: 0.5, y: 0.5 + TOROIDAL_R, dx: -TOROIDAL_V, dy: 0, color: { r: 1.5, g: 1.5, b: 0.05 } },
	{ x: 0.5 - (TOROIDAL_R / TOROIDAL_A) * 0.707, y: 0.5 + TOROIDAL_R * 0.707, dx: -TOROIDAL_S, dy: -TOROIDAL_S, color: { r: 0.1, g: 1.8, b: 0.2 } },
	{ x: 0.5 - TOROIDAL_R / TOROIDAL_A, y: 0.5, dx: 0, dy: -TOROIDAL_V, color: { r: 0.05, g: 1.5, b: 1.8 } },
	{ x: 0.5 - (TOROIDAL_R / TOROIDAL_A) * 0.707, y: 0.5 - TOROIDAL_R * 0.707, dx: TOROIDAL_S, dy: -TOROIDAL_S, color: { r: 0.1, g: 0.15, b: 2.2 } },
	{ x: 0.5, y: 0.5 - TOROIDAL_R, dx: TOROIDAL_V, dy: 0, color: { r: 1.0, g: 0.05, b: 2.0 } },
	{ x: 0.5 + (TOROIDAL_R / TOROIDAL_A) * 0.707, y: 0.5 - TOROIDAL_R * 0.707, dx: TOROIDAL_S, dy: TOROIDAL_S, color: { r: 1.8, g: 0.05, b: 1.2 } }
];

export const TOROIDAL_CONFIG: PresetConfig = {
	containerShape: { type: 'annulus', cx: 0.5, cy: 0.5, innerRadius: 0.15, outerRadius: 0.42 },
	curl: 50,
	densityDissipation: 0.25,
	initialDensityDissipation: 0.6,
	initialDensityDissipationDuration: 2.0,
	velocityDissipation: 0.02,
	pressure: 0.8,
	splatRadius: 0.4,
	splatForce: 6000,
	shading: true,
	colorful: true,
	colorUpdateSpeed: 8,
	bloom: true,
	bloomThreshold: 0.5,
	bloomIntensity: 1.8,
	sunrays: true,
	sunraysWeight: 0.6,
	initialSplatCount: 0,
	backColor: { r: 2, g: 2, b: 10 },
	presetSplats: TOROIDAL_SPLATS
};

// ----------------------------------------------------------------------------
// Flow-scene presets
// ----------------------------------------------------------------------------

const GAS_FLARE_LEFT_WALL = 'M 34 100 L 46 100 L 46 74 C 44 72, 41 71, 37 72 L 34 76 Z';
const GAS_FLARE_RIGHT_WALL = 'M 54 100 L 66 100 L 66 76 L 63 72 C 59 71, 56 72, 54 74 Z';

const GAS_FLARE_FLOW: FlowConfig = {
	mode: 'live',
	boundary: { left: 'open', right: 'open', top: 'open', bottom: 'wall' },
	sources: [
		{
			kind: 'line',
			from: { x: 0.455, y: 0.245 },
			to: { x: 0.545, y: 0.245 },
			velocity: { x: 25, y: 760 },
			dye: { r: 0.9, g: 0.24, b: 0.025 },
			scalars: { temperature: 2.4 },
			rate: 60,
			radius: 0.045,
			profile: 'parabolic'
		},
		{
			kind: 'line',
			from: { x: 0.18, y: 0.42 },
			to: { x: 0.18, y: 0.82 },
			velocity: { x: 42, y: 0 },
			rate: 10,
			radius: 0.18,
			profile: 'uniform'
		}
	],
	outlets: [
		{ edge: 'top', from: 0, to: 1, width: 0.09, clearDye: 0.18, clearScalars: true, clearVelocity: true },
		{ edge: 'left', from: 0.36, to: 1, width: 0.035, clearDye: 0.35, clearScalars: false, clearVelocity: false },
		{ edge: 'right', from: 0.36, to: 1, width: 0.035, clearDye: 0.35, clearScalars: false, clearVelocity: false }
	],
	scalarFields: [{ name: 'temperature', dissipation: 0.5, advection: 'standard', range: [0, 3.2] }],
	forces: [{ kind: 'buoyancy', scalar: 'temperature', direction: { x: 0, y: 1 }, strength: 160, ambient: 0.03 }],
	visualization: { colorBy: 'temperature', scalar: 'temperature', glowBy: 'scalar', transfer: 'fire', range: [0, 3.2], scale: 0.9 }
};

export const GAS_FLARE_CONFIG: PresetConfig = {
	obstructions: [
		{ d: GAS_FLARE_LEFT_WALL, fit: 'fill' },
		{ d: GAS_FLARE_RIGHT_WALL, fit: 'fill' }
	],
	flow: GAS_FLARE_FLOW,
	openBoundary: true,
	curl: 16,
	densityDissipation: 0.42,
	initialDensityDissipation: 0.55,
	velocityDissipation: 0.055,
	pressure: 0.85,
	pressureIterations: 24,
	splatRadius: 0.06,
	splatForce: 3800,
	shading: false,
	colorful: false,
	bloom: true,
	bloomIterations: 5,
	bloomResolution: 192,
	bloomThreshold: 0.48,
	bloomIntensity: 1.0,
	sunrays: false,
	sunraysWeight: 0,
	simResolution: 160,
	dyeResolution: 768,
	initialSplatCount: 0,
	backColor: { r: 6, g: 6, b: 8 }
};

const VENTURI_TOP = 'M0 0 L100 0 L100 18 C75 18 62 44 50 44 C38 44 25 18 0 18 Z';
const VENTURI_BOTTOM = 'M0 100 L100 100 L100 82 C75 82 62 56 50 56 C38 56 25 82 0 82 Z';

const VENTURI_FLOW: FlowConfig = {
	mode: 'live',
	boundary: { left: 'open', right: 'open', top: 'wall', bottom: 'wall' },
	forces: [{ kind: 'pressureGradient', vector: { x: 42, y: 0 } }],
	outlets: [{ edge: 'right', from: 0, to: 1, width: 0.05, clearDye: 0.35, clearScalars: true, clearVelocity: true }],
	visualization: { colorBy: 'speed', glowBy: 'none', transfer: 'cfd', range: [0, 170], scale: 1.12 }
};

export const VENTURI_CONFIG: PresetConfig = {
	obstructions: [
		{ d: VENTURI_TOP, fit: 'fill' },
		{ d: VENTURI_BOTTOM, fit: 'fill' }
	],
	flow: VENTURI_FLOW,
	openBoundary: true,
	curl: 0,
	densityDissipation: 0.35,
	velocityDissipation: 0.09,
	maxTimeStep: 1 / 60,
	substeps: 1,
	viscosity: 0.016,
	viscosityIterations: 5,
	wallFriction: 0.16,
	wallFrictionWidth: 2,
	pressure: 0.9,
	pressureIterations: 26,
	splatRadius: 0.055,
	splatForce: 6000,
	shading: false,
	colorful: false,
	bloom: false,
	bloomThreshold: 0.6,
	bloomIntensity: 0.5,
	sunrays: false,
	simResolution: 160,
	dyeResolution: 512,
	initialSplatCount: 0,
	backColor: { r: 6, g: 10, b: 14 }
};

const KARMAN_CYLINDER: Obstruction = {
	d: 'M 25 52 A 10 10 0 1 0 45 52 A 10 10 0 1 0 25 52 Z',
	viewBox: [0, 0, 100, 100],
	fit: 'fill'
};

const KARMAN_V0 = 460;
const KARMAN_SPLATS: PresetSplat[] = [
	{ x: 0.04, y: 0.14, dx: KARMAN_V0, dy: 0, color: { r: 0.2, g: 0.12, b: 0.3 } },
	{ x: 0.04, y: 0.32, dx: KARMAN_V0, dy: 0, color: { r: 0.1, g: 0.25, b: 0.3 } },
	{ x: 0.04, y: 0.5, dx: KARMAN_V0, dy: 0, color: { r: 0.28, g: 0.22, b: 0.1 } },
	{ x: 0.04, y: 0.68, dx: KARMAN_V0, dy: 0, color: { r: 0.1, g: 0.28, b: 0.16 } },
	{ x: 0.04, y: 0.86, dx: KARMAN_V0, dy: 0, color: { r: 0.3, g: 0.12, b: 0.18 } }
];

const KARMAN_RAKE_X = 0.03;
const KARMAN_RAKE_RATE = 26;
const KARMAN_RAKE_RADIUS = 0.028;
const karmanRakeLine = (y: number, dye: RGB) =>
	({ kind: 'point', x: KARMAN_RAKE_X, y, dye, rate: KARMAN_RAKE_RATE, radius: KARMAN_RAKE_RADIUS }) as const;

const KARMAN_FLOW: FlowConfig = {
	mode: 'live',
	boundary: { left: 'open', right: 'open', top: 'open', bottom: 'open' },
	forces: [{ kind: 'pressureGradient', vector: { x: 64, y: 0 } }],
	sources: [
		karmanRakeLine(0.2, { r: 0.42, g: 0.07, b: 0.1 }),
		karmanRakeLine(0.32, { r: 0.42, g: 0.26, b: 0.05 }),
		karmanRakeLine(0.44, { r: 0.36, g: 0.4, b: 0.07 }),
		karmanRakeLine(0.56, { r: 0.07, g: 0.38, b: 0.18 }),
		karmanRakeLine(0.68, { r: 0.06, g: 0.26, b: 0.44 }),
		karmanRakeLine(0.8, { r: 0.34, g: 0.1, b: 0.4 })
	],
	outlets: [
		{ edge: 'right', from: 0, to: 1, width: 0.075, clearDye: 0.08, clearScalars: true, clearVelocity: true },
		{ edge: 'top', from: 0, to: 1, width: 0.045, clearDye: 0.12, clearScalars: true, clearVelocity: false },
		{ edge: 'bottom', from: 0, to: 1, width: 0.045, clearDye: 0.12, clearScalars: true, clearVelocity: false },
		{ edge: 'left', from: 0, to: 1, width: 0.02, clearDye: 0.45, clearScalars: true, clearVelocity: false }
	],
	visualization: { colorBy: 'dye' }
};

export const KARMAN_CONFIG: PresetConfig = {
	obstructions: [KARMAN_CYLINDER],
	obstructionColor: { r: 86, g: 98, b: 122 },
	flow: KARMAN_FLOW,
	openBoundary: true,
	curl: 10,
	densityDissipation: 0.7,
	velocityDissipation: 0.075,
	maxTimeStep: 1 / 120,
	substeps: 2,
	viscosity: 0.014,
	viscosityIterations: 8,
	wallFriction: 0.16,
	wallFrictionWidth: 2,
	pressure: 0.9,
	pressureIterations: 34,
	splatRadius: 0.06,
	splatForce: 6000,
	shading: false,
	colorful: false,
	bloom: false,
	sunrays: false,
	simResolution: 192,
	dyeResolution: 1024,
	initialSplatCount: 0,
	presetSplats: KARMAN_SPLATS,
	backColor: { r: 4, g: 6, b: 14 }
};

// Cropped to the first three patent cells from the reference Tesla-valve SVG,
// simplified to a compact polygon path. Even-odd holes are the internal slots.
const TESLA_VALVE_PATH = `
	M 0 93.5 L 0.5 173.8 L 32.5 173.7 L 149.5 155.3 L 163.5 154.4 L 179.5 155.3 L 196.5 158.3 L 427.5 223.7 L 460.5 231.8 L 476.5 229.8 L 489.5 222.7 L 499.9 210.5 L 503.9 201.5 L 505.8 193.5 L 505.8 179.5 L 500.8 164.5 L 496.5 157.9 L 489.1 150.5 L 474.5 142.1 L 474.1 137.5 L 476.5 135.9 L 797.5 226.7 L 818.5 231.7 L 825.5 231.8 L 834.5 229.8 L 846.1 223.5 L 856.9 211.5 L 862.8 195.5 L 862.9 179.5 L 859 166.5 L 850.5 154.4 L 842.5 148 L 832.5 142.5 L 831.2 138.5 L 832.5 136.2 L 834.5 135.7 L 1157.5 227.8 L 1174.5 231.7 L 1190.5 229.8 L 1197.5 226.8 L 1204.5 221.7 L 1214 209.5 L 1219 193.5 L 1217.9 175.5 L 1212.6 162.5 L 1204.1 152.5 L 1188.5 143.1 L 1186.7 139.5 L 1188.5 136.1 L 1191.5 135.9 L 1220 144 L 1220 64.7 L 1031.5 118.6 L 1011.5 123 L 1009.2 120.5 L 1010.5 116.5 L 1024.5 108.8 L 1036.8 95.5 L 1041.8 83.5 L 1043.2 68.5 L 1039.8 53.5 L 1032.5 40.8 L 1020.5 31.2 L 1006.5 27.2 L 987.5 30.3 L 657.5 123.2 L 654 121.5 L 654.4 117.5 L 665.5 111.8 L 672.5 106.7 L 682 95.5 L 686.9 82.5 L 687.9 68.5 L 683.7 51.5 L 676.9 40.5 L 671.5 35.3 L 663.5 30.2 L 651.5 27.3 L 641.5 28 L 628.5 31.3 L 300.5 123.7 L 296.9 121.5 L 297.2 117.5 L 313.5 108.9 L 324.8 96.5 L 329.8 85.5 L 331.8 70.5 L 328.9 54.5 L 320.9 40.5 L 315.5 35.3 L 307.5 30.3 L 295.5 27.3 L 278.5 29.3 L 36.5 90.8 L 0.5 91.8 Z
	M 142.4 96.5 L 142.5 95.4 L 146.5 94.1 L 288.5 56.2 L 295.5 57 L 299.4 59.5 L 303 64.5 L 304.6 70.5 L 302.8 80.5 L 299.5 85 L 295.5 87.8 L 200.5 114.1 Z
	M 323.2 162.5 L 379.5 144.4 L 469.5 172 L 473.3 174.5 L 477 179.5 L 478.5 185.5 L 477.9 191.5 L 475.7 196.5 L 472.5 199.8 L 468.5 201.9 L 461.5 202.7 Z
	M 684 162.5 L 741.5 144.8 L 829.5 172.1 L 833.7 175.5 L 836.8 180.5 L 837.7 185.5 L 837 191.5 L 834.7 196.5 L 831.5 199.8 L 825.4 202.5 L 820.5 202.7 Z
	M 507.8 96.5 L 529.5 89.2 L 647.5 56.3 L 652.5 57.1 L 656.5 59.4 L 659.9 63.5 L 661.8 68.5 L 661.9 75.5 L 659.9 81.5 L 656.5 85.7 L 652.5 87.9 L 564.5 114.1 Z
	M 1040.1 162.5 L 1097.5 144.7 L 1185.5 172.4 L 1190.9 177.5 L 1192.7 181.5 L 1192.8 191.5 L 1189.6 197.5 L 1185.5 200.9 L 1180.5 202.5 L 1175.5 202.5 Z
	M 864.8 96.5 L 879.5 91.3 L 1003.5 56.3 L 1008.5 57.2 L 1012.5 59.7 L 1015.7 63.5 L 1017.6 69.5 L 1017.6 75.5 L 1015.6 81.5 L 1008.5 87.7 L 921.5 114.1 Z
`;

const TESLA_VALVE_CHANNEL: ContainerShape = {
	type: 'svgPath',
	viewBox: [0, 0, 1220, 257],
	fillRule: 'evenodd',
	maskResolution: 2048,
	d: TESLA_VALVE_PATH
};

const TESLA_VALVE_FLOW: FlowConfig = {
	mode: 'live',
	boundary: { left: 'open', right: 'open', top: 'wall', bottom: 'wall' },
	forces: [{ kind: 'pressureGradient', vector: { x: 28, y: 0 } }],
	outlets: [{ edge: 'right', from: 0.16, to: 0.84, width: 0.08, clearDye: 0.32, clearScalars: true, clearVelocity: true }]
};

export const TESLA_VALVE_CONFIG: PresetConfig = {
	containerShape: TESLA_VALVE_CHANNEL,
	flow: TESLA_VALVE_FLOW,
	curl: 10,
	densityDissipation: 0.36,
	velocityDissipation: 0.085,
	maxTimeStep: 1 / 60,
	substeps: 1,
	viscosity: 0.04,
	viscosityIterations: 10,
	wallFriction: 0.14,
	wallFrictionWidth: 2,
	pressure: 0.9,
	pressureIterations: 30,
	splatRadius: 0.085,
	splatForce: 6000,
	autoSplatRate: 5,
	autoSplatCount: 4,
	autoSplatVelocityX: 190,
	autoSplatVelocityY: 0,
	autoSplatCenterX: 0.035,
	autoSplatBandWidth: 0.024,
	autoSplatCenterY: 0.49,
	autoSplatBandHeight: 0.18,
	shading: false,
	colorful: false,
	bloom: false,
	sunrays: false,
	simResolution: 192,
	dyeResolution: 768,
	initialSplatCount: 0,
	backColor: { r: 5, g: 9, b: 12 }
};

// ----------------------------------------------------------------------------
// Aggregate
// ----------------------------------------------------------------------------

/** Ordered preset definitions: classic → container → flow. */
export const PRESETS: readonly PresetDefinition[] = [
	{ id: 'LavaLamp', name: 'Lava Lamp', category: 'classic', blurb: 'Warm buoyant blobs rising in a glass vessel.', config: LAVA_LAMP_CONFIG },
	{ id: 'Plasma', name: 'Plasma', category: 'classic', blurb: 'A confined full-spectrum plasma ball churning at center.', config: PLASMA_CONFIG },
	{ id: 'InkInWater', name: 'Ink in Water', category: 'classic', blurb: 'India-ink droplets blooming as they sink through dark water.', config: INK_IN_WATER_CONFIG },
	{ id: 'FrozenSwirl', name: 'Frozen Swirl', category: 'classic', blurb: 'A single icy whirlpool that spins out and freezes in place.', config: FROZEN_SWIRL_CONFIG },
	{ id: 'Aurora', name: 'Aurora', category: 'classic', blurb: 'Layered green and magenta ribbons glowing like northern lights.', config: AURORA_CONFIG },
	{ id: 'CircularFluid', name: 'Circular Fluid', category: 'container', blurb: 'Vivid fluid swirling inside a circular container.', config: CIRCULAR_FLUID_CONFIG },
	{ id: 'FrameFluid', name: 'Frame Fluid', category: 'container', blurb: 'Fluid circulating around a rectangular picture-frame cutout.', config: FRAME_FLUID_CONFIG },
	{ id: 'AnnularFluid', name: 'Annular Fluid', category: 'container', blurb: 'A ring-vortex orbiting between two concentric circles.', config: ANNULAR_FLUID_CONFIG },
	{ id: 'SvgPathFluid', name: 'SVG Path Fluid', category: 'container', blurb: 'Fluid confined to an ampersand glyph (text container shape).', config: SVG_PATH_FLUID_CONFIG },
	{ id: 'Toroidal', name: 'Toroidal', category: 'container', blurb: 'A violent full-spectrum storm circulating in a toroidal ring.', config: TOROIDAL_CONFIG },
	{ id: 'GasFlare', name: 'Gas Flare', category: 'flow', blurb: 'A hot buoyant jet rising from a flare-stack nozzle.', config: GAS_FLARE_CONFIG },
	{ id: 'Venturi', name: 'Venturi', category: 'flow', blurb: "Bernoulli's principle: flow accelerating through a pinched throat.", config: VENTURI_CONFIG },
	{ id: 'Karman', name: 'Kármán Vortex Street', category: 'flow', blurb: 'Flow past a cylinder, evoking a von Kármán vortex street.', config: KARMAN_CONFIG },
	{ id: 'TeslaValve', name: 'Tesla Valve', category: 'flow', blurb: 'Throughflow routing through a passive Tesla-valve channel.', config: TESLA_VALVE_CONFIG }
];

/** Lookup by preset id. */
export const PRESET_BY_ID: Record<string, PresetDefinition> = Object.fromEntries(
	PRESETS.map((p) => [p.id, p])
);

/** Get a preset definition by id, or `undefined` if unknown. */
export function getPreset(id: string): PresetDefinition | undefined {
	return PRESET_BY_ID[id];
}
