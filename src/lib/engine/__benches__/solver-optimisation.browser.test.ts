import { describe, expect, it } from 'vitest';
import { FluidEngine, _setContextTier } from '../FluidEngine.js';
import { KARMAN_CONFIG, PLASMA_CONFIG } from '../../presets/registry.js';
import type { FluidConfig } from '../types.js';
import type { DoubleFBO } from '../internal-types.js';
import { createFBO, disposeFBO, type ProgramWrap } from '../gl-utils.js';
import type { ExtInfo, FBO } from '../internal-types.js';

interface Harness {
	gl: WebGL2RenderingContext;
	ext: ExtInfo;
	bloom: FBO;
	bloomFramebuffers: FBO[];
	renderCore(target: FBO | null): void;
}

interface PressureHarness {
	gl: WebGL2RenderingContext;
	ext: ExtInfo;
	velocity: DoubleFBO;
	pressure: DoubleFBO;
	pressureJacobi4Program: ProgramWrap | undefined;
	projectVelocity(): void;
	withGl<T>(fn: () => T): T | undefined;
}

function pressureEngine(tier: 'own' | 'shared', config: FluidConfig, width = 800, height = 500): FluidEngine {
	_setContextTier(tier);
	try {
		const canvas = document.createElement('canvas');
		canvas.width = width;
		canvas.height = height;
		const engine = new FluidEngine({ canvas, autoStart: false, config: {
			seed: 5, initialSplatCount: 0, pointerInput: false, bloom: false, sunrays: false,
			dyeResolution: 65, simResolution: 33, ...config
		} });
		expect(engine.sharedContext).toBe(tier === 'shared');
		const h = engine as unknown as PressureHarness;
		expect(h.ext.isWebGL2).toBe(true);
		const debug = h.gl.getExtension('WEBGL_debug_renderer_info');
		const renderer = debug ? h.gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) as string : '';
		console.log(JSON.stringify({ pressureRenderer: renderer, tier }));
		expect(renderer).toMatch(/ANGLE.*Metal.*Apple M1 Max/);
		expect(renderer).not.toMatch(/SwiftShader/i);
		return engine;
	} finally {
		_setContextTier(false);
	}
}

function seedPressure(engine: FluidEngine, warm: boolean): void {
	const h = engine as unknown as PressureHarness;
	h.withGl(() => {
		const gl = h.gl;
		const { width, height } = h.velocity;
		const velocity = new Float32Array(width * height * 2);
		const pressure = new Float32Array(width * height);
		for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
			const i = y * width + x;
			velocity[2 * i] = Math.sin(x * 0.77 + y * 0.19) * 7 + (x === 0 ? 13 : 0);
			velocity[2 * i + 1] = Math.cos(y * 0.61 - x * 0.31) * 9 + (y === height - 1 ? -17 : 0);
			pressure[i] = warm ? Math.sin(i * 0.43) * 3 : 0;
		}
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, h.velocity.read.texture);
		gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, width, height, gl.RG, gl.FLOAT, velocity);
		gl.bindTexture(gl.TEXTURE_2D, h.pressure.read.texture);
		gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, width, height, gl.RED, gl.FLOAT, pressure);
		expect(gl.getError()).toBe(gl.NO_ERROR);
	});
}

// Readback floats are exact fp16 values. Monotone half encodings count representable steps, including subnormals.
function halfOrder(value: number): number {
	const a = Math.abs(value);
	const bits = a === 0 ? 0 : a < 2 ** -14
		? Math.round(a / 2 ** -24)
		: (() => { const e = Math.floor(Math.log2(a)); return ((e + 15) << 10) + Math.round((a / 2 ** e - 1) * 1024); })();
	return value < 0 || Object.is(value, -0) ? 0x8000 - bits : 0x8000 + bits;
}

