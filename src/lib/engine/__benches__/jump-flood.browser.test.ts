import { describe, expect, it } from 'vitest';
import { FluidEngine } from '../FluidEngine.js';
import type { FluidConfig } from '../types.js';
import type { FBO } from '../internal-types.js';

interface Harness {
	gl: WebGL2RenderingContext;
	containerSdf: FBO | null;
	obstructionSdf: FBO | null;
	renderCore(target: FBO | null): void;
	initMaskTexture(): void;
}

// Circle of radius 40 centred in a 100×100 viewBox.
const CIRCLE = 'M50 10 A40 40 0 1 0 50 90 A40 40 0 1 0 50 10 Z';

function setup(size: number, extra: FluidConfig) {
	const canvas = document.createElement('canvas');
	canvas.width = canvas.height = size;
	const engine = new FluidEngine({
		canvas,
		autoStart: false,
		config: {
			initialSplatCount: 0, pointerInput: false, simResolution: 32, dyeResolution: 128,
			shading: false, bloom: false, sunrays: false, densityDissipation: 0, transparent: true, ...extra
		}
	});
	return { engine, h: engine as unknown as Harness };
}

function readSdf(gl: WebGL2RenderingContext, sdf: FBO): Float32Array {
	const px = new Float32Array(sdf.width * sdf.height * 4);
	gl.bindFramebuffer(gl.FRAMEBUFFER, sdf.fbo);
	gl.readPixels(0, 0, sdf.width, sdf.height, gl.RGBA, gl.FLOAT, px);
	const out = new Float32Array(sdf.width * sdf.height);
	for (let i = 0; i < out.length; i++) out[i] = px[i * 4];
	return out;
}

/**
 * Partial-coverage pixels across the right-hand edge of the centre row. In
 * reveal mode with no dye the output alpha is exactly the display mask.
 */
