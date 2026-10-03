/* Measurement only: SVELTE_FLUID_GPU_BENCH=1. No ANGLE timer queries.
 * Paired randomized busy throughput, every bitmap job awaited, GPU drained at
 * both boundaries. Each reduction stage measured independently, never averaged
 * across its 30-frame cycle. Wall time remains an upper bound, not a GPU timer.
 */
import { commands } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { FluidEngine, _setContextTier } from '../FluidEngine.js';
import { cssQualityPolicy } from '../resolution.js';
import { PRESETS } from '../../presets/registry.js';
import type { FluidConfig } from '../types.js';

const [CSS_W, CSS_H] = String(import.meta.env.SVELTE_FLUID_GPU_BENCH_CSS || '1440x900').split('x').map(Number);
const OUT = import.meta.env.SVELTE_FLUID_GPU_BENCH_OUT || '/tmp/strict-budget-followup.json';
const ONLY = String(import.meta.env.SVELTE_FLUID_GPU_BENCH_PRESETS || 'GasFlare,LavaLamp,Karman').split(',');
const SHARED = import.meta.env.SVELTE_FLUID_GPU_BENCH_TIER === 'shared';
const BATCHES = 12;
const FRAMES = 20;
type Probe = { sync: WebGLSync | null; epoch: number; velocityLevel: number; dyeLevel: number };
type Harness = {
	canvas: HTMLCanvasElement; gl: WebGL2RenderingContext; rafRunning: boolean; lastUpdateTime: number;
	update(): void; stopRaf(): void; withGl(fn: () => void): void;
	issueSettleProbe(): void; advanceSettleProbe(): void; cancelSettleProbe(): void;
	settleProbe: Probe | null; settleEpoch: number;
	settleVelocityChain: unknown[]; settleDyeChain: unknown[];
};
const rows: Record<string, unknown>[] = [];
let adapter = 'unknown';
const quantile = (v: number[], q: number) => [...v].sort((a, b) => a - b)[Math.min(v.length - 1, Math.floor(q * v.length))];
const summary = (v: number[]) => ({ medianMs: quantile(v, 0.5), worstBatchMs: Math.max(...v), batches: v });
let randomSeed = 20261002;
function random() { randomSeed = (Math.imul(randomSeed, 1664525) + 1013904223) >>> 0; return randomSeed / 2 ** 32; }
function shuffle<T>(values: T[]): T[] {
	const result = [...values];
	for (let i = result.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [result[i], result[j]] = [result[j], result[i]]; }
	return result;
}
function config(base: FluidConfig, w: number, h: number): FluidConfig {
	const cfg = { ...base, pointerInput: false };
	const max = Math.max(w, h);
	cfg.dyeResolution = Math.min(cfg.dyeResolution ?? 1024, max);
	cfg.bloomResolution = Math.min(cfg.bloomResolution ?? 256, max);
	cfg.sunraysResolution = Math.min(cfg.sunraysResolution ?? 196, max);
	const policy = cssQualityPolicy(w, h, cfg.simResolution ?? 128, cfg.bloomIterations !== undefined, cfg.pressureIterations !== undefined);
	if (policy.suppressPost) { if (cfg.bloom === undefined) cfg.bloom = false; if (cfg.sunrays === undefined) cfg.sunrays = false; }
	if (policy.bloomIterations !== undefined) cfg.bloomIterations = policy.bloomIterations;
	if (policy.pressureIterations !== undefined) cfg.pressureIterations = policy.pressureIterations;
	return cfg;
}
function build(preset: string, dpr: number, shared: boolean, cssW = CSS_W, cssH = CSS_H): FluidEngine {
	const canvas = document.createElement('canvas');
	canvas.width = Math.round(cssW * dpr); canvas.height = Math.round(cssH * dpr);
	canvas.style.cssText = `width:${cssW}px;height:${cssH}px`;
	document.body.append(canvas);
	_setContextTier(shared ? 'shared' : 'own');
	try { return new FluidEngine({ canvas, autoStart: false, config: config(PRESETS.find((p) => p.id === preset)!.config as FluidConfig, cssW, cssH) }); }
	finally { _setContextTier('auto'); }
}
function frame(e: FluidEngine) {
	const h = e as unknown as Harness;
	h.lastUpdateTime = performance.now() - 1000 / 60; h.rafRunning = true; h.update(); h.stopRaf();
}
function drain(e: FluidEngine) {
	const h = e as unknown as Harness;
	h.withGl(() => {
		const gl = h.gl;
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
	});
}
function stages(e: FluidEngine): string[] {
	const h = e as unknown as Harness;
	h.issueSettleProbe();
	const labels = ['ordinary', 'snapshot'];
	for (let i = 1; i < h.settleVelocityChain.length; i++) labels.push(`velocity-${i}`);
	for (let i = 1; i < h.settleDyeChain.length; i++) labels.push(`dye-${i}`);
	labels.push('readback', 'full-chain');
	while (h.settleProbe && !h.settleProbe.sync) h.advanceSettleProbe();
	h.cancelSettleProbe();
	return labels;
}
function stage(e: FluidEngine, label: string) {
	const h = e as unknown as Harness;
	if (label === 'ordinary') return;
	h.cancelSettleProbe();
	if (label === 'snapshot' || label === 'full-chain') {
		h.issueSettleProbe();
		if (label === 'full-chain') while (h.settleProbe && !h.settleProbe.sync) h.advanceSettleProbe();
	} else {
		h.settleProbe = { sync: null, epoch: h.settleEpoch, velocityLevel: h.settleVelocityChain.length, dyeLevel: h.settleDyeChain.length };
		if (label.startsWith('velocity-')) h.settleProbe.velocityLevel = Number(label.split('-')[1]);
		if (label.startsWith('dye-')) h.settleProbe.dyeLevel = Number(label.split('-')[1]);
		h.advanceSettleProbe();
	}
	// Busy replay only: retire the sync, not the command it fences. Queue order
	// prevents later writes overtaking these reads. Production keeps one probe.
	h.cancelSettleProbe();
}
async function batch(e: FluidEngine, label: string, frames = FRAMES): Promise<number> {
	await e.presented(); drain(e);
	const pending: Promise<void>[] = [];
	const t0 = performance.now();
	for (let i = 0; i < frames; i++) { frame(e); pending.push(e.presented()); stage(e, label); }
	await Promise.all(pending); drain(e);
	return (performance.now() - t0) / frames;
}
async function warm(e: FluidEngine) {
	for (let i = 0; i < 200; i++) frame(e);
	await e.presented(); drain(e);
	const gl = (e as unknown as Harness).gl;
	const dbg = gl.getExtension('WEBGL_debug_renderer_info');
	if (dbg) adapter = String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL));
}
async function flush() {
	const write = (commands as unknown as Record<string, (p: string, c: string) => Promise<void>>).writeBenchJson;
	await write(OUT, JSON.stringify({ browser: navigator.userAgent, adapter, css: [CSS_W, CSS_H], method: 'paired randomized synced throughput; all bitmap jobs awaited; final GPU drain', rows }, null, 2));
}

