import { describe, expect, it } from 'vitest';
import { PRESETS, PRESET_BY_ID } from '$lib/presets/registry.js';
import { parsePresetParam, presetToEditorState } from './presetTransfer.js';

describe('presetToEditorState', () => {
	it('maps a classic preset (LavaLamp) to fluid mode with hydrated controls', () => {
		const s = presetToEditorState(PRESET_BY_ID.LavaLamp);
		expect(s.mode).toBe('fluid');
		expect(s.containerType).toBe('roundedRect');
		expect(s.glass).toBe(true);
		expect(s.scalars.curl).toBe(5);
		expect(s.scalars.splatRadius).toBe(0.75);
		expect(s.backColor).toEqual({ r: 222, g: 218, b: 215 });
		expect(s.unrepresented).toContain('presetSplats');
	});

	it('maps a container preset (CircularFluid) to its analytical shape', () => {
		const s = presetToEditorState(PRESET_BY_ID.CircularFluid);
		expect(s.mode).toBe('fluid');
		expect(s.containerType).toBe('circle');
		expect(s.scalars.curl).toBe(35);
		expect(s.bools.colorful).toBe(true);
	});

	it('flags an svgPath container as unrepresentable and falls back to none', () => {
		const s = presetToEditorState(PRESET_BY_ID.SvgPathFluid);
		expect(s.containerType).toBe('none');
		expect(s.unrepresented).toContain('containerShape (svgPath)');
	});

	it('maps a flow preset (Karman) to its flow scene', () => {
		const s = presetToEditorState(PRESET_BY_ID.Karman);
		expect(s.mode).toBe('flow');
		expect(s.flowScene).toBe('Karman');
		expect(s.unrepresented).toEqual(
			expect.arrayContaining(['flow', 'presetSplats', 'obstructions', 'obstructionColor'])
		);
	});

	it('maps TeslaValve (flow + svgPath container) correctly', () => {
		const s = presetToEditorState(PRESET_BY_ID.TeslaValve);
		expect(s.mode).toBe('flow');
		expect(s.flowScene).toBe('TeslaValve');
		expect(s.unrepresented).toEqual(
			expect.arrayContaining(['flow', 'containerShape (svgPath)'])
		);
	});

	it('produces a valid mode for every preset without throwing', () => {
		const validModes = new Set(['fluid', 'flow']);
		for (const p of PRESETS) {
			const s = presetToEditorState(p);
			expect(validModes.has(s.mode), p.id).toBe(true);
			if (s.mode === 'flow') expect(s.flowScene, p.id).toBeDefined();
		}
	});
});

describe('parsePresetParam', () => {
	const ids = PRESETS.map((p) => p.id);
	it('returns the id when known', () => {
		expect(parsePresetParam('Karman', ids)).toBe('Karman');
	});
	it('returns null for unknown or empty values', () => {
		expect(parsePresetParam('Nope', ids)).toBeNull();
		expect(parsePresetParam('', ids)).toBeNull();
		expect(parsePresetParam(null, ids)).toBeNull();
	});
});
