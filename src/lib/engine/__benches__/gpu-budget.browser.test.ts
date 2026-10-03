/*
 * GPU budget harness (measurement, not a gate). Opt in with
 * SVELTE_FLUID_GPU_BENCH=1; see dev-docs/benchmarks/gpu-budget.md.
 *
 * Per preset x DPR: synced steady throughput. Batches of back-to-back live-loop
 * frames bracketed by a 1-px readback that drains the GPU queue; wall time per
 * frame is an upper bound on GPU time per frame (CPU submit is ~0.02 ms, so the
 * loop is GPU-bound). Per-pass cost = throughput delta with that pass stubbed.
 * Per-frame TIME_ELAPSED is still recorded but not trusted: ANGLE Metal charges
 * whole command buffers to a query and over-reads by up to 100x at large
 * canvases (gpu-budget.md, "Where the gap was").
 */
import { commands } from 'vitest/browser';
import { afterAll, describe, expect, it } from 'vitest';
import { FluidEngine, _setContextTier } from '../FluidEngine.js';
import { createTimerQueryAdapter } from '../engine-profiler.js';
import { cssQualityPolicy } from '../resolution.js';
import { PRESETS } from '../../presets/registry.js';
import { SETTLE_CHECK_INTERVAL } from '../settle.js';
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
const OUT = import.meta.env.SVELTE_FLUID_GPU_BENCH_OUT || '/tmp/svelte-fluid-gpu-budget.json';
// Comma-separated preset ids, e.g. 'Karman,(default)'; empty = all.
const ONLY = String(import.meta.env.SVELTE_FLUID_GPU_BENCH_PRESETS || '')
	.split(',')
	.map((s) => s.trim())
	.filter(Boolean);

interface Row {
	preset: string;
	dpr: number;
	samples: number;
	medianMs: number;
	worstBatchMs: number;
	passMs: Record<string, number>;
	timerQueryMedianMs: number;
	/** ADR 0099 probe, main-thread ms (issue + poll), queue drained first: median / max. */
	settleCheckMs: number;
	settleCheckMaxMs: number;
	/** Post-submit drain wall time only, not elapsed GPU time: median. */
	settleDrainMs: number;
	/** Per-frame ms of SETTLE_CHECK_INTERVAL-frame batches whose last frame issues and reads the probe. */
	settleBatchMs: number;
	canvas: string;
	tier: string;
	probeEveryFrameMs: number;
	probeOverheadMs: number;
}

type Harness = { rafRunning: boolean; lastUpdateTime: number; update(): void };

const rows: Row[] = [];
const SHARED = import.meta.env.SVELTE_FLUID_GPU_BENCH_TIER === 'shared';
let adapter = 'unknown';

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

/** Passes whose marginal cost the harness isolates by stubbing them out. */
const PASSES = ['simulateFrame', 'applyBloom', 'applySunrays', 'drawDisplay', 'drawGlass'] as const;
type Pass = (typeof PASSES)[number];
const BATCHES = 12;
const BATCH_FRAMES = 20;
const PASS_REPEATS = 60;

