import { afterEach, describe, expect, it } from 'vitest';
import { FluidEngine, _setContextTier } from '../FluidEngine.js';
import { createFBO, disposeFBO } from '../gl-utils.js';
import type { FlowConfig } from '../types.js';
import { softwareGL } from './renderer.js';

/** Native `FlowSource.pulse` / `dyeCycle`: deterministic and clocked by solver time, not wall time. */

const SIZE = 128;
const live: FluidEngine[] = [];
afterEach(() => {
	for (const e of live.splice(0)) e.dispose();
	_setContextTier('auto');
});

interface Harness {
	gl: WebGL2RenderingContext;
	renderCore(target: unknown): void;
}

function flow(pulse: boolean): FlowConfig {
	return {
		mode: 'live',
		boundary: { left: 'open', right: 'open', top: 'wall', bottom: 'wall' },
		sources: [
			{
				kind: 'line', from: { x: 0.02, y: 0.4 }, to: { x: 0.02, y: 0.6 }, radius: 0.03, rate: 60, inflow: true,
				velocity: { x: 200, y: 0 },
				dye: { r: 1, g: 0, b: 0 },
				dyeCycle: { period: 0.5, colors: [{ r: 1, g: 0, b: 0 }, { r: 0, g: 0, b: 1 }] },
				...(pulse ? { pulse: { period: 0.3, floor: 0, sharpness: 12 } } : {})
			}
		]
	};
}

function make(pulse: boolean, autoStart = false): FluidEngine {
	_setContextTier(false);
	const canvas = document.createElement('canvas');
	canvas.width = SIZE;
	canvas.height = SIZE;
	document.body.append(canvas);
	const e = new FluidEngine({
		canvas,
		autoStart,
		config: {
			seed: 7, pointerInput: false, initialSplatCount: 0, autoSplatRate: 0,
			simResolution: 128, dyeResolution: 128, pressureIterations: 10, curl: 0,
			bloom: false, sunrays: false, shading: false, flow: flow(pulse)
		}
	});
	live.push(e);
	return e;
}

function hash(e: FluidEngine): string {
	const h = e as unknown as Harness;
	const t = createFBO(h.gl, SIZE, SIZE, h.gl.RGBA8, h.gl.RGBA, h.gl.UNSIGNED_BYTE, h.gl.NEAREST);
	try {
		h.renderCore(t);
		const px = new Uint8Array(SIZE * SIZE * 4);
		h.gl.bindFramebuffer(h.gl.FRAMEBUFFER, t.fbo);
		h.gl.readPixels(0, 0, SIZE, SIZE, h.gl.RGBA, h.gl.UNSIGNED_BYTE, px);
		let x = 0x811c9dc5;
		for (const b of px) x = Math.imul(x ^ b, 0x01000193) >>> 0;
		return x.toString(16);
	} finally {
		disposeFBO(h.gl, t);
	}
}

describe.skipIf(softwareGL)('FlowSource pulse', () => {
	it('is deterministic for the same seed and steps', () => {
		const a = make(true);
		const b = make(true);
		a.advance(240, 1 / 240);
		b.advance(240, 1 / 240);
		expect(hash(a)).toBe(hash(b));
	});

	it('changes the flow when the pulse is removed', () => {
		const a = make(true);
		const b = make(false);
		a.advance(240, 1 / 240);
		b.advance(240, 1 / 240);
		expect(hash(a)).not.toBe(hash(b));
	});

	it('does not advance while paused, whatever the wall time', async () => {
		// The rendered hash carries wall-clock shader time when autoStart is on, so assert the solver clock.
		const e = make(true, true);
		const clock = () => (e as unknown as { simTime: number }).simTime;
		e.advance(60, 1 / 240);
		e.pause();
		const before = clock();
		expect(before).toBeCloseTo(0.25, 6);
		await new Promise((r) => setTimeout(r, 500));
		expect(clock()).toBe(before);
	});
});
