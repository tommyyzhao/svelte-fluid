/**
 * Tests for resolveConfig() — the bridge between public FluidConfig
 * and internal ResolvedConfig. Verifies that:
 * - All fields map correctly from camelCase to SCREAMING_CASE
 * - Defaults are applied when fields are omitted
 * - Clamping/normalization works (spawnY, bleed)
 * - initialSplatCount overrides min/max
 * - Partial patches preserve unset fields
 * - Construct-only fields (seed) are still resolved on initial call
 */
import { describe, it, expect } from 'vitest';
import { resolveConfig, DEFAULTS } from '../FluidEngine.js';
import type { FluidConfig, ResolvedConfig } from '../types.js';

describe('resolveConfig', () => {
	it('returns defaults when input is undefined', () => {
		const result = resolveConfig(undefined, DEFAULTS);
		expect(result).toEqual(DEFAULTS);
	});

	it('returns defaults when input is empty object', () => {
		const result = resolveConfig({}, DEFAULTS);
		expect(result).toEqual(DEFAULTS);
	});

	it('does not mutate the base config', () => {
		const base = { ...DEFAULTS };
		resolveConfig({ curl: 99 }, base);
		expect(base.CURL).toBe(DEFAULTS.CURL);
	});

	describe('Bucket A — hot scalars', () => {
		it('maps physics scalars', () => {
			const r = resolveConfig({
				curl: 50,
				splatRadius: 0.5,
				densityDissipation: 0.5,
				velocityDissipation: 0.3,
				pressure: 0.6,
				pressureIterations: 30,
				splatForce: 8000
			}, DEFAULTS);
			expect(r.CURL).toBe(50);
			expect(r.SPLAT_RADIUS).toBe(0.5);
			expect(r.DENSITY_DISSIPATION).toBe(0.5);
			expect(r.VELOCITY_DISSIPATION).toBe(0.3);
			expect(r.PRESSURE).toBe(0.6);
			expect(r.PRESSURE_ITERATIONS).toBe(30);
			expect(r.SPLAT_FORCE).toBe(8000);
		});

		it('maps pointer and hover flags', () => {
			const r = resolveConfig({ pointerInput: false, splatOnHover: true }, DEFAULTS);
			expect(r.POINTER_INPUT).toBe(false);
			expect(r.SPLAT_ON_HOVER).toBe(true);
		});

		it('maps random splat fields', () => {
			const r = resolveConfig({
				randomSplatRate: 5,
				randomSplatCount: 3,
				randomSplatColor: { r: 1, g: 0, b: 0 },
				randomSplatDx: 100,
				randomSplatDy: -50,
				randomSplatSpawnY: 0.7,
				randomSplatEvenSpacing: true,
				randomSplatSwirl: 200,
				randomSplatSpread: 0.5
			}, DEFAULTS);
			expect(r.RANDOM_SPLAT_RATE).toBe(5);
			expect(r.RANDOM_SPLAT_COUNT).toBe(3);
			expect(r.RANDOM_SPLAT_COLOR).toEqual({ r: 1, g: 0, b: 0 });
			expect(r.RANDOM_SPLAT_DX).toBe(100);
			expect(r.RANDOM_SPLAT_DY).toBe(-50);
			expect(r.RANDOM_SPLAT_SPAWN_Y).toBe(0.7);
			expect(r.RANDOM_SPLAT_EVEN_SPACING).toBe(true);
			expect(r.RANDOM_SPLAT_SWIRL).toBe(200);
			expect(r.RANDOM_SPLAT_SPREAD).toBe(0.5);
		});

		it('maps glass parameters', () => {
			const r = resolveConfig({
				glass: true,
				glassThickness: 0.06,
				glassRefraction: 0.8,
				glassReflectivity: 0.3,
				glassChromatic: 0.5
			}, DEFAULTS);
			expect(r.GLASS).toBe(true);
			expect(r.GLASS_THICKNESS).toBe(0.06);
			expect(r.GLASS_REFRACTION).toBe(0.8);
			expect(r.GLASS_REFLECTIVITY).toBe(0.3);
			expect(r.GLASS_CHROMATIC).toBe(0.5);
		});

		it('maps reveal parameters', () => {
			const r = resolveConfig({
				reveal: true,
				revealSensitivity: 0.2,
				revealCurve: 0.5,
				revealCoverColor: { r: 0.5, g: 0.5, b: 0.5 }
			}, DEFAULTS);
			expect(r.REVEAL).toBe(true);
			expect(r.REVEAL_SENSITIVITY).toBe(0.2);
			expect(r.REVEAL_CURVE).toBe(0.5);
			expect(r.REVEAL_COVER_COLOR).toEqual({ r: 0.5, g: 0.5, b: 0.5 });
		});

		it('maps distortion parameters', () => {
			const r = resolveConfig({
				distortion: true,
				distortionPower: 0.7,
				distortionImageUrl: 'https://example.com/img.jpg',
				distortionFit: 'contain',
				distortionScale: 1.5
			}, DEFAULTS);
			expect(r.DISTORTION).toBe(true);
			expect(r.DISTORTION_POWER).toBe(0.7);
			expect(r.DISTORTION_IMAGE_URL).toBe('https://example.com/img.jpg');
			expect(r.DISTORTION_FIT).toBe('contain');
			expect(r.DISTORTION_SCALE).toBe(1.5);
		});

		it('maps sticky parameters', () => {
			const r = resolveConfig({
				sticky: true,
				stickyMask: { text: 'HELLO' },
				stickyStrength: 0.8,
				stickyPressure: 0.2,
				stickyAmplify: 0.5
			}, DEFAULTS);
			expect(r.STICKY).toBe(true);
			expect(r.STICKY_MASK).toEqual({ text: 'HELLO' });
			expect(r.STICKY_STRENGTH).toBe(0.8);
			expect(r.STICKY_PRESSURE).toBe(0.2);
			expect(r.STICKY_AMPLIFY).toBe(0.5);
		});

		it('maps display options', () => {
			const r = resolveConfig({
				shading: false,
				colorful: false,
				colorUpdateSpeed: 5,
				paused: true,
				backColor: { r: 128, g: 128, b: 128 },
				transparent: true
			}, DEFAULTS);
			expect(r.SHADING).toBe(false);
			expect(r.COLORFUL).toBe(false);
			expect(r.COLOR_UPDATE_SPEED).toBe(5);
			expect(r.PAUSED).toBe(true);
			expect(r.BACK_COLOR).toEqual({ r: 128, g: 128, b: 128 });
			expect(r.TRANSPARENT).toBe(true);
		});
	});

	describe('Bucket B — keyword recompile triggers', () => {
		it('maps bloom/sunrays toggles', () => {
			const r = resolveConfig({ bloom: false, sunrays: false }, DEFAULTS);
			expect(r.BLOOM).toBe(false);
			expect(r.SUNRAYS).toBe(false);
		});
	});

	describe('Bucket C — FBO rebuild triggers', () => {
		it('maps resolution fields', () => {
			const r = resolveConfig({
				simResolution: 64,
				dyeResolution: 512,
				bloomResolution: 128,
				bloomIterations: 4,
				sunraysResolution: 128
			}, DEFAULTS);
			expect(r.SIM_RESOLUTION).toBe(64);
			expect(r.DYE_RESOLUTION).toBe(512);
			expect(r.BLOOM_RESOLUTION).toBe(128);
			expect(r.BLOOM_ITERATIONS).toBe(4);
			expect(r.SUNRAYS_RESOLUTION).toBe(128);
		});

		it('maps container shape', () => {
			const shape = { type: 'circle' as const, cx: 0.5, cy: 0.5, radius: 0.4 };
			const r = resolveConfig({ containerShape: shape }, DEFAULTS);
			expect(r.CONTAINER_SHAPE).toEqual(shape);
		});

		it('null containerShape clears the shape', () => {
			const base = resolveConfig(
				{ containerShape: { type: 'circle', cx: 0.5, cy: 0.5, radius: 0.4 } },
				DEFAULTS
			);
			const r = resolveConfig({ containerShape: null }, base);
			expect(r.CONTAINER_SHAPE).toBeNull();
		});
	});

	describe('Bucket D — construct-only fields', () => {
		it('resolves seed with unsigned 32-bit truncation', () => {
			const r = resolveConfig({ seed: 42 }, DEFAULTS);
			expect(r.SEED).toBe(42);
		});

		it('truncates negative seed to unsigned', () => {
			const r = resolveConfig({ seed: -1 }, DEFAULTS);
			expect(r.SEED).toBe(4294967295); // 0xFFFFFFFF
		});

		it('maps initialSplatCount to both MIN and MAX', () => {
			const r = resolveConfig({ initialSplatCount: 10 }, DEFAULTS);
			expect(r.INITIAL_SPLAT_MIN).toBe(10);
			expect(r.INITIAL_SPLAT_MAX).toBe(10);
		});

		it('maps initialSplatCountMin/Max independently', () => {
			const r = resolveConfig({ initialSplatCountMin: 3, initialSplatCountMax: 12 }, DEFAULTS);
			expect(r.INITIAL_SPLAT_MIN).toBe(3);
			expect(r.INITIAL_SPLAT_MAX).toBe(12);
		});
	});

	describe('clamping and normalization', () => {
		it('clamps randomSplatSpawnY to [0, 1]', () => {
			expect(resolveConfig({ randomSplatSpawnY: -0.5 }, DEFAULTS).RANDOM_SPLAT_SPAWN_Y).toBe(0);
			expect(resolveConfig({ randomSplatSpawnY: 1.5 }, DEFAULTS).RANDOM_SPLAT_SPAWN_Y).toBe(1);
			expect(resolveConfig({ randomSplatSpawnY: 0.3 }, DEFAULTS).RANDOM_SPLAT_SPAWN_Y).toBe(0.3);
		});

		it('clamps distortion bleed to [0, 0.5]', () => {
			expect(resolveConfig({ distortionBleedX: -0.1 }, DEFAULTS).DISTORTION_BLEED_X).toBe(0);
			expect(resolveConfig({ distortionBleedX: 0.8 }, DEFAULTS).DISTORTION_BLEED_X).toBe(0.5);
			expect(resolveConfig({ distortionBleedY: -0.1 }, DEFAULTS).DISTORTION_BLEED_Y).toBe(0);
			expect(resolveConfig({ distortionBleedY: 0.8 }, DEFAULTS).DISTORTION_BLEED_Y).toBe(0.5);
		});

		it('null distortionImageUrl resolves to null', () => {
			const base = resolveConfig({ distortionImageUrl: 'test.png' }, DEFAULTS);
			const r = resolveConfig({ distortionImageUrl: undefined }, base);
			// undefined means "not set" — preserves existing value
			expect(r.DISTORTION_IMAGE_URL).toBe('test.png');
		});
	});

	describe('density dissipation ramp', () => {
		it('initialDensityDissipation defaults to densityDissipation', () => {
			const r = resolveConfig({ densityDissipation: 0.5 }, DEFAULTS);
			expect(r.INITIAL_DENSITY_DISSIPATION).toBe(0.5);
		});

		it('explicit initialDensityDissipation overrides the default', () => {
			const r = resolveConfig({
				densityDissipation: 0.5,
				initialDensityDissipation: 0.9
			}, DEFAULTS);
			expect(r.DENSITY_DISSIPATION).toBe(0.5);
			expect(r.INITIAL_DENSITY_DISSIPATION).toBe(0.9);
		});

		it('initialDensityDissipationDuration is mapped', () => {
			const r = resolveConfig({ initialDensityDissipationDuration: 3 }, DEFAULTS);
			expect(r.INITIAL_DENSITY_DISSIPATION_DURATION).toBe(3);
		});
	});

	describe('partial patches preserve unset fields', () => {
		it('setting one field leaves others unchanged', () => {
			const base = resolveConfig({ curl: 50, splatRadius: 0.5 }, DEFAULTS);
			const patched = resolveConfig({ curl: 20 }, base);
			expect(patched.CURL).toBe(20);
			expect(patched.SPLAT_RADIUS).toBe(0.5); // preserved
		});

		it('empty patch is identity', () => {
			const base = resolveConfig({ curl: 50 }, DEFAULTS);
			const patched = resolveConfig({}, base);
			expect(patched).toEqual(base);
		});
	});
});

