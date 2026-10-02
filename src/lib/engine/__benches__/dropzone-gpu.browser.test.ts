/*
 * Drop-zone and caustics GPU cost (measurement, not a gate; ADR-0089 method).
 * Opt in with SVELTE_FLUID_GPU_BENCH=1 and SVELTE_FLUID_DPR=<native>. Busy
 * frames (impulse every frame, climb mid-ease, ambient waves) are bracketed by
 * a 1-px readback that drains the queue; wall time per frame bounds GPU time.
 */
import { commands } from 'vitest/browser';
import { it } from 'vitest';
import { acquireGlHost } from '../gl-host.js';
import { SurfaceEngine } from '../surface/SurfaceEngine.js';
import type { SurfaceConfig } from '../surface/SurfaceEngine.js';

const OUT = import.meta.env.SVELTE_FLUID_GPU_BENCH_OUT || '/tmp/lane-dropzone/dropzone-gpu.json';
const BATCH = 30;
const BATCHES = 15;

it('drop zone and caustics GPU per instance', { timeout: 300_000 }, async () => {
	const dpr = devicePixelRatio;
	const cases: [string, SurfaceConfig, number, number][] = [
		['dropzone 480x200 dragging', { control: 'dropzone', tone: 'dark', rect: { x: 6, y: 6, width: 480, height: 200 }, radius: 18, drag: { x: -10, y: 100 }, labels: [{ x: 160, y: 96, width: 170, height: 20 }] }, 492, 212],
		['caustics 720x400', { control: 'overlay', tone: 'dark', rect: { x: 0, y: 0, width: 720, height: 400 }, radius: 16, overlay: 0.3 }, 720, 400]
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
