/*
 * EnamelText GPU cost (measurement, not a gate; ADR-0089 method). Opt in with
 * SVELTE_FLUID_GPU_BENCH=1 and SVELTE_FLUID_DPR=<native>. Batches of busy
 * frames (held press: every transport pass plus the composite) are bracketed
 * by a 1-px readback that drains the queue; wall time per frame bounds GPU
 * time. No timer queries.
 */
import { commands } from 'vitest/browser';
import { it } from 'vitest';
import { acquireGlHost } from '../gl-host.js';
import { EnamelEngine } from '../enamel/EnamelEngine.js';

const OUT = import.meta.env.SVELTE_FLUID_GPU_BENCH_OUT || '/tmp/lane-enamel/enamel-gpu.json';
const BATCH = 30;
const BATCHES = 15;

it('enamel GPU per instance', { timeout: 300_000 }, async () => {
	const dpr = devicePixelRatio;
	const rows: Record<string, unknown>[] = [];
	for (const [name, font, text] of [
		['heading 96px bold', '700 96px/1.1 system-ui', 'Enamel'],
		['heading 64px bold, two words', '700 64px/1.1 system-ui', 'Soft enamel']
	] as const) {
		const host = document.createElement('div');
		host.style.cssText = `position:relative;display:inline-block;font:${font}`;
		const source = document.createElement('span');
		source.textContent = text;
		const canvas = document.createElement('canvas');
		canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%';
		host.append(source, canvas);
		document.body.append(host);
		const e = new EnamelEngine({ canvas, source });
		const r = host.getBoundingClientRect();
		e.resize(r.width, r.height, dpr);
		const gl = acquireGlHost(e).gl;
		const px = new Uint8Array(4);
		const drain = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
		const t0 = performance.now();
		e.busyFrames(1);
		drain();
		const setupMs = performance.now() - t0;
		e.busyFrames(120);
		drain();
		const per: number[] = [];
		for (let b = 0; b < BATCHES; b++) {
			const t = performance.now();
			e.busyFrames(BATCH);
			drain();
			per.push((performance.now() - t) / BATCH);
		}
		per.sort((a, b) => a - b);
		rows.push({ name, dpr, canvas: `${canvas.width}x${canvas.height}`, grid: e.grid, setupMs, medianMs: per[per.length >> 1], worstBatchMs: per[per.length - 1] });
		e.dispose();
		host.remove();
	}
	console.log(JSON.stringify(rows));
	await (commands as unknown as Record<string, (p: string, c: string) => Promise<void>>).writeBenchJson(OUT, JSON.stringify(rows, null, 2));
});