describe('DEFAULTS', () => {
	it('has expected physics defaults', () => {
		expect(DEFAULTS.SIM_RESOLUTION).toBe(128);
		expect(DEFAULTS.DYE_RESOLUTION).toBe(1024);
		expect(DEFAULTS.DENSITY_DISSIPATION).toBe(1);
		expect(DEFAULTS.VELOCITY_DISSIPATION).toBe(0.2);
		expect(DEFAULTS.PRESSURE).toBe(0.8);
		expect(DEFAULTS.CURL).toBe(30);
		expect(DEFAULTS.SPLAT_RADIUS).toBe(0.25);
		expect(DEFAULTS.SPLAT_FORCE).toBe(6000);
	});

	it('has expected visual defaults', () => {
		expect(DEFAULTS.SHADING).toBe(true);
		expect(DEFAULTS.BLOOM).toBe(true);
		expect(DEFAULTS.SUNRAYS).toBe(true);
		expect(DEFAULTS.TRANSPARENT).toBe(false);
	});

	it('has expected interaction defaults', () => {
		expect(DEFAULTS.POINTER_INPUT).toBe(true);
		expect(DEFAULTS.SPLAT_ON_HOVER).toBe(false);
		expect(DEFAULTS.PAUSED).toBe(false);
	});

	it('has modes disabled by default', () => {
		expect(DEFAULTS.REVEAL).toBe(false);
		expect(DEFAULTS.DISTORTION).toBe(false);
		expect(DEFAULTS.STICKY).toBe(false);
		expect(DEFAULTS.GLASS).toBe(false);
	});

	it('has null container shape by default', () => {
		expect(DEFAULTS.CONTAINER_SHAPE).toBeNull();
	});

	it('has no random splats by default', () => {
		expect(DEFAULTS.RANDOM_SPLAT_RATE).toBe(0);
	});
});
