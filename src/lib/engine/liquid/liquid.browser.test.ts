import { describe, expect, it } from 'vitest';
import { commands } from 'vitest/browser';
import { LiquidEngine } from './LiquidEngine.js';
import { compileShader, makeProgram } from '../gl-utils.js';
import * as liquidShaders from './liquid-shaders.js';
import { mixtureLut } from './palette.js';
import { STONE } from './types.js';
import type { LiquidScene, Rect, SensorFrame, TerrainEdit, Wind } from './types.js';

const PALETTE = ['#6ec6ff', '#f2b134', '#e8608a'] as const;
const output = commands as unknown as {
	writeBenchJson(path: string, json: string): Promise<void>;
	writeBenchBase64(path: string, base64: string): Promise<void>;
	captureCanvasScreenshot(rect: { x: number; y: number; width: number; height: number }): Promise<string>;
};
const yieldGpu = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const rect = (x: number, y: number, w: number, h: number): Rect => ({
	x,
	y,
	w,
	h
});
function scene(width = 64, height = 48): LiquidScene {
	return {
		width,
		height,
		terrain: new Uint8Array(width * height),
		fills: [],
		sensors: [],
		drains: []
	};
}
function paint(s: LiquidScene, r: Rect, kind = STONE): void {
	for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) s.terrain[y * s.width + x] = kind;
}
function setup(
	width = 640,
	height = 400
): {
	engine: LiquidEngine;
	canvas: HTMLCanvasElement;
	gl: WebGL2RenderingContext;
} {
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	canvas.getContext('webgl2', {
		alpha: true,
		premultipliedAlpha: true,
		antialias: false,
		depth: false,
		stencil: false,
		preserveDrawingBuffer: true
	});
	const engine = new LiquidEngine({
		canvas,
		seed: 4821,
		palette: PALETTE,
		onContextLost: () => console.error('Unexpected liquid context loss'),
		onError: (error) => console.error('Liquid error', error)
	});
	const gl = canvas.getContext('webgl2')!;
	return { engine, canvas, gl };
}
function conserved(frame: SensorFrame): void {
	for (let sp = 0; sp < 3; sp++) {
		const drained = Object.values(frame.drained).reduce((sum, c) => sum + c[sp], 0);
		expect(frame.alive[sp] + drained, `tick ${frame.tick}, species ${sp}`).toBe(frame.seeded[sp] + frame.emitted[sp]);
	}
	expect(Number.isFinite(frame.activity)).toBe(true);
}
async function finish(engine: LiquidEngine, gl: WebGL2RenderingContext): Promise<readonly SensorFrame[]> {
	gl.finish();
	for (let i = 0; i < 20; i++) {
		await new Promise<void>((resolve) => setTimeout(resolve, 5));
		const frames = engine.pollSensors();
		if (frames.length) return frames;
	}
	return [];
}
function occupied(f: SensorFrame): number {
	return f.occupancy.reduce((sum, v) => sum + +(v > 0), 0);
}
function surface(f: SensorFrame, width: number, r: Rect): number {
	const columns: number[] = [];
	for (let x = r.x; x < r.x + r.w; x++) {
		for (let y = r.y; y < r.y + r.h; y++)
			if (f.occupancy[y * width + x]) {
				columns.push(y);
				break;
			}
	}
	columns.sort((a, b) => a - b);
	return columns[Math.floor(columns.length / 2)] ?? Infinity;
}