function pressureParity(label: string, reference: FluidEngine, candidate: FluidEngine): void {
	const a = reference.readField('pressure').data;
	const b = candidate.readField('pressure').data;
	expect(b.length).toBe(a.length);
	const ab = new Uint32Array(a.buffer, a.byteOffset, a.length);
	const bb = new Uint32Array(b.buffer, b.byteOffset, b.length);
	let maxAbs = 0, maxUlp = 0, changed = 0, nonFinite = 0;
	for (let i = 0; i < a.length; i++) {
		if (!Number.isFinite(a[i]) || !Number.isFinite(b[i])) nonFinite++;
		maxAbs = Math.max(maxAbs, Math.abs(a[i] - b[i]));
		maxUlp = Math.max(maxUlp, Math.abs(halfOrder(a[i]) - halfOrder(b[i])));
		if (ab[i] !== bb[i]) changed++;
	}
	console.log(JSON.stringify({ pressureParity: label, maxAbs, maxUlp, changed, nonFinite }));
	expect(nonFinite).toBe(0);
	expect(changed, `${label}: maxAbs=${maxAbs}, maxUlp=${maxUlp}`).toBe(0);
}

function project(engine: FluidEngine, baseline: boolean): void {
	const h = engine as unknown as PressureHarness;
	const quad = h.pressureJacobi4Program;
	try {
		if (baseline) h.pressureJacobi4Program = undefined;
		h.withGl(() => { h.projectVelocity(); expect(h.gl.getError()).toBe(h.gl.NO_ERROR); });
	} finally {
		h.pressureJacobi4Program = quad;
	}
}

function advancePressure(engine: FluidEngine, baseline: boolean): void {
	const h = engine as unknown as PressureHarness;
	const quad = h.pressureJacobi4Program;
	try {
		if (baseline) h.pressureJacobi4Program = undefined;
		engine.advance(1, 1 / 60);
	} finally {
		h.pressureJacobi4Program = quad;
	}
}

const pressureCases: { name: string; config: FluidConfig; warm: boolean }[] = [
	{ name: 'odd-boundaries-cold', config: {}, warm: false },
	{ name: 'odd-boundaries-warm', config: { pressure: 0.9 }, warm: true },
	{ name: 'solid-container', config: { containerShape: { type: 'circle', cx: 0.5, cy: 0.5, radius: 0.43 } }, warm: true },
	{ name: 'svg-solid-mask', config: { obstructions: [{ d: 'M32 15H55V85H32Z', viewBox: [0, 0, 100, 100] }] }, warm: true },
	{ name: 'sticky-pressure', config: { sticky: true, stickyPressure: 0.15, stickyMask: { d: 'M10 15H80V75H10Z', blur: 2, maskResolution: 65 } }, warm: true },
	{ name: 'large-grid-fallback', config: { simResolution: 257 }, warm: true }
];

describe('four-iteration pressure bit-parity (E1 round 3)', () => {
	for (const tier of ['own', 'shared'] as const) {
		for (const c of pressureCases) {
			it(`${tier} ${c.name}, zero/pairs/remainders`, () => {
				const reference = pressureEngine(tier, c.config);
				const candidate = pressureEngine(tier, c.config);
				try {
					for (const iterations of [0, 1, 2, 3, 4, 5, 6, 7, 8, 20, 34]) {
						for (const engine of [reference, candidate]) {
							engine.setConfig({ pressureIterations: iterations });
							seedPressure(engine, c.warm);
						}
						project(reference, true);
						project(candidate, false);
						pressureParity(`${tier}/${c.name}/p${iterations}`, reference, candidate);
					}
				} finally { reference.dispose(); candidate.dispose(); }
			});
		}
		for (const [name, config] of [['Plasma', PLASMA_CONFIG], ['Karman', KARMAN_CONFIG]] as const) {
			it(`${tier} ${name} train multi-step parity`, () => {
				const reference = pressureEngine(tier, config);
				const candidate = pressureEngine(tier, config);
				try {
					for (let step = 1; step <= 200; step++) {
						advancePressure(reference, true);
						advancePressure(candidate, false);
						pressureParity(`${tier}/${name}/step${step}`, reference, candidate);
					}
				} finally { reference.dispose(); candidate.dispose(); }
			});
		}
		it(`${tier} resize/loss/restore/dispose`, async () => {
			const config = { pressureIterations: 7, pressure: 0.9 };
			const reference = pressureEngine(tier, config);
			const candidate = pressureEngine(tier, config);
			try {
				for (const engine of [reference, candidate]) engine.resize(803, 503);
				seedPressure(reference, true); seedPressure(candidate, true);
				project(reference, true); project(candidate, false);
				pressureParity(`${tier}/resize`, reference, candidate);
				const contexts = [...new Set([reference, candidate].map((e) => (e as unknown as PressureHarness).gl))];
				for (const gl of contexts) {
					const canvas = gl.canvas;
					const lost = new Promise<void>((r) => canvas.addEventListener('webglcontextlost', () => r(), { once: true }));
					const restored = new Promise<void>((r) => canvas.addEventListener('webglcontextrestored', () => r(), { once: true }));
					const loss = gl.getExtension('WEBGL_lose_context')!;
					loss.loseContext(); await lost;
					loss.restoreContext(); await restored;
				}
				seedPressure(reference, true); seedPressure(candidate, true);
				project(reference, true); project(candidate, false);
				pressureParity(`${tier}/restore`, reference, candidate);
				const h = candidate as unknown as PressureHarness;
				const program = h.pressureJacobi4Program!.program;
				candidate.dispose();
				expect(h.gl.isProgram(program)).toBe(tier === 'shared');
				seedPressure(reference, true); project(reference, true);
				expect((reference as unknown as PressureHarness).gl.getError()).toBe(h.gl.NO_ERROR);
			} finally { reference.dispose(); candidate.dispose(); }
		});
	}
});

