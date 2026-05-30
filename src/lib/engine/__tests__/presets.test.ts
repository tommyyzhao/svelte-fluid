import { describe, expect, it } from 'vitest';
import annularFluid from '../../presets/AnnularFluid.svelte?raw';
import aurora from '../../presets/Aurora.svelte?raw';
import circularFluid from '../../presets/CircularFluid.svelte?raw';
import frameFluid from '../../presets/FrameFluid.svelte?raw';
import frozenSwirl from '../../presets/FrozenSwirl.svelte?raw';
import inkInWater from '../../presets/InkInWater.svelte?raw';
import lavaLamp from '../../presets/LavaLamp.svelte?raw';
import plasma from '../../presets/Plasma.svelte?raw';
import riverDelta from '../../presets/RiverDelta.svelte?raw';
import gasFlare from '../../presets/GasFlare.svelte?raw';
import svgPathFluid from '../../presets/SvgPathFluid.svelte?raw';
import teslaValve from '../../presets/TeslaValve.svelte?raw';
import toroidalTempest from '../../presets/ToroidalTempest.svelte?raw';
import venturi from '../../presets/Venturi.svelte?raw';
import airfoil from '../../../routes/obstruction-demos/Airfoil.svelte?raw';
import karman from '../../../routes/obstruction-demos/Karman.svelte?raw';
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
	RiverDelta: riverDelta,
	GasFlare: gasFlare,
	SvgPathFluid: svgPathFluid,
	TeslaValve: teslaValve,
	ToroidalTempest: toroidalTempest,
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
	it('Karman uses persistent flow sources instead of random auto splats', () => {
		expect(karman).toContain('const FLOW: FlowConfig');
		expect(karman).toContain('flow={FLOW}');
		expect(karman).not.toContain('autoSplatRate=');
		expect(karman).not.toContain('autoSplatCount=');
	});

	it('Airfoil uses persistent flow sources and a narrow body', () => {
		expect(airfoil).toContain('const FLOW: FlowConfig');
		expect(airfoil).toContain('flow={FLOW}');
		expect(airfoil).not.toContain('setInterval');
		expect(airfoil).toContain('bloom={false}');
		expect(airfoil).toContain("kind: 'line'");
		expect(airfoil).toContain("visualization: { colorBy: 'speed'");
		expect(airfoil).toContain("' C 22 43, 42 41, 62 44'");
	});

	it('TeslaValve uses a channel-shaped container with bypass loops, not a generic zigzag obstruction block', () => {
		expect(teslaValve).toContain('const VALVE_CHANNEL: ContainerShape');
		expect(teslaValve).toContain('const TESLA_VALVE_PATH');
		expect(teslaValve).toContain('viewBox: [0, 0, 1220, 257]');
		expect(teslaValve).toContain("fillRule: 'evenodd'");
		expect(teslaValve).toContain('maskResolution: 1024');
		expect(teslaValve).toContain('containerShape={VALVE_CHANNEL}');
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
		expect(venturi).toContain('maxTimeStep={1 / 120}');
		expect(venturi).toContain('substeps={2}');
		expect(venturi).toContain('viscosity={0.018}');
		expect(venturi).toContain('wallFriction={0.18}');
		expect(venturi).not.toContain('velocity: { x:');
		expect(venturi).not.toContain('rate:');
		expect(venturi).toContain("outlets: [{ edge: 'right', from: 0, to: 1");
		expect(venturi).toContain('clearVelocity: true');
		expect(venturi).toContain("transfer: 'cfd'");
		expect(venturi).toContain('range: [0, 260]');
		expect(venturi).not.toContain('scalars: { ink');
	});

	it('Maze uses a low-diffusion scalar sheet and gravity to read more like liquid', () => {
		expect(maze).toContain("kind: 'line'");
		expect(maze).toContain("forces: [{ kind: 'gravity'");
		expect(maze).toContain('dissipation: 0.003');
		expect(maze).toContain('bloom={false}');
	});
});