describe('Verdigris real-GPU liquid', () => {
	it('hardware smoke, exact sensors, compaction and epoch isolation', async () => {
		const { engine, gl } = setup();
		try {
			const debug = gl.getExtension('WEBGL_debug_renderer_info');
			expect(debug).not.toBeNull();
			const renderer = gl.getParameter(debug!.UNMASKED_RENDERER_WEBGL) as string;
			console.info('Verdigris GPU:', renderer);
			expect(renderer.toLowerCase()).not.toMatch(/swiftshader|llvmpipe|software/);
			const s = scene();
			s.fills = [
				{ species: 0, rect: rect(4, 4, 12, 12), markers: 576 },
				{ species: 1, rect: rect(8, 8, 12, 12), markers: 576 },
				{ species: 2, rect: rect(12, 12, 12, 12), markers: 576 }
			];
			s.sensors = [
				{ id: 'all', rect: rect(0, 0, 64, 48) },
				{ id: 'left', rect: rect(0, 0, 18, 48) },
				{ id: 'overlap', rect: rect(9, 11, 20, 18) }
			];
			s.drains = [{ id: 'sink', rect: rect(0, 38, 64, 10) }];
			engine.load(s);
			let exact = 0;
			for (let tick = 0; tick < 90; tick++) {
				engine.step({ tick, emit: [], edits: [] });
				const particles = engine._debugParticles();
				const frames = await finish(engine, gl);
				for (const f of frames) {
					conserved(f);
					if (f.tick !== tick) continue;
					exact++;
					for (const sensor of s.sensors) {
						const counts = [0, 0, 0];
						const flux = [0, 0];
						for (let i = 0; i < particles.slots; i++) {
							const at = i * 4;
							if (particles.b[at + 1] !== 1) continue;
							const x = Math.floor(particles.a[at]);
							const y = Math.floor(particles.a[at + 1]);
							const r = sensor.rect;
							if (x < r.x || x >= r.x + r.w || y < r.y || y >= r.y + r.h) continue;
							counts[particles.b[at]]++;
							flux[0] += particles.a[at + 2];
							flux[1] += particles.a[at + 3];
						}
						expect(f.sensors[sensor.id].counts).toEqual(counts);
						expect(Math.abs(f.sensors[sensor.id].flux.x - flux[0])).toBeLessThan(0.02 + Math.abs(flux[0]) * 1e-5);
						expect(Math.abs(f.sensors[sensor.id].flux.y - flux[1])).toBeLessThan(0.02 + Math.abs(flux[1]) * 1e-5);
					}
				}
			}
			expect(exact).toBeGreaterThan(80);
			engine.compact();
			engine.step({ tick: 90, emit: [], edits: [] });
			for (const f of await finish(engine, gl)) conserved(f);
			expect(engine.capacityLeft).toBeGreaterThan(65_536 - 1728);
			engine.step({ tick: 91, emit: [], edits: [] });
			engine.load(s);
			engine.step({ tick: 0, emit: [], edits: [] });
			const frames = await finish(engine, gl);
			expect(frames.length).toBeGreaterThan(0);
			for (const f of frames) {
				expect(f.epoch).toBe(2);
				conserved(f);
			}
			expect(gl.getError()).toBe(gl.NO_ERROR);
		} finally {
			engine.dispose();
		}
	}, 120_000);

	it('conserves every species through dam break, emission and drainage for 3600 ticks', async () => {
		const { engine, gl } = setup();
		try {
			const s = scene(96, 64);
			paint(s, rect(0, 62, 96, 2));
			paint(s, rect(40, 32, 2, 30));
			s.fills = [0, 1, 2].map((species) => ({
				species: species as 0 | 1 | 2,
				rect: rect(2 + species * 10, 4, 10, 48),
				markers: 1920
			}));
			s.drains = [{ id: 'out', rect: rect(90, 38, 6, 24) }];
			s.sensors = [{ id: 'whole', rect: rect(0, 0, 96, 64) }];
			engine.load(s);
			let frames = 0;
			let final: SensorFrame | undefined;
			for (let tick = 0; tick < 3600; tick++) {
				const edits =
					tick === 120
						? Array.from({ length: 60 }, (_, i) => ({
								x: 40 + (i % 2),
								y: 32 + Math.floor(i / 2),
								kind: 0 as const
						  }))
						: [];
				engine.step({
					tick,
					edits,
					emit:
						tick % 4 === 0 && tick < 2400
							? [
									{
										species: (tick % 3) as 0 | 1 | 2,
										count: 12,
										rect: rect(12, 2, 4, 2),
										velocity: { x: 35, y: 30 }
									}
							  ]
							: []
				});
				if (tick % 8 === 7) await yieldGpu();
				for (const f of engine.pollSensors()) {
					conserved(f);
					frames++;
					final = f;
				}
				if (tick === 1800) engine.compact();
			}
			for (const f of await finish(engine, gl)) {
				conserved(f);
				frames++;
				final = f;
			}
			expect(frames).toBeGreaterThan(100);
			expect(final!.drained.out.reduce((a, b) => a + b)).toBeGreaterThan(0);
			const report = {
				frames,
				final: final!.tick,
				alive: final!.alive,
				drained: final!.drained,
				seeded: final!.seeded,
				emitted: final!.emitted
			};
			console.info('Conservation:', report);
			await output.writeBenchJson('/tmp/verdigris-engine/conservation.json', JSON.stringify(report, null, 2));
			expect(gl.getError()).toBe(gl.NO_ERROR);
		} finally {
			engine.dispose();
		}
	}, 600_000);

	it('never leaks through a two-cell stone box under a falling stream for 3600 ticks', async () => {
		const { engine, gl } = setup();
		try {
			const s = scene(64, 72);
			paint(s, rect(8, 8, 48, 2));
			paint(s, rect(8, 62, 48, 2));
			paint(s, rect(8, 8, 2, 56));
			paint(s, rect(54, 8, 2, 56));
			s.fills = [{ species: 0, rect: rect(10, 38, 44, 24), markers: 4224 }];
			s.sensors = [
				{ id: 'left', rect: rect(0, 0, 8, 72) },
				{ id: 'right', rect: rect(56, 0, 8, 72) },
				{ id: 'top', rect: rect(8, 0, 48, 8) },
				{ id: 'bottom', rect: rect(8, 64, 48, 8) }
			];
			engine.load(s);
			let frames = 0;
			for (let tick = 0; tick < 3600; tick++) {
				engine.step({
					tick,
					edits: [],
					emit:
						tick < 1800 && tick % 4 === 0
							? [
									{
										species: 1,
										count: 8,
										rect: rect(28, 11, 4, 2),
										velocity: { x: 0, y: 150 }
									}
							  ]
							: []
				});
				if (tick % 8 === 7) await yieldGpu();
				for (const f of engine.pollSensors()) {
					conserved(f);
					frames++;
					for (const reading of Object.values(f.sensors)) expect(reading.counts).toEqual([0, 0, 0]);
				}
			}
			for (const f of await finish(engine, gl)) for (const reading of Object.values(f.sensors)) expect(reading.counts).toEqual([0, 0, 0]);
			expect(frames).toBeGreaterThan(100);
			console.info('Leakage:', { frames, escaped: 0 });
			await output.writeBenchJson('/tmp/verdigris-engine/leakage.json', JSON.stringify({ ticks: 3600, frames, escaped: 0 }, null, 2));
			expect(gl.getError()).toBe(gl.NO_ERROR);
		} finally {
			engine.dispose();
		}
	}, 600_000);

	it('levels communicating vessels within ten seconds and preserves occupied volume for thirty seconds', async () => {
		const { engine, gl } = setup();
		try {
			const s = scene(72, 96);
			paint(s, rect(0, 0, 4, 96));
			paint(s, rect(68, 0, 4, 96));
			paint(s, rect(0, 92, 72, 4));
			paint(s, rect(26, 0, 20, 80));
			s.fills = [{ species: 0, rect: rect(4, 8, 22, 84), markers: 7392 }];
			engine.load(s);
			let start: SensorFrame | undefined;
			let end: SensorFrame | undefined;
			for (let tick = 0; tick <= 2400; tick++) {
				if (tick === 600 || tick === 2400) {
					// A synchronous particle probe is test-only; it drains queued GPU work before
					// polling every old fence, leaving a free PBO for this exact measurement tick.
					engine._debugParticles();
					for (let i = 0; i < 3; i++) {
						await new Promise((resolve) => setTimeout(resolve, 20));
						engine.pollSensors();
					}
				}
				engine.step({ tick, edits: [], emit: [] });
				if (tick === 600 || tick === 2400) {
					engine._debugParticles();
					let measured: SensorFrame | undefined;
					for (let i = 0; i < 30 && !measured; i++) {
						await new Promise((resolve) => setTimeout(resolve, 5));
						for (const f of engine.pollSensors()) {
							conserved(f);
							if (f.tick === tick) measured = f;
						}
					}
					expect(measured?.tick).toBe(tick);
					if (tick === 600) start = measured;
					end = measured;
				} else {
					if (tick % 8 === 7) await yieldGpu();
					for (const f of engine.pollSensors()) {
						conserved(f);
						end = f;
					}
				}
			}
			for (const f of await finish(engine, gl)) end = f;
			expect(start?.tick).toBe(600);
			expect(end?.tick).toBe(2400);
			const a = surface(start!, 72, rect(6, 0, 18, 92));
			const b = surface(start!, 72, rect(48, 0, 18, 92));
			const drift = Math.abs(occupied(end!) / occupied(start!) - 1);
			const report = {
				left: a,
				right: b,
				difference: Math.abs(a - b),
				occupiedStart: occupied(start!),
				occupiedEnd: occupied(end!),
				drift
			};
			console.info('Vessels:', report);
			await output.writeBenchJson('/tmp/verdigris-engine/vessels.json', JSON.stringify(report, null, 2));
			expect(Math.abs(a - b)).toBeLessThanOrEqual(2);
			expect(drift).toBeLessThanOrEqual(0.1);
			expect(gl.getError()).toBe(gl.NO_ERROR);
		} finally {
			engine.dispose();
		}
	}, 600_000);

	it('pushes every marker out of a newly solid 6×6 block without loss', async () => {
		const { engine, gl } = setup();
		try {
			const s = scene(48, 48);
			paint(s, rect(0, 46, 48, 2));
			s.fills = [{ species: 0, rect: rect(2, 26, 44, 20), markers: 3520 }];
			engine.load(s);
			for (let tick = 0; tick < 180; tick++) {
				engine.step({ tick, edits: [], emit: [] });
				if (tick % 8 === 7) {
					await yieldGpu();
					engine.pollSensors();
				}
			}
			const edits: TerrainEdit[] = [];
			for (let y = 34; y < 40; y++) for (let x = 20; x < 26; x++) edits.push({ x, y, kind: STONE });
			for (let tick = 180; tick < 190; tick++) engine.step({ tick, edits: tick === 180 ? edits : [], emit: [] });
			const particles = engine._debugParticles();
			let alive = 0;
			for (let i = 0; i < particles.slots; i++) {
				if (particles.b[i * 4 + 1] !== 1) continue;
				alive++;
				const x = Math.floor(particles.a[i * 4]);
				const y = Math.floor(particles.a[i * 4 + 1]);
				expect(x >= 20 && x < 26 && y >= 34 && y < 40).toBe(false);
			}
			expect(alive).toBe(3520);
			for (const f of await finish(engine, gl)) conserved(f);
			// Emission into solid must also survive a grid that never had velocity there.
			engine.load({ ...scene(48, 48), terrain: s.terrain.slice(), fills: [] });
			engine.step({
				tick: 0,
				edits,
				emit: [
					{
						species: 2,
						count: 64,
						rect: rect(22, 36, 1, 1),
						velocity: { x: 0, y: 0 }
					}
				]
			});
			for (let tick = 1; tick < 10; tick++) engine.step({ tick, edits: [], emit: [] });
			const emitted = engine._debugParticles();
			for (let i = 0; i < 64; i++) {
				expect(emitted.b[i * 4 + 1]).toBe(1);
				const x = Math.floor(emitted.a[i * 4]);
				const y = Math.floor(emitted.a[i * 4 + 1]);
				expect(x >= 20 && x < 26 && y >= 34 && y < 40).toBe(false);
				expect(Number.isFinite(emitted.a[i * 4 + 2])).toBe(true);
			}
			for (const f of await finish(engine, gl)) conserved(f);
			expect(gl.getError()).toBe(gl.NO_ERROR);
		} finally {
			engine.dispose();
		}
	}, 120_000);

	it('rebuilds after real context loss; the game can load a new epoch', async () => {
		const canvas = document.createElement('canvas');
		let lost = 0;
		let restored = 0;
		const engine = new LiquidEngine({
			canvas,
			seed: 42,
			palette: PALETTE,
			onContextLost: () => lost++,
			onContextRestored: () => restored++
		});
		const gl = canvas.getContext('webgl2')!;
		try {
			const extension = gl.getExtension('WEBGL_lose_context');
			expect(extension).not.toBeNull();
			const s = scene(24, 24);
			s.fills = [{ species: 0, rect: rect(2, 2, 10, 10), markers: 400 }];
			engine.load(s);
			extension!.loseContext();
			for (let i = 0; i < 100 && !lost; i++) await new Promise((resolve) => setTimeout(resolve, 10));
			expect(lost).toBe(1);
			engine.step({ tick: 0, emit: [], edits: [] });
			expect(engine.pollSensors()).toEqual([]);
			extension!.restoreContext();
			for (let i = 0; i < 100 && !restored; i++) await new Promise((resolve) => setTimeout(resolve, 10));
			expect(restored).toBe(1);
			engine.load(s);
			engine.step({ tick: 0, emit: [], edits: [] });
			for (const f of await finish(engine, gl)) {
				expect(f.epoch).toBe(2);
				conserved(f);
			}
			expect(engine._debugParticles().slots).toBe(400);
			expect(gl.getError()).toBe(gl.NO_ERROR);
		} finally {
			engine.dispose();
		}
	});

	it('validates boundaries and disposes twice without GL errors; fresh canvases work', () => {
		for (let i = 0; i < 2; i++) {
			const { engine, gl } = setup();
			try {
				expect(() => engine.load({ ...scene(), width: 257 })).toThrow();
				expect(() => engine.load({ ...scene(), terrain: new Uint8Array(1) })).toThrow();
				engine.load(scene());
				expect(() => engine.step({ tick: 0, emit: [], edits: [{ x: -1, y: 0, kind: 1 }] })).toThrow();
				expect(() =>
					engine.step({
						tick: 0,
						edits: [],
						emit: [
							{
								species: 0,
								count: -1,
								rect: rect(0, 0, 1, 1),
								velocity: { x: 0, y: 0 }
							}
						]
					})
				).toThrow();
				engine.step({ tick: 0, edits: [], emit: [] });
				expect(() => engine.step({ tick: 0, edits: [], emit: [] })).toThrow();
				engine.render({ time: 0 });
			} finally {
				engine.dispose();
				engine.dispose();
			}
			expect(gl.getError()).toBe(gl.NO_ERROR);
		}
	});

	it('reports 50k-marker GPU timings and captures coherent dam-break and pigment surfaces', async () => {
		const { engine, gl, canvas } = setup(1280, 800);
		try {
			const s = scene(192, 120);
			paint(s, rect(0, 118, 192, 2));
			s.fills = [
				{ species: 0, rect: rect(4, 12, 75, 106), markers: 31_800 },
				{ species: 1, rect: rect(79, 60, 60, 58), markers: 13_920 },
				{ species: 2, rect: rect(139, 80, 49, 38), markers: 4280 }
			];
			engine.load(s);
			for (let tick = 0; tick < 30; tick++) {
				engine.step({ tick, emit: [], edits: [] });
				if (tick % 8 === 7) {
					await yieldGpu();
					engine.pollSensors();
				}
			}
			await finish(engine, gl);
			const begin = performance.now();
			for (let tick = 30; tick < 50; tick++) engine.step({ tick, emit: [], edits: [] });
			gl.finish();
			engine._debugParticles();
			const stepMs = (performance.now() - begin) / 20;
			engine.render({ time: 1 });
			gl.finish();
			const renderStart = performance.now();
			for (let i = 0; i < 30; i++) {
				// Charge mixing every frame, as during playback, not the paused-tick cache.
				(engine as unknown as { resources: { mixtureTick: number } }).resources.mixtureTick = -2;
				engine.render({ time: 1 + i / 60 });
			}
			gl.finish();
			gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
			const renderMs = (performance.now() - renderStart) / 30;
			expect(gl.isContextLost()).toBe(false);
			expect(engine._debugParticles().slots).toBe(50_000);
			const authored = {
				...s,
				fills: [
					{ species: 0 as const, rect: rect(4, 12, 40, 106), markers: 16_960 },
					{ species: 1 as const, rect: rect(44, 60, 40, 58), markers: 9280 },
					{ species: 2 as const, rect: rect(84, 94, 39, 24), markers: 3760 }
				]
			};
			engine.load(authored);
			for (let tick = 0; tick < 30; tick++) {
				engine.step({ tick, emit: [], edits: [] });
				if (tick % 8 === 7) {
					await yieldGpu();
					engine.pollSensors();
				}
			}
			await finish(engine, gl);
			const authoredStart = performance.now();
			for (let tick = 30; tick < 50; tick++) engine.step({ tick, emit: [], edits: [] });
			gl.finish();
			engine._debugParticles();
			const authoredStepMs = (performance.now() - authoredStart) / 20;
			const report = {
				markers: 50_000,
				grid: [192, 120],
				canvas: [1280, 800],
				stepMs,
				renderMs,
				authoredMarkers: 30_000,
				authoredStepMs,
				substeps: 2,
				pressureIterations: 24
			};
			console.info('Verdigris perf:', report);
			await output.writeBenchJson('/tmp/verdigris-engine/perf.json', JSON.stringify(report, null, 2));
			// Wall-clock budgets only mean something on a quiet machine; the report is always written.
			if (import.meta.env.SVELTE_FLUID_GPU_BENCH) {
				expect(authoredStepMs).toBeLessThanOrEqual(8);
				expect(renderMs).toBeLessThanOrEqual(2);
			}
			canvas.style.cssText = 'position:fixed;inset:0;display:block;width:1280px;height:800px;max-width:none;background:#f8f1df';
			document.body.style.margin = '0';
			document.body.append(canvas);
			await yieldGpu();
			engine.render({ time: 1.5 });
			const screenshot = (background = '#f8f1df') => {
				const image = document.createElement('canvas');
				image.width = 1280;
				image.height = 800;
				const ctx = image.getContext('2d')!;
				ctx.fillStyle = background;
				ctx.fillRect(0, 0, 1280, 800);
				ctx.drawImage(canvas, 0, 0);
				return image.toDataURL('image/png').split(',')[1];
			};
			await output.writeBenchBase64('/tmp/verdigris-engine/dam-break.png', screenshot());
			await output.writeBenchBase64('/tmp/verdigris-engine/dam-break-dark.png', screenshot('#0f2a2e'));
			const mixed = scene(192, 120);
			paint(mixed, rect(0, 118, 192, 2));
			mixed.fills = [
				{ species: 0, rect: rect(6, 70, 56, 48), markers: 5376 },
				{ species: 1, rect: rect(6, 70, 56, 48), markers: 5376 },
				{ species: 0, rect: rect(68, 70, 56, 48), markers: 5376 },
				{ species: 2, rect: rect(68, 70, 56, 48), markers: 5376 },
				{ species: 0, rect: rect(130, 70, 56, 48), markers: 3584 },
				{ species: 1, rect: rect(130, 70, 56, 48), markers: 3584 },
				{ species: 2, rect: rect(130, 70, 56, 48), markers: 3584 }
			];
			engine.load(mixed);
			for (let tick = 0; tick < 180; tick++) {
				engine.step({ tick, emit: [], edits: [] });
				if (tick % 8 === 7) {
					await yieldGpu();
					engine.pollSensors();
				}
			}
			engine.render({ time: 3, glow: 0.15 });
			await output.writeBenchBase64('/tmp/verdigris-engine/mixed-pool.png', screenshot());
			await output.writeBenchBase64('/tmp/verdigris-engine/mixed-pool-dark.png', screenshot('#0f2a2e'));
			expect(gl.getError()).toBe(gl.NO_ERROR);
		} finally {
			canvas.remove();
			engine.dispose();
		}
	}, 180_000);
});

