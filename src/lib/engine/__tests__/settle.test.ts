import { describe, expect, it } from 'vitest';
import { DEFAULTS, resolveConfig } from '../FluidEngine.js';
import { PRESETS } from '../../presets/registry.js';
import { HEIGHT_SPECULAR_DISPLAY_BOUND, SETTLE_EPSILON, hasContinuousDriver, dyeVisibilityGain, heightVisibilityScale, isInertSolver, isQuiet, isQuietFlags } from '../settle.js';

const base = { AUTO_SPLAT_RATE: 0, FLOW: null, COLORFUL: false, INITIAL_DENSITY_DISSIPATION_DURATION: 0 };

describe('hasContinuousDriver', () => {
	it('plain scene settles', () => expect(hasContinuousDriver(base, 100)).toBe(false));
	it('empty flow visualization is not a driver; even zero prescribed fields remain drivers', () => {
		for (const colorBy of ['speed', 'pressure', 'scalar'] as const) {
			const FLOW = { visualization: { colorBy } };
			expect(hasContinuousDriver({ ...base, FLOW }, 100)).toBe(false);
			for (const prescribed of [
				{ kind: 'grid' as const, velocity: { width: 1, height: 1, data: [0, 0] } },
				{ kind: 'grid' as const, scalars: { temperature: { width: 1, height: 1, data: [0] } } }
			]) expect(hasContinuousDriver({ ...base, FLOW: { ...FLOW, prescribed } }, 100)).toBe(true);
		}
	});
	it('autoSplatRate blocks', () => expect(hasContinuousDriver({ ...base, AUTO_SPLAT_RATE: 0.2 }, 100)).toBe(true));
	it('driving flow blocks', () =>
		expect(
			hasContinuousDriver({ ...base, FLOW: { forces: [{ kind: 'gravity', vector: { x: 0, y: -1 } }] } }, 100)
		).toBe(true));
	it('inert flow does not block', () =>
		expect(hasContinuousDriver({ ...base, FLOW: { boundary: { left: 'open' } } }, 100)).toBe(false));
	it('prescribed grid blocks', () =>
		expect(
			hasContinuousDriver(
				{ ...base, FLOW: { prescribed: { kind: 'grid', velocity: { width: 1, height: 1, data: [0, 0] } } } },
				100
			)
		).toBe(true));
	it('initial dissipation ramp blocks until it ends', () => {
		const c = { ...base, INITIAL_DENSITY_DISSIPATION_DURATION: 2 };
		expect(hasContinuousDriver(c, 1)).toBe(true);
		expect(hasContinuousDriver(c, 2)).toBe(false);
	});
	it('COLORFUL does not block', () => expect(hasContinuousDriver({ ...base, COLORFUL: true }, 100)).toBe(false));
});

describe('inert solver proof', () => {
	const inert = resolveConfig({ initialSplatCount: 0, autoSplatRate: 0, densityDissipation: 0,
		pressure: 0, pressureIterations: 0, curl: 0, viscosity: 0, wallFriction: 0,
		flow: null, sticky: false, reveal: false, distortion: true, distortionPower: 0,
		refraction: 1, bloom: false, sunrays: false }, DEFAULTS);
	const grid = [64, 64, 256, 256];
	it('admits only identity transport, regardless of static display amplification', () => {
		expect(isInertSolver(inert, 1, grid)).toBe(true);
		for (const PRESSURE_ITERATIONS of [0, 1, 20]) for (const VELOCITY_DISSIPATION of [0, 0.2, 100]) {
			expect(isInertSolver({ ...inert, PRESSURE_ITERATIONS, VELOCITY_DISSIPATION }, 1, grid)).toBe(true);
		}
		expect(isInertSolver({ ...inert, INITIAL_DENSITY_DISSIPATION_DURATION: 1 }, 1, grid)).toBe(true);
	});
	it('every changing or unproven condition vetoes the proof', () => {
		for (const patch of [
			{ FLOW: {} }, { FLOW: { outlets: [{ edge: 'left' as const }] } },
			{ FLOW: { forces: [{ kind: 'buoyancy' as const, scalar: 'temperature', strength: 1 }] } },
			{ AUTO_SPLAT_RATE: 1 }, { CONTAINER_SHAPE: { type: 'circle' as const, cx: 0.5, cy: 0.5, radius: 0.4 } },
			{ OBSTRUCTIONS: [] }, { STICKY_MASK: { d: 'M0 0H1V1Z' } }, { REVEAL: true }, { STICKY: true },
			{ DENSITY_DISSIPATION: 0.1 }, { PRESSURE: 0.8 }, { CURL: 1 }, { VISCOSITY: 1 }, { WALL_FRICTION: 1 },
			{ INITIAL_DENSITY_DISSIPATION_DURATION: 2 }, { INITIAL_DENSITY_DISSIPATION_DURATION: NaN },
			{ VELOCITY_DISSIPATION: -1 }, { VELOCITY_DISSIPATION: NaN }, { VELOCITY_DISSIPATION: Infinity }
		]) expect(isInertSolver({ ...inert, ...patch }, 1, grid)).toBe(false);
		for (const elapsed of [NaN, Infinity, -1]) expect(isInertSolver(inert, elapsed, grid)).toBe(false);
		for (let i = 0; i < 4; i++) for (const n of [0, -1, 63, 257, 0.5, NaN, Infinity]) {
			const dimensions = [...grid]; dimensions[i] = n;
			expect(isInertSolver(inert, 1, dimensions)).toBe(false);
		}
		expect(isInertSolver(inert, 1, [])).toBe(false);
	});
	it('byte proof requires exact zero velocity plus unconditional field validity', () => {
		const valid = [0, 0, 0, 255, 255, 0, 255, 255];
		expect(isQuietFlags(valid, true, true)).toBe(true);
		for (const i of [1, 2, 5]) {
			const bytes = [...valid]; bytes[i] = 255;
			expect(isQuietFlags(bytes, true, true)).toBe(false);
		}
	});
});