function edgeWidth(gl: WebGL2RenderingContext, size: number, row: number): number {
	const px = new Uint8Array(size * 4);
	gl.readPixels(0, row, size, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
	const alpha = Array.from({ length: size }, (_, i) => px[i * 4 + 3]);
	expect(Math.max(...alpha)).toBe(255);
	expect(Math.min(...alpha)).toBe(0);
	return alpha.slice(size / 2).filter((a) => a > 12 && a < 243).length;
}

describe('jump-flood SDF (ADR-0084)', () => {
	it('reads back a circle mask SDF within ~1 texel RMS of the analytic distance', () => {
		const { engine, h } = setup(256, { containerShape: { type: 'svgPath', d: CIRCLE } });
		try {
			const sdf = h.containerSdf!;
			expect(sdf).toBeTruthy();
			expect(sdf.width).toBe(512);
			const d = readSdf(h.gl, sdf);
			const r = 40 * (512 / 100);
			let sq = 0;
			let n = 0;
			let worstNearEdge = 0;
			for (let y = 0; y < 512; y++)
				for (let x = 0; x < 512; x++) {
					const truth = Math.hypot(x + 0.5 - 256, y + 0.5 - 256) - r;
					const e = d[y * 512 + x] - truth;
					expect(Number.isFinite(d[y * 512 + x])).toBe(true);
					sq += e * e;
					n++;
					if (Math.abs(truth) < 4) worstNearEdge = Math.max(worstNearEdge, Math.abs(e));
				}
			const rms = Math.sqrt(sq / n);
			console.info(`[jfa] circle SDF rms=${rms.toFixed(3)} texel, worst |e| within 4 texels of edge=${worstNearEdge.toFixed(3)}`);
			expect(rms).toBeLessThan(1);
			expect(worstNearEdge).toBeLessThan(1);
			expect(h.gl.getError()).toBe(h.gl.NO_ERROR);
		} finally {
			engine.dispose();
		}
	});

	it('anti-aliases svgPath, analytic and obstruction edges over ~1 device px at DPR 1 and 3', () => {
		for (const dpr of [1, 3]) {
			const size = 128 * dpr;
			const cases: FluidConfig[] = [
				{ containerShape: { type: 'svgPath', d: CIRCLE } },
				{ containerShape: { type: 'circle', cx: 0.5, cy: 0.5, radius: 0.4 } },
				{ obstructions: [{ d: CIRCLE }] }
			];
			for (const extra of cases) {
				const { engine, h } = setup(size, { reveal: true, ...extra });
				try {
					h.renderCore(null);
					const width = edgeWidth(h.gl, size, size / 2);
					console.info(`[jfa] dpr=${dpr} ${Object.keys(extra)[0]} ${JSON.stringify(extra).slice(0, 40)} edge=${width}px`);
					expect(width).toBeGreaterThanOrEqual(1);
					expect(width).toBeLessThanOrEqual(2);
				} finally {
					engine.dispose();
				}
			}
		}
	});

	it('rebuilds a 1024² SDF only on mask change, reusing its framebuffer', () => {
		const { engine, h } = setup(256, { containerShape: { type: 'svgPath', d: CIRCLE, maskResolution: 1024 } });
		try {
			const gl = h.gl;
			const first = h.containerSdf!;
			expect(first.width).toBe(1024);
			const one = new Float32Array(4);
			const times: number[] = [];
			for (let i = 0; i < 5; i++) {
				const t0 = performance.now();
				h.initMaskTexture();
				gl.bindFramebuffer(gl.FRAMEBUFFER, h.containerSdf!.fbo);
				gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.FLOAT, one);
				times.push(performance.now() - t0);
			}
			times.sort((a, b) => a - b);
			console.info(`[jfa] 1024² mask rasterize+upload+JFA median=${times[2].toFixed(2)}ms min=${times[0].toFixed(2)}ms`);
			expect(h.containerSdf).toBe(first);

			let creates = 0;
			const create = gl.createFramebuffer.bind(gl);
			Object.defineProperty(gl, 'createFramebuffer', { configurable: true, value: () => { creates++; return create(); } });
			for (let i = 0; i < 3; i++) h.renderCore(null);
			engine.setConfig({ curl: 5 });
			h.renderCore(null);
			expect(creates).toBe(0);
			engine.setConfig({ containerShape: { type: 'circle', cx: 0.5, cy: 0.5, radius: 0.3 } });
			expect(h.containerSdf).toBeNull();
			expect(gl.getError()).toBe(gl.NO_ERROR);
		} finally {
			engine.dispose();
		}
	});

	it('rebuilds the SDFs after context loss and restore', async () => {
		const { engine, h } = setup(128, {
			containerShape: { type: 'svgPath', d: CIRCLE },
			obstructions: [{ d: 'M40 40 L60 40 L60 60 L40 60 Z' }]
		});
		try {
			const lose = h.gl.getExtension('WEBGL_lose_context')!;
			const canvas = h.gl.canvas as HTMLCanvasElement;
			const lost = new Promise((r) => canvas.addEventListener('webglcontextlost', r, { once: true }));
			lose.loseContext();
			await lost;
			// Chromium ignores restoreContext() inside the loss event's task.
			await new Promise((r) => setTimeout(r, 0));
			const restored = new Promise((r) => canvas.addEventListener('webglcontextrestored', r, { once: true }));
			lose.restoreContext();
			await restored;
			await new Promise((r) => setTimeout(r, 0));
			// Restore itself leaves a pre-existing INVALID_OPERATION queued even
			// without masks; drain it so the render below is checked in isolation.
			h.gl.getError();
			expect(h.containerSdf).toBeTruthy();
			expect(h.obstructionSdf).toBeTruthy();
			const d = readSdf(h.gl, h.containerSdf!);
			const w = h.containerSdf!.width;
			expect(d[(w / 2) * w + w / 2]).toBeLessThan(-100);
			expect(d[0]).toBeGreaterThan(30);
			h.renderCore(null);
			expect(h.gl.getError()).toBe(h.gl.NO_ERROR);
		} finally {
			engine.dispose();
		}
	});
});
