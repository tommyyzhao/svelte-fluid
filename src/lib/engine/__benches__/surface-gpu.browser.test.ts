/*
 * Liquid-control GPU cost (measurement, not a gate; ADR-0089 method). Opt in
 * with SVELTE_FLUID_GPU_BENCH=1 and SVELTE_FLUID_DPR=<native>. Batches of busy
 * frames (impulse every frame: worst case) are bracketed by a 1-px readback that
 * drains the queue; wall time per frame bounds GPU time. No timer queries.
 */
import { commands } from 'vitest/browser';
import { it } from 'vitest';
import { acquireGlHost } from '../gl-host.js';
import { SurfaceEngine } from '../surface/SurfaceEngine.js';
import type { SurfaceConfig } from '../surface/SurfaceEngine.js';

const OUT = import.meta.env.SVELTE_FLUID_GPU_BENCH_OUT || '/tmp/lane-surface/surface-gpu.json';
const BATCH = 30;
const BATCHES = 15;

it('surface GPU per instance', { timeout: 300_000 }, async () => {
	const dpr = devicePixelRatio;
	const cases: [string, SurfaceConfig, number, number][] = [
		['button 220x56', { control: 'button', tone: 'light', rect: { x: 6, y: 6, width: 220, height: 56 }, radius: 28 }, 232, 68],
		['segmented 360x56', { control: 'segmented', tone: 'dark', rect: { x: 6, y: 6, width: 360, height: 56 }, radius: 28, lens: { x: 6, y: 6, width: 120, height: 56 }, labels: [{ x: 40, y: 24, width: 50, height: 20 }, { x: 160, y: 24, width: 50, height: 20 }, { x: 280, y: 24, width: 50, height: 20 }] }, 372, 68],
		['wide button 480x64', { control: 'button', tone: 'dark', rect: { x: 6, y: 6, width: 480, height: 64 }, radius: 32, focus: true }, 492, 76]
	];
	const rows: Record<string, unknown>[] = [];
	for (const [name, config, w, h] of cases) {
		const canvas = document.createElement('canvas');
		document.body.append(canvas);
		const e = new SurfaceEngine({ canvas, config });
		e.resize(w, h, dpr);
		const gl = acquireGlHost(e).gl;
		const px = new Uint8Array(4);
		const drain = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
		e.busyFrames(120);
		drain();
		const per: number[] = [];
		for (let b = 0; b < BATCHES; b++) {
			const t0 = performance.now();
			e.busyFrames(BATCH);
			drain();
			per.push((performance.now() - t0) / BATCH);
		}
		per.sort((a, b) => a - b);
		rows.push({ name, dpr, canvas: `${canvas.width}x${canvas.height}`, medianMs: per[per.length >> 1], worstBatchMs: per[per.length - 1] });
		e.dispose();
		canvas.remove();
	}
	await (commands as unknown as Record<string, (p: string, c: string) => Promise<void>>).writeBenchJson(OUT, JSON.stringify(rows, null, 2));
});