describe('one-way air coupling', () => {
	const wind = (x = 60, y = 0): Wind => ({
		width: 1,
		height: 1,
		data: new Float32Array([x, y]),
	});
	function centroid(engine: LiquidEngine) {
		const p = engine._debugParticles();
		let x = 0,
			y = 0,
			n = 0;
		for (let i = 0; i < p.slots; i++)
			if (p.b[i * 4 + 1] === 1) {
				x += p.a[i * 4];
				y += p.a[i * 4 + 1];
				n++;
			}
		return { x: x / n, y: y / n, n };
	}

	it('deflects a falling stream in the same step, conserves exactly, renders evidence', async () => {
		const outcomes: number[] = [];
		for (const windy of [false, true]) {
			const { engine, gl, canvas } = setup(960, 360);
			try {
				const s = scene(192, 72);
				s.gravity = 300;
				paint(s, rect(0, 70, 192, 2));
				s.sensors = [{ id: 'all', rect: rect(0, 0, 192, 72) }];
				engine.load(s);
				const field = windy ? wind() : undefined;
				let frames = 0;
				const started = performance.now();
				for (let tick = 0; tick < 180; tick++) {
					engine.step({
						tick,
						edits: [],
						wind: field,
						emit:
							tick < 120
								? [
										{
											species: 0,
											count: 2,
											rect: rect(14, 2, 2, 1),
											velocity: { x: 0, y: 15 },
										},
									]
								: [],
					});
					if (tick % 8 === 7) await yieldGpu();
					for (const frame of engine.pollSensors()) {
						conserved(frame);
						frames++;
					}
					if (windy && tick === 90) {
						engine.render({ time: tick / 60 });
						const image = document.createElement('canvas');
						image.width = canvas.width; image.height = canvas.height;
						const ctx = image.getContext('2d')!;
						ctx.fillStyle = '#f8f1df'; ctx.fillRect(0, 0, image.width, image.height);
						ctx.drawImage(canvas, 0, 0);
						// Sparse airborne markers are below the beauty renderer's density threshold.
						// Show their actual positions rather than an empty/fictional liquid surface.
						const particles = engine._debugParticles();
						ctx.fillStyle = '#162b35';
						ctx.font = '16px sans-serif';
						ctx.fillText('Wind +60 cells/s: sparse marker diagnostic (1.5 s)', 160, 24);
						for (let i = 0; i < particles.slots; i++) if (particles.b[i * 4 + 1] === 1) {
							ctx.beginPath();
							ctx.arc(particles.a[i * 4] / s.width * image.width, particles.a[i * 4 + 1] / s.height * image.height, 2, 0, 2 * Math.PI);
							ctx.fill();
						}
						await output.writeBenchBase64('/tmp/verdigris-v2/wind-stream.png', image.toDataURL('image/png').split(',')[1]);
					}
				}
				for (const frame of await finish(engine, gl)) {
					conserved(frame);
					frames++;
				}
				expect(frames).toBeGreaterThan(3);
				const p = engine._debugParticles();
				let x = 0,
					n = 0;
				for (let i = 0; i < p.slots; i++)
					if (p.a[i * 4 + 1] > 67) {
						x += p.a[i * 4];
						n++;
					}
				expect(n).toBeGreaterThan(10);
				outcomes.push(x / n);
				console.info('Wind stream:', {
					windy,
					landingX: x / n,
					landed: n,
					msPerTick: (performance.now() - started) / 180,
				});
				expect(gl.getError()).toBe(gl.NO_ERROR);
			} finally {
				engine.dispose();
				canvas.remove();
			}
		}
		const deflection = outcomes[1] - outcomes[0];
		console.info('Wind deflection cells:', deflection);
		expect(deflection).toBeGreaterThanOrEqual(8);
	}, 120_000);

	it('leaves a settled pool level and centroid stable for 3 seconds', async () => {
		const { engine, gl } = setup();
		try {
			const s = scene(64, 48);
			paint(s, rect(0, 44, 64, 4));
			paint(s, rect(0, 0, 2, 44));
			paint(s, rect(62, 0, 2, 44));
			s.fills = [{ species: 1, rect: rect(2, 28, 60, 16), markers: 3840 }];
			engine.load(s);
			for (let tick = 0; tick < 600; tick++) {
				engine.step({ tick, emit: [], edits: [] });
				if (tick % 8 === 7) await yieldGpu();
				engine.pollSensors();
			}
			const before = centroid(engine);
			const f0 = (await finish(engine, gl)).at(-1)!;
			const level0 = surface(f0, 64, rect(5, 0, 54, 44));
			let maxLevelChange = 0,
				maxDrift = 0;
			const field = wind();
			for (let tick = 600; tick < 780; tick++) {
				engine.step({ tick, emit: [], edits: [], wind: field });
				if (tick % 8 === 7) await yieldGpu();
				for (const frame of engine.pollSensors()) {
					conserved(frame);
					maxLevelChange = Math.max(
						maxLevelChange,
						Math.abs(surface(frame, 64, rect(5, 0, 54, 44)) - level0)
					);
				}
				if (tick % 30 === 29)
					maxDrift = Math.max(
						maxDrift,
						Math.abs(centroid(engine).x - before.x)
					);
			}
			const after = centroid(engine);
			for (const frame of await finish(engine, gl)) {
				conserved(frame);
				maxLevelChange = Math.max(
					maxLevelChange,
					Math.abs(surface(frame, 64, rect(5, 0, 54, 44)) - level0)
				);
			}
			console.info('Wind pool:', { before, after, maxLevelChange, maxDrift });
			expect(after.n).toBe(before.n);
			expect(maxLevelChange).toBeLessThanOrEqual(2);
			expect(maxDrift).toBeLessThanOrEqual(1.5);
			expect(gl.getError()).toBe(gl.NO_ERROR);
		} finally {
			engine.dispose();
		}
	}, 180_000);

	it('validates wind before mutating a tick; reuploads changed contents only; omission disables drag', () => {
		const { engine, gl } = setup();
		try {
			const s = scene();
			s.gravity = 0;
			s.fills = [{ species: 0, rect: rect(20, 20, 1, 1), markers: 1 }];
			engine.load(s);
			const invalid = [
				{ ...wind(), width: 0 },
				{ ...wind(), width: 97 },
				{ ...wind(), height: 61 },
				{ ...wind(), height: 1.5 },
				{ ...wind(), data: new Float32Array(1) },
				wind(NaN),
				wind(Infinity),
				wind(401),
				wind(300, 300),
			];
			for (const field of invalid)
				expect(() =>
					engine.step({ tick: 0, emit: [], edits: [], wind: field })
				).toThrow();
			const original = gl.texSubImage2D.bind(gl);
			let uploads = 0;
			gl.texSubImage2D = ((...args: Parameters<typeof gl.texSubImage2D>) => {
				if (args[6] === gl.RG) uploads++;
				return original(...args);
			}) as typeof gl.texSubImage2D;
			const field = wind();
			engine.step({ tick: 0, emit: [], edits: [], wind: field });
			expect(uploads).toBe(1);
			const first = engine._debugParticles().a;
			expect(first[0]).toBeGreaterThan(20.05);
			engine.step({ tick: 1, emit: [], edits: [], wind: field });
			expect(uploads).toBe(1);
			field.data[0] = -60;
			engine.step({ tick: 2, emit: [], edits: [], wind: field });
			expect(uploads).toBe(2);
			engine.step({ tick: 3, emit: [], edits: [] });
			expect((engine as unknown as { hasWind: boolean }).hasWind).toBe(false);
			expect(gl.getError()).toBe(gl.NO_ERROR);
			gl.texSubImage2D = original;
		} finally {
			engine.dispose();
		}
	});
});