async function measure(preset: string, base: FluidConfig, dpr: number): Promise<Row> {
	const w = Math.floor(CSS_W * dpr);
	const h = Math.floor(CSS_H * dpr);
	const canvas = document.createElement('canvas');
	canvas.width = w;
	canvas.height = h;
	_setContextTier(SHARED ? 'shared' : 'own');
	const engine = new FluidEngine({ canvas, autoStart: false, config: componentConfig(base, w, h) });
	_setContextTier('auto');
	const stubs = engine as unknown as Record<string, unknown>;
	const batches: number[] = [];
	const passMs: Partial<Record<Pass, number>> = {};
	let timerQueryMedianMs = NaN;
	const checks: number[] = [];
	const checkGpu: number[] = [];
	const probeFrames: number[] = [];
	const probeDeltas: number[] = [];
	const settleBatches: number[] = [];
	try {
		const gl = (engine as unknown as { gl: WebGL2RenderingContext }).gl;
		const dbg = gl.getExtension('WEBGL_debug_renderer_info');
		if (dbg) adapter = String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL));
		const px = new Uint8Array(4);
		// A 1-px readback of the default framebuffer drains the whole queue.
		const drain = () => {
			gl.bindFramebuffer(gl.FRAMEBUFFER, null);
			gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
		};
		const batch = (frames: number) => {
			drain();
			const t0 = performance.now();
			for (let i = 0; i < frames; i++) frame(engine);
			drain();
			return (performance.now() - t0) / frames;
		};
		// Warm-up also captures each pass's live arguments for the replay below.
		const args = new Map<Pass, unknown[]>();
		for (const pass of PASSES) {
			const orig = Object.getPrototypeOf(engine)[pass] as (...a: unknown[]) => unknown;
			stubs[pass] = (...a: unknown[]) => (args.set(pass, a), orig.apply(engine, a));
		}
		for (let i = 0; i < WARMUP; i++) frame(engine);
		for (const pass of PASSES) delete stubs[pass];
		for (let i = 0; i < BATCHES; i++) batches.push(batch(BATCH_FRAMES));
		// ADR 0099 quiet probe. The live loop issues it once per SETTLE_CHECK_INTERVAL
		// frames after present and polls its fence on later frames; autoStart:false
		// never does, so drive both halves directly.
		const probe = engine as unknown as { issueSettleProbe(): void; pollSettleProbe(): boolean | null };
		// WebGL updates sync status only between tasks, so yield before polling.
		const poll = async () => {
			let totalMs = 0;
			for (let spin = 0; spin < 100; spin++) {
				await tick();
				const t0 = performance.now();
				const quiet = probe.pollSettleProbe();
				totalMs += performance.now() - t0;
				if (quiet !== null) return totalMs;
			}
			throw new Error('settle probe never signalled');
		};
		// First probe allocates the reduction chains and readback buffer; not steady state.
		probe.issueSettleProbe();
		await poll();
		for (let i = 0; i < 2 * BATCHES; i++) {
			frame(engine);
			drain();
			const t0 = performance.now();
			probe.issueSettleProbe();
			const t1 = performance.now();
			drain();
			checkGpu.push(performance.now() - t1);
			checks.push(t1 - t0 + (await poll()));
		}
		for (let i = 0; i < BATCHES; i++) {
			drain();
			const t0 = performance.now();
			for (let f = 0; f < SETTLE_CHECK_INTERVAL; f++) frame(engine);
			probe.issueSettleProbe();
			drain();
			const elapsed = performance.now() - t0;
			settleBatches.push((elapsed + await poll()) / SETTLE_CHECK_INTERVAL);
		}
		// Paired busy throughput: enqueue the same reduction + PBO readback every
		// frame, do not wait/poll in the measured span. Delta against ordinary
		// frames isolates probe workload without adding CPU readback latency twice.
		const eachProbe = () => {
			probe.issueSettleProbe();
			(engine as unknown as { withGl(fn: () => void): void; settleProbe: { sync: WebGLSync } | null }).withGl(() => {
				const p = engine as unknown as { settleProbe: { sync: WebGLSync } | null };
				if (p.settleProbe) gl.deleteSync(p.settleProbe.sync);
				p.settleProbe = null;
			});
		};
		const probeBatch = () => {
			drain();
			const t0 = performance.now();
			for (let i = 0; i < BATCH_FRAMES; i++) { frame(engine); eachProbe(); }
			drain();
			return (performance.now() - t0) / BATCH_FRAMES;
		};
		batch(BATCH_FRAMES);
		probeBatch();
		for (let i = 0; i < BATCHES; i++) {
			// Alternate ordering to limit clock/thermal drift.
			let ordinary: number, checked: number;
			if (i % 2) { checked = probeBatch(); ordinary = batch(BATCH_FRAMES); }
			else { ordinary = batch(BATCH_FRAMES); checked = probeBatch(); }
			probeFrames.push(checked);
			probeDeltas.push(checked - ordinary);
		}
		// Per pass: replay it alone, back to back, with its captured arguments.
		// Stubbing a pass out of the frame instead lets the GPU drop clocks and
		// gives deltas of the wrong sign; a saturated replay keeps them up.
		for (const [pass, a] of args) {
			const fn = (Object.getPrototypeOf(engine)[pass] as (...a: unknown[]) => unknown).bind(engine);
			const run = () => {
				drain();
				const t0 = performance.now();
				for (let i = 0; i < PASS_REPEATS; i++) {
					(engine as unknown as { withGl(fn: () => void): void }).withGl(() => fn(...a));
					// End the render pass, as the next frame's solver would. Without
					// this, Apple's tiler culls the overwritten opaque draws (HSR).
					gl.flush();
				}
				drain();
				return (performance.now() - t0) / PASS_REPEATS;
			};
			run();
			passMs[pass] = quantile([run(), run(), run()], 0.5);
		}
		// Reported only to show the artefact: per-frame TIME_ELAPSED on ANGLE
		// Metal charges whole command buffers and reads 2-14x the real cost at
		// large canvases (dev-docs/benchmarks/gpu-budget.md).
		const timer = createTimerQueryAdapter(gl);
		if (timer) {
			const qs = Array.from({ length: SAMPLES }, () => timer.create()!);
			timer.disjoint();
			for (const q of qs) {
				timer.begin(q);
				frame(engine);
				timer.end();
			}
			for (let spin = 0; spin < 400 && !timer.available(qs[SAMPLES - 1]); spin++) await tick();
			const disjoint = timer.disjoint();
			const ms: number[] = [];
			for (const q of qs) {
				const ns = !disjoint && timer.available(q) ? timer.resultNanos(q) : null;
				if (ns != null && Number.isFinite(ns)) ms.push(ns / 1e6);
				timer.delete(q);
			}
			timerQueryMedianMs = quantile(ms, 0.5);
		}
	} finally {
		engine.dispose();
	}

	return {
		preset,
		dpr,
		samples: batches.length,
		medianMs: quantile(batches, 0.5),
		worstBatchMs: Math.max(...batches),
		passMs,
		timerQueryMedianMs,
		settleCheckMs: quantile(checks, 0.5),
		settleCheckMaxMs: Math.max(...checks),
		settleDrainMs: quantile(checkGpu, 0.5),
		settleBatchMs: quantile(settleBatches, 0.5),
		canvas: `${w}x${h}`,
		tier: SHARED ? 'shared' : 'own',
		probeEveryFrameMs: quantile(probeFrames, 0.5),
		probeOverheadMs: quantile(probeDeltas, 0.5)
	};
}

