import { expect, it } from 'vitest';
import {
	resolveMacOptions,
	validateMacOptions,
	type MacOptions
} from './engine.js';

import { TRACERS, resolveTracerOptions } from './tracers.js';
import { tracerUpdateShader, tracerSplatVertex } from './shaders.js';

const legacy: MacOptions = {
	width: 1080,
	nu: 1.8,
	dt: 1 / 120,
	pressureSweeps: 64,
	dyeScale: 3,
	bufferRate: 10,
	noiseAcceleration: 0,
	targetRe: 200,
	direction: 1,
	force: 0.4
};
const g = {
	plenum: 121,
	valveWidth: 1080,
	meanWidth: 30.0898148,
	cellsPerCm: 36,
	mouths: [63, 63],
	grid: { width: 1322, height: 126 }
};

it('canonicalizes legacy checkpoint options, key order and partial nested defaults', () => {
	const resolved = resolveMacOptions(legacy);
	expect(JSON.stringify(resolveMacOptions({ force: 0.4, direction: 1 }))).toBe(
		JSON.stringify(resolved)
	);
	expect(
		JSON.stringify(
			resolveMacOptions({
				...legacy,
				...resolved,
				disturbance: { seed: 704 },
				filament: {},
				tracers: {}
			})
		)
	).toBe(JSON.stringify(resolved));
	expect(resolved).toMatchObject({
		plenumWidths: 4,
		spongeWidths: 1,
		pressureSolver: 'jacobi',
		dye: 'grid',
		disturbance: {
			centerWidths: 2.25,
			halfWidthWidths: 0.7,
			timeFactor: 0.05,
			spatialDivisor: 3,
			seed: 704
		},
		filament: { widthCm: (0.755622 * 2) / 36, spacingCm: (0.755622 * 11) / 36 },
		tracers: { capacity: 262144, rate: 2048, sigma: 0.25 }
	});
	for (const change of [
		{ plenumWidths: 5 },
		{ disturbance: { seed: 705 } },
		{ tracers: { rate: 1024 } }
	])
		expect(
			JSON.stringify(resolveMacOptions({ ...legacy, ...change }))
		).not.toBe(JSON.stringify(resolved));
});

it('generates tracer literals from the same constants used for allocation and stepping', () => {
	const defaults = tracerUpdateShader(TRACERS);
	expect(defaults).toContain(`ij.y*${TRACERS.textureWidth}+ij.x`);
	expect(defaults).toContain(`+${TRACERS.capacity})%${TRACERS.capacity}`);
	expect(defaults).toContain(`*2./${TRACERS.rate}.`);
	expect(defaults).toContain(`/${TRACERS.substepTravel}`);
	expect(defaults).toContain(`length(b-a)>${TRACERS.maxTravel}`);
	expect(defaults).toContain(`k<${TRACERS.maxSubsteps}`);
	const alternate = resolveTracerOptions({
		capacity: 131072,
		rate: 1024,
		sigma: 0.3
	});
	expect(tracerUpdateShader(alternate)).toContain('+131072)%131072');
	expect(tracerUpdateShader(alternate)).toContain('*2./1024.');
	expect(tracerSplatVertex(alternate)).toContain(
		`gl_InstanceID%${TRACERS.textureWidth}`
	);
	expect(tracerUpdateShader({ ...TRACERS, rate: 1e21 })).toContain(
		'*2./1e+21;'
	);
});

it('validates defaults and non-default construct-only options without WebGL', () => {
	expect(() => validateMacOptions(legacy, g)).not.toThrow();
	expect(() =>
		validateMacOptions({ ...legacy, direction: -1 }, g)
	).not.toThrow();
	expect(() =>
		validateMacOptions(
			{
				...legacy,
				tracers: { capacity: 131072, rate: 1024, sigma: 0.3 },
				filament: { spacingCm: 0 },
				bufferRate: 0,
				noiseAcceleration: 0
			},
			g
		)
	).not.toThrow();
});

it.each<[Partial<MacOptions>, string]>([
	[{ direction: 0 as 1 }, 'direction'],
	[{ force: 0 }, 'force'],
	[{ width: 119 }, 'width'],
	[{ width: 240.5 }, 'width'],
	[{ nu: Infinity }, 'nu'],
	[{ dt: 0 }, 'dt'],
	[{ nu: 1, dt: 0.21 }, 'nu.*dt'],
	[{ pressureSweeps: 1 }, 'pressureSweeps'],
	[{ dyeScale: 4 }, 'dyeScale'],
	[{ bufferRate: -1 }, 'bufferRate'],
	[{ noiseAcceleration: -1 }, 'noiseAcceleration'],
	[{ targetRe: NaN }, 'targetRe'],
	[{ dye: 'bad' as 'grid' }, 'dye'],
	[{ plenumWidths: 0 }, 'plenumWidths'],
	[{ plenumWidths: Infinity }, 'plenumWidths'],
	[{ spongeWidths: 0 }, 'spongeWidths'],
	[{ spongeWidths: 5 }, 'spongeWidths'],
	[{ disturbance: { centerWidths: 0 } }, 'disturbance.centerWidths'],
	[{ disturbance: { halfWidthWidths: -1 } }, 'disturbance.halfWidthWidths'],
	[{ disturbance: { timeFactor: 0 } }, 'disturbance.timeFactor'],
	[{ disturbance: { spatialDivisor: NaN } }, 'disturbance.spatialDivisor'],
	[{ disturbance: { seed: -1 } }, 'disturbance.seed'],
	[{ disturbance: { seed: 65536 } }, 'disturbance.seed'],
	[{ disturbance: { seed: 1.5 } }, 'disturbance.seed'],
	[{ filament: { widthCm: 0 } }, 'filament.widthCm'],
	[{ filament: { spacingCm: -1 } }, 'filament.spacingCm'],
	[{ tracers: { capacity: 511 } }, 'tracers.capacity'],
	[{ tracers: { capacity: 1049088 } }, 'tracers.capacity'],
	[{ tracers: { capacity: 1025 } }, 'tracers.capacity'],
	[{ tracers: { rate: 0 } }, 'tracers.rate'],
	[{ tracers: { rate: Infinity } }, 'tracers.rate'],
	[{ tracers: { sigma: 0 } }, 'tracers.sigma'],
	[{ tracers: { sigma: 0.5 } }, 'tracers.sigma'],
	[{ pressureSolver: 'bad' as 'jacobi' }, 'pressureSolver'],
	[
		{ pressureSolver: 'two-level' },
		'two-level pressure not available in this build'
	]
])('rejects invalid options %j (%s)', (change, field) => {
	expect(() => validateMacOptions({ ...legacy, ...change })).toThrow(
		RangeError
	);
	expect(() => validateMacOptions({ ...legacy, ...change })).toThrow(
		new RegExp(field)
	);
});

it('rejects disturbance support and source outside either end before GL allocation', () => {
	for (const direction of [1, -1] as const) {
		expect(() =>
			validateMacOptions(
				{ ...legacy, direction, disturbance: { centerWidths: 10 } },
				g
			)
		).toThrow(/disturbance.*support/);
		expect(() =>
			validateMacOptions(
				{ ...legacy, direction },
				{ ...g, plenum: 1, grid: { ...g.grid, width: 1082 } }
			)
		).toThrow(/source/);
	}
});
