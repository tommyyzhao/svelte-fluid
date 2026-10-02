import { describe, expect, it } from 'vitest';
import { FluidEngine } from '../FluidEngine.js';
import { createFBO, disposeFBO } from '../gl-utils.js';
import type { FBO } from '../types.js';

interface Harness {
	gl: WebGL2RenderingContext;
	renderCore(target: FBO | null): void;
}

function setup(extra = {}) {
	const canvas = document.createElement('canvas');
	canvas.width = canvas.height = 64;
	const engine = new FluidEngine({ canvas, autoStart: false, config: {
		initialSplatCount: 0, pointerInput: false, simResolution: 32, dyeResolution: 64,
		shading: false, bloom: false, sunrays: false, densityDissipation: 0, ...extra
	} });
	return { engine, harness: engine as unknown as Harness };
}

describe('display pipeline readback', () => {
	it('opt-in Neutral rolls bright HDR splats below white in a floating display target; hot keywords allocate no FBOs', () => {
		const { engine, harness } = setup({ toneMapping: 'neutral' as const });
		const gl = harness.gl;
		const target = createFBO(gl, 64, 64, gl.RGBA32F, gl.RGBA, gl.FLOAT, gl.NEAREST);
		try {
			engine.splat(0.5, 0.5, 0, 0, { r: 4, g: 1, b: 0.3 });
			engine.advance(1, 1 / 60);
			harness.renderCore(target);
			const pixel = new Float32Array(4);
			gl.readPixels(32, 32, 1, 1, gl.RGBA, gl.FLOAT, pixel);
			for (const v of pixel) expect(Number.isFinite(v)).toBe(true);
			expect(Math.max(...pixel.slice(0, 3))).toBeLessThan(1);
			expect(Math.max(...pixel.slice(0, 3))).toBeGreaterThan(0.7);
			let creates = 0;
			let deletes = 0;
			const create = gl.createFramebuffer.bind(gl);
			const del = gl.deleteFramebuffer.bind(gl);
			Object.defineProperty(gl, 'createFramebuffer', { configurable: true, value: () => { creates++; return create(); } });
			Object.defineProperty(gl, 'deleteFramebuffer', { configurable: true, value: (f: WebGLFramebuffer | null) => { deletes++; del(f); } });
			for (const toneMapping of ['agx', 'none', 'neutral'] as const) {
				engine.setConfig({ toneMapping });
				harness.renderCore(target);
				gl.readPixels(32, 32, 1, 1, gl.RGBA, gl.FLOAT, pixel);
				for (const v of pixel) expect(Number.isFinite(v)).toBe(true);
				expect(Math.max(...pixel.slice(0, 3))).toBeLessThanOrEqual(1);
			}
			expect(creates).toBe(0);
			expect(deletes).toBe(0);
			expect(gl.getError()).toBe(gl.NO_ERROR);
		} finally { disposeFBO(gl, target); engine.dispose(); }
	});
	it('paints a dark obstruction fill opaque over a transparent canvas', () => {
		const { engine, harness } = setup({
			transparent: true,
			obstructions: [{ d: 'M0 0 L100 0 L100 100 L0 100 Z', fit: 'fill' as const }],
			obstructionColor: { r: 0, g: 0, b: 0 }
		});
		try {
			harness.renderCore(null);
			const gl = harness.gl;
			const px = new Uint8Array(4);
			gl.readPixels(32, 32, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
			expect(px[3]).toBe(255);
			expect(Math.max(px[0], px[1], px[2])).toBeLessThanOrEqual(1);
		} finally { engine.dispose(); }
	});
	it('keeps empty transparent pixels zero and every colour premultiplied', () => {
		for (const extra of [{ transparent: true }, { reveal: true, revealSensitivity: 10 }, {
			transparent: true, glass: true,
			containerShape: { type: 'circle' as const, cx: 0.5, cy: 0.5, radius: 0.4 }
		}]) {
			const { engine, harness } = setup(extra);
			try {
				engine.splat(0.5, 0.5, 0, 0, { r: 2, g: 0.2, b: 0.1 });
				engine.advance(1, 1 / 60);
				harness.renderCore(null);
				const pixels = new Uint8Array(64 * 64 * 4);
				const gl = harness.gl;
				gl.readPixels(0, 0, 64, 64, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
				for (let i = 0; i < pixels.length; i += 4) {
					for (let c = 0; c < 3; c++) expect(pixels[i + c]).toBeLessThanOrEqual(pixels[i + 3]);
				}
				expect(gl.getError()).toBe(gl.NO_ERROR);
			} finally { engine.dispose(); }
		}
	});
});
