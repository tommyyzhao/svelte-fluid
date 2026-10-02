/*
 * Shared-host present cost (ADR-0093). Measurement, not a gate; opt in with
 * SVELTE_FLUID_GPU_BENCH=1. JSON: /tmp/lane-shared-ctx/present.json.
 *
 * Every canvas is in the DOM. Per configuration (n instances, shared or own
 * context, 800×500 CSS at DPR 2/3):
 *  - glSync: back-to-back page frames (each instance simulates, renders and
 *    presents), one 1-px readback per live context at the end. Presents are
 *    fired, not awaited.
 *  - allSync: the same, plus await every present promise at the end, so async
 *    snapshot delivery is included.
 *  - raf: real requestAnimationFrame-driven frames (scheduler, compositor and
 *    all), median rAF interval. Vsync-bound below ~16.7 ms.
 * Per-instance figures are total / (frames × n). Per-canvas present is a
 * buffer swap the compositor takes without a copy; shared present is a
 * createImageBitmap snapshot copy, which glSync and allSync both include.
 */
import { commands } from 'vitest/browser';
import { afterAll, describe, expect, it } from 'vitest';
import { FluidEngine, _setContextTier } from '../FluidEngine.js';
import { PRESETS } from '../../presets/registry.js';
import type { FluidConfig } from '../types.js';

type Harness = { rafRunning: boolean; lastUpdateTime: number; update(): void; gl: WebGL2RenderingContext; present(): void };
const CSS_W = 800;
const CSS_H = 500;
const BATCHES = 8;
const BATCH_FRAMES = 10;
const rows: Record<string, unknown>[] = [];

function frame(engine: FluidEngine): void {
	const h = engine as unknown as Harness;
	h.lastUpdateTime = performance.now() - 1000 / 60;
	h.rafRunning = true;
	h.update();
	engine.pause();
}

const median = (v: number[]) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)];
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const raf = () => new Promise<number>((r) => requestAnimationFrame(r));

function build(n: number, shared: boolean, dpr: number, config: FluidConfig, autoStart: boolean, stubPresent = false) {
	_setContextTier(shared);
	const list: FluidEngine[] = [];
	try {
		for (let i = 0; i < n; i++) {
			const canvas = document.createElement('canvas');
			canvas.width = CSS_W * dpr;
			canvas.height = CSS_H * dpr;
			canvas.style.cssText = `width:${CSS_W / 4}px;height:${CSS_H / 4}px`;
			document.body.append(canvas);
			const engine = new FluidEngine({ canvas, autoStart, config: { pointerInput: false, seed: i + 1, ...config } });
			expect(engine.sharedContext).toBe(shared);
			if (stubPresent) (engine as unknown as Harness).present = () => {};
			list.push(engine);
		}
	} finally {
		_setContextTier('auto');
	}
	return list;
}

async function synced(list: FluidEngine[], shared: boolean, awaitPresents: boolean): Promise<number> {
	const px = new Uint8Array(4);
	const contexts = shared ? [list[0]] : list;
	const drain = () => {
		for (const e of contexts) {
			const gl = (e as unknown as Harness).gl;
			gl.bindFramebuffer(gl.FRAMEBUFFER, null);
			gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
		}
	};
	for (let i = 0; i < 40; i++) for (const e of list) frame(e);
	drain();
	await Promise.all(list.map((e) => e.presented()));
	await tick(30);
	const batches: number[] = [];
	for (let b = 0; b < BATCHES; b++) {
		drain();
		await Promise.all(list.map((e) => e.presented()));
		const t0 = performance.now();
		const pending: Promise<void>[] = [];
		for (let i = 0; i < BATCH_FRAMES; i++) {
			for (const e of list) {
				frame(e);
				pending.push(e.presented());
			}
		}
		drain();
		if (awaitPresents) await Promise.all(pending);
		batches.push((performance.now() - t0) / BATCH_FRAMES / list.length);
	}
	return median(batches);
}

async function rafInterval(list: FluidEngine[]): Promise<number> {
	for (let i = 0; i < 30; i++) await raf();
	const t: number[] = [];
	let last = await raf();
	for (let i = 0; i < 90; i++) {
		const now = await raf();
		t.push(now - last);
		last = now;
	}
	expect(list.every((e) => !e.isPaused)).toBe(true);
	return median(t);
}

const CONFIGS: [string, FluidConfig][] = [
	['(default)', {}],
	['Karman', PRESETS.find((p) => p.id === 'Karman')!.config as FluidConfig]
];

describe('shared-host present cost (measurement only)', () => {
	for (const dpr of [2, 3]) {
		for (const [preset, config] of CONFIGS) {
			it(`DPR ${dpr} ${preset}`, { timeout: 600_000 }, async () => {
				for (const n of [1, 2, 4, 8]) {
					for (const shared of [false, true]) {
						const row: Record<string, unknown> = { preset, dpr, n, mode: shared ? 'shared' : 'own' };
						let list = build(n, shared, dpr, config, false);
						row.glSyncMs = +(await synced(list, shared, false)).toFixed(3);
						row.allSyncMs = +(await synced(list, shared, true)).toFixed(3);
						for (const e of list) e.dispose();
						document.body.replaceChildren();
						if (shared && n === 1) {
							list = build(n, shared, dpr, config, false, true);
							row.noPresentMs = +(await synced(list, shared, false)).toFixed(3);
							for (const e of list) e.dispose();
							document.body.replaceChildren();
						}
						list = build(n, shared, dpr, config, true);
						row.rafIntervalMs = +(await rafInterval(list)).toFixed(2);
						for (const e of list) e.dispose();
						document.body.replaceChildren();
						await tick(50);
						rows.push(row);
					}
				}
			});
		}
	}
	afterAll(async () => {
		const write = (commands as unknown as Record<string, (p: string, c: string) => Promise<void>>).writeBenchJson;
		await write('/tmp/lane-shared-ctx/present.json', JSON.stringify(rows, null, 2));
	});
});
