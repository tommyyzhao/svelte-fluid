import { mount, unmount } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import FluidReveal from '../../FluidReveal.svelte';
import { FluidEngine, _setContextTier } from '../FluidEngine.js';
import { activeFrameSubscribers } from '../frame-scheduler.js';
import type { FluidConfig } from '../types.js';
import { dyeVisibilityGain, isQuiet, isQuietFlags } from '../settle.js';
import { createFBO, disposeFBO } from '../gl-utils.js';
import type { FBO } from '../internal-types.js';
import { DYE_HEIGHT_CEILING } from '../shaders.js';
import { softwareGL } from './renderer.js';

/* ADR 0099: a decayed visible engine stops scheduling frames until input. */

const CONFIG = { pointerInput: false, splatOnHover: true, simResolution: 64, dyeResolution: 256 } satisfies FluidConfig;
const live: FluidEngine[] = [];
const apps: object[] = [];

function engine(config: FluidConfig = {}, autoStart = true, canvas = document.createElement('canvas')): FluidEngine {
	canvas.width = 128;
	canvas.height = 128;
	document.body.append(canvas);
	const e = new FluidEngine({ canvas, autoStart, config: { ...CONFIG, ...config } });
	live.push(e);
	return e;
}

const INERT = { initialSplatCount: 0, autoSplatRate: 0, densityDissipation: 0, pressure: 0,
	pressureIterations: 0, curl: 0, viscosity: 0, wallFriction: 0, velocityDissipation: 0,
	flow: null, containerShape: null, sticky: false, reveal: false,
	distortion: true, distortionPower: 0, refraction: 1, bloom: false, sunrays: false } satisfies FluidConfig;

interface InertProbe {
	gl: WebGL2RenderingContext;
	velocity: { read: FBO; width: number; height: number };
	dye: { read: FBO; width: number; height: number };
	pressure: { read: FBO };
	ext: { supportLinearFiltering: boolean; isWebGL2: boolean };
	distortionTexture: WebGLTexture;
	ditheringTexture: { width: number };
	autoStart: boolean;
	deterministicMode: boolean;
	canReadSettleFloat(): boolean;
	issueSettleProbe(): void;
	advanceSettleProbe(): void;
	pollSettleProbe(): boolean | null;
	trackSettle(): void;
	renderCore(target: FBO): void;
	copyProgram: { bind(): void; uniforms: Record<string, WebGLUniformLocation> };
	blit(target: FBO): void;
	settleProbe: { ready?: boolean; sync?: WebGLSync; inert: boolean } | null;
	settleBytes: Uint8Array;
	settlePixels: Float32Array;
}

async function probeQuiet(p: InertProbe): Promise<boolean | null> {
	p.issueSettleProbe();
	for (let i = 0; i < 12 && !p.settleProbe?.ready && !p.settleProbe?.sync; i++) p.advanceSettleProbe();
	let quiet: boolean | null = null;
	await until(() => { quiet = p.pollSettleProbe(); return quiet !== null; }, 5000);
	return quiet;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function until(pred: () => boolean, timeoutMs: number): Promise<number> {
	const t0 = performance.now();
	while (!pred()) {
		if (performance.now() - t0 > timeoutMs) throw new Error(`timed out after ${timeoutMs} ms`);
		await sleep(50);
	}
	return performance.now() - t0;
}

/** Count rAF callbacks over a window. */
async function rafCount(ms: number): Promise<number> {
	const original = window.requestAnimationFrame;
	let n = 0;
	window.requestAnimationFrame = ((cb: FrameRequestCallback) => {
		n++;
		return original.call(window, cb);
	}) as typeof window.requestAnimationFrame;
	try {
		await sleep(ms);
	} finally {
		window.requestAnimationFrame = original;
	}
	return n;
}

function maxAbsDiff(a: ArrayLike<number>, b: ArrayLike<number>): number {
	let m = 0;
	for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i] - b[i]));
	return m;
}

afterEach(() => {
	for (const e of live.splice(0)) e.dispose();
	for (const a of apps.splice(0)) void unmount(a as never);
	document.body.replaceChildren();
});