// Test-only intercept: production host remains the ADR-0088 safe snapshot path.
const snapshot = globalThis.createImageBitmap.bind(globalThis);
function option(premultiply: boolean) {
	globalThis.createImageBitmap = ((source: ImageBitmapSource, options?: ImageBitmapOptions) => snapshot(source, premultiply ? { ...options, premultiplyAlpha: 'premultiply' } : options)) as typeof createImageBitmap;
}
function pixels(e: FluidEngine): Uint8ClampedArray {
	const c = document.createElement('canvas'); c.width = (e as unknown as Harness).canvas.width; c.height = (e as unknown as Harness).canvas.height;
	const ctx = c.getContext('2d', { willReadFrequently: true })!; ctx.drawImage((e as unknown as Harness).canvas, 0, 0);
	return ctx.getImageData(0, 0, c.width, c.height).data;
}

describe('strict GPU budget follow-up (measurement only)', () => {
	it('explicit premultiply preserves transparent, glass and reveal RGBA exactly', async () => {
		for (const cfg of [
			{ transparent: true },
			{ transparent: true, glass: true, containerShape: { type: 'circle' as const, cx: 0.5, cy: 0.5, radius: 0.4 } },
			{ transparent: true, reveal: true }
		]) {
			const e = build('LavaLamp', 1, true, 251, 157);
			try {
				e.setConfig(cfg); e.advance(30, 1 / 60);
				const h = e as unknown as { renderDirty: boolean; present(): void };
				option(false); h.renderDirty = true; e.renderOnce(); await e.presented(); const a = pixels(e);
				option(true); h.renderDirty = true; e.renderOnce(); await e.presented(); const b = pixels(e);
				let differing = 0, max = 0;
				for (let i = 0; i < a.length; i++) { if (a[i] !== b[i]) differing++; max = Math.max(max, Math.abs(a[i] - b[i])); }
				rows.push({ kind: 'premultiply-parity', config: cfg, differing, max });
				expect(differing).toBe(0);
			} finally { globalThis.createImageBitmap = snapshot; e.dispose(); document.body.replaceChildren(); }
		}
		await flush();
	});
	for (const dpr of [1, 2, 3]) it(`DPR ${dpr} ${SHARED ? 'shared' : 'own'} independent stages`, { timeout: 600_000 }, async () => {
		for (const preset of shuffle(ONLY)) {
			const e = build(preset, dpr, SHARED);
			try {
				await warm(e);
				const labels = stages(e);
				for (const label of shuffle(labels)) {
					const ordinary: number[] = [], checked: number[] = [], delta: number[] = [];
					await batch(e, label);
					for (let repeat = 0; repeat < BATCHES; repeat++) {
						let a = 0, b = 0;
						for (const kind of shuffle(['ordinary', label])) { const value = await batch(e, kind); if (kind === 'ordinary') a = value; else b = value; }
						if (label === 'ordinary') b = a;
						ordinary.push(a); checked.push(b); delta.push(b - a);
					}
					rows.push({ kind: 'stage', preset, dpr, tier: SHARED ? 'shared' : 'own', stage: label, ...summary(checked), ordinary: summary(ordinary), delta: summary(delta) });
				}
				if (SHARED) {
					const values = { default: [] as number[], premultiply: [] as number[] };
					for (let repeat = 0; repeat < BATCHES; repeat++) for (const choice of shuffle(['default', 'premultiply'] as const)) {
						option(choice === 'premultiply'); values[choice].push(await batch(e, 'ordinary'));
					}
					rows.push({ kind: 'premultiply-throughput', preset, dpr, default: summary(values.default), premultiply: summary(values.premultiply) });
				}
			} finally { globalThis.createImageBitmap = snapshot; e.dispose(); document.body.replaceChildren(); }
			await flush();
		}
	});
	if (SHARED) for (const n of [9, 16, 24]) it(`${n} mixed-size shared instances, per-instance frames`, { timeout: 600_000 }, async () => {
		for (const dpr of [1, 2, 3]) {
			const list: FluidEngine[] = [];
			try {
				for (let i = 0; i < n; i++) {
					const size = [[320, 200], [800, 500], [CSS_W, CSS_H]][i % 3];
					list.push(build(ONLY[i % ONLY.length], dpr, true, ...size as [number, number]));
				}
				for (const e of list) { for (let i = 0; i < 40; i++) frame(e); await e.presented(); }
				drain(list[0]);
				// Actual individual shared frame batches with all n resources resident;
				// never divide a page-frame total by n to conceal the largest instance.
				const samples = list.map(() => [] as number[]);
				for (let repeat = 0; repeat < 6; repeat++) for (const i of shuffle(list.map((_, i) => i))) samples[i].push(await batch(list[i], 'ordinary', 10));
				for (let i = 0; i < n; i++) rows.push({ kind: 'mixed-shared', n, dpr, instance: i, preset: ONLY[i % ONLY.length], canvas: [(list[i] as unknown as Harness).canvas.width, (list[i] as unknown as Harness).canvas.height], ...summary(samples[i]) });
			} finally { for (const e of list) e.dispose(); document.body.replaceChildren(); }
			await flush();
		}
	});
});
