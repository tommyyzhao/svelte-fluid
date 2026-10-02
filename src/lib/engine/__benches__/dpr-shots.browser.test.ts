/*
 * Same-seed screenshots for visual-equivalence review (not a gate).
 * Opt in with SVELTE_FLUID_GPU_BENCH=1 and SVELTE_FLUID_SHOTS_DIR=/tmp/dpr/before.
 * Optional: SVELTE_FLUID_SHOTS_DPRS='1,2' (default 3), SVELTE_FLUID_SHOTS_CSS=800x500
 * (default 1440x900), SVELTE_FLUID_SHOTS_EXTRA='{"specular":1}' merged into every
 * config, SVELTE_FLUID_SHOTS_DYE=1 to also dump the float dye field.
 */
import { commands } from 'vitest/browser';
import { it } from 'vitest';
import { FluidEngine } from '../FluidEngine.js';
import { PRESETS } from '../../presets/registry.js';
import type { FluidConfig } from '../types.js';

const env = import.meta.env;
const DIR = env.SVELTE_FLUID_SHOTS_DIR || '/tmp/dpr/shots';
const DPRS = String(env.SVELTE_FLUID_SHOTS_DPRS || '3').split(',').map(Number);
const [CSS_W, CSS_H] = String(env.SVELTE_FLUID_SHOTS_CSS || '1440x900').split('x').map(Number);
const EXTRA: FluidConfig = env.SVELTE_FLUID_SHOTS_EXTRA ? JSON.parse(env.SVELTE_FLUID_SHOTS_EXTRA) : {};
const DUMP_DYE = !!env.SVELTE_FLUID_SHOTS_DYE;
const FRAMES = 150;

const b64 = (bytes: Uint8Array): string => {
	let bin = '';
	for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	return btoa(bin);
};

/** A high-contrast photo stand-in for distortion/refraction review. */
async function testImage(): Promise<string> {
	const c = document.createElement('canvas');
	c.width = c.height = 512;
	const g = c.getContext('2d')!;
	for (let y = 0; y < 16; y++)
		for (let x = 0; x < 16; x++) {
			g.fillStyle = (x + y) % 2 ? '#e8e2d4' : '#2b3a55';
			g.fillRect(x * 32, y * 32, 32, 32);
		}
	return c.toDataURL();
}

it('preset screenshots', { timeout: 1_200_000 }, async () => {
	const write = (commands as unknown as Record<string, (p: string, c: string) => Promise<void>>).writeBenchJson;
	const image = await testImage();
	const cases: [string, FluidConfig][] = [
		['default', {}],
		['default-transparent', { transparent: true }],
		['LavaLamp-transparent', { ...(PRESETS[0].config as FluidConfig), transparent: true }],
		['distortion', { distortion: true, distortionImageUrl: image, initialSplatCount: 12 }],
		...PRESETS.map((p): [string, FluidConfig] => [p.id, p.config as FluidConfig])
	];
	for (const dpr of DPRS) {
		const W = Math.floor(CSS_W * dpr);
		const H = Math.floor(CSS_H * dpr);
		for (const [name, base] of cases) {
			const canvas = document.createElement('canvas');
			canvas.width = W;
			canvas.height = H;
			const maxPx = Math.max(W, H);
			const engine = new FluidEngine({
				canvas,
				autoStart: false,
				config: {
					...base,
					...EXTRA,
					seed: 1234,
					pointerInput: false,
					dyeResolution: Math.min(base.dyeResolution ?? 1024, maxPx),
					bloomResolution: Math.min(base.bloomResolution ?? 256, maxPx),
					sunraysResolution: Math.min(base.sunraysResolution ?? 196, maxPx)
				}
			});
			const h = engine as unknown as { rafRunning: boolean; calcDeltaTime(): number; update(): void; gl: WebGL2RenderingContext };
			h.calcDeltaTime = () => 1 / 60;
			if (base.distortionImageUrl) for (let i = 0; i < 100; i++) await new Promise((r) => setTimeout(r, 10));
			for (let i = 0; i < FRAMES; i++) {
				h.rafRunning = true;
				h.update();
			}
			engine.pause();
			const gl = h.gl;
			const px = new Uint8Array(W * H * 4);
			gl.bindFramebuffer(gl.FRAMEBUFFER, null);
			gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
			// Raw RGBA rows, bottom-up; converted to PNG offline. base64 keeps the
			// string-only write command lossless.
			await write(`${DIR}/${name}-dpr${dpr}-${W}x${H}.rgba.b64`, b64(px));
			if (DUMP_DYE) {
				const dye = engine.readField('dye');
				await write(`${DIR}/${name}-dpr${dpr}-dye-${dye.width}x${dye.height}.f32.b64`, b64(new Uint8Array(dye.data.buffer)));
			}
			engine.dispose();
		}
	}
});
