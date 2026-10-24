import { expect, it } from 'vitest';
import { commands } from 'vitest/browser';
import { FluidEngine } from '../FluidEngine.js';
import type { DoubleFBO, FBO } from '../internal-types.js';
import { getTuning } from '../../../routes/test/tesla-valve/tunings.js';
import { renderer } from './renderer.js';

it.skipIf(import.meta.env.SVELTE_FLUID_SHOTS_EXTRA !== 'pressure-crossover')('measures pressure pairing across the production crossover', async () => {
	const rows: unknown[] = [];
	for (const resolution of [256, 332, 444, 576]) {
		const canvas = document.createElement('canvas'); canvas.width = 1920; canvas.height = 640;
		const tuning = getTuning('flame-jet');
		const engine = new FluidEngine({ canvas, autoStart: false, config: { ...tuning.config, simResolution: resolution, dyeResolution: 32, bloom: false, seed: 704, flow: { ...tuning.config.flow, scalarFields: [], visualization: { colorBy: 'dye' } } } });
		const h = engine as unknown as { gl: WebGL2RenderingContext; velocity: DoubleFBO; pressure: DoubleFBO; projectVelocity(): void };
		const gl = h.gl, width = h.velocity.width;
		const pixel = new Float32Array(4);
		const sync = (target: FBO) => { gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.FLOAT, pixel); };
		try {
			engine.advance(60, 1 / 240);
			const results: Record<string, number> = {};
			for (const paired of [false, true, true, false]) {
				const times: number[] = [];
				for (let n = 0; n < 11; n++) {
					sync(h.velocity.read);
					const start = performance.now();
					h.velocity.width = paired ? 1 : 2_000_000;
					try { for (let i = 0; i < 4; i++) h.projectVelocity(); }
					finally { h.velocity.width = width; }
					sync(h.velocity.read);
					if (n >= 2) times.push(performance.now() - start);
					await new Promise((r) => setTimeout(r, 0));
				}
				times.sort((a, b) => a - b);
				const key = paired ? 'paired' : 'single';
				results[key] = results[key] ? (results[key] + times[4]) / 2 : times[4];
			}
			expect(gl.getError(), renderer).toBe(gl.NO_ERROR);
			rows.push({ resolution, width, height: h.velocity.height, texels: width * h.velocity.height, ...results });
		} finally { engine.dispose(); }
	}
	await (commands as unknown as { writeBenchJson(path: string, content: string): Promise<void> }).writeBenchJson('.svelte-kit/flame-perf/pressure-crossover.json', JSON.stringify({ renderer, rows }, null, 2));
}, 600_000);
