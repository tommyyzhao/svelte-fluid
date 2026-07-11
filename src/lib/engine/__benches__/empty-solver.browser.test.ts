import { describe, expect, it } from 'vitest';
import { FluidEngine } from '../FluidEngine.js';
import type { FluidConfig } from '../types.js';

const BASE = {
	pointerInput: false,
	initialSplatCount: 0,
	simResolution: 32,
	dyeResolution: 32,
	pressureIterations: 2,
	curl: 0,
	shading: false,
	bloom: false,
	sunrays: false
} satisfies FluidConfig;

function countedEngine(config: FluidConfig = {}) {
	const canvas = document.createElement('canvas');
	canvas.width = 64;
	canvas.height = 64;
	const gl = canvas.getContext('webgl2');
	if (!gl) throw new Error('WebGL2 is required for empty-solver tests');
	const drawElements = gl.drawElements.bind(gl);
	let draws = 0;
	Object.defineProperty(gl, 'drawElements', {
		configurable: true,
		value: (...args: Parameters<WebGL2RenderingContext['drawElements']>) => {
			draws++;
			drawElements(...args);
		}
	});
	const engine = new FluidEngine({ canvas, autoStart: false, config: { ...BASE, ...config } });
	return { engine, reset: () => { draws = 0; }, draws: () => draws };
}

function maxDifference(a: ArrayLike<number>, b: ArrayLike<number>): number {
	if (a.length !== b.length) return Number.POSITIVE_INFINITY;
	let max = 0;
	for (let i = 0; i < a.length; i++) max = Math.max(max, Math.abs(a[i] - b[i]));
	return max;
}

describe('provably empty solver skip', () => {
	it('submits zero solver draws until the first input, then stays active', () => {
		const { engine, reset, draws } = countedEngine();
		try {
			reset();
			engine.advance(10, 1 / 120);
			expect(draws()).toBe(0);
			engine.splat(0.5, 0.5, 0, 0, { r: 0, g: 0, b: 0 });
			reset();
			engine.advance(1, 1 / 120);
			expect(draws()).toBeGreaterThan(0);
		} finally {
			engine.dispose();
		}
	});

	it('never false-idles sources, forces, or prescribed grids', () => {
		const configs: FluidConfig[] = [
			{ flow: { sources: [{ kind: 'point', x: 0.5, y: 0.5, velocity: { x: 1, y: 0 } }] } },
			{ flow: { forces: [{ kind: 'gravity', vector: { x: 0, y: -1 } }] } },
			{ flow: { prescribed: { kind: 'grid', velocity: { width: 1, height: 1, data: [0, 0] } }, mode: 'prescribed' } }
		];
		for (const config of configs) {
			const { engine, reset, draws } = countedEngine(config);
			try {
				reset();
				engine.advance(1, 1 / 120);
				expect(draws()).toBeGreaterThan(0);
			} finally {
				engine.dispose();
			}
		}

		const outlet = countedEngine({ flow: { boundary: { right: 'open' }, outlets: [{ edge: 'right' }] } });
		try {
			outlet.reset();
			outlet.engine.advance(2, 1 / 120);
			expect(outlet.draws()).toBe(0);
		} finally {
			outlet.engine.dispose();
		}
	});

	it('preserves simulation time and post-activation output versus an active-zero control', () => {
		const skipped = countedEngine();
		const control = countedEngine();
		try {
			control.engine.splat(0.5, 0.5, 0, 0, { r: 0, g: 0, b: 0 });
			skipped.engine.advance(20, 1 / 120);
			control.engine.advance(20, 1 / 120);
			for (const engine of [skipped.engine, control.engine]) {
				engine.splat(0.4, 0.5, 180, 0, { r: 1, g: 0.2, b: 0.1 });
				engine.advance(8, 1 / 120);
			}
			expect(maxDifference(skipped.engine.readField('velocity').data, control.engine.readField('velocity').data)).toBeLessThan(1e-6);
			expect(maxDifference(skipped.engine.readField('dye').data, control.engine.readField('dye').data)).toBeLessThan(1e-6);
		} finally {
			skipped.engine.dispose();
			control.engine.dispose();
		}
	});
});
