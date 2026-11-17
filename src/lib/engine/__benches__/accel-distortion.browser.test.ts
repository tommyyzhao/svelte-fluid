import { afterEach, describe, expect, it } from 'vitest';
import { FluidEngine, _setContextTier } from '../FluidEngine.js';
import type { DistortionField } from '../FluidEngine.js';
import { createFBO, disposeFBO } from '../gl-utils.js';
import type { FBO } from '../internal-types.js';
import { softwareGL } from './renderer.js';

/**
 * Internal acceleration / pressure-gradient distortion preview. Raw logs for
 * a run go to archive/evidence (see the preview task); nothing here is public API.
 */

/** FNV-1a of the velocity-mode frame, captured from main @ 490b540 on hardware Chrome. */
const MAIN_VELOCITY_HASH = '3190fa5e';
const SIZE = 128;

interface Harness {
	gl: WebGL2RenderingContext;
	accelPrev: FBO | null;
	accelValid: boolean;
	velocity: { width: number; height: number };
	distortionLoadedUrl: string | null;
	ditheringTexture: { width: number };
	renderCore(target: FBO | null): void;
}

const live: FluidEngine[] = [];
const harness = (e: FluidEngine) => e as unknown as Harness;

afterEach(() => {
	for (const e of live.splice(0)) e.dispose();
	_setContextTier('auto');
});

/** High-contrast bands so any UV shift moves pixels. */
function bandedImage(): string {
	const c = document.createElement('canvas');
	c.width = 256;
	c.height = 256;
	const g = c.getContext('2d')!;
	for (let i = 0; i < 256; i += 8) {
		g.fillStyle = (i / 8) % 2 ? '#e8d9a0' : '#2a4d3a';
		g.fillRect(i, 0, 8, 256);
	}
	for (let j = 0; j < 256; j += 16) {
		g.fillStyle = 'rgba(180,40,40,0.6)';
		g.fillRect(0, j, 256, 3);
	}
	return c.toDataURL();
}
const URL = bandedImage();

async function until(pred: () => boolean, ms = 5000): Promise<void> {
	const t0 = performance.now();
	while (!pred()) {
		if (performance.now() - t0 > ms) throw new Error('timed out');
		await new Promise((r) => setTimeout(r, 10));
	}
}

async function make(tier: 'own' | 'shared', extra: Record<string, unknown> = {}, canvas = document.createElement('canvas')) {
	_setContextTier(tier === 'shared');
	canvas.width = SIZE;
	canvas.height = SIZE;
	document.body.append(canvas);
	const e = new FluidEngine({
		canvas,
		autoStart: false,
		config: {
			seed: 7, pointerInput: false, initialSplatCount: 0, autoSplatRate: 0,
			simResolution: 64, dyeResolution: 128, pressureIterations: 8, curl: 0,
			bloom: false, sunrays: false, shading: false,
			distortion: true, distortionPower: 0.02, distortionImageUrl: URL,
			velocityDissipation: 0, densityDissipation: 0, splatRadius: 100,
			...extra
		}
	});
	live.push(e);
	const h = harness(e);
	await until(() => h.distortionLoadedUrl === URL && h.ditheringTexture.width === 64);
	return e;
}

function frame(e: FluidEngine): Uint8Array {
	const h = harness(e);
	const t = createFBO(h.gl, SIZE, SIZE, h.gl.RGBA8, h.gl.RGBA, h.gl.UNSIGNED_BYTE, h.gl.NEAREST);
	try {
		h.renderCore(t);
		const px = new Uint8Array(SIZE * SIZE * 4);
		h.gl.bindFramebuffer(h.gl.FRAMEBUFFER, t.fbo);
		h.gl.readPixels(0, 0, SIZE, SIZE, h.gl.RGBA, h.gl.UNSIGNED_BYTE, px);
		return px;
	} finally {
		disposeFBO(h.gl, t);
	}
}

const fnv = (px: Uint8Array) => {
	let h = 0x811c9dc5;
	for (const b of px) h = Math.imul(h ^ b, 0x01000193) >>> 0;
	return h.toString(16).padStart(8, '0');
};

/** Mean |a-b| over the central half of the frame, in 0..255. */
function centreDiff(a: Uint8Array, b: Uint8Array): number {
	let sum = 0, n = 0;
	for (let y = SIZE / 4; y < (SIZE * 3) / 4; y++)
		for (let x = SIZE / 4; x < (SIZE * 3) / 4; x++)
			for (let c = 0; c < 3; c++, n++) sum += Math.abs(a[(y * SIZE + x) * 4 + c] - b[(y * SIZE + x) * 4 + c]);
	return sum / n;
}

/** Displacement magnitude proxy: warped frame vs the undistorted frame of the same state. */
function displacement(e: FluidEngine, warped: Uint8Array): number {
	e.setConfig({ distortionPower: 0 });
	const flat = frame(e);
	e.setConfig({ distortionPower: 0.02 });
	return centreDiff(warped, flat);
}

describe('velocity mode is unchanged', () => {
	it('matches main @ 490b540 byte-for-byte for a fixed seed and step sequence', async () => {
		const e = await make('own');
		e.splat(0.3, 0.6, 900, -400, { r: 0.8, g: 0, b: 0 });
		e.splat(0.7, 0.4, -700, 500, { r: 0.8, g: 0, b: 0 });
		e.advance(30, 1 / 60);
		const hash = fnv(frame(e));
		console.info(`velocity-hash=${hash} renderer-software=${softwareGL}`);
		// Hash is GPU-specific; the golden was taken on hardware Chrome.
		if (softwareGL) return;
		expect(hash).toBe(MAIN_VELOCITY_HASH);
	});

	it('setting velocity explicitly changes nothing', async () => {
		const e = await make('own');
		e.splat(0.3, 0.6, 900, -400, { r: 0.8, g: 0, b: 0 });
		e.advance(10, 1 / 60);
		const a = fnv(frame(e));
		e.previewDistortionField('velocity', 5);
		expect(fnv(frame(e))).toBe(a);
	});
});

