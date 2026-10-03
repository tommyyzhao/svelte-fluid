import { mount, unmount } from 'svelte';
import { afterEach, describe, expect, it } from 'vitest';
import FluidReveal from '../../FluidReveal.svelte';
import { FluidEngine, _setContextTier } from '../FluidEngine.js';
import { activeFrameSubscribers } from '../frame-scheduler.js';
import type { FluidConfig } from '../types.js';

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
		const cfg = { densityDissipation: 4, seed: 7 } satisfies FluidConfig;
		const a = engine(cfg);
		const b = engine({ ...cfg, autoSplatRate: 1e-9 });
		await until(() => a.isSettled, 20_000);
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
		expect(Math.abs(gd - d)).toBeLessThanOrEqual(d * 2 ** -10);
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