describe('settle visible idle fluid (ADR 0099)', () => {
	it.each(['float', 'byte', 'webgl1-manual', 'maccormack'] as const)('%s inert black deposit proves a fixed point, stops frames, wakes and re-settles', async (mode) => {
		const canvas = document.createElement('canvas');
		if (mode === 'webgl1-manual') {
			const get = canvas.getContext.bind(canvas) as (t: string, ...args: unknown[]) => unknown;
			(canvas as unknown as { getContext: unknown }).getContext = (t: string, ...args: unknown[]) => {
				if (t === 'webgl2' || t === 'bitmaprenderer') return null;
				const gl = get(t, ...args) as WebGLRenderingContext | null;
				if (gl) {
					const extension = gl.getExtension.bind(gl);
					gl.getExtension = ((name: string) => name === 'OES_texture_half_float_linear' ? null : extension(name)) as typeof gl.getExtension;
				}
				return gl;
			};
		}
		const e = engine({ ...INERT, advectionScheme: mode === 'maccormack' ? 'maccormack' : 'semilagrangian' }, false, canvas);
		const p = e as unknown as InertProbe;
		if (mode === 'byte') p.canReadSettleFloat = () => false;
		expect([p.velocity.width, p.velocity.height, p.dye.width, p.dye.height]).toEqual([64, 64, 256, 256]);
		if (mode === 'webgl1-manual') expect(p.ext.supportLinearFiltering).toBe(false);
		const gl = p.gl;
		const target = createFBO(gl, 128, 128, p.ext.isWebGL2 ? gl.RGBA8 : gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, gl.NEAREST);
		const dyeTarget = createFBO(gl, 256, 256, p.ext.isWebGL2 ? gl.RGBA8 : gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, gl.NEAREST);
		const read = (fbo: FBO) => {
			const pixels = new Uint8Array(fbo.width * fbo.height * 4);
			gl.bindFramebuffer(gl.FRAMEBUFFER, fbo.fbo);
			gl.readPixels(0, 0, fbo.width, fbo.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
			expect(gl.getError()).toBe(gl.NO_ERROR);
			return pixels;
		};
		const dye = () => {
			if (p.ext.isWebGL2) return e.readField('dye').data;
			p.copyProgram.bind();
			gl.uniform1i(p.copyProgram.uniforms.uTexture, p.dye.read.attach(0));
			p.blit(dyeTarget);
			return read(dyeTarget);
		};
		try {
			await until(() => p.ditheringTexture.width === 64, 5000);
			const pixels = new Uint8Array(64 * 64 * 4);
			for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) pixels.set([(x >> 2) % 2 ? 255 : 0, (y >> 2) % 2 ? 255 : 0, 80, 255], (y * 64 + x) * 4);
			gl.bindTexture(gl.TEXTURE_2D, p.distortionTexture);
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 64, 64, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
			e.splat(0.5, 0.5, 0, 0, { r: 0, g: 0, b: 0 });
			const deposited = dye();
			expect(deposited.some((v, i) => i % 4 === 3 && v > 0)).toBe(true);
			p.renderCore(target);
			const before = read(target);
			// Empirical identity check supplements, never replaces, the source proof.
			e.advance(40, 1 / 60);
			expect(dye()).toEqual(deposited);
			p.renderCore(target);
			expect(read(target)).toEqual(before);
			p.autoStart = true; p.deterministicMode = false; e.resume();
			await until(() => e.isSettled, 10_000);
			expect(e.settleCheckStats.checks).toBe(3);
			expect(activeFrameSubscribers()).toBe(0);
			expect(await rafCount(250)).toBe(0);
			expect(dye()).toEqual(deposited);
			expect(read(target)).toEqual(before);
			p.renderCore(target);
			expect(read(target)).toEqual(before);
			if (mode === 'byte' || mode === 'webgl1-manual') expect(p.settleBytes[2]).toBe(0);
			else expect(p.settlePixels[0]).toBe(0);
			for (const wake of [() => e.splat(0.3, 0.6, 0, 0, { r: 0, g: 0, b: 0 }), () => e.setConfig({ refraction: 0.5 })]) {
				wake();
				expect(e.isSettled).toBe(false);
				expect(activeFrameSubscribers()).toBe(1);
				await until(() => e.isSettled, 10_000);
				expect(activeFrameSubscribers()).toBe(0);
			}
			console.info(`[idle fixed point ${mode}] retained thickness, exact transport/display, three probes, zero subscribers/RAF, splat/config wake`);
		} finally { disposeFBO(gl, target); disposeFBO(gl, dyeTarget); }
	}, 40_000);

	it('colored HDR fixed point retains the visible shared canvas on rectangular power-of-two grids with projection', async () => {
		_setContextTier('shared');
		try {
			for (const bytes of [false, true]) {
				const canvas = document.createElement('canvas');
				const e = engine({ ...INERT, pressureIterations: 3, distortion: false, specular: 1 }, false, canvas);
				const p = e as unknown as InertProbe;
				if (bytes) p.canReadSettleFloat = () => false;
				e.resize(256, 128);
				expect(e.sharedContext).toBe(true);
				expect([p.velocity.width, p.velocity.height, p.dye.width, p.dye.height]).toEqual([128, 64, 512, 256]);
				await until(() => p.ditheringTexture.width === 64, 5000);
				// Nonzero valid stored pressure is cleared by PRESSURE=0 with paired + single Jacobi.
				(e as unknown as { withGl(fn: () => void): void }).withGl(() => {
					p.gl.bindTexture(p.gl.TEXTURE_2D, p.pressure.read.texture);
					p.gl.texSubImage2D(p.gl.TEXTURE_2D, 0, 20, 20, 1, 1, p.gl.RED, p.gl.FLOAT, new Float32Array([1]));
					expect(p.gl.getError()).toBe(p.gl.NO_ERROR);
				});
				e.splat(0.5, 0.5, 0, 0, { r: 12, g: 3, b: 0.4 });
				const deposit = e.readField('dye').data;
				const maximum = deposit.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
				expect(maximum).toBeGreaterThan(1);
				expect(maximum).toBeLessThan(1000);
				e.advance(40, 1 / 60);
				expect(e.readField('dye').data).toEqual(deposit);
				expect(e.readField('velocity').data.every((v) => v === 0)).toBe(true);
				expect(e.readField('pressure').data.every((v) => v === 0)).toBe(true);
				p.autoStart = true; p.deterministicMode = false; e.resume();
				await until(() => e.isSettled, 10_000);
				await e.presented();
				const capture = document.createElement('canvas'); capture.width = 256; capture.height = 128;
				const context = capture.getContext('2d')!;
				const visible = () => {
					context.clearRect(0, 0, 256, 128);
					context.drawImage(canvas, 0, 0);
					return context.getImageData(0, 0, 256, 128).data;
				};
				const before = visible();
				expect(before.some((v, i) => i % 4 !== 3 && v > 0)).toBe(true);
				expect(activeFrameSubscribers()).toBe(0);
				expect(await rafCount(250)).toBe(0);
				expect(visible()).toEqual(before);
				expect(e.readField('dye').data).toEqual(deposit);
				e.dispose();
			}
		} finally { _setContextTier('auto'); }
	}, 30_000);

	it.each([false, true])('inert proof rejects moving/forced/masked/unproven scenes (byte=%s)', async (bytes) => {
		for (const patch of [
			{}, { pressure: 0.8 }, { densityDissipation: 0.01 },
			{ containerShape: { type: 'circle' as const, cx: 0.5, cy: 0.5, radius: 0.4 } },
			{ flow: { outlets: [{ edge: 'left' as const, clearDye: 0 }] } },
			{ flow: { forces: [{ kind: 'gravity' as const, vector: { x: 0, y: -1 } }] } },
			{ autoSplatRate: 0.001 }, { dyeResolution: 255 }, { simResolution: 63 }, { simResolution: 64, dyeResolution: 256 }
		]) {
			const e = engine({ ...INERT, ...patch }, false);
			const p = e as unknown as InertProbe;
			if (bytes) p.canReadSettleFloat = () => false;
			if (patch.simResolution === 64) {
				e.resize(160, 128); // Requested powers of two become 80×64 / 320×256.
				expect([p.velocity.width, p.velocity.height, p.dye.width, p.dye.height]).toEqual([80, 64, 320, 256]);
			}
			e.splat(0.5, 0.5, 0, 0, { r: 0, g: 0, b: 0 });
			if (Object.keys(patch).length === 0) {
				p.gl.bindTexture(p.gl.TEXTURE_2D, p.velocity.read.texture);
				p.gl.texSubImage2D(p.gl.TEXTURE_2D, 0, 0, 0, 1, 1, p.gl.RG, p.gl.FLOAT, new Float32Array([2 ** -20, 0]));
			}
			if (patch.pressure) {
				p.gl.bindTexture(p.gl.TEXTURE_2D, p.pressure.read.texture);
				p.gl.texSubImage2D(p.gl.TEXTURE_2D, 0, 20, 20, 1, 1, p.gl.RED, p.gl.FLOAT, new Float32Array([1]));
			}
			expect(p.gl.getError()).toBe(p.gl.NO_ERROR);
			for (let check = 0; check < 3; check++) expect(await probeQuiet(p)).toBe(false);
			p.autoStart = true; p.deterministicMode = false;
			p.trackSettle();
			expect(e.isSettled).toBe(false);
			if (patch.pressure) {
				e.advance(1, 1 / 60);
				expect(e.readField('velocity').data.some((v) => v !== 0)).toBe(true);
			}
			e.dispose();
		}
	});

	it.each([false, true])('inert bypass never masks invalid raw fields or a changing RGB clamp (byte=%s)', async (bytes) => {
		for (const [field, value] of [
			['dye', [0, 0, 0, -1]], ['dye', [0, 0, 0, DYE_HEIGHT_CEILING * 2]],
			['dye', [0, 0, 0, Infinity]], ['dye', [0, 0, 0, NaN]],
			['dye', [Infinity, 0, 0, 0]], ['dye', [1001, 0, 0, 0]],
			['velocity', [Infinity, 0]], ['velocity', [NaN, 0]]
		] as const) {
			const e = engine(INERT, false);
			const p = e as unknown as InertProbe;
			if (bytes) p.canReadSettleFloat = () => false;
			p.gl.bindTexture(p.gl.TEXTURE_2D, p[field].read.texture);
			p.gl.texSubImage2D(p.gl.TEXTURE_2D, 0, 0, 0, 1, 1, field === 'dye' ? p.gl.RGBA : p.gl.RG, p.gl.FLOAT, new Float32Array(value));
			expect(p.gl.getError()).toBe(p.gl.NO_ERROR);
			expect(await probeQuiet(p)).toBe(false);
			expect(e.isSettled).toBe(false);
			e.dispose();
		}
	});

	it('default engine settles to zero frame subscribers, then renders no rAF, wake + re-settle', async () => {
		const e = engine({ densityDissipation: 4 });
		expect(activeFrameSubscribers()).toBeGreaterThanOrEqual(1);
		const settleMs = await until(() => activeFrameSubscribers() === 0, 20_000);
		console.info(`[idle] time-to-settle (densityDissipation 4): ${(settleMs / 1000).toFixed(2)} s`);
		expect(e.isSettled).toBe(true);
		expect(await rafCount(2000)).toBe(0);

		e.splat(0.5, 0.5, 300, 0, { r: 1, g: 0.5, b: 0.2 });
		expect(e.isSettled).toBe(false);
		expect(activeFrameSubscribers()).toBeGreaterThanOrEqual(1);
		await until(() => activeFrameSubscribers() === 0, 20_000);
		expect(e.isSettled).toBe(true);
		const stats = e.settleCheckStats;
		console.info(
			`[idle] check cost: ${(stats.totalMs / stats.checks).toFixed(3)} ms per check, ${(stats.totalMs / stats.checks / 30).toFixed(4)} ms/frame (${stats.checks} checks)`
		);
	}, 60_000);

	it.each(['webgl1', 'webgl2-byte'] as const)('%s fallback settles, preserves final image, wakes and re-settles', async (mode) => {
		const canvas = document.createElement('canvas');
		if (mode === 'webgl1') {
			const get = canvas.getContext.bind(canvas) as (t: string, ...args: unknown[]) => unknown;
			(canvas as unknown as { getContext: unknown }).getContext = (t: string, ...args: unknown[]) => t === 'webgl2' || t === 'bitmaprenderer' ? null : get(t, ...args);
		}
		const e = engine({ densityDissipation: 4, initialSplatCount: 0 }, false, canvas);
		const p = e as unknown as { canReadSettleFloat(): boolean; autoStart: boolean; deterministicMode: boolean; settleBytes: Uint8Array; gl: WebGLRenderingContext };
		if (mode === 'webgl2-byte') p.canReadSettleFloat = () => false;
		p.autoStart = true;
		p.deterministicMode = false;
		e.resume();
		await until(() => e.isSettled, 20_000);
		expect(activeFrameSubscribers()).toBe(0);
		expect(isQuietFlags(p.settleBytes)).toBe(true);
		// Render once into a retained target: default drawing buffers need not persist.
		const gl = p.gl;
		const target = createFBO(gl, 128, 128, mode === 'webgl1' ? gl.RGBA : (gl as WebGL2RenderingContext).RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.NEAREST);
		try {
			(e as unknown as { renderCore(target: FBO): void }).renderCore(target);
			const read = () => {
				const bytes = new Uint8Array(128 * 128 * 4);
				gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
				gl.readPixels(0, 0, 128, 128, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
				expect(gl.getError()).toBe(gl.NO_ERROR);
				return bytes;
			};
			const before = read();
			await sleep(200);
			expect(read()).toEqual(before);
			(e as unknown as { renderCore(target: FBO): void }).renderCore(target);
			expect(read()).toEqual(before);
		} finally { disposeFBO(gl, target); }
		e.splat(0.5, 0.5, -300, 400, { r: 2, g: 0.5, b: 0.2 });
		expect(e.isSettled).toBe(false);
		await until(() => e.isSettled, 20_000);
		expect(activeFrameSubscribers()).toBe(0);
		const stats = e.settleCheckStats;
		console.info(`[idle ${mode}] CPU stage ${(stats.stageMs / stats.checks).toFixed(3)} ms/check, readback ${(stats.readbackMs / stats.checks).toFixed(3)} ms/check; not GPU certification`);
	}, 60_000);

	it.each(['webgl1', 'webgl2-byte'] as const)('%s delayed image/dither readiness wakes empty special renderers and re-settles', async (mode) => {
		const NativeImage = window.Image;
		const pending: { image: HTMLImageElement; ready: boolean; release(): void }[] = [];
		vi.stubGlobal('Image', function () {
			const image = new NativeImage();
			let callback: ((event: Event) => void) | null = null;
			const entry = { image, ready: false, release: () => callback?.call(image, new Event('load')) };
			image.addEventListener('load', () => { entry.ready = true; });
			Object.defineProperty(image, 'onload', { set: (value) => { callback = value; } });
			pending.push(entry);
			return image;
		});
		try {
			const source = document.createElement('canvas');
			source.width = 8; source.height = 4;
			const context = source.getContext('2d')!;
			context.fillStyle = '#f00'; context.fillRect(0, 0, 8, 4);
			const url = source.toDataURL();
			for (const special of ['reveal', 'distortion'] as const) {
				pending.length = 0;
				const canvas = document.createElement('canvas');
				if (mode === 'webgl1') {
					const get = canvas.getContext.bind(canvas) as (t: string, ...args: unknown[]) => unknown;
					(canvas as unknown as { getContext: unknown }).getContext = (t: string, ...args: unknown[]) => t === 'webgl2' || t === 'bitmaprenderer' ? null : get(t, ...args);
				}
				const e = engine({ initialSplatCount: 0, autoSplatRate: 0, [special]: true,
					distortionImageUrl: special === 'distortion' ? url : undefined }, false, canvas);
				const p = e as unknown as InertProbe & { distortionLoadedUrl: string | null; distortionTextureW: number };
				if (mode === 'webgl2-byte') p.canReadSettleFloat = () => false;
				p.autoStart = true; p.deterministicMode = false; e.resume();
				await until(() => pending.every((entry) => entry.ready), 5000);
				expect(pending).toHaveLength(special === 'distortion' ? 2 : 1);
				await until(() => e.isSettled, 10_000);
				expect(p.ditheringTexture.width).toBe(1);
				// Decode real images normally; defer only delivery of readiness callbacks.
				for (const entry of pending) {
					expect(activeFrameSubscribers()).toBe(0);
					entry.release();
					expect(e.isSettled).toBe(false);
					expect(activeFrameSubscribers()).toBe(1);
					await until(() => e.isSettled, 10_000);
					expect(activeFrameSubscribers()).toBe(0);
				}
				expect(p.ditheringTexture.width).toBe(64);
				if (special === 'distortion') {
					expect(p.distortionLoadedUrl).toBe(url);
					expect(p.distortionTextureW).toBe(8);
					const target = createFBO(p.gl, 128, 128, mode === 'webgl1' ? p.gl.RGBA : p.gl.RGBA8, p.gl.RGBA, p.gl.UNSIGNED_BYTE, p.gl.NEAREST);
					try {
						p.renderCore(target);
						const pixel = new Uint8Array(4);
						p.gl.bindFramebuffer(p.gl.FRAMEBUFFER, target.fbo);
						p.gl.readPixels(64, 64, 1, 1, p.gl.RGBA, p.gl.UNSIGNED_BYTE, pixel);
						expect(pixel[0]).toBeGreaterThan(200);
						expect(pixel[1]).toBeLessThan(40);
					} finally { disposeFBO(p.gl, target); }
				}
				expect(p.gl.getError()).toBe(p.gl.NO_ERROR);
				expect(await rafCount(250)).toBe(0);
				e.dispose();
			}
		} finally { vi.unstubAllGlobals(); }
	}, 60_000);

	it.each(['webgl1', 'webgl2-byte'] as const)('%s flags equal issue-time signed velocity/HDR dye maxima across odd edges', async (mode) => {
		const canvas = document.createElement('canvas');
		if (mode === 'webgl1') {
			const get = canvas.getContext.bind(canvas) as (t: string, ...args: unknown[]) => unknown;
			(canvas as unknown as { getContext: unknown }).getContext = (t: string, ...args: unknown[]) => t === 'webgl2' || t === 'bitmaprenderer' ? null : get(t, ...args);
		}
		const e = engine({ simResolution: 61, dyeResolution: 203, initialSplatCount: 0 }, false, canvas);
		const p = e as unknown as { canReadSettleFloat(): boolean; issueSettleProbe(): void; advanceSettleProbe(): void; pollSettleProbe(): boolean | null; settleProbe: { ready?: boolean } | null; settleBytes: Uint8Array; config: { DENSITY_DISSIPATION: number } };
		if (mode === 'webgl2-byte') p.canReadSettleFloat = () => false;
		e.splat(0.999, 0.001, -900, 1200, { r: 0.2, g: 1.7, b: 2.3 });
		const max = (data: Float32Array) => data.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
		// WebGL1 cannot read half-float maxima to CPU; known signed/HDR input must be nonquiet.
		const expected = mode === 'webgl1' ? false : isQuiet(max(e.readField('velocity').data), max(e.readField('dye', { components: 3 }).data), p.config.DENSITY_DISSIPATION);
		p.issueSettleProbe();
		for (let i = 0; i < 12 && !p.settleProbe?.ready; i++) { e.advance(1, 1 / 60); p.advanceSettleProbe(); }
		expect(p.pollSettleProbe()).toBe(expected);
		expect([...p.settleBytes]).toEqual([255, 0, 255, 255, 255, 255, 255, 255]);
	});

	it('restored context re-probes capability and builds byte targets', async () => {
		const canvas = document.createElement('canvas');
		const e = engine({ initialSplatCount: 0 }, false, canvas);
		const p = e as unknown as { gl: WebGL2RenderingContext; issueSettleProbe(): void; settleProbe: { bytes: boolean } | null; canReadSettleFloat(): boolean; contextLost: boolean; failed: boolean };
		p.issueSettleProbe();
		expect(p.settleProbe?.bytes).toBe(false);
		const loss = p.gl.getExtension('WEBGL_lose_context');
		if (!loss) throw new Error('WEBGL_lose_context unavailable');
		loss.loseContext();
		await until(() => p.contextLost, 5000);
		p.canReadSettleFloat = () => false;
		loss.restoreContext();
		await until(() => !p.contextLost, 10_000);
		expect(p.failed).toBe(false);
		expect(p.settleProbe).toBeNull();
		p.issueSettleProbe();
		expect(p.settleProbe?.bytes).toBe(true);
	}, 20_000);

	it('byte snapshots cancel before and after readback on lifecycle changes', () => {
		for (const ready of [false, true]) for (const action of ['splat', 'config', 'resize', 'pause', 'loss', 'dispose']) {
			const e = engine({ initialSplatCount: 0 }, false);
			const p = e as unknown as { canReadSettleFloat(): boolean; issueSettleProbe(): void; advanceSettleProbe(): void; pollSettleProbe(): boolean | null; handleContextLost(): void; settleProbe: { ready?: boolean } | null; settleCheckCount: number };
			p.canReadSettleFloat = () => false;
			p.issueSettleProbe();
			if (ready) for (let i = 0; i < 12 && !p.settleProbe?.ready; i++) p.advanceSettleProbe();
			expect(p.settleProbe).not.toBeNull();
			if (action === 'splat') e.splat(0.5, 0.5, 1, 0, { r: 1, g: 0, b: 0 });
			else if (action === 'config') e.setConfig({ curl: 1 });
			else if (action === 'resize') e.resize(131, 127);
			else if (action === 'pause') e.pause();
			else if (action === 'loss') p.handleContextLost();
			else e.dispose();
			expect(p.settleProbe).toBeNull();
			expect(p.pollSettleProbe()).toBeNull();
			expect(p.settleCheckCount).toBe(0);
			e.dispose();
		}
	});

	it.each([false, true])('byte readback error fails closed (silent=%s)', (silent) => {
		const e = engine({}, false);
		const p = e as unknown as { canReadSettleFloat(): boolean; gl: WebGL2RenderingContext; issueSettleProbe(): void; advanceSettleProbe(): void; settleProbe: unknown; failed: boolean; settleCheckCount: number };
		p.canReadSettleFloat = () => false;
		const read = p.gl.readPixels;
		p.gl.readPixels = (() => { if (silent) p.gl.bindBuffer(-1, null); else throw new Error('injected readback failure'); }) as typeof read;
		try {
			p.issueSettleProbe();
			for (let i = 0; i < 12 && p.settleProbe; i++) p.advanceSettleProbe();
		} finally { p.gl.readPixels = read; }
		expect(p.failed).toBe(true);
		expect(p.settleProbe).toBeNull();
		expect(p.settleCheckCount).toBe(0);
		expect(e.isSettled).toBe(false);
	});

	it.each([false, true])('shared byte settle-probe failure isolates its instance, sibling still renders and settles (silent=%s)', async (silent) => {
		_setContextTier('shared');
		try {
			const e = engine({ initialSplatCount: 0 }, false);
			const sibling = engine({ initialSplatCount: 0 }, false);
			const p = e as unknown as InertProbe & { failed: boolean; settleCheckCount: number };
			const other = sibling as unknown as InertProbe & { failed: boolean };
			p.canReadSettleFloat = other.canReadSettleFloat = () => false;
			expect(p.gl).toBe(other.gl);
			const read = p.gl.readPixels;
			p.gl.readPixels = (() => { if (silent) p.gl.bindBuffer(-1, null); else throw new Error('injected shared byte readback failure'); }) as typeof read;
			try {
				p.issueSettleProbe();
				for (let i = 0; i < 12 && p.settleProbe; i++) p.advanceSettleProbe();
			} finally { p.gl.readPixels = read; }
			expect(p.failed).toBe(true);
			expect(p.settleProbe).toBeNull();
			expect(p.settleCheckCount).toBe(0);
			expect(e.isSettled).toBe(false);
			sibling.splat(0.5, 0.5, 0, 0, { r: 1, g: 0.2, b: 0.1 });
			sibling.advance(2, 1 / 60);
			sibling.renderOnce();
			await sibling.presented();
			expect(sibling.readField('dye').data.some((v) => v > 0)).toBe(true);
			expect(other.failed).toBe(false);
			expect(other.gl.getError()).toBe(other.gl.NO_ERROR);
			e.dispose();
			sibling.setConfig({ densityDissipation: 100 });
			other.autoStart = true; other.deterministicMode = false; sibling.resume();
			await until(() => sibling.isSettled, 10_000);
			expect(other.failed).toBe(false);
			expect(activeFrameSubscribers()).toBe(0);
		} finally { _setContextTier('auto'); }
	}, 20_000);

	it.each(['distortion', 'reveal'] as const)('%s amplifies sub-epsilon dye; only exact zero may settle', async (mode) => {
		for (const bytes of [false, true]) {
			const e = engine({ initialSplatCount: 0, densityDissipation: 0, [mode]: true, distortionPower: 100, revealSensitivity: 100, revealCurve: 0.2 }, false);
			const p = e as unknown as { canReadSettleFloat(): boolean; issueSettleProbe(): void; advanceSettleProbe(): void; pollSettleProbe(): boolean | null; settleProbe: { ready?: boolean; sync?: WebGLSync } | null };
			if (bytes) p.canReadSettleFloat = () => false;
			const check = async () => {
				p.issueSettleProbe();
				for (let i = 0; i < 12 && !p.settleProbe?.ready && !p.settleProbe?.sync; i++) p.advanceSettleProbe();
				let quiet: boolean | null = null;
				await until(() => { quiet = p.pollSettleProbe(); return quiet !== null; }, 5000);
				return quiet;
			};
			expect(await check()).toBe(true);
			const h = e as unknown as { gl: WebGL2RenderingContext; renderCore(target: null): void; distortionTexture: WebGLTexture };
			if (mode === 'distortion') {
				const pixels = new Uint8Array(64 * 64 * 4);
				for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
					const value = ((x >> 2) + (y >> 2)) % 2 ? 255 : 0;
					pixels.set([value, value, value, 255], (y * 64 + x) * 4);
				}
				h.gl.bindTexture(h.gl.TEXTURE_2D, h.distortionTexture);
				h.gl.texImage2D(h.gl.TEXTURE_2D, 0, h.gl.RGBA, 64, 64, 0, h.gl.RGBA, h.gl.UNSIGNED_BYTE, pixels);
			}
			const image = () => {
				h.renderCore(null);
				const pixels = new Uint8Array(128 * 128 * 4);
				h.gl.readPixels(0, 0, 128, 128, h.gl.RGBA, h.gl.UNSIGNED_BYTE, pixels);
				expect(h.gl.getError()).toBe(h.gl.NO_ERROR);
				return pixels;
			};
			const before = image();
			e.splat(0.5, 0.5, 1, 0, { r: 0.001, g: 0, b: 0 });
			expect(maxAbsDiff(before, image())).toBeGreaterThan(1);
			const dye = e.readField('dye', { components: 3 }).data.reduce((m, x) => Math.max(m, Math.abs(x)), 0);
			expect(isQuiet(1, dye, 0)).toBe(true);
			// Counterexample from display GLSL: 0.1 UV distortion or nonzero reveal alpha.
			const amplified = mode === 'distortion' ? 100 * dye : Math.pow(100 * dye, 0.2);
			expect(amplified).toBeGreaterThan(0.5 / 255);
			expect(await check()).toBe(false);
			e.dispose();
		}
	});

	it('nonfinite velocity cannot settle invisible dye on either readback path', async () => {
		for (const bytes of [false, true]) {
			const e = engine({ initialSplatCount: 0 }, false);
			const p = e as unknown as { gl: WebGL2RenderingContext; velocity: { read: FBO }; canReadSettleFloat(): boolean; issueSettleProbe(): void; advanceSettleProbe(): void; pollSettleProbe(): boolean | null; settleProbe: { ready?: boolean; sync?: WebGLSync } | null };
			if (bytes) p.canReadSettleFloat = () => false;
			const gl = p.gl;
			gl.bindTexture(gl.TEXTURE_2D, p.velocity.read.texture);
			gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 1, 1, gl.RG, gl.FLOAT, new Float32Array([Infinity, 0]));
			expect(gl.getError()).toBe(gl.NO_ERROR);
			p.issueSettleProbe();
			for (let i = 0; i < 12 && !p.settleProbe?.ready && !p.settleProbe?.sync; i++) p.advanceSettleProbe();
			let quiet: boolean | null = null;
			await until(() => { quiet = p.pollSettleProbe(); return quiet !== null; }, 5000);
			expect(quiet).toBe(false);
			e.dispose();
		}
	});

	it('invalid dissipation fails closed even for empty amplified modes on either readback path', async () => {
		for (const bytes of [false, true]) for (const dissipation of [NaN, -1]) {
			const e = engine({ initialSplatCount: 0, reveal: true }, false);
			const p = e as unknown as { config: { DENSITY_DISSIPATION: number }; canReadSettleFloat(): boolean; issueSettleProbe(): void; advanceSettleProbe(): void; pollSettleProbe(): boolean | null; settleProbe: { ready?: boolean; sync?: WebGLSync } | null };
			// Direct injection isolates the internal fail-closed boundary from config resolution.
			p.config.DENSITY_DISSIPATION = dissipation;
			if (bytes) p.canReadSettleFloat = () => false;
			p.issueSettleProbe();
			for (let i = 0; i < 12 && !p.settleProbe?.ready && !p.settleProbe?.sync; i++) p.advanceSettleProbe();
			let quiet: boolean | null = null;
			await until(() => { quiet = p.pollSettleProbe(); return quiet !== null; }, 5000);
			expect(quiet).toBe(false);
			e.dispose();
		}
	});

	it.each(['speed', 'pressure', 'scalar'] as const)('empty %s flow visualization settles on float and byte probes, then splat wakes', async (colorBy) => {
		for (const bytes of [false, true]) {
			const e = engine({ initialSplatCount: 0, autoSplatRate: 0, flow: { visualization: { colorBy } } });
			const p = e as unknown as { solverMayContainContent: boolean; canReadSettleFloat(): boolean };
			if (bytes) p.canReadSettleFloat = () => false;
			await until(() => e.isSettled, 10_000);
			expect(p.solverMayContainContent).toBe(false);
			for (const field of ['velocity', 'pressure', 'dye', ...(colorBy === 'scalar' ? ['scalar'] as const : [])] as const) {
				const data = e.readField(field, field === 'scalar' ? { components: 3 } : {}).data;
				expect(data.every((v) => v === 0)).toBe(true);
			}
			expect(activeFrameSubscribers()).toBe(0);
			const callbacks = await rafCount(250);
			expect(callbacks).toBe(0);
			e.splat(0.5, 0.5, 300, 0, { r: 0, g: 0, b: 0 });
			expect(p.solverMayContainContent).toBe(true);
			expect(e.isSettled).toBe(false);
			expect(activeFrameSubscribers()).toBeGreaterThanOrEqual(1);
			await sleep(200);
			expect(e.isSettled).toBe(false);
			console.info(`[idle empty ${colorBy} ${bytes ? 'byte' : 'float'}] raw fields zero, quiet callbacks ${callbacks}, black splat woke; nonempty flow remains active`);
			e.dispose();
		}
	});

	it('nonempty non-dye flow visualization is explicitly unsupported by dye-only quiet proof', () => {
		const e = engine({ initialSplatCount: 0, flow: { visualization: { colorBy: 'speed' } } }, false);
		e.splat(0.5, 0.5, 300, 0, { r: 0, g: 0, b: 0 });
		const p = e as unknown as { autoStart: boolean; deterministicMode: boolean; trackSettle(): void; settleProbe: unknown };
		p.autoStart = true; p.deterministicMode = false;
		for (let i = 0; i < 100; i++) p.trackSettle();
		expect(p.settleProbe).toBeNull();
		expect(e.isSettled).toBe(false);
	});

	it('default densityDissipation settles within 20 s', async () => {
		engine();
		const settleMs = await until(() => activeFrameSubscribers() === 0, 20_000);
		console.info(`[idle] time-to-settle (default config): ${(settleMs / 1000).toFixed(2)} s`);
	}, 30_000);

	it('a pointermove on the canvas wakes a settled engine (hover splat)', async () => {
		const canvas = document.createElement('canvas');
		const e = engine({ densityDissipation: 4, pointerInput: true }, true, canvas);
		await until(() => activeFrameSubscribers() === 0, 20_000);
		expect(e.isSettled).toBe(true);
		canvas.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, pointerType: 'mouse', clientX: 40, clientY: 40, bubbles: true }));
		expect(activeFrameSubscribers()).toBeGreaterThanOrEqual(1);
		expect(e.isSettled).toBe(false);
	}, 40_000);

	it('autoSplatRate > 0 never settles', async () => {
		const e = engine({ autoSplatRate: 2, densityDissipation: 4 });
		await sleep(10_000);
		expect(e.isSettled).toBe(false);
		expect(activeFrameSubscribers()).toBeGreaterThanOrEqual(1);
	}, 20_000);

	it('explicit pause clears settled; setConfig wakes', async () => {
		const e = engine({ densityDissipation: 4 });
		await until(() => activeFrameSubscribers() === 0, 20_000);
		e.setConfig({ curl: 5 });
		expect(activeFrameSubscribers()).toBeGreaterThanOrEqual(1);
		e.pause();
		expect(e.isSettled).toBe(false);
		expect(activeFrameSubscribers()).toBe(0);
	}, 40_000);

	it('wake parity: settled+splat vs never-stopped engine, same moment', async () => {
		// Same seed, both live. A settles (loop stopped) while B is kept alive by
		// a zero-strength driver that cannot settle; both then get splat S at the
		// same wall time and are compared 1 s later. Not bit-exact: each runs its
		// own wall-clock dt sequence (variable, clamped), and A's first dt after
		// wake is clamped from a long gap.
		const cfg = {
			densityDissipation: 4, seed: 7,
			// Software GL's long draws give the engines different clamped wall-clock dt.
			// Isolate wake parity there; retain the original live hardware timing gate.
			...(softwareGL ? { simResolution: 16, dyeResolution: 64, initialSplatCount: 0, bloom: false, sunrays: false } : {})
		} satisfies FluidConfig;
		const a = engine(cfg);
		const b = engine({ ...cfg, autoSplatRate: 1e-9 });
		await until(() => a.isSettled, 20_000);
		if (softwareGL) for (const e of [a, b]) {
			(e as unknown as { calcDeltaTime(): number }).calcDeltaTime = () => 1 / 60;
		}
		expect(b.isSettled).toBe(false);
		const S = [0.4, 0.5, 200, 20, { r: 0.8, g: 0.3, b: 0.1 }] as const;
		a.splat(...S);
		b.splat(...S);
		await sleep(1000);
		a.pause();
		b.pause();
		const diff = maxAbsDiff(a.readField('dye').data, b.readField('dye').data);
		console.info(`[idle] wake parity max |dye diff| = ${diff.toExponential(3)}`);
		expect(diff).toBeLessThan(0.02);
	}, 60_000);

	it.each(['own', 'shared'] as const)('staged GPU snapshot equals issue-time maxima while fields evolve (%s tier)', async (tier) => {
		_setContextTier(tier);
		try {
		// Odd, non-multiple-of-8 sizes exercise partial reduction tiles.
		const e = engine({ simResolution: 61, dyeResolution: 203 }, false);
		const sibling = tier === 'shared' ? engine({ simResolution: 47, dyeResolution: 159 }, false) : null;
		e.splat(0.13, 0.91, 900, -400, { r: 0.2, g: 1.7, b: 0.4 });
		e.splat(0.97, 0.04, -300, 1200, { r: 0.05, g: 0.1, b: 2.3 });
		const probe = e as unknown as {
			issueSettleProbe(): void;
			trackSettle(): void;
			autoStart: boolean; deterministicMode: boolean;
			advanceSettleProbe(): void;
			pollSettleProbe(): boolean | null;
			settlePixels: Float32Array;
			settleProbe: unknown;
			blit(...args: unknown[]): void;
		};
		const cpuMax = (data: Float32Array) => data.reduce((m, x) => Math.max(m, Math.abs(x)), 0);
		for (const resized of [false, true]) {
		if (resized) e.resize(137, 119);
		(probe as unknown as { settleFrames: number }).settleFrames = 0;
		const v = cpuMax(e.readField('velocity').data);
		const d = cpuMax(e.readField('dye', { components: 3 }).data);
		const displayedDye = d * dyeVisibilityGain((e as unknown as { config: { SUNRAYS: boolean; SUNRAYS_WEIGHT: number } }).config);
		const original = probe.blit;
		let draws = 0;
		probe.blit = (...args) => { draws++; original(...args); };
		try {
			probe.autoStart = true;
			probe.deterministicMode = false;
			for (let frame = 0; frame < 30; frame++) probe.trackSettle();
			expect(draws).toBe(2);
			for (let i = 0; i < 12 && probe.settleProbe; i++) {
				// Changes the ping-pong fields without external input/epoch invalidation.
				e.advance(1, 1 / 60);
				draws = 0;
				if (sibling) {
					sibling.splat(0.4, 0.6, 250, -80, { r: 0.3, g: 0.4, b: 0.8 });
					sibling.advance(1, 1 / 60);
				}
				probe.trackSettle();
				expect(draws).toBeLessThanOrEqual(1);
				await sleep(0);
			}
		} finally { probe.blit = original; }
		expect(probe.settleProbe).toBeNull();
		const gv = probe.settlePixels[0];
		const gd = probe.settlePixels[4];
		expect(cpuMax(e.readField('dye', { components: 3 }).data)).not.toBe(d);
		expect(v).toBeGreaterThan(1);
		expect(d).toBeGreaterThan(0.5);
		// Inputs are already half floats; the R16F chain re-rounds once (2^-11 relative).
		expect(Math.abs(gv - v)).toBeLessThanOrEqual(v * 2 ** -10);
		expect(Math.abs(gd - displayedDye)).toBeLessThanOrEqual(displayedDye * 2 ** -10);
		}
		} finally {
			_setContextTier('auto');
		}
	});

	it('cancels snapshots on splat, config, resize, pause, loss and dispose', async () => {
		for (const when of ['snapshot', 'fenced']) for (const action of ['splat', 'config', 'resize', 'pause', 'loss', 'dispose']) {
			const e = engine({}, false);
			const probe = e as unknown as {
				issueSettleProbe(): void;
				advanceSettleProbe(): void;
				pollSettleProbe(): boolean | null;
				handleContextLost(): void;
				settleProbe: { sync: WebGLSync | null } | null;
				settleCheckCount: number;
			};
			probe.issueSettleProbe();
			if (when === 'fenced') for (let i = 0; i < 12 && !probe.settleProbe?.sync; i++) probe.advanceSettleProbe();
			expect(probe.settleProbe).not.toBeNull();
			if (action === 'splat') e.splat(0.5, 0.5, 300, 0, { r: 1, g: 0.2, b: 0.1 });
			else if (action === 'config') e.setConfig({ densityDissipation: 0.1 });
			else if (action === 'resize') e.resize(131, 127);
			else if (action === 'pause') e.pause();
			else if (action === 'loss') probe.handleContextLost();
			else e.dispose();
			expect(probe.settleProbe).toBeNull();
			expect(probe.pollSettleProbe()).toBeNull();
			expect(probe.settleCheckCount).toBe(0);
			e.dispose();
		}
	});

	it('a partial reduction allocation leaves no truncated chain to reuse', () => {
		const e = engine({ simResolution: 16 }, false);
		const p = e as unknown as {
			gl: WebGL2RenderingContext; velocity: { read: unknown }; settleVelocityChain: { width: number; height: number }[];
			prepareSettleChain(src: unknown, chain: unknown[]): void;
		};
		const original = p.gl.createTexture.bind(p.gl);
		let n = 0;
		p.gl.createTexture = (() => ++n === 2 ? null : original()) as typeof p.gl.createTexture;
		try {
			expect(() => p.prepareSettleChain(p.velocity.read, p.settleVelocityChain)).toThrow();
			expect(p.settleVelocityChain).toHaveLength(0);
		} finally { p.gl.createTexture = original; }
		p.prepareSettleChain(p.velocity.read, p.settleVelocityChain);
		const reduced = p.settleVelocityChain[p.settleVelocityChain.length - 1];
		expect([reduced.width, reduced.height]).toEqual([1, 1]);
	});

	it('failed framebuffer allocation deletes its orphan texture', () => {
		const e = engine({ simResolution: 16 }, false);
		const p = e as unknown as {
			gl: WebGL2RenderingContext; velocity: { read: unknown }; settleVelocityChain: unknown[];
			prepareSettleChain(src: unknown, chain: unknown[]): unknown;
		};
		const create = p.gl.createFramebuffer.bind(p.gl);
		const remove = p.gl.deleteTexture.bind(p.gl);
		let deleted = 0;
		p.gl.createFramebuffer = (() => null) as unknown as typeof p.gl.createFramebuffer;
		p.gl.deleteTexture = (texture) => { deleted++; remove(texture); };
		try {
			expect(() => p.prepareSettleChain(p.velocity.read, p.settleVelocityChain)).toThrow();
			expect(deleted).toBe(1);
			expect(p.settleVelocityChain).toHaveLength(0);
		} finally { p.gl.createFramebuffer = create; p.gl.deleteTexture = remove; }
	});

	it.each(['own', 'shared'] as const)('failed readPixels cannot become quiet (%s tier)', (tier) => {
		_setContextTier(tier);
		try {
			const e = engine({}, false);
			const p = e as unknown as {
				gl: WebGL2RenderingContext;
				issueSettleProbe(): void;
				advanceSettleProbe(): void;
				settleProbe: { sync: WebGLSync | null } | null; settleCheckCount: number; failed: boolean;
			};
			const original = p.gl.readPixels.bind(p.gl);
			p.gl.readPixels = (() => {
				// Real GL validation error; no JS exception, exactly the silent-zero failure.
				p.gl.bindBuffer(-1, null);
			}) as typeof p.gl.readPixels;
			try {
				p.issueSettleProbe();
				for (let i = 0; i < 12 && p.settleProbe && !p.settleProbe.sync; i++) p.advanceSettleProbe();
			} finally { p.gl.readPixels = original; }
			expect(p.failed).toBe(true);
			expect(p.settleProbe).toBeNull();
			expect(p.settleCheckCount).toBe(0);
			expect(e.isSettled).toBe(false);
		} finally { _setContextTier('auto'); }
	});

	it('shared polling rejects its own errors, not prior sibling GL errors', async () => {
		_setContextTier('shared');
		try {
			const e = engine({}, false);
			const sibling = engine({}, false);
			const p = e as unknown as {
				issueSettleProbe(): void; advanceSettleProbe(): void; pollSettleProbe(): boolean | null;
				settleProbe: { sync: WebGLSync | null } | null; failed: boolean;
			};
			p.issueSettleProbe();
			for (let i = 0; i < 12 && !p.settleProbe?.sync; i++) p.advanceSettleProbe();
			const other = sibling as unknown as { gl: WebGL2RenderingContext; withGl(fn: () => void): void };
			await until(() => {
				other.withGl(() => other.gl.bindBuffer(-1, null));
				p.pollSettleProbe();
				expect(p.failed).toBe(false);
				return p.settleProbe === null;
			}, 5000);
		} finally { _setContextTier('auto'); }
	});

	it('readback issue frame cannot poll its newly created fence', () => {
		const e = engine({}, false);
		const p = e as unknown as {
			autoStart: boolean; deterministicMode: boolean; gl: WebGL2RenderingContext; trackSettle(): void;
			issueSettleProbe(): void; settleProbe: { sync: WebGLSync | null; velocityLevel: number; dyeLevel: number };
			settleVelocityChain: unknown[]; settleDyeChain: unknown[];
		};
		p.autoStart = true;
		p.deterministicMode = false;
		p.issueSettleProbe();
		p.settleProbe.velocityLevel = p.settleVelocityChain.length;
		p.settleProbe.dyeLevel = p.settleDyeChain.length;
		const original = p.gl.getSyncParameter;
		let polls = 0;
		p.gl.getSyncParameter = (() => { polls++; return p.gl.UNSIGNALED; }) as typeof original;
		try {
			p.trackSettle();
			expect(p.settleProbe.sync).not.toBeNull();
			expect(polls).toBe(0);
			p.trackSettle();
			expect(polls).toBe(1);
		} finally { p.gl.getSyncParameter = original; }
	});

	it.each(['own', 'shared'] as const)('failed fence polling and buffer reads fail closed (%s tier)', async (tier) => {
		_setContextTier(tier);
		try { for (const operation of ['getSyncParameter', 'getBufferSubData'] as const) {
			const e = engine({}, false);
			const p = e as unknown as {
				gl: WebGL2RenderingContext; issueSettleProbe(): void; advanceSettleProbe(): void;
				pollSettleProbe(): boolean | null; settleProbe: { sync: WebGLSync | null } | null;
				failed: boolean; settleCheckCount: number;
			};
			p.issueSettleProbe();
			for (let i = 0; i < 12 && !p.settleProbe?.sync; i++) p.advanceSettleProbe();
			await until(() => p.gl.getSyncParameter(p.settleProbe!.sync!, p.gl.SYNC_STATUS) === p.gl.SIGNALED, 5000);
			const original = p.gl[operation];
			(p.gl as unknown as Record<string, unknown>)[operation] = () => { p.gl.bindBuffer(-1, null); return null; };
			try { expect(p.pollSettleProbe()).toBeNull(); }
			finally { (p.gl as unknown as Record<string, unknown>)[operation] = original; }
			expect(p.failed).toBe(true);
			expect(p.settleProbe).toBeNull();
			expect(p.settleCheckCount).toBe(0);
			expect(p.gl.getParameter(p.gl.PIXEL_PACK_BUFFER_BINDING)).toBeNull();
		} } finally { _setContextTier('auto'); }
	});

	it('FluidReveal auto-reveal is not deadlocked by settling', async () => {
		const el = document.createElement('div');
		el.style.cssText = 'width:200px;height:200px;position:relative';
		document.body.append(el);
		const app = mount(FluidReveal as never, { target: el, props: { autoReveal: true, fadeSpeed: 0.9 } });
		apps.push(app as object);
		await sleep(8_000);
		// Auto-reveal splats forever, so the engine must still be running.
		expect(activeFrameSubscribers()).toBeGreaterThanOrEqual(1);
		await sleep(2_000);
		expect(activeFrameSubscribers()).toBeGreaterThanOrEqual(1);
	}, 30_000);
});
