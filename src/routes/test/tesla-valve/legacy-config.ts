import type { FlowConfig } from '$lib/engine/types.js';
import { TESLA_VALVE_CONFIG, type PresetConfig } from '$lib/presets/registry.js';

/**
 * The 1.x TeslaValve preset as shipped before ADR 0132. Every lab tuning and the
 * conservation bench derive from it, so the preset can change without rewriting the
 * recorded earlier versions. Geometry is shared with the live preset.
 */
const LEGACY_TESLA_VALVE_FLOW: FlowConfig = {
	mode: 'live',
	boundary: { left: 'open', right: 'open', top: 'wall', bottom: 'wall' },
	forces: [{ kind: 'pressureGradient', vector: { x: 28, y: 0 } }],
	outlets: [{ edge: 'right', from: 0.16, to: 0.84, width: 0.08, clearDye: 0.32, clearScalars: true, clearVelocity: true }]
};

export const LEGACY_TESLA_VALVE_CONFIG: PresetConfig = {
	containerShape: TESLA_VALVE_CONFIG.containerShape,
	flow: LEGACY_TESLA_VALVE_FLOW,
	curl: 15,
	densityDissipation: 0.36,
	velocityDissipation: 0.085,
	maxTimeStep: 1 / 60,
	substeps: 1,
	viscosity: 0.026667,
	viscosityIterations: 10,
	wallFriction: 0.14,
	wallFrictionWidth: 2,
	pressure: 0.9,
	pressureIterations: 26,
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
	simResolution: 128,
	dyeResolution: 512,
	initialSplatCount: 0,
	backColor: { r: 5, g: 9, b: 12 }
};
