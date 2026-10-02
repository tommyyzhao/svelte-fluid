/*
 * GPU budget harness (measurement, not a gate). Opt in with
 * SVELTE_FLUID_GPU_BENCH=1; see dev-docs/benchmarks/gpu-budget.md.
 *
 * Per preset x DPR: steady back-to-back whole-frame GPU time
 * (EXT_disjoint_timer_query_webgl2, one query per frame, read asynchronously;
 * CPU-wall batch fallback), a separate cold isolated-frame median, plus per-pass
 * medians from the existing EngineProfiler on a second, instrumented engine.
 */
import { commands } from 'vitest/browser';
import { afterAll, describe, expect, it } from 'vitest';
import { FluidEngine } from '../FluidEngine.js';
import { createTimerQueryAdapter, PROFILE_GROUPS, type ProfileGroup } from '../engine-profiler.js';
import { cssQualityPolicy } from '../resolution.js';
import { PRESETS } from '../../presets/registry.js';
import type { FluidConfig } from '../types.js';

// Override e.g. SVELTE_FLUID_GPU_BENCH_CSS=1440x900 for a full-viewport check.
const [CSS_W, CSS_H] = String(import.meta.env.SVELTE_FLUID_GPU_BENCH_CSS || '800x500')
	.split('x')
	.map(Number);
const DPRS = [1, 2, 3] as const;
// Fed warm-up long enough (~0.2-0.3 s of GPU work) for clocks to ramp after
// engine construction idles the GPU.
const WARMUP = 200;
const SAMPLES = 120;
const COLD_SAMPLES = 15;
const OUT = import.meta.env.SVELTE_FLUID_GPU_BENCH_OUT || '/tmp/svelte-fluid-gpu-budget.json';
// Comma-separated preset ids, e.g. 'Karman,(default)'; empty = all.
const ONLY = String(import.meta.env.SVELTE_FLUID_GPU_BENCH_PRESETS || '')
	.split(',')
	.map((s) => s.trim())
	.filter(Boolean);

interface Row {
	preset: string;
	dpr: number;
	timing: 'gpu' | 'cpu-wall';
	samples: number;
	medianMs: number;
	p95Ms: number;
	coldMedianMs: number;
	passMedianMs: Partial<Record<ProfileGroup, number>>;
	canvas: string;
}

type Harness = { rafRunning: boolean; lastUpdateTime: number; update(): void };

const rows: Row[] = [];
let adapter = 'unknown';
let timing: 'gpu' | 'cpu-wall' = 'cpu-wall';

const quantile = (v: number[], q: number): number => {
	const s = [...v].sort((a, b) => a - b);
	return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : NaN;
};

/** Mirror Fluid.svelte's canvas-size-derived config so numbers match the component. */
function componentConfig(base: FluidConfig, w: number, h: number): FluidConfig {
	const cfg: FluidConfig = { ...base, pointerInput: false };
	const maxPx = Math.max(w, h);
	cfg.dyeResolution = Math.min(cfg.dyeResolution ?? 1024, maxPx);
	cfg.bloomResolution = Math.min(cfg.bloomResolution ?? 256, maxPx);
	cfg.sunraysResolution = Math.min(cfg.sunraysResolution ?? 196, maxPx);
	const p = cssQualityPolicy(
		CSS_W,
		CSS_H,
		cfg.simResolution ?? 128,
		cfg.bloomIterations !== undefined,
		cfg.pressureIterations !== undefined
	);
	if (p.suppressPost) {
		if (cfg.bloom === undefined) cfg.bloom = false;
		if (cfg.sunrays === undefined) cfg.sunrays = false;
	}
	if (p.bloomIterations !== undefined) cfg.bloomIterations = p.bloomIterations;
	if (p.pressureIterations !== undefined) cfg.pressureIterations = p.pressureIterations;
	return cfg;
}

/** One live-loop frame (simulate + render) at a fixed 60 Hz dt. */
function frame(engine: FluidEngine): void {
	const h = engine as unknown as Harness;
	h.lastUpdateTime = performance.now() - 1000 / 60;
	h.rafRunning = true;
	h.update();
	engine.pause();
}

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

