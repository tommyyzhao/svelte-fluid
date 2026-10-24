import { describe, expect, it } from 'vitest';
import { commands } from 'vitest/browser';
import { FluidEngine } from '../FluidEngine.js';
import type { FluidConfig } from '../types.js';
import { GAS_FLARE_CONFIG, KARMAN_CONFIG, TESLA_VALVE_CONFIG, VENTURI_CONFIG } from '../../presets/registry.js';
import { getTuning } from '../../../routes/test/tesla-valve/tunings.js';
import { jetFlow } from '../../../routes/test/tesla-valve/jet-pulse.js';

// Open-edge flux-conservation measurement (opt in: SVELTE_FLUID_GPU_BENCH=1).
// Pre-registered rule: any scene with MEAN post-projection section-flux spread
// > 2% => "SPONGE NEEDED". No retuning after the data. Post-projection =
// velocity read right after step() (projectVelocity is its last velocity pass).
// Not driven: autoSplat* (lives in the RAF `simulateFrame`, not `advance()`); the
// flux drivers under test (sources, pressureGradient) all run inside step().

interface Harness {
	solidMaskData: Uint8Array | null;
	solidMaskW: number;
	solidMaskH: number;
	profileEnvironment(): { simWidth: number; simHeight: number };
}
interface Scene {
	name: string;
	config: FluidConfig;
	css: [number, number];
	/** 'x' = sections are vertical lines, flux integrates u (left->right). 'y' = horizontal lines, integrates v. */
	axis: 'x' | 'y';
	range: [number, number];
	pulse?: { base: number; peak: number; palette?: readonly any[] };
}
const flame = getTuning('flame-jet');
const cast = (c: unknown) => c as FluidConfig;
const channel = (outlet: boolean) =>
	cast({
		...VENTURI_CONFIG,
		obstructions: undefined,
		flow: { ...VENTURI_CONFIG.flow!, outlets: outlet ? VENTURI_CONFIG.flow!.outlets : [] }
	});
const scenes: Scene[] = [
	{ name: 'VENTURI', config: cast(VENTURI_CONFIG), css: [800, 400], axis: 'x', range: [0.15, 0.85] },
	{ name: 'GAS_FLARE', config: cast(GAS_FLARE_CONFIG), css: [600, 600], axis: 'y', range: [0.35, 0.85] },
	{ name: 'KARMAN', config: cast(KARMAN_CONFIG), css: [800, 400], axis: 'x', range: [0.15, 0.85] },
	{ name: 'TESLA_VALVE', config: cast(TESLA_VALVE_CONFIG), css: [960, 202], axis: 'x', range: [0.15, 0.85] },
	// Controlled follow-ups: isolate projection/open-edge, outlet damping, geometry.
	{ name: 'CHANNEL_OPEN', config: channel(false), css: [800, 400], axis: 'x', range: [0.15, 0.85] },
	{ name: 'CHANNEL_OPEN_OUTLET', config: channel(true), css: [800, 400], axis: 'x', range: [0.15, 0.85] },
	// S2c pre-registered main gate; same sections, spin-up, sampling, ≤2% threshold.
	{ name: 'CHANNEL_OPEN_OUTLET_RELAX', config: cast({ ...channel(true), flow: { ...channel(true).flow, outlets: channel(true).flow!.outlets!.map((outlet) => ({ ...outlet, velocity: 'relax' })) } }), css: [800, 400], axis: 'x', range: [0.15, 0.85] },
	{ name: 'VENTURI_RELAX', config: cast({ ...VENTURI_CONFIG, flow: { ...VENTURI_CONFIG.flow!, outlets: VENTURI_CONFIG.flow!.outlets!.map((outlet) => ({ ...outlet, velocity: 'relax' })) } }), css: [800, 400], axis: 'x', range: [0.15, 0.85] },
	{ name: 'VENTURI_NO_OUTLET', config: cast({ ...VENTURI_CONFIG, flow: { ...VENTURI_CONFIG.flow!, outlets: [] } }), css: [800, 400], axis: 'x', range: [0.15, 0.85] },
	// Diagnostics (not part of the pre-registered verdict): 8x Jacobi iterations,
	// separates solver under-convergence from an open-edge leak.
	{ name: 'VENTURI_p8x', config: cast({ ...VENTURI_CONFIG, pressureIterations: 208 }), css: [800, 400], axis: 'x', range: [0.15, 0.85] },
	{ name: 'TESLA_VALVE_p8x', config: cast({ ...TESLA_VALVE_CONFIG, pressureIterations: 208 }), css: [960, 202], axis: 'x', range: [0.15, 0.85] },
	{
		name: 'flame-jet',
		config: cast({ ...flame.config, glass: false, transparent: true }),
		css: [960, 320],
		axis: 'x',
		range: [0.15, 0.85],
		pulse: flame.pulse!
	}
];

