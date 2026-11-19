import { describe, expect, it } from 'vitest';
import { commands } from 'vitest/browser';
import { FluidEngine } from '../FluidEngine.js';
import { createFBO, disposeFBO } from '../gl-utils.js';
import { createDistortionPresetSplats } from '../distortion-splats.js';
import type { FBO } from '../internal-types.js';
import { renderer, softwareGL } from './renderer.js';

/**
 * Strength calibration for the three `distortionField` modes (ADR 0131), on the
 * home-page FluidDistortion card config. Opt in with SVELTE_FLUID_GPU_BENCH=1;
 * raw per-trial JSON goes to SVELTE_FLUID_GPU_BENCH_OUT (an evidence folder).
 * Gate: pressure mean |diff| within 0.5-2x of velocity over 3 s; acceleration
 * mean > 1.0 over the first second.
 */
const out = import.meta.env.SVELTE_FLUID_GPU_BENCH_OUT;
const cmd = commands as unknown as { writeBenchJson(path: string, data: string): Promise<void> };
const W = 680, H = 400, STEP = 1 / 60, FRAMES = 180;
const BLEED = 60, CARD_W = 560, CARD_H = 280;

interface Harness { gl: WebGL2RenderingContext; renderCore(target: FBO | null): void }
const MODES = ['velocity', 'pressure', 'acceleration'] as const;

async function trial(mode: (typeof MODES)[number], url: string) {
	const canvas = document.createElement('canvas');
	canvas.width = W;
	canvas.height = H;
	document.body.append(canvas);
	// The FluidDistortion wrapper's defaults, card props (power 0.3, 6 splats, seed 311).
	const e = new FluidEngine({
		canvas,
		autoStart: false,
		config: {
			seed: 311, distortion: true, distortionField: mode, distortionPower: 0.3, distortionImageUrl: url,
			distortionBleedX: BLEED / (CARD_W + 2 * BLEED), distortionBleedY: BLEED / (CARD_H + 2 * BLEED),
			densityDissipation: 0.98, initialDensityDissipation: 0.5, initialDensityDissipationDuration: 2,
			splatRadius: 1, splatOnHover: false, initialSplatCount: 0, bloom: false, sunrays: false, shading: false,
			velocityDissipation: 0.97, curl: 0, pressure: 0, pointerInput: false, backColor: { r: 0, g: 0, b: 0 },
			presetSplats: createDistortionPresetSplats(311, 6)
		}
	});
	const h = e as unknown as Harness;
	const t = createFBO(h.gl, W, H, h.gl.RGBA8, h.gl.RGBA, h.gl.UNSIGNED_BYTE, h.gl.NEAREST);
	const shot = () => {
		h.renderCore(t);
		const px = new Uint8Array(W * H * 4);
		h.gl.bindFramebuffer(h.gl.FRAMEBUFFER, t.fbo);
		h.gl.readPixels(0, 0, W, H, h.gl.RGBA, h.gl.UNSIGNED_BYTE, px);
		return px;
	};
	try {
		await new Promise((r) => setTimeout(r, 1500)); // image + dither texture upload
		const perFrame: number[] = [];
		for (let f = 0; f < FRAMES; f++) {
			e.advance(1, STEP);
			// Distorted first: acceleration snapshots velocity after its first render of a step.
			e.setConfig({ distortionPower: 0.3 });
			const warped = shot();
			e.setConfig({ distortionPower: 0 });
			const flat = shot();
			// Visible card only: the bleed ring is clipped on the page.
			let sum = 0;
			for (let y = BLEED; y < H - BLEED; y++)
				for (let x = BLEED; x < W - BLEED; x++) {
					const i = (y * W + x) * 4;
					sum += Math.abs(warped[i] - flat[i]) + Math.abs(warped[i + 1] - flat[i + 1]) + Math.abs(warped[i + 2] - flat[i + 2]);
				}
			perFrame.push(sum / (CARD_W * CARD_H * 3));
		}
		const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
		return { mode, perFrame, mean3s: mean(perFrame), mean1s: mean(perFrame.slice(0, 60)), meanLast1s: mean(perFrame.slice(-60)) };
	} finally {
		disposeFBO(h.gl, t);
		e.dispose();
		canvas.remove();
	}
}

describe.skipIf(softwareGL || !out)('distortion field strength calibration', () => {
	it('pressure is within 0.5-2x of velocity; acceleration is visibly non-zero', async () => {
		const url = URL.createObjectURL(await (await fetch('/bosch-garden.jpg')).blob());
		const tag = import.meta.env.SVELTE_FLUID_SHOTS_EXTRA || 'run';
		const results: Record<string, { mean3s: number; mean1s: number }> = {};
		for (const rep of [1, 2]) {
			for (const mode of MODES) {
				const r = await trial(mode, url);
				await cmd.writeBenchJson(`${out}/${tag}-${mode}-rep${rep}.json`, JSON.stringify({ renderer, tag, rep, W, H, STEP, FRAMES, ...r }, null, 1));
				console.info(`${tag} rep${rep} ${mode}: mean3s=${r.mean3s.toFixed(3)} mean1s=${r.mean1s.toFixed(3)} last1s=${r.meanLast1s.toFixed(3)}`);
				results[mode] = r;
			}
		}
		const ratioP = results.pressure.mean3s / results.velocity.mean3s;
		const ratioA = results.acceleration.mean3s / results.velocity.mean3s;
		await cmd.writeBenchJson(`${out}/${tag}-summary.json`, JSON.stringify({ renderer, results, pressureOverVelocity: ratioP, accelerationOverVelocity: ratioA }, null, 1));
		console.info(`${tag} ratios: pressure/velocity=${ratioP.toFixed(3)} acceleration/velocity=${ratioA.toFixed(3)}`);
		expect(ratioP).toBeGreaterThanOrEqual(0.5);
		expect(ratioP).toBeLessThanOrEqual(2);
		expect(results.acceleration.mean1s).toBeGreaterThan(1.0);
	}, 180_000);
});