describe('acceleration mode', () => {
	it.each(['own', 'shared'] as const)('%s tier: steady flow warps ~0, velocity mode does not, impulse does', async (tier) => {
		const e = await make(tier);
		// Wide, near-uniform splat; no dissipation so the flow stays steady.
		e.splat(0.5, 0.5, 600, 250, { r: 0.8, g: 0, b: 0 });
		e.advance(120, 1 / 60);
		const k = 40;

		const vel = displacement(e, frame(e));

		e.previewDistortionField('acceleration', k);
		// First frame after allocation: a = 0, identical to the undistorted image.
		const first = frame(e);
		e.setConfig({ distortionPower: 0 });
		expect(centreDiff(first, frame(e))).toBe(0);
		e.setConfig({ distortionPower: 0.02 });

		e.advance(1, 1 / 60);
		const steady = displacement(e, frame(e));
		console.info(`${tier}: velocity=${vel.toFixed(2)} acceleration(steady)=${steady.toFixed(2)}`);
		expect(vel).toBeGreaterThan(5);
		expect(steady).toBeLessThan(vel * 0.1);

		// Positive control: an impulse between presented frames must show up.
		e.splat(0.5, 0.5, 4000, -3000, { r: 0.8, g: 0, b: 0 });
		e.advance(1, 1 / 60);
		const kick = displacement(e, frame(e));
		console.info(`${tier}: acceleration(impulse)=${kick.toFixed(2)}`);
		expect(kick).toBeGreaterThan(steady * 5);
	});

	it('pressure-gradient mode renders and adds no state', async () => {
		const e = await make('own');
		e.splat(0.5, 0.5, 4000, -3000, { r: 0.8, g: 0, b: 0 });
		e.advance(2, 1 / 60);
		e.previewDistortionField('pressure-gradient', 10);
		expect(harness(e).accelPrev).toBeNull();
		const warped = displacement(e, frame(e));
		console.info(`pressure-gradient displacement=${warped.toFixed(2)}`);
		expect(Number.isFinite(warped)).toBe(true);
		expect(harness(e).gl.getError()).toBe(harness(e).gl.NO_ERROR);
	});

	it('rejects invalid modes and softness without changing state', async () => {
		const e = await make('own');
		expect(() => e.previewDistortionField('nope' as DistortionField, 1)).toThrow(RangeError);
		expect(() => e.previewDistortionField('acceleration', 0)).toThrow(RangeError);
		expect(() => e.previewDistortionField('acceleration', NaN)).toThrow(RangeError);
		expect(harness(e).accelPrev).toBeNull();
	});
});

describe('previous-velocity target ownership', () => {
	function counted() {
		const canvas = document.createElement('canvas');
		const gl = canvas.getContext('webgl2')!;
		const counter = { live: 0 };
		const create = gl.createTexture.bind(gl);
		const del = gl.deleteTexture.bind(gl);
		Object.defineProperty(gl, 'createTexture', { configurable: true, value: () => (counter.live++, create()) });
		Object.defineProperty(gl, 'deleteTexture', { configurable: true, value: (t: WebGLTexture | null) => { if (t) counter.live--; del(t); } });
		return { canvas, counter };
	}

	it('exists only in acceleration mode; mode exit and dispose leave no extra textures', async () => {
		const base = counted();
		const plain = await make('own', {}, base.canvas);
		const plainLive = base.counter.live;
		expect(harness(plain).accelPrev).toBeNull();
		plain.dispose();
		const plainAfterDispose = base.counter.live;

		const c = counted();
		const e = await make('own', {}, c.canvas);
		expect(c.counter.live).toBe(plainLive);
		e.previewDistortionField('acceleration', 10);
		expect(harness(e).accelPrev).not.toBeNull();
		expect(c.counter.live).toBe(plainLive + 1);

		e.previewDistortionField('pressure-gradient', 10);
		expect(harness(e).accelPrev).toBeNull();
		expect(c.counter.live).toBe(plainLive);

		e.previewDistortionField('acceleration', 10);
		e.setConfig({ distortion: false });
		expect(harness(e).accelPrev).toBeNull();
		expect(c.counter.live).toBe(plainLive);
		e.setConfig({ distortion: true });
		expect(harness(e).accelPrev).not.toBeNull();

		e.dispose();
		expect(harness(e).accelPrev).toBeNull();
		expect(c.counter.live).toBe(plainAfterDispose);
	});

	it.each(['own', 'shared'] as const)('%s tier: rebuilt on sim resize and canvas resize, first frame is a = 0', async (tier) => {
		const e = await make(tier);
		const h = harness(e);
		e.previewDistortionField('acceleration', 10);
		e.splat(0.5, 0.5, 2000, 0, { r: 0.8, g: 0, b: 0 });
		e.advance(2, 1 / 60);
		frame(e);
		expect(h.accelValid).toBe(true);
		const before = h.accelPrev!;
		e.setConfig({ simResolution: 48 });
		expect(h.accelPrev).not.toBe(before);
		expect([h.accelPrev!.width, h.accelPrev!.height]).toEqual([h.velocity.width, h.velocity.height]);
		expect(h.accelValid).toBe(false);

		frame(e);
		e.resize(SIZE * 2, SIZE);
		expect(h.accelPrev).not.toBeNull();
		expect([h.accelPrev!.width, h.accelPrev!.height]).toEqual([h.velocity.width, h.velocity.height]);
		expect(h.accelValid).toBe(false);
	});
});
