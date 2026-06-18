/*
 * Preset → Playground transfer (demo site).
 *
 * Pure mapping from a registry preset's config to the playground editor's
 * control state, so "Open in Playground" loads the same configuration. The
 * playground also renders the EXACT preset (via its config) for full fidelity;
 * this mapping hydrates the editable controls and reports which config
 * dimensions the slider editor cannot represent (for an honest UI note).
 *
 * Kept pure and framework-free so it is unit-testable without mounting.
 */

import type { PresetDefinition } from '$lib/presets/registry.js';
import type { RGB } from '$lib/engine/types.js';

export type EditorMode = 'fluid' | 'flow' | 'reveal' | 'sticky' | 'distortion';
export type ContainerType = 'none' | 'circle' | 'roundedRect' | 'frame' | 'annulus';
export type FlowScene = 'GasFlare' | 'Venturi' | 'Karman' | 'TeslaValve' | 'CustomFlow';

/** Numeric controls the playground exposes as sliders. */
export const EDITOR_SCALAR_KEYS = [
	'curl',
	'splatRadius',
	'splatForce',
	'densityDissipation',
	'velocityDissipation',
	'maxTimeStep',
	'substeps',
	'viscosity',
	'viscosityIterations',
	'wallFriction',
	'wallFrictionWidth',
	'pressure',
	'pressureIterations',
	'autoSplatRate',
	'autoSplatCount',
	'autoSplatVelocityX',
	'autoSplatVelocityY',
	'autoSplatCenterX',
	'autoSplatCenterY',
	'autoSplatBandWidth',
	'autoSplatBandHeight',
	'autoSplatSwirl'
] as const;

/** Boolean toggles the playground exposes. */
export const EDITOR_BOOL_KEYS = [
	'bloom',
	'shading',
	'sunrays',
	'colorful',
	'splatOnHover',
	'transparent',
	'autoSplatEvenX'
] as const;

export interface EditorState {
	mode: EditorMode;
	flowScene?: FlowScene;
	containerType: ContainerType;
	glass: boolean;
	backColor?: RGB;
	scalars: Record<string, number>;
	bools: Record<string, boolean>;
	/** Config dimensions the slider editor cannot reproduce (shown as a note). */
	unrepresented: string[];
}

const FLOW_SCENES = new Set(['GasFlare', 'Venturi', 'Karman', 'TeslaValve']);
const ANALYTICAL_SHAPES = new Set(['circle', 'roundedRect', 'frame', 'annulus']);

/**
 * Map a registry preset to the playground editor's control state. Flow presets
 * resolve to their flow scene (rendered by the real component); container/
 * classic presets hydrate the scalar/boolean sliders, container type, glass,
 * and background.
 */
export function presetToEditorState(def: PresetDefinition): EditorState {
	const c = def.config;
	const isFlow = !!c.flow;
	const shapeType = c.containerShape?.type;
	const containerType: ContainerType =
		shapeType && ANALYTICAL_SHAPES.has(shapeType) ? (shapeType as ContainerType) : 'none';

	const scalars: Record<string, number> = {};
	for (const k of EDITOR_SCALAR_KEYS) {
		const v = c[k];
		if (typeof v === 'number') scalars[k] = v;
	}
	const bools: Record<string, boolean> = {};
	for (const k of EDITOR_BOOL_KEYS) {
		const v = c[k];
		if (typeof v === 'boolean') bools[k] = v;
	}

	const unrepresented: string[] = [];
	if (c.presetSplats) unrepresented.push('presetSplats');
	if (c.flow) unrepresented.push('flow');
	if (c.obstructions) unrepresented.push('obstructions');
	if (c.obstructionColor) unrepresented.push('obstructionColor');
	if (shapeType === 'svgPath') unrepresented.push('containerShape (svgPath)');

	return {
		mode: isFlow ? 'flow' : 'fluid',
		flowScene: isFlow ? (FLOW_SCENES.has(def.id) ? (def.id as FlowScene) : 'CustomFlow') : undefined,
		containerType,
		glass: !!c.glass,
		backColor: c.backColor,
		scalars,
		bools,
		unrepresented
	};
}

/** Parse a `?preset=<id>` value into a known preset id, or null. */
export function parsePresetParam(value: string | null, knownIds: readonly string[]): string | null {
	if (!value) return null;
	return knownIds.includes(value) ? value : null;
}