const SAMPLE_SECONDS = 0.05;
const WINDOW_SAMPLES = 24; // 1.2 s = one flame-jet pulse period
const MEASURE_SAMPLES = 72; // 3.6 s = 3 pulse periods
const MAX_WINDOWS = 25;
const SECTIONS = 5;
const pct = (a: number[], p: number) => [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(p * a.length))];
const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;

describe('flow conservation (open-edge scenes)', () => {
	for (const scene of scenes) {
		it(`${scene.name}: post-projection section-flux spread`, { timeout: 900_000 }, async () => {
			const canvas = document.createElement('canvas');
			canvas.width = scene.css[0];
			canvas.height = scene.css[1];
			canvas.style.cssText = `width:${scene.css[0]}px;height:${scene.css[1]}px;display:block`;
			document.body.append(canvas);
			const engine = new FluidEngine({
				canvas,
				autoStart: false,
				config: { ...scene.config, seed: 704, pointerInput: false }
			});
			const h = engine as unknown as Harness;
			try {
				const { simWidth: W, simHeight: H } = h.profileEnvironment();
				const dt = scene.config.maxTimeStep ?? 1 / 60;
				const hasMask = !!h.solidMaskData && h.solidMaskW > 0;
				const fluid = new Uint8Array(W * H);
				for (let y = 0; y < H; y++)
					for (let x = 0; x < W; x++) {
						let f = 1;
						if (hasMask) {
							const mx = Math.min(h.solidMaskW - 1, Math.floor(((x + 0.5) / W) * h.solidMaskW));
							const my = Math.min(h.solidMaskH - 1, Math.floor((1 - (y + 0.5) / H) * h.solidMaskH));
							f = h.solidMaskData![my * h.solidMaskW + mx] < 128 ? 1 : 0;
						}
						fluid[y * W + x] = f;
					}
				// Interior = fluid with radius-2 fluid neighbourhood, >=4 cells from domain edges.
				const interior = new Uint8Array(W * H);
				for (let y = 4; y < H - 4; y++)
					for (let x = 4; x < W - 4; x++) {
						let ok = 1;
						for (let dy = -2; dy <= 2 && ok; dy++)
							for (let dx = -2; dx <= 2; dx++) if (!fluid[(y + dy) * W + x + dx]) { ok = 0; break; }
						interior[y * W + x] = ok;
					}
				const n = scene.axis === 'x' ? W : H;
				const lines = Array.from({ length: SECTIONS }, (_, i) => {
					const f = scene.range[0] + ((scene.range[1] - scene.range[0]) * i) / (SECTIONS - 1);
					return Math.min(n - 1, Math.max(0, Math.round(f * n - 0.5)));
				});

				const sample = () => {
					const v = engine.readField('velocity');
					const d = v.data;
					const flux = lines.map((c) => {
						let s = 0;
						if (scene.axis === 'x') {
							for (let y = 0; y < H; y++) if (fluid[y * W + c]) s += d[(y * W + c) * 2];
						} else {
							for (let x = 0; x < W; x++) if (fluid[c * W + x]) s += d[(c * W + x) * 2 + 1];
						}
						return s;
					});
					const m = mean(flux);
					const spread = (Math.max(...flux) - Math.min(...flux)) / Math.abs(m);
					let maxDiv = 0, speed = 0, cnt = 0;
					for (let y = 4; y < H - 4; y++)
						for (let x = 4; x < W - 4; x++) {
							if (!interior[y * W + x]) continue;
							const i = y * W + x;
							const div = 0.5 * (d[(i + 1) * 2] - d[(i - 1) * 2] + d[(i + W) * 2 + 1] - d[(i - W) * 2 + 1]);
							maxDiv = Math.max(maxDiv, Math.abs(div));
							speed += Math.hypot(d[i * 2], d[i * 2 + 1]);
							cnt++;
						}
					return { flux, m, spread, maxDiv, U: speed / cnt };
				};

				const sampleEvery = Math.max(1, Math.round(SAMPLE_SECONDS / dt));
				let step = 0;
				const run = (count: number) => {
					const out: ReturnType<typeof sample>[] = [];
					for (let s = 0; s < count; s++) {
						for (let k = 0; k < sampleEvery; k++) {
							if (scene.pulse)
								engine.setConfig({
									flow: jetFlow(scene.config.flow!, step * dt, scene.pulse.base, scene.pulse.peak, scene.pulse.palette)
								});
							engine.advance(1, dt);
							step++;
						}
						out.push(sample());
					}
					return out;
				};

				// Spin-up: mean section flux of successive 1.2 s windows changes < 1%.
				let prev = NaN, windows = 0, established = false, change = NaN;
				while (windows < MAX_WINDOWS) {
					const w = mean(run(WINDOW_SAMPLES).map((s) => s.m));
					windows++;
					change = Math.abs(w - prev) / Math.abs(w);
					prev = w;
					if (windows >= 3 && change < 0.01) { established = true; break; }
				}
				const meas = run(MEASURE_SAMPLES);
				const spreads = meas.map((s) => s.spread);
				const divs = meas.map((s) => s.maxDiv / s.U);
				const result = {
					scene: scene.name,
					grid: `${W}x${H}`,
					axis: scene.axis === 'x' ? 'vertical sections, flux=sum u' : 'horizontal sections, flux=sum v',
					sectionsAt: lines,
					spinUpSeconds: +(windows * WINDOW_SAMPLES * sampleEvery * dt).toFixed(2),
					established,
					lastWindowChange: +change.toFixed(5),
					meanFluxPerSection: lines.map((_, i) => +mean(meas.map((s) => s.flux[i])).toFixed(2)),
					meanSpread: +mean(spreads).toFixed(5),
					p95Spread: +pct(spreads, 0.95).toFixed(5),
					divOverU_mean: +mean(divs).toFixed(5),
					divOverU_max: +Math.max(...divs).toFixed(5),
					meanSpeedU: +mean(meas.map((s) => s.U)).toFixed(3),
					exceeds2pct: mean(spreads) > 0.02
				};
				console.log('FLOWCONS', JSON.stringify(result));
				await (commands as unknown as { writeBenchJson(p: string, d: string): Promise<void> }).writeBenchJson(
					`${import.meta.env.SVELTE_FLUID_GPU_BENCH_OUT || '/tmp/flow-conservation'}/${scene.name}.json`,
					JSON.stringify(result, null, 1)
				);
				expect(Number.isFinite(result.meanSpread)).toBe(true);
				if (scene.name === 'CHANNEL_OPEN_OUTLET_RELAX') expect(mean(spreads)).toBeLessThanOrEqual(0.02);
			} finally {
				engine.dispose();
				canvas.remove();
			}
		});
	}
});
