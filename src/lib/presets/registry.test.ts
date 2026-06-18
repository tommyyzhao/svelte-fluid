import { describe, expect, it } from 'vitest';

import lavaLamp from './LavaLamp.svelte?raw';
import plasma from './Plasma.svelte?raw';
import inkInWater from './InkInWater.svelte?raw';
import frozenSwirl from './FrozenSwirl.svelte?raw';
import aurora from './Aurora.svelte?raw';
import circularFluid from './CircularFluid.svelte?raw';
import frameFluid from './FrameFluid.svelte?raw';
import annularFluid from './AnnularFluid.svelte?raw';
import svgPathFluid from './SvgPathFluid.svelte?raw';
import toroidal from './Toroidal.svelte?raw';
import gasFlare from './GasFlare.svelte?raw';
import venturi from './Venturi.svelte?raw';
import karman from './Karman.svelte?raw';
import teslaValve from './TeslaValve.svelte?raw';

import { PRESETS, PRESET_BY_ID, getPreset } from './registry.js';

/** id → (component source, exported config const name) for the drift guard. */
const SOURCES: Record<string, { source: string; configVar: string }> = {
	LavaLamp: { source: lavaLamp, configVar: 'LAVA_LAMP_CONFIG' },
	Plasma: { source: plasma, configVar: 'PLASMA_CONFIG' },
	InkInWater: { source: inkInWater, configVar: 'INK_IN_WATER_CONFIG' },
	FrozenSwirl: { source: frozenSwirl, configVar: 'FROZEN_SWIRL_CONFIG' },
	Aurora: { source: aurora, configVar: 'AURORA_CONFIG' },
	CircularFluid: { source: circularFluid, configVar: 'CIRCULAR_FLUID_CONFIG' },
	FrameFluid: { source: frameFluid, configVar: 'FRAME_FLUID_CONFIG' },
	AnnularFluid: { source: annularFluid, configVar: 'ANNULAR_FLUID_CONFIG' },
	SvgPathFluid: { source: svgPathFluid, configVar: 'SVG_PATH_FLUID_CONFIG' },
	Toroidal: { source: toroidal, configVar: 'TOROIDAL_CONFIG' },
	GasFlare: { source: gasFlare, configVar: 'GAS_FLARE_CONFIG' },
	Venturi: { source: venturi, configVar: 'VENTURI_CONFIG' },
	Karman: { source: karman, configVar: 'KARMAN_CONFIG' },
	TeslaValve: { source: teslaValve, configVar: 'TESLA_VALVE_CONFIG' }
};

const EXPECTED_IDS = [
	'AnnularFluid',
	'Aurora',
	'CircularFluid',
	'FrameFluid',
	'FrozenSwirl',
	'GasFlare',
	'InkInWater',
	'Karman',
	'LavaLamp',
	'Plasma',
	'SvgPathFluid',
	'TeslaValve',
	'Toroidal',
	'Venturi'
];

describe('preset config registry', () => {
	it('covers exactly the 14 exported preset wrappers', () => {
		expect(PRESETS.map((p) => p.id).sort()).toEqual(EXPECTED_IDS);
		expect(PRESETS).toHaveLength(14);
	});

	it('every preset has a name, blurb, valid category, and a backColor default', () => {
		const categories = new Set(['classic', 'container', 'flow']);
		for (const p of PRESETS) {
			expect(p.name.length, p.id).toBeGreaterThan(0);
			expect(p.blurb.length, p.id).toBeGreaterThan(0);
			expect(categories.has(p.category), `${p.id} category ${p.category}`).toBe(true);
			expect(p.config.backColor, `${p.id} backColor`).toBeDefined();
		}
	});

	it('every config is plain JSON-serializable data (no functions, round-trips equal)', () => {
		for (const p of PRESETS) {
			const round = JSON.parse(JSON.stringify(p.config));
			expect(round, p.id).toEqual(p.config);
		}
	});

	it('PRESET_BY_ID and getPreset resolve the same objects', () => {
		for (const p of PRESETS) {
			expect(PRESET_BY_ID[p.id]).toBe(p);
			expect(getPreset(p.id)).toBe(p);
		}
		expect(getPreset('NotAPreset')).toBeUndefined();
	});

	it('has at least one preset in every category', () => {
		expect(PRESETS.some((p) => p.category === 'classic')).toBe(true);
		expect(PRESETS.some((p) => p.category === 'container')).toBe(true);
		expect(PRESETS.some((p) => p.category === 'flow')).toBe(true);
	});

	// Drift guard: each component must actually CONSUME its registry config by
	// spreading the const and deriving its default backColor from it. This is
	// what makes the registry the single source of truth for what renders.
	describe('components consume the registry (no drift)', () => {
		for (const id of EXPECTED_IDS) {
			it(`${id} spreads ${SOURCES[id].configVar}`, () => {
				const { source, configVar } = SOURCES[id];
				expect(source).toContain(`import { ${configVar} } from './registry.js'`);
				expect(source).toContain(`{...${configVar}}`);
				expect(source).toContain(`backColor={backColor ?? ${configVar}.backColor}`);
			});
		}
	});
});
