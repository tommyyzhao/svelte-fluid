import { describe, expect, it } from 'vitest';
import { FluidEngine } from '../FluidEngine.js';
import { createFBO, disposeFBO } from '../gl-utils.js';
import type { ExtInfo, FBO } from '../internal-types.js';

interface Harness {
	gl: WebGL2RenderingContext;
	ext: ExtInfo;
	bloom: FBO;
	bloomFramebuffers: FBO[];
	renderCore(target: FBO | null): void;
}

describe('rejected packed bloom appearance regression (ADR 0102)', () => {
	for (const color of [{ r: 0, g: 0, b: 10 }, { r: 12, g: 3, b: 8 }]) {
		it(`demonstrates packed blue/HDR ${JSON.stringify(color)} exceeds one native display LSB`, () => {
			const canvas = document.createElement('canvas');
			canvas.width = 2880; canvas.height = 1800;
			const engine = new FluidEngine({ canvas, autoStart: false, config: {
				seed: 5, initialSplatCount: 0, pointerInput: false, sunrays: false,
				bloom: true, bloomResolution: 256, bloomIterations: 8, dyeResolution: 1024,
				shading: false, bloomIntensity: 1, bloomThreshold: 0.48,
				densityDissipation: 0, curl: 0, pressure: 0
			} });
			const h = engine as unknown as Harness, gl = h.gl;
			const target = createFBO(gl, 2880, 1800, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.NEAREST);
			const reference = h.bloom, chain = h.bloomFramebuffers;
			const packed: FBO[] = [];
			try {
				engine.splat(0.4, 0.5, 0, 0, color);
				engine.splat(0.65, 0.65, 0, 0, { r: color.r * 0.1, g: color.g * 0.1, b: color.b * 0.1 });
				const read = () => {
					h.renderCore(target);
					const pixels = new Uint8Array(2880 * 1800 * 4);
					gl.readPixels(0, 0, 2880, 1800, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
					expect(gl.getError()).toBe(gl.NO_ERROR);
					return pixels;
				};
				const before = read();
				for (const fbo of [reference, ...chain]) packed.push(createFBO(gl, fbo.width, fbo.height, gl.R11F_G11F_B10F, gl.RGB, gl.UNSIGNED_INT_10F_11F_11F_REV, gl.LINEAR));
				h.bloom = packed[0]; h.bloomFramebuffers = packed.slice(1);
				const after = read();
				let max = 0, sum = 0, changed = 0;
				for (let i = 0; i < before.length; i++) {
					const d = Math.abs(before[i] - after[i]); max = Math.max(max, d); sum += d; if (d) changed++;
				}
				console.log(JSON.stringify({ color, maxLsb: max, meanLsb: sum / before.length, changedChannels: changed }));
				// Fixed appearance gate: packed blue has five mantissa bits versus fp16's ten;
				// no extra tolerance beyond one final display LSB is permitted.
				expect(max).toBeGreaterThan(1);
			} finally {
				h.bloom = reference; h.bloomFramebuffers = chain;
				for (const fbo of packed) disposeFBO(gl, fbo);
				disposeFBO(gl, target); engine.dispose();
			}
		});
	}
});