async function flush(): Promise<void> {
	// Custom command registered in vitest.config.ts (built-in writeFile can't leave the repo).
	const write = (commands as unknown as Record<string, (p: string, c: string) => Promise<void>>).writeBenchJson;
	await write(OUT, JSON.stringify({ adapter, method: 'synced-throughput', cssSize: [CSS_W, CSS_H], rows }, null, 2));
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
				expect(Number.isFinite(row.worstBatchMs)).toBe(true);
				expect(row.samples).toBeGreaterThan(0);
			}
			await flush();
		});
	}

	afterAll(() => {
		const names = [...new Set(rows.map((r) => r.preset))];
		const cell = (n: string, d: number) => {
			const r = rows.find((x) => x.preset === n && x.dpr === d);
			return r
				? `${r.medianMs.toFixed(2)}/${r.worstBatchMs.toFixed(2)} s${r.settleBatchMs.toFixed(2)} c${r.settleCheckMs.toFixed(2)}/${r.settleCheckMaxMs.toFixed(2)} g${r.settleDrainMs.toFixed(2)}`
				: '-';
		};
		const lines = [
			`GPU budget [synced throughput] ${adapter} @ ${CSS_W}x${CSS_H} css, median/worst batch ms, s=per-frame with 1-in-${SETTLE_CHECK_INTERVAL} settle probe, c=probe CPU median/max, g=post-submit drain`,
			'preset'.padEnd(16) + DPRS.map((d) => `DPR${d}`.padStart(46)).join('')
		];
		for (const n of names) lines.push(n.padEnd(16) + DPRS.map((d) => cell(n, d).padStart(46)).join(''));
		console.log(lines.join('\n'));
		console.log(`results: ${OUT}`);
	});
});