describe('falling-column air coupling', () => {
	it('deflects the real 6.4-marker/tick pour and captures beauty renders', async () => {
		const landings: number[] = [];
		for (const windy of [false, true]) {
			const { engine, gl, canvas } = setup(960, 400);
			try {
				const s = scene(192, 80);
				paint(s, rect(0, 78, 192, 2));
				s.drains = [{ id: 'landing', rect: rect(0, 76, 192, 2) }];
				engine.load(s);
				const field = { width: 1, height: 1, data: new Float32Array([60, 0]) };
				const landed = new Map<number, number>();
				for (let tick = 0; tick < 300; tick++) {
					engine.step({ tick, edits: [], wind: windy ? field : undefined,
						emit: tick < 180 ? [{ species: 0, count: Math.floor((tick + 1) * 6.4) - Math.floor(tick * 6.4), rect: rect(28, 4, 4, 4), velocity: { x: 0, y: 20 } }] : [] });
					if (tick % 8 === 7) await yieldGpu();
					for (const f of engine.pollSensors()) conserved(f);
					const p = engine._debugParticles();
					for (let i = 0; i < p.slots; i++) if (p.b[i * 4 + 1] === 2 && !landed.has(i)) landed.set(i, p.a[i * 4]);
					if (tick === 100) {
						engine.render({ time: tick / 60 });
						const image = document.createElement('canvas'); image.width = canvas.width; image.height = canvas.height;
						const ctx = image.getContext('2d')!;
						ctx.drawImage(canvas, 0, 0);
						const rgba = ctx.getImageData(0, 0, image.width, image.height).data;
						let gaps = 0;
						for (let y = 40; y < 370; y++) {
							let covered = false;
							for (let x = 0; x < image.width; x++) covered ||= rgba[(y * image.width + x) * 4 + 3] > 100;
							if (!covered) gaps++;
						}
						const widths = [45, 200, 360].map((y) => {
							let left = image.width, right = -1;
							for (let x = 0; x < image.width; x++) if (rgba[(y * image.width + x) * 4 + 3] > 100) { left = Math.min(left, x); right = x; }
							return Math.max(0, right - left + 1) / (image.width / s.width);
						});
						console.info('Dense beauty ribbon gaps/widths:', { windy, gaps, widths });
						if (!windy) expect(widths[1]).toBeLessThanOrEqual(5);
						expect(gaps).toBe(0);
						ctx.fillStyle = '#f8f1df'; ctx.fillRect(0, 0, image.width, image.height); ctx.drawImage(canvas, 0, 0);
						await output.writeBenchBase64(windy ? '/tmp/verdigris-v2/wind-dense-pour.png' : '/tmp/verdigris-v2/no-wind-dense-pour.png', image.toDataURL('image/png').split(',')[1]);
					}
				}
				for (const f of await finish(engine, gl)) conserved(f);
				expect(landed.size).toBe(1152);
				landings.push([...landed.values()].reduce((a, b) => a + b, 0) / landed.size);
				expect(gl.getError()).toBe(gl.NO_ERROR);
			} finally { engine.dispose(); }
		}
		console.info('Dense pour landings:', { landings, deflection: landings[1] - landings[0] });
		expect(landings[1] - landings[0]).toBeGreaterThanOrEqual(25);
	}, 120_000);

	it('wind does not lift the body of a sloshing dam-break pool', async () => {
		const runs: { y: number; above: number }[] = [];
		for (const windy of [false, true]) {
			const { engine, gl } = setup();
			try {
				const s = scene(64, 48);
				paint(s, rect(0, 44, 64, 4));
				paint(s, rect(0, 0, 2, 44)); paint(s, rect(62, 0, 2, 44));
				s.fills = [{ species: 0, rect: rect(2, 20, 20, 24), markers: 1920 }];
				engine.load(s);
				const field = { width: 1, height: 1, data: new Float32Array([60, 0]) };
				let minY = Infinity, maxAbove = 0;
				for (let tick = 0; tick < 180; tick++) {
					engine.step({ tick, edits: [], emit: [], wind: windy ? field : undefined });
					if (tick % 8 === 7) await yieldGpu();
					for (const f of engine.pollSensors()) conserved(f);
					if (tick % 15 === 14) {
						const p = engine._debugParticles(); let y = 0, above = 0;
						for (let i = 0; i < p.slots; i++) { y += p.a[i * 4 + 1]; if (p.a[i * 4 + 1] < 16) above++; }
						minY = Math.min(minY, y / p.slots); maxAbove = Math.max(maxAbove, above);
					}
				}
				for (const f of await finish(engine, gl)) conserved(f);
				runs.push({ y: minY, above: maxAbove });
				expect(gl.getError()).toBe(gl.NO_ERROR);
			} finally { engine.dispose(); }
		}
		console.info('Wind dam-break body:', runs);
		expect(runs[1].y).toBeGreaterThanOrEqual(runs[0].y - 2);
		expect(runs[1].above).toBeLessThanOrEqual(runs[0].above + 96);
	}, 120_000);
});


