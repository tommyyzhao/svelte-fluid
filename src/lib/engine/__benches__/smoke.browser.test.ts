import { afterEach, describe, expect, it } from 'vitest';
import { FluidEngine, _setContextTier } from '../FluidEngine.js';
import { softwareGL } from './renderer.js';

afterEach(() => _setContextTier('auto'));

describe('FluidEngine smoke boot (WebGL2)', () => {
	// Hardware-only: renderer assertion + requireHardwareAcceleration reject software GL.
	// Context-tier/disposal coverage still runs on software GL in shared-context.browser.test.ts.
	it.skipIf(softwareGL)('constructs on its own WebGL2 canvas context below the tier limit [hardware: non-software renderer and requireHardwareAcceleration]', () => {
		const canvas = document.createElement('canvas');
		canvas.width = 64;
		canvas.height = 64;
		const engine = new FluidEngine({ canvas, config: { pointerInput: false } });
		expect(engine.sharedContext).toBe(false);
		expect(canvas.getContext('webgl2')).toBeTruthy();
		const gl = canvas.getContext('webgl2')!;
		const debug = gl.getExtension('WEBGL_debug_renderer_info')!;
		const renderer = String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL));
		console.log('RELEASE_GATE_RENDERER', renderer);
		expect(renderer).not.toMatch(/swiftshader|llvmpipe|software/i);
		engine.dispose();
		// Even when the shared tier is selected, hardware-required engines own their context.
		_setContextTier('shared');
		const hw = new FluidEngine({ canvas: document.createElement('canvas'), autoStart: false, config: { pointerInput: false, requireHardwareAcceleration: true } });
		try { expect(hw.sharedContext).toBe(false); }
		finally { hw.dispose(); }
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
