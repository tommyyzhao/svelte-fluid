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
		expect(inkInWater).not.toContain('FlowConfig');
		expect(inkInWater).not.toContain('flow={FLOW}');
		expect(inkInWater).toContain('autoSplatRate={0.2}');
		expect(inkInWater).toContain('autoSplatVelocityY={-180}');
		expect(inkInWater).toContain('autoSplatCenterY={0.9}');
		expect(inkInWater).toContain('bloom');
		expect(inkInWater).toContain('bloomIntensity={0.6}');
	});

	it('Karman uses pressure-driven throughflow with fast intermittent dye tracers', () => {
		expect(karman).toContain('const FLOW: FlowConfig');
		expect(karman).toContain('flow={FLOW}');
		expect(karman).toContain("forces: [{ kind: 'pressureGradient', vector: { x: 64, y: 0 } }]");
		// Startup freestream curtain — without it the first tracer packets
		// mushroom into still fluid while the body force spins up.
		expect(karman).toContain('presetSplats={PRESET_SPLATS}');
		expect(karman).toContain("visualization: { colorBy: 'dye' }");
		expect(karman).toContain("boundary: { left: 'open', right: 'open', top: 'open', bottom: 'open' }");
		expect(karman).toContain(
			"{ edge: 'right', from: 0, to: 1, width: 0.075, clearDye: 0.08, clearScalars: true, clearVelocity: true }"
		);
		expect(karman).toContain(
			"{ edge: 'top', from: 0, to: 1, width: 0.045, clearDye: 0.12, clearScalars: true, clearVelocity: false }"
		);
		expect(karman).toContain(
			"{ edge: 'bottom', from: 0, to: 1, width: 0.045, clearDye: 0.12, clearScalars: true, clearVelocity: false }"
		);
		expect(karman).toContain(
			"{ edge: 'left', from: 0, to: 1, width: 0.02, clearDye: 0.45, clearScalars: true, clearVelocity: false }"
		);
		expect(karman).toContain('autoSplatRate={4.5}');
		expect(karman).toContain('autoSplatCount={3}');
		// Multicolor tracer packets: fresh generated hue per packet.
		expect(karman).toContain('autoSplatColor={null}');
		expect(karman).toContain('autoSplatVelocityX={460}');
		expect(karman).toContain('autoSplatCenterX={0.035}');
		expect(karman).toContain('autoSplatBandWidth={0.025}');
		expect(karman).toContain('autoSplatBandHeight={0.5}');
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

	it('TeslaValve uses a channel-shaped container with bypass loops, not a generic zigzag obstruction block', () => {
		expect(teslaValve).toContain('const VALVE_CHANNEL: ContainerShape');
		expect(teslaValve).toContain('const TESLA_VALVE_PATH');
		expect(teslaValve).toContain('viewBox: [0, 0, 1220, 257]');
		expect(teslaValve).toContain("fillRule: 'evenodd'");
		expect(teslaValve).toContain('maskResolution: 2048');
		expect(teslaValve).toContain('containerShape={VALVE_CHANNEL}');
		expect(teslaValve).toContain("forces: [{ kind: 'pressureGradient', vector: { x: 28, y: 0 } }]");
		expect(teslaValve).toContain('autoSplatRate={5}');
		expect(teslaValve).toContain('autoSplatCount={4}');
		expect(teslaValve).toContain('autoSplatVelocityX={190}');
		expect(teslaValve).toContain('autoSplatCenterX={0.035}');
		expect(teslaValve).toContain('autoSplatBandWidth={0.024}');
		expect(teslaValve).toContain('autoSplatCenterY={0.49}');
		expect(teslaValve).toContain('autoSplatBandHeight={0.18}');
		expect(teslaValve).toContain('viscosity={0.04}');
		expect(teslaValve).toContain('viscosityIterations={10}');
		expect(teslaValve).not.toContain("kind: 'line'");
		expect(teslaValve).not.toContain('dye: { r: 1.0, g: 0.24, b: 0.02 }');
		expect(teslaValve).not.toContain('dye: { r: 0.0, g: 0.9, b: 1.0 }');
		expect(teslaValve).not.toContain('dye: { r: 0.95, g: 0.08, b: 0.95 }');
		expect(teslaValve).not.toContain('Low-rate tracer feeds');
		expect(teslaValve).not.toContain('from: { x: 0.15');
		expect(teslaValve).not.toContain('from: { x: 0.38');
		expect(teslaValve).not.toContain('from: { x: 0.62');
		expect(teslaValve).not.toContain('PresetSplat');
		expect(teslaValve).not.toContain("visualization: { colorBy: 'speed'");
		expect(teslaValve).not.toContain('scalarFields');
		expect(teslaValve).not.toContain('obstructions={TONGUES}');
	});

	it('GasFlare uses an upward hot jet with scalar buoyancy from a physical nozzle slot', () => {
		expect(gasFlare).toContain('const LEFT_STACK_WALL');
		expect(gasFlare).toContain('const RIGHT_STACK_WALL');
		expect(gasFlare).toContain('velocity: { x: 25, y: 760 }');
		expect(gasFlare).toContain('scalars: { temperature: 2.4 }');
		expect(gasFlare).toContain("forces: [{ kind: 'buoyancy'");
		expect(gasFlare).toContain("visualization: { colorBy: 'temperature'");
		expect(gasFlare).not.toContain('de Laval');
	});

	it('Venturi uses pressure-gradient-style forcing so the throat speed-up is visible', () => {
		expect(venturi).toContain("forces: [{ kind: 'pressureGradient', vector: { x: 42, y: 0 } }]");
		expect(venturi).toContain('maxTimeStep={1 / 60}');
		expect(venturi).toContain('substeps={1}');
		expect(venturi).toContain('viscosity={0.016}');
		expect(venturi).toContain('viscosityIterations={5}');
		expect(venturi).toContain('wallFriction={0.16}');
		expect(venturi).toContain('pressureIterations={26}');
		expect(venturi).not.toContain('velocity: { x:');
		expect(venturi).not.toContain('rate:');
		expect(venturi).toContain("outlets: [{ edge: 'right', from: 0, to: 1");
		expect(venturi).toContain('clearVelocity: true');
		expect(venturi).toContain("transfer: 'cfd'");
		expect(venturi).toContain('range: [0, 170]');
		expect(venturi).not.toContain('scalars: { ink');
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
