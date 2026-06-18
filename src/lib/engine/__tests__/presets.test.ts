import { describe, expect, it } from 'vitest';
import annularFluid from '../../presets/AnnularFluid.svelte?raw';
import aurora from '../../presets/Aurora.svelte?raw';
import circularFluid from '../../presets/CircularFluid.svelte?raw';
import frameFluid from '../../presets/FrameFluid.svelte?raw';
import frozenSwirl from '../../presets/FrozenSwirl.svelte?raw';
import inkInWater from '../../presets/InkInWater.svelte?raw';
import lavaLamp from '../../presets/LavaLamp.svelte?raw';
import plasma from '../../presets/Plasma.svelte?raw';
import gasFlare from '../../presets/GasFlare.svelte?raw';
import svgPathFluid from '../../presets/SvgPathFluid.svelte?raw';
import teslaValve from '../../presets/TeslaValve.svelte?raw';
import toroidal from '../../presets/Toroidal.svelte?raw';
import venturi from '../../presets/Venturi.svelte?raw';
import airfoil from '../../../routes/obstruction-demos/Airfoil.svelte?raw';
import karman from '../../presets/Karman.svelte?raw';
import maze from '../../../routes/obstruction-demos/Maze.svelte?raw';
import {
	GAS_FLARE_CONFIG,
	INK_IN_WATER_CONFIG,
	KARMAN_CONFIG,
	PRESET_BY_ID,
	PRESETS,
	TESLA_VALVE_CONFIG,
	VENTURI_CONFIG
} from '../../presets/registry.js';

const presets = {
	AnnularFluid: annularFluid,
	Aurora: aurora,
	CircularFluid: circularFluid,
	FrameFluid: frameFluid,
	FrozenSwirl: frozenSwirl,
	InkInWater: inkInWater,
	LavaLamp: lavaLamp,
	Plasma: plasma,
	GasFlare: gasFlare,
	SvgPathFluid: svgPathFluid,
	TeslaValve: teslaValve,
	Toroidal: toroidal,
	Venturi: venturi,
	Airfoil: airfoil,
	Karman: karman,
	Maze: maze
};

describe('preset pointer interaction defaults', () => {
	for (const [name, source] of Object.entries(presets)) {
		it(`${name} enables hover splats by default`, () => {
			expect(source).toContain('splatOnHover = true');
			expect(source).toContain('{splatOnHover}');
		});
	}
});