describe('height visibility proof', () => {
	it('bounds sunrays amplification without blocking ordinary residual dye forever', () => {
		for (const weight of [-1, 0, 0.5, 1, 100]) {
			const gain = dyeVisibilityGain({ SUNRAYS: true, SUNRAYS_WEIGHT: weight });
			const exact = 0.7 * (1 + Math.max(weight, 0) * Array.from({ length: 16 }, (_, i) => 0.95 ** i).reduce((s, v) => s + v, 0));
			expect(gain).toBeGreaterThanOrEqual(1);
			expect(gain).toBeCloseTo(Math.max(1, exact), 10);
			expect(isQuiet(50, SETTLE_EPSILON / (gain * 2), 1)).toBe(true);
		}
		expect(dyeVisibilityGain({ SUNRAYS: false, SUNRAYS_WEIGHT: 100 })).toBe(1);
	});
	it('default diffuse stays RGB-bounded; exposed black specular/refraction cannot false-idle', () => {
		expect(heightVisibilityScale(DEFAULTS)).toBe(0);
		for (const patch of [{ shading: true, toneMapping: 'agx' as const }, { shading: true, minContrast: 3 }, { shading: true, glass: true, containerShape: { type: 'circle' as const, cx: 0.5, cy: 0.5, radius: 0.4 } }]) expect(heightVisibilityScale(resolveConfig(patch, DEFAULTS))).toBe(-1);
		expect(heightVisibilityScale(resolveConfig({ specular: 0.5, bloom: false, sunrays: false }, DEFAULTS))).toBeCloseTo(0.5 * HEIGHT_SPECULAR_DISPLAY_BOUND);
		const glass = { specular: 1, glass: true, bloom: false, sunrays: false, refraction: 0, containerShape: { type: 'circle' as const, cx: 0.5, cy: 0.5, radius: 0.4 } };
		expect(heightVisibilityScale(resolveConfig(glass, DEFAULTS))).toBe(-1);
		expect(heightVisibilityScale(resolveConfig({ ...glass, distortion: true }, DEFAULTS))).toBe(HEIGHT_SPECULAR_DISPLAY_BOUND);
		for (const patch of [{ specular: 1, reveal: true }, { specular: 1, toneMapping: 'agx' as const }, { refraction: 1, distortion: true }, { refraction: 1, glass: true, containerShape: { type: 'circle' as const, cx: 0.5, cy: 0.5, radius: 0.4 } }]) {
			expect(heightVisibilityScale(resolveConfig(patch, DEFAULTS))).toBe(-1);
		}
	});
	it('bounds the fixed dielectric highlight for every sampled normal, thickness and gain', () => {
		const l = [-0.35, 0.45, 1];
		const len = Math.hypot(...l);
		const light = l.map((v) => v / len);
		const half = [light[0], light[1], light[2] + 1];
		const hlen = Math.hypot(...half);
		const hv = half.map((v) => v / hlen);
		const dot = (a: number[], b: number[]) => a.reduce((s, v, i) => s + v * b[i], 0);
		const fresnel = 0.02 + 0.98 * (1 - hv[2]) ** 5;
		expect(fresnel).toBeLessThan(0.02001);
		for (let az = 0; az < 32; az++) for (let el = 0; el <= 16; el++) {
			const theta = az * 2 * Math.PI / 32;
			const phi = el * Math.PI / 32;
			const n = [Math.sin(phi) * Math.cos(theta), Math.sin(phi) * Math.sin(theta), Math.cos(phi)];
			for (const thickness of [1e-7, 0.00001, 0.01, 0.06, 0.24]) for (const gain of [0.1, 0.5, 1]) {
				const lin = gain * 130 / (8 * Math.PI) * Math.max(dot(n, hv), 0) ** 128 * fresnel * Math.max(dot(n, light), 0) * (1 - Math.exp(-thickness / 0.06));
				const srgb = lin <= 0.0031308 ? lin * 12.92 : 1.055 * lin ** (1 / 2.4) - 0.055;
				expect(srgb).toBeLessThanOrEqual(gain * HEIGHT_SPECULAR_DISPLAY_BOUND * thickness);
			}
		}
	});
});

