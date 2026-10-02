import { afterEach, describe, expect, it } from 'vitest';
import { FluidEngine, _setContextTier } from '../FluidEngine.js';

afterEach(() => _setContextTier('auto'));

describe('FluidEngine smoke boot (WebGL2)', () => {
	it('constructs on its own WebGL2 canvas context below the tier limit', () => {
		const canvas = document.createElement('canvas');
		canvas.width = 64;
		canvas.height = 64;
		const engine = new FluidEngine({ canvas, config: { pointerInput: false } });
		expect(engine.sharedContext).toBe(false);
		expect(canvas.getContext('webgl2')).toBeTruthy();
		engine.dispose();
	});

	it('constructs on the shared WebGL2 host', () => {
		const canvas = document.createElement('canvas');
		canvas.width = 64;
		canvas.height = 64;
		_setContextTier('shared');
		const engine = new FluidEngine({ canvas, config: { pointerInput: false } });
		// ADR-0093: shared-tier instances render on the hidden gl-host context
		// and present to their own canvas through a bitmaprenderer.
		expect(engine.sharedContext).toBe(true);
		expect((engine as unknown as { gl: unknown }).gl).toBeInstanceOf(WebGL2RenderingContext);
		expect(canvas.getContext('bitmaprenderer')).toBeTruthy();
		engine.dispose();
	});
});
