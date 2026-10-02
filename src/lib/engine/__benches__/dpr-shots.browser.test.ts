/*
 * Same-seed DPR-3 screenshots for visual-equivalence review (not a gate).
 * Opt in with SVELTE_FLUID_GPU_BENCH=1 and SVELTE_FLUID_SHOTS_DIR=/tmp/dpr/before.
 */
import { commands } from 'vitest/browser';
import { it } from 'vitest';
import { FluidEngine } from '../FluidEngine.js';
import { PRESETS } from '../../presets/registry.js';
import type { FluidConfig } from '../types.js';

const DIR = import.meta.env.SVELTE_FLUID_SHOTS_DIR || '/tmp/dpr/shots';
const W = 1440 * 3;
const H = 900 * 3;
const FRAMES = 150;

it('dpr-3 screenshots', { timeout: 600_000 }, async () => {
	const write = (commands as unknown as Record<string, (p: string, c: string) => Promise<void>>).writeBenchJson;
	const cases: [string, FluidConfig][] = [
		['default', {}],
		['default-transparent', { transparent: true }],
		['LavaLamp-transparent', { ...(PRESETS[0].config as FluidConfig), transparent: true }],
		...PRESETS.map((p): [string, FluidConfig] => [p.id, p.config as FluidConfig])
	];
	for (const [name, base] of cases) {
		const canvas = document.createElement('canvas');
		canvas.width = W;
		canvas.height = H;
		const engine = new FluidEngine({
			canvas,
			autoStart: false,
			config: { ...base, seed: 1234, pointerInput: false, dyeResolution: Math.min(base.dyeResolution ?? 1024, W) }
		});
		const h = engine as unknown as { rafRunning: boolean; calcDeltaTime(): number; update(): void; gl: WebGL2RenderingContext };
		h.calcDeltaTime = () => 1 / 60;
		for (let i = 0; i < FRAMES; i++) {
			h.rafRunning = true;
			h.update();
		}
		engine.pause();
		const gl = h.gl;
		const px = new Uint8Array(W * H * 4);
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
		engine.dispose();
		// Raw RGBA rows, bottom-up; converted to PNG offline. base64 keeps the
		// string-only write command lossless.
		let bin = '';
		for (let i = 0; i < px.length; i += 0x8000) bin += String.fromCharCode(...px.subarray(i, i + 0x8000));
		await write(`${DIR}/${name}.rgba.b64`, btoa(bin));
	}
});