describe('rejected packed bloom appearance regression (ADR 0102)', () => {
	for (const color of [{ r: 0, g: 0, b: 10 }, { r: 12, g: 3, b: 8 }]) {
		it(`demonstrates packed blue/HDR ${JSON.stringify(color)} exceeds one native display LSB`, () => {
			const canvas = document.createElement('canvas');
			canvas.width = 2880; canvas.height = 1800;
			const engine = new FluidEngine({ canvas, autoStart: false, config: {
				seed: 5, initialSplatCount: 0, pointerInput: false, sunrays: false,
				bloom: true, bloomResolution: 256, bloomIterations: 8, dyeResolution: 1024,
				shading: false, bloomIntensity: 1, bloomThreshold: 0.48,
				densityDissipation: 0, curl: 0, pressure: 0
			} });
			const h = engine as unknown as Harness, gl = h.gl;
			const target = createFBO(gl, 2880, 1800, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.NEAREST);
			const reference = h.bloom, chain = h.bloomFramebuffers;
			const packed: FBO[] = [];
			try {
				engine.splat(0.4, 0.5, 0, 0, color);
				engine.splat(0.65, 0.65, 0, 0, { r: color.r * 0.1, g: color.g * 0.1, b: color.b * 0.1 });
				const read = () => {
					h.renderCore(target);
					const pixels = new Uint8Array(2880 * 1800 * 4);
					gl.readPixels(0, 0, 2880, 1800, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
					expect(gl.getError()).toBe(gl.NO_ERROR);
					return pixels;
				};
				const before = read();
				for (const fbo of [reference, ...chain]) packed.push(createFBO(gl, fbo.width, fbo.height, gl.R11F_G11F_B10F, gl.RGB, gl.UNSIGNED_INT_10F_11F_11F_REV, gl.LINEAR));
				h.bloom = packed[0]; h.bloomFramebuffers = packed.slice(1);
				const after = read();
				let max = 0, sum = 0, changed = 0;
				for (let i = 0; i < before.length; i++) {
					const d = Math.abs(before[i] - after[i]); max = Math.max(max, d); sum += d; if (d) changed++;
				}
				console.log(JSON.stringify({ color, maxLsb: max, meanLsb: sum / before.length, changedChannels: changed }));
				// Fixed appearance gate: packed blue has five mantissa bits versus fp16's ten;
				// no extra tolerance beyond one final display LSB is permitted.
				expect(max).toBeGreaterThan(1);
			} finally {
				h.bloom = reference; h.bloomFramebuffers = chain;
				for (const fbo of packed) disposeFBO(gl, fbo);
				disposeFBO(gl, target); engine.dispose();
			}
		});
	}
});