it('preserves resting pool and dam-break body rendering; captures before/after', async () => {
	const { engine, gl, canvas } = setup(768, 576);
	const internals = engine as unknown as { programs: Map<string, ReturnType<typeof makeProgram>> };
	const legacyDensity = liquidShaders.DENSITY_VS
		.replace(' + mix(8.0, 3.0, step(2.0, texelFetch(cells, c, 0).a)) * airborne', '')
		.replace('if (airborne > 0.0) radius *= 0.35;', '')
		.replace('streak = vec2(a.z, -a.w) / sceneSize * imageSize / 60.0 * airborne;', 'streak = vec2(0.0);');
	const legacyComposite = liquidShaders.COMPOSITE_FS.replace('edge = max(edge, airborneCoverage);', '');
	function program(vs: string, fs: string) {
		const v = compileShader(gl, gl.VERTEX_SHADER, vs), f = compileShader(gl, gl.FRAGMENT_SHADER, fs);
		try { return makeProgram(gl, v, f); } finally { gl.deleteShader(v); gl.deleteShader(f); }
	}
	const oldDensity = program(legacyDensity, liquidShaders.DENSITY_FS);
	const oldComposite = program(liquidShaders.FULLSCREEN, legacyComposite);
	try {
		for (const kind of ['pool', 'dam-break']) {
			const s = scene(64, 48);
			paint(s, rect(0, 44, 64, 4)); paint(s, rect(0, 0, 2, 44)); paint(s, rect(62, 0, 2, 44));
			s.fills = [{ species: 0, rect: kind === 'pool' ? rect(2, 28, 60, 16) : rect(2, 20, 20, 24), markers: kind === 'pool' ? 3840 : 1920 }];
			engine.load(s);
			for (let tick = 0; tick < (kind === 'pool' ? 600 : 45); tick++) {
				engine.step({ tick, emit: [], edits: [] });
				if (tick % 8 === 7) await yieldGpu(); engine.pollSensors();
			}
			const currentDensity = internals.programs.get('density')!, currentComposite = internals.programs.get('composite')!;
			const pixels: Uint8ClampedArray[] = [];
			for (const version of ['before', 'after']) {
				internals.programs.set('density', version === 'before' ? oldDensity : currentDensity);
				internals.programs.set('composite', version === 'before' ? oldComposite : currentComposite);
				engine.render({ time: 1 });
				const image = document.createElement('canvas'); image.width = canvas.width; image.height = canvas.height;
				const ctx = image.getContext('2d')!; ctx.drawImage(canvas, 0, 0);
				pixels.push(ctx.getImageData(0, 0, image.width, image.height).data);
				ctx.globalCompositeOperation = 'destination-over'; ctx.fillStyle = '#f8f1df'; ctx.fillRect(0, 0, image.width, image.height);
				await output.writeBenchBase64(`/tmp/verdigris-v2/${kind}-${version}.png`, image.toDataURL('image/png').split(',')[1]);
			}
			internals.programs.set('density', currentDensity); internals.programs.set('composite', currentComposite);
			let coreDifference = 0, allDifference = 0;
			for (let y = 12; y < canvas.height - 12; y++) for (let x = 12; x < canvas.width - 12; x++) {
				const at = (y * canvas.width + x) * 4;
				const diff = Math.max(...[0, 1, 2, 3].map((c) => Math.abs(pixels[0][at + c] - pixels[1][at + c])));
				allDifference = Math.max(allDifference, diff);
				if ([-12, 0, 12].every((dy) => [-12, 0, 12].every((dx) => pixels[0][((y + dy) * canvas.width + x + dx) * 4 + 3] > 235))) coreDifference = Math.max(coreDifference, diff);
			}
			console.info('Render body pixel differences:', { kind, coreDifference, allDifference });
			expect(coreDifference).toBeLessThanOrEqual(5);
			if (kind === 'pool') expect(allDifference).toBeLessThanOrEqual(2);
		}
		expect(gl.getError()).toBe(gl.NO_ERROR);
	} finally { gl.deleteProgram(oldDensity.program); gl.deleteProgram(oldComposite.program); engine.dispose(); }
}, 120_000);

