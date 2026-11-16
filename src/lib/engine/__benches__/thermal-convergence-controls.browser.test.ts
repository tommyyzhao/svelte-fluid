import { expect, it } from 'vitest';
import { commands } from 'vitest/browser';
import { FluidEngine } from '../FluidEngine.js';
import { getTuning } from '../../../routes/test/tesla-valve/tunings.js';
import { jetFlow } from '../../../routes/test/tesla-valve/jet-pulse.js';
import { renderer } from './renderer.js';

const cmd = commands as unknown as { writeBenchJson(path: string, content: string): Promise<void> };
it.skipIf(import.meta.env.SVELTE_FLUID_SHOTS_EXTRA !== 'thermal-controls')(
	'falsifies truncation-bound and chaotic-divergence explanations with early and equal-convergence controls',
	async () => {
		expect(/swiftshader|llvmpipe|software/i.test(renderer)).toBe(false);
		const tuning = getTuning('flame-jet'), pulse = tuning.pulse!;
		const checkpoints = [1, 10, 60, 240, 720];
		const reference = new Map<number, { dye: Float32Array; scalar: Float32Array }>();
		const results: Record<string, Record<number, { salt: number; theta: number }>> = {};
		const scratch = import.meta.env.SVELTE_FLUID_SHOTS_DIR === 'scratch-controls';
		const variants = scratch ? [['original', 20, 40], ['narrow', 20, 40]] as const : import.meta.env.SVELTE_FLUID_SHOTS_DIR === 'rounding-controls'
			? [['original', 80, 40], ['bounded', 20, 10], ['equal-convergence', 81, 41]] as const
			: [['original', 80, 40], ['diffusion-only', 20, 40]] as const;
		for (const [variant, diffusionIterations, viscosityIterations] of variants) {
			const canvas = document.createElement('canvas');
			canvas.width = 1920; canvas.height = 640;
			const flow = { ...tuning.config.flow, scalarFields: tuning.config.flow.scalarFields!.map((f) => ({ ...f, diffusionIterations })) };
			const engine = new FluidEngine({ canvas, autoStart: false, config: { ...tuning.config, flow, viscosityIterations, seed: 704, pointerInput: false } });
			const h = engine as unknown as { scalarDiffusion: unknown };
			const narrowTarget = h.scalarDiffusion;
			if (scratch && variant === 'original') h.scalarDiffusion = null;
			results[variant] = {};
			try {
				for (let step = 1; step <= 720; step++) {
					engine.setConfig({ flow: jetFlow(flow, step / 240, pulse.base, pulse.peak, pulse.palette) });
					engine.advance(1, 1 / 240);
					if (checkpoints.includes(step)) {
						const dye = engine.readField('dye').data, scalar = engine.readField('scalar').data;
						if (variant === 'original') reference.set(step, { dye, scalar });
						else {
							const ref = reference.get(step)!;
							let salt = 0, theta = 0;
							for (let i = 0; i < dye.length; i += 4) {
								for (let c = 0; c < 3; c++) salt = Math.max(salt, Math.abs(dye[i + c] - ref.dye[i + c]));
								theta = Math.max(theta, Math.abs(scalar[i] - ref.scalar[i]));
							}
							results[variant][step] = { salt, theta };
							console.log('thermal convergence control', variant, step, JSON.stringify({ salt, theta }));
							if (variant === 'diffusion-only' || variant === 'narrow') {
								expect(salt).toBe(0);
								expect(theta).toBeLessThanOrEqual(1e-6);
							}
						}
					}
					if (step % 60 === 0) await new Promise((r) => setTimeout(r, 0));
				}
			} finally { h.scalarDiffusion = narrowTarget; engine.dispose(); canvas.remove(); }
		}
		await cmd.writeBenchJson(`.svelte-kit/flame-perf/${scratch ? 'scratch' : import.meta.env.SVELTE_FLUID_SHOTS_DIR === 'rounding-controls' ? 'convergence' : 'diffusion'}-controls.json`, JSON.stringify(results, null, 2));
	},
	600_000
);