describe('isQuiet', () => {
	it('moving visible dye is not quiet', () => expect(isQuiet(5, 0.1, 1)).toBe(false));
	it('invisible dye is quiet whatever the velocity', () => expect(isQuiet(50, 0, 1)).toBe(true));
	it('bright dye still fading is not quiet', () => expect(isQuiet(0, 1, 1)).toBe(false));
	it('faded dye with no motion is quiet', () => expect(isQuiet(0, 0.03, 1)).toBe(true));
	it('zero dissipation keeps any dye quiet', () => expect(isQuiet(0, 5, 0)).toBe(true));
	it('epsilon is half an 8-bit step', () => expect(SETTLE_EPSILON).toBeCloseTo(0.5 / 255));
	it('public dissipation filters nonfinite input but negative finite values remain nonquiet', () => {
		expect(resolveConfig({ densityDissipation: NaN }, DEFAULTS).DENSITY_DISSIPATION).toBe(DEFAULTS.DENSITY_DISSIPATION);
		const resolved = resolveConfig({ densityDissipation: -1 }, DEFAULTS);
		expect(resolved.DENSITY_DISSIPATION).toBe(-1);
		expect(isQuiet(0, 0, resolved.DENSITY_DISSIPATION)).toBe(false);
	});
});

describe('RGBA8 quiet flags', () => {
	it('matches maxima including threshold boundaries and HDR', () => {
		for (const v of [0, 0.499, 0.5, 1000]) for (const d of [0, SETTLE_EPSILON / 2, SETTLE_EPSILON, 0.1, 1000]) for (const fade of [0, 1, 60]) {
			const bytes = [v >= 0.5 ? 255 : 0, 0, 0, 255, d >= SETTLE_EPSILON ? 255 : 0, d * (1 - 1 / (1 + fade / 60)) >= SETTLE_EPSILON ? 255 : 0, d !== 0 ? 255 : 0, 255];
			expect(isQuietFlags(bytes)).toBe(isQuiet(v, d, fade));
			expect(isQuietFlags(bytes, true)).toBe(d === 0);
		}
	});
	it('invalid buffers and maxima fail closed', () => {
		for (const bytes of [[], Array(8).fill(0), Array(8).fill(127), [NaN, 0, 0, 255, 0, 0, 0, 255], [255, 255, 0, 255, 0, 0, 0, 255]]) expect(isQuietFlags(bytes)).toBe(false);
		for (const n of [NaN, Infinity, -1]) {
			expect(isQuiet(n, 0, 1)).toBe(false);
			expect(isQuiet(0, n, 1)).toBe(false);
			expect(isQuiet(0, 0, n)).toBe(false);
		}
	});
});

describe('presets', () => {
	const flags = PRESETS.map((p) => ({
		id: p.id,
		continuous: hasContinuousDriver(resolveConfig(p.config as never, DEFAULTS), 1e6)
	}));
	for (const f of flags) {
		it(`${f.id} ${f.continuous ? 'never settles' : 'settles'}`, () => {
			expect(typeof f.continuous).toBe('boolean');
		});
	}
	it('classifies presets both ways', () => {
		expect(flags.some((f) => f.continuous)).toBe(true);
		expect(flags.some((f) => !f.continuous)).toBe(true);
		console.info('settling presets:', flags.filter((f) => !f.continuous).map((f) => f.id).join(', '));
	});
});