describe('render-only connected liquid mixing', () => {
	it('mixes layered pools with KM, isolates stone basins and preserves falling gold', async () => {
		const { engine, gl, canvas } = setup(640, 480);
		const baseline = setup(64, 48);
		const internals = engine as unknown as {
			programs: Map<string, ReturnType<typeof makeProgram>>;
		};
		const current = internals.programs.get('composite')!;
		const vertex = compileShader(gl, gl.VERTEX_SHADER, liquidShaders.FULLSCREEN);
		const fragment = compileShader(
			gl,
			gl.FRAGMENT_SHADER,
			liquidShaders.COMPOSITE_FS.replace('weights = mix(weights, mixed.rgb / max(dot(mixed.rgb, vec3(1.0)), 1e-6), mixing);', '')
		);
		const legacy = makeProgram(gl, vertex, fragment);
		gl.deleteShader(vertex);
		gl.deleteShader(fragment);
		const lut = mixtureLut(PALETTE);
		const srgb = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);
		const hue = (rgb: number[]) => {
			const [r, g, b] = rgb,
				hi = Math.max(...rgb),
				lo = Math.min(...rgb),
				d = hi - lo;
			if (d < 1e-6) return 0;
			return ((hi === r ? (g - b) / d : hi === g ? (b - r) / d + 2 : (r - g) / d + 4) / 6 + 1) % 1;
		};
		const hueDistance = (a: number, b: number) => Math.min(Math.abs(a - b), 1 - Math.abs(a - b));
		const expected = (sap: number) => {
			const x = sap * 63,
				left = Math.floor(x),
				f = x - left;
			return hue([0, 1, 2].map((c) => srgb(lut[left * 4 + c] * (1 - f) + lut[Math.min(63, left + 1) * 4 + c] * f)));
		};
		let gridWidth = 64,
			gridHeight = 48;
		function sample(pixels: Uint8ClampedArray, x: number, y: number) {
			const at = (Math.floor((y * canvas.height) / gridHeight) * canvas.width + Math.floor((x * canvas.width) / gridWidth)) * 4;
			expect(pixels[at + 3]).toBeGreaterThan(200);
			return hue(Array.from(pixels.subarray(at, at + 3)));
		}
		try {
			for (const kind of ['mixed-pool', 'divided-basins', 'stream-into-pool', 'single-species', 'two-springs-urn']) {
				const s = scene(64, 48);
				paint(s, rect(0, 44, 64, 4));
				paint(s, rect(0, 0, 2, 44));
				paint(s, rect(62, 0, 2, 44));
				paint(s, rect(18, 0, 2, 44));
				paint(s, rect(44, 0, 2, 44));
				if (kind === 'divided-basins') {
					paint(s, rect(30, 0, 4, 44));
					s.fills = [
						{ species: 0, rect: rect(20, 24, 10, 20), markers: 800 },
						{ species: 1, rect: rect(34, 24, 10, 20), markers: 800 }
					];
				} else if (kind === 'mixed-pool') {
					s.fills = [
						{ species: 0, rect: rect(20, 20, 24, 12), markers: 1152 },
						{ species: 1, rect: rect(20, 32, 24, 12), markers: 1152 }
					];
				} else s.fills = [{ species: 0, rect: rect(20, 32, 24, 12), markers: 1152 }];
				s.sensors = [
					{ id: 'all', rect: rect(0, 0, 64, 48) },
					{ id: 'lower', rect: rect(20, 36, 24, 8) }
				];
				if (kind === 'two-springs-urn') {
					// Current game urn (20,17,6,5) LU, four solver cells per LU.
					s.width = 192;
					s.height = 120;
					s.terrain = new Uint8Array(192 * 120);
					paint(s, rect(76, 68, 4, 24));
					paint(s, rect(104, 68, 4, 24));
					paint(s, rect(76, 88, 32, 4));
					s.fills = [
						{ species: 0, rect: rect(80, 68, 12, 20), markers: 832 },
						{ species: 1, rect: rect(92, 68, 12, 20), markers: 832 }
					];
					s.sensors = [{ id: 'green-urn', rect: rect(80, 68, 24, 20) }];
				}
				gridWidth = s.width;
				gridHeight = s.height;
				engine.load(s);
				baseline.engine.load(s);
				for (let tick = 0; tick < 120; tick++) {
					const input = {
						tick,
						edits: [],
						emit:
							kind === 'stream-into-pool' && tick >= 60
								? [
										{
											species: 1 as const,
											count: 6,
											rect: rect(30, 2, 4, 4),
											velocity: { x: 0, y: 20 }
										}
								  ]
								: []
					};
					engine.step(input);
					baseline.engine.step(input);
					engine.render({ time: tick / 60 });
					if (tick === 118) {
						await finish(engine, gl);
						await finish(baseline.engine, baseline.gl);
					} else if (tick % 8 === 7 && tick !== 119) {
						await yieldGpu();
						engine.pollSensors();
						baseline.engine.pollSensors();
					}
				}
				const frames = await finish(engine, gl),
					reference = await finish(baseline.engine, baseline.gl);
				const latest = frames.at(-1)!,
					original = reference.at(-1)!;
				expect(latest.tick).toBe(119);
				expect(original.tick).toBe(119);
				expect(latest.sensors).toEqual(original.sensors);
				expect(latest.alive).toEqual(original.alive);
				conserved(latest);
				const particles = engine._debugParticles(),
					untouched = baseline.engine._debugParticles();
				expect(particles.a.subarray(0, particles.slots * 4)).toEqual(untouched.a.subarray(0, untouched.slots * 4));
				expect(particles.b.subarray(0, particles.slots * 4)).toEqual(untouched.b.subarray(0, untouched.slots * 4));
				const images: Uint8ClampedArray[] = [];
				for (const version of ['before', 'after']) {
					internals.programs.set('composite', version === 'before' ? legacy : current);
					engine.render({ time: 2 });
					const image = document.createElement('canvas');
					image.width = canvas.width;
					image.height = canvas.height;
					const ctx = image.getContext('2d')!;
					ctx.drawImage(canvas, 0, 0);
					images.push(ctx.getImageData(0, 0, image.width, image.height).data);
					ctx.globalCompositeOperation = 'destination-over';
					ctx.fillStyle = '#0f2a2e';
					ctx.fillRect(0, 0, image.width, image.height);
					await output.writeBenchBase64(`/tmp/verdigris-mix/${kind}-${version}.png`, image.toDataURL('image/png').split(',')[1]);
				}
				internals.programs.set('composite', current);
				if (kind === 'stream-into-pool') {
					engine.resize(282, 211);
					engine.render({ time: 2 });
					const scaleImage = document.createElement('canvas');
					scaleImage.width = 282;
					scaleImage.height = 211;
					const ctx = scaleImage.getContext('2d')!;
					ctx.fillStyle = '#0f2a2e';
					ctx.fillRect(0, 0, 282, 211);
					ctx.drawImage(canvas, 0, 0);
					await output.writeBenchBase64('/tmp/verdigris-mix/stream-game-scale-after.png', scaleImage.toDataURL('image/png').split(',')[1]);
					engine.resize(640, 480);
				}
				const after = images[1];
				if (kind === 'mixed-pool') {
					const hues = [
						rect(24, 20, 1, 1),
						rect(39, 20, 1, 1),
						rect(24, 25, 1, 1),
						rect(39, 25, 1, 1),
						rect(24, 39, 1, 1),
						rect(39, 39, 1, 1)
					].map(({ x, y }) => sample(after, x, y));
					console.info('Layered pool KM hues:', {
						expected: expected(0.5),
						hues
					});
					for (const h of hues) expect(hueDistance(h, expected(0.5))).toBeLessThan(0.045);
				} else if (kind === 'divided-basins') {
					for (const y of [29, 38]) {
						expect(hueDistance(sample(after, 28, y), expected(0))).toBeLessThan(0.025);
						expect(hueDistance(sample(after, 36, y), expected(1))).toBeLessThan(0.025);
					}
				} else if (kind === 'stream-into-pool') {
					for (const y of [10, 18, 24]) expect(hueDistance(sample(after, 32, y), expected(1))).toBeLessThan(0.025);
				} else if (kind === 'two-springs-urn') {
					for (const x of [84, 100]) for (const y of [76, 84]) expect(hueDistance(sample(after, x, y), expected(0.5))).toBeLessThan(0.045);
				} else {
					let difference = 0;
					for (let i = 0; i < after.length; i++) difference = Math.max(difference, Math.abs(after[i] - images[0][i]));
					console.info('Single-species mixing pixel difference:', difference);
					expect(difference).toBeLessThanOrEqual(2);
				}
				expect(gl.getError()).toBe(gl.NO_ERROR);
				expect(baseline.gl.getError()).toBe(baseline.gl.NO_ERROR);
			}
		} finally {
			internals.programs.set('composite', current);
			gl.deleteProgram(legacy.program);
			engine.dispose();
			baseline.engine.dispose();
		}
	}, 120_000);
});
