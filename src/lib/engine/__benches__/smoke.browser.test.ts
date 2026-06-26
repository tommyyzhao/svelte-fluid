import { describe, expect, it } from 'vitest';
import { FluidEngine } from '../FluidEngine.js';

describe('FluidEngine smoke boot (WebGL2)', () => {
	it('constructs on a real canvas and exposes a WebGL2 context', () => {
		const canvas = document.createElement('canvas');
		canvas.width = 64;
		canvas.height = 64;

		const engine = new FluidEngine({
			canvas,
			config: { pointerInput: false }
		});

		const gl = canvas.getContext('webgl2');
		expect(gl).toBeTruthy();
		engine.dispose();
	});
});