describe('flow-sensitive obstruction demos', () => {
	it('InkInWater remains an intermittent droplet preset, not a flow-scene retrofit', () => {
		// Source-level: no flow-scene wiring.
		expect(inkInWater).not.toContain('FlowConfig');
		expect(inkInWater).not.toContain('flow={FLOW}');
		// Config (registry): intermittent auto-splat droplets with bloom glow.
		expect(INK_IN_WATER_CONFIG.flow).toBeUndefined();
		expect(INK_IN_WATER_CONFIG.autoSplatRate).toBe(0.2);
		expect(INK_IN_WATER_CONFIG.autoSplatVelocityY).toBe(-180);
		expect(INK_IN_WATER_CONFIG.autoSplatCenterY).toBe(0.9);
		expect(INK_IN_WATER_CONFIG.bloom).toBe(true);
		expect(INK_IN_WATER_CONFIG.bloomIntensity).toBe(0.6);
	});

	it('Karman uses pressure-driven throughflow with a passive streakline rake', () => {
		const flow = KARMAN_CONFIG.flow!;
		expect(flow.forces).toEqual([{ kind: 'pressureGradient', vector: { x: 64, y: 0 } }]);
		expect(flow.visualization).toEqual({ colorBy: 'dye' });
		expect(flow.boundary).toEqual({ left: 'open', right: 'open', top: 'open', bottom: 'open' });
		// Startup freestream curtain — without it the first tracer packets
		// mushroom into still fluid while the body force spins up.
		expect(KARMAN_CONFIG.presetSplats?.length).toBe(5);
		// Drains on all four edges so the wake can exit rather than saturate.
		expect(flow.outlets).toEqual([
			{ edge: 'right', from: 0, to: 1, width: 0.075, clearDye: 0.08, clearScalars: true, clearVelocity: true },
			{ edge: 'top', from: 0, to: 1, width: 0.045, clearDye: 0.12, clearScalars: true, clearVelocity: false },
			{ edge: 'bottom', from: 0, to: 1, width: 0.045, clearDye: 0.12, clearScalars: true, clearVelocity: false },
			{ edge: 'left', from: 0, to: 1, width: 0.02, clearDye: 0.45, clearScalars: true, clearVelocity: false }
		]);
		// Genuine flow tracers: a six-line streakline rake of persistent
		// dye-only point sources, not autosplat packets. The rake is passive
		// (no velocity injection) — point-footprint velocity accumulation
		// would curl the inlet into a recirculation cell.
		expect(KARMAN_CONFIG.autoSplatRate).toBeUndefined();
		expect(flow.sources?.length).toBe(6);
		expect(flow.sources?.every((s) => s.kind === 'point')).toBe(true);
		expect(flow.sources?.every((s) => !('velocity' in s))).toBe(true);
		expect(flow.sources?.[0]).toMatchObject({ kind: 'point', x: 0.03, y: 0.2, rate: 26, radius: 0.028 });
		expect(flow.sources?.[5]).toMatchObject({ kind: 'point', y: 0.8 });
		// The cylinder is painted so the bluff body is visible (ADR-0039).
		expect(KARMAN_CONFIG.obstructionColor).toEqual({ r: 86, g: 98, b: 122 });
		// Library preset conventions: pointer interactivity is exposed.
		expect(karman).toContain('pointerInput = true');
		expect(karman).toContain('{pointerInput}');
	});

	it('Airfoil uses pressure-driven flow plus dye splats around a narrow body', () => {
		expect(airfoil).toContain('const FLOW: FlowConfig');
		expect(airfoil).toContain('flow={FLOW}');
		expect(airfoil).not.toContain('setInterval');
		expect(airfoil).toContain('bloom={false}');
		expect(airfoil).toContain("forces: [{ kind: 'pressureGradient'");
		expect(airfoil).toContain("visualization: { colorBy: 'dye' }");
		expect(airfoil).toContain("boundary: { left: 'open', right: 'open', top: 'open', bottom: 'open' }");
		expect(airfoil).toContain("edge: 'right'");
		expect(airfoil).toContain("edge: 'top'");
		expect(airfoil).toContain("edge: 'bottom'");
		expect(airfoil).toContain("edge: 'left'");
		expect(airfoil).toContain('autoSplatRate={3.6}');
		expect(airfoil).toContain('autoSplatCount={3}');
		expect(airfoil).toContain('autoSplatVelocityX={460}');
		expect(airfoil).toContain('autoSplatCenterX={0.035}');
		expect(airfoil).toContain('autoSplatBandWidth={0.025}');
		expect(airfoil).toContain('autoSplatBandHeight={0.46}');
		expect(airfoil).toContain('presetSplats={PRESET_SPLATS}');
		expect(airfoil).toContain(
			"{ edge: 'right', from: 0, to: 1, width: 0.025, clearDye: 0.02, clearScalars: true, clearVelocity: false }"
		);
		expect(airfoil).toContain(
			"{ edge: 'top', from: 0, to: 1, width: 0.025, clearDye: 0.04, clearScalars: true, clearVelocity: false }"
		);
		expect(airfoil).toContain(
			"{ edge: 'bottom', from: 0, to: 1, width: 0.025, clearDye: 0.04, clearScalars: true, clearVelocity: false }"
		);
		expect(airfoil).toContain(
			"{ edge: 'left', from: 0, to: 1, width: 0.018, clearDye: 0.55, clearScalars: true, clearVelocity: false }"
		);
		expect(airfoil).toContain("' C 22 43, 42 41, 62 44'");
	});

	it('TeslaValve uses one channel-shaped container with bypass loops, not separate tongue obstructions', () => {
		const shape = TESLA_VALVE_CONFIG.containerShape!;
		expect(shape).toMatchObject({
			type: 'svgPath',
			viewBox: [0, 0, 1220, 257],
			fillRule: 'evenodd',
			maskResolution: 2048
		});
		const flow = TESLA_VALVE_CONFIG.flow!;
		expect(flow.forces).toEqual([{ kind: 'pressureGradient', vector: { x: 28, y: 0 } }]);
		// Inlet auto-splat band drives readable dye packets through the channel.
		expect(TESLA_VALVE_CONFIG.autoSplatRate).toBe(5);
		expect(TESLA_VALVE_CONFIG.autoSplatCount).toBe(4);
		expect(TESLA_VALVE_CONFIG.autoSplatVelocityX).toBe(190);
		expect(TESLA_VALVE_CONFIG.autoSplatCenterX).toBe(0.035);
		expect(TESLA_VALVE_CONFIG.autoSplatBandWidth).toBe(0.024);
		expect(TESLA_VALVE_CONFIG.autoSplatCenterY).toBe(0.49);
		expect(TESLA_VALVE_CONFIG.autoSplatBandHeight).toBe(0.18);
		expect(TESLA_VALVE_CONFIG.viscosity).toBe(0.04);
		expect(TESLA_VALVE_CONFIG.viscosityIterations).toBe(10);
		// One physical container — no separate tongue obstructions, no per-source
		// line tracers, no scalar fields, no speed visualization.
		expect(TESLA_VALVE_CONFIG.obstructions).toBeUndefined();
		expect(flow.sources).toBeUndefined();
		expect(flow.scalarFields).toBeUndefined();
		expect(flow.visualization).toBeUndefined();
	});

	it('GasFlare uses an upward hot jet with scalar buoyancy from a physical nozzle slot', () => {
		const flow = GAS_FLARE_CONFIG.flow!;
		// Two physical stack-wall obstructions form the nozzle slot.
		expect(GAS_FLARE_CONFIG.obstructions?.length).toBe(2);
		// Hot line jet injects velocity + temperature scalar.
		expect(flow.sources?.[0]).toMatchObject({
			kind: 'line',
			velocity: { x: 25, y: 760 },
			scalars: { temperature: 2.4 }
		});
		expect(flow.forces?.[0]).toMatchObject({ kind: 'buoyancy', scalar: 'temperature' });
		expect(flow.visualization?.colorBy).toBe('temperature');
		// Honest framing: not a compressible rocket-throat model.
		expect(gasFlare).not.toContain('de Laval');
	});

	it('Venturi uses pressure-gradient-style forcing so the throat speed-up is visible', () => {
		const flow = VENTURI_CONFIG.flow!;
		expect(flow.forces).toEqual([{ kind: 'pressureGradient', vector: { x: 42, y: 0 } }]);
		expect(VENTURI_CONFIG.maxTimeStep).toBe(1 / 60);
		expect(VENTURI_CONFIG.substeps).toBe(1);
		expect(VENTURI_CONFIG.viscosity).toBe(0.016);
		expect(VENTURI_CONFIG.viscosityIterations).toBe(5);
		expect(VENTURI_CONFIG.wallFriction).toBe(0.16);
		expect(VENTURI_CONFIG.pressureIterations).toBe(26);
		// Field visualization (speed/CFD), not dye coloring, and no inlet source.
		expect(flow.sources).toBeUndefined();
		expect(flow.outlets?.[0]).toMatchObject({ edge: 'right', from: 0, to: 1, clearVelocity: true });
		expect(flow.visualization).toMatchObject({ colorBy: 'speed', transfer: 'cfd', range: [0, 170] });
	});

	it('Maze uses a low-diffusion scalar sheet and gravity to read more like liquid', () => {
		expect(maze).toContain("kind: 'line'");
		expect(maze).toContain("forces: [{ kind: 'gravity'");
		expect(maze).toContain("bottom: 'open'");
		expect(maze).toContain('dissipation: 0.045');
		expect(maze).toContain('clearVelocity: false');
		expect(maze).toContain('bloom={false}');
	});
});

describe('Toroidal rename', () => {
	it('index.ts exports Toroidal and keeps the deprecated ToroidalTempest alias', async () => {
		const index = (await import('../../index.js?raw' as string)) as unknown as { default: string };
		expect(index.default).toContain(
			"export { default as Toroidal, type ToroidalProps } from './presets/Toroidal.svelte';"
		);
		expect(index.default).toContain('@deprecated');
		expect(index.default).toContain(
			"export { default as ToroidalTempest, type ToroidalProps as ToroidalTempestProps } from './presets/Toroidal.svelte';"
		);
	});
});