async function measure(preset: string, base: FluidConfig, dpr: number): Promise<Row> {
	const w = Math.floor(CSS_W * dpr);
	const h = Math.floor(CSS_H * dpr);
	const make = (instrument: boolean) => {
		const canvas = document.createElement('canvas');
		canvas.width = w;
		canvas.height = h;
		return new FluidEngine({ canvas, autoStart: false, instrument, config: componentConfig(base, w, h) });
	};

	const engine = make(false);
	const times: number[] = [];
	const cold: number[] = [];
	try {
		const gl = (engine as unknown as { gl: WebGL2RenderingContext }).gl;
		const dbg = gl.getExtension('WEBGL_debug_renderer_info');
		if (dbg) adapter = String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL));
		const timer = createTimerQueryAdapter(gl);
		timing = timer ? 'gpu' : 'cpu-wall';
		for (let i = 0; i < WARMUP; i++) frame(engine);
		gl.finish();
		if (timer) {
			// Steady state: SAMPLES frames issued back to back, one query each, results
			// read only afterwards. A gl.finish() between frames lets the GPU idle and
			// downclock, which inflated and destabilised the old medians.
			const qs = Array.from({ length: SAMPLES }, () => timer.create()!);
			timer.disjoint(); // clear any stale disjoint flag
			for (const q of qs) {
				timer.begin(q);
				frame(engine);
				timer.end();
			}
			for (let spin = 0; spin < 400 && !timer.available(qs[SAMPLES - 1]); spin++) await tick();
			const disjoint = timer.disjoint();
			for (const q of qs) {
				const ns = !disjoint && timer.available(q) ? timer.resultNanos(q) : null;
				if (ns != null && Number.isFinite(ns)) times.push(ns / 1e6);
				timer.delete(q);
			}
			// Cold single frame: idle GPU, one isolated frame (what a sparse/paused
			// page pays). Reported separately; not the budget number.
			for (let i = 0; i < COLD_SAMPLES; i++) {
				for (let spin = 0; spin < 5; spin++) await tick();
				const q = timer.create()!;
				timer.begin(q);
				frame(engine);
				timer.end();
				gl.finish();
				for (let spin = 0; spin < 200 && !timer.available(q); spin++) await tick();
				const ns = !timer.disjoint() && timer.available(q) ? timer.resultNanos(q) : null;
				if (ns != null && Number.isFinite(ns)) cold.push(ns / 1e6);
				timer.delete(q);
			}
		} else {
			const t0 = performance.now();
			for (let i = 0; i < SAMPLES; i++) frame(engine);
			gl.finish();
			times.push((performance.now() - t0) / SAMPLES);
		}
	} finally {
		engine.dispose();
	}

	// Per-pass attribution via the existing profiler (its per-group queries
	// cannot nest inside ours, hence a separate engine).
	const passMedianMs: Partial<Record<ProfileGroup, number>> = {};
	const prof = make(true);
	try {
		const gl = (prof as unknown as { gl: WebGL2RenderingContext }).gl;
		for (let i = 0; i < WARMUP + 40; i++) {
			frame(prof);
			gl.finish();
		}
		for (let spin = 0; spin < 50; spin++) await tick();
		const frames = prof.getBenchProfile()?.frames ?? [];
		for (const g of PROFILE_GROUPS) {
			const v = frames.map((f) => f.groups[g].gpuMs ?? f.groups[g].cpuMs).filter(Number.isFinite);
			if (v.length) passMedianMs[g] = quantile(v, 0.5);
		}
	} finally {
		prof.dispose();
	}

	return {
		preset,
		dpr,
		timing,
		samples: times.length,
		medianMs: quantile(times, 0.5),
		p95Ms: quantile(times, 0.95),
		coldMedianMs: quantile(cold, 0.5),
		passMedianMs,
		canvas: `${w}x${h}`
	};
}

async function flush(): Promise<void> {
	// Custom command registered in vitest.config.ts (built-in writeFile can't leave the repo).
	const write = (commands as unknown as Record<string, (p: string, c: string) => Promise<void>>).writeBenchJson;
	await write(OUT, JSON.stringify({ adapter, timing, cssSize: [CSS_W, CSS_H], rows }, null, 2));
}

describe('GPU budget (measurement only)', () => {
	const all: [string, FluidConfig][] = [
		['(default)', {}],
		...PRESETS.map((p): [string, FluidConfig] => [p.id, p.config as FluidConfig])
	];
	const cases = all.filter(([name]) => !ONLY.length || ONLY.includes(name));

	for (const dpr of DPRS) {
		it(`DPR ${dpr}`, { timeout: 600_000 }, async () => {
			for (const [name, cfg] of cases) {
				const row = await measure(name, cfg, dpr);
				rows.push(row);
				expect(Number.isFinite(row.medianMs)).toBe(true);
				expect(Number.isFinite(row.p95Ms)).toBe(true);
				expect(row.samples).toBeGreaterThan(0);
			}
			await flush();
		});
	}

	afterAll(() => {
		const names = [...new Set(rows.map((r) => r.preset))];
		const cell = (n: string, d: number) => {
			const r = rows.find((x) => x.preset === n && x.dpr === d);
			return r ? `${r.medianMs.toFixed(2)}/${r.p95Ms.toFixed(2)} c${r.coldMedianMs.toFixed(1)}` : '-';
		};
		const lines = [
			`GPU budget [${timing}] ${adapter} @ ${CSS_W}x${CSS_H} css, median/p95 steady, c=cold median ms`,
			'preset'.padEnd(16) + DPRS.map((d) => `DPR${d}`.padStart(19)).join('')
		];
		for (const n of names) lines.push(n.padEnd(16) + DPRS.map((d) => cell(n, d).padStart(19)).join(''));
		console.log(lines.join('\n'));
		console.log(`results: ${OUT}`);
	});
});
