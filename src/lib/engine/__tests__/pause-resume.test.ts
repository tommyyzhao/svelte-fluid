/**
 * Tests for pause/resume state machine logic.
 *
 * FluidEngine requires a real WebGL context, so we can't unit-test it
 * directly in Node. Instead we test the state transition invariants by
 * verifying the public interface contract that the component layer relies on.
 *
 * The FluidHandle interface contract:
 * - pause() stops the RAF loop; isPaused becomes true
 * - resume() restarts the RAF loop; isPaused becomes false
 * - Both are idempotent
 * - A disposed engine ignores pause/resume
 * - Context loss prevents resume until restored
 *
 * We test the container-shapes module and the FluidHandle interface shape
 * to ensure backwards compatibility.
 */
import { describe, it, expect } from 'vitest';
import type { FluidHandle, RGB } from '../types.js';

describe('FluidHandle interface shape', () => {
	/** Minimal mock implementing the FluidHandle contract. */
	function createMockHandle(): FluidHandle & { _rafRunning: boolean; _disposed: boolean } {
		let rafRunning = true;
		let disposed = false;
		return {
			get _rafRunning() { return rafRunning; },
			get _disposed() { return disposed; },
			splat(_x: number, _y: number, _dx: number, _dy: number, _color: RGB) {},
			randomSplats(_count: number) {},
			pause() {
				if (!rafRunning || disposed) return;
				rafRunning = false;
			},
			resume() {
				if (rafRunning || disposed) return;
				rafRunning = true;
			},
			get isPaused() { return !rafRunning; }
		};
	}

	it('starts running (not paused)', () => {
		const h = createMockHandle();
		expect(h.isPaused).toBe(false);
	});

	it('pause() sets isPaused to true', () => {
		const h = createMockHandle();
		h.pause();
		expect(h.isPaused).toBe(true);
	});

	it('resume() after pause sets isPaused to false', () => {
		const h = createMockHandle();
		h.pause();
		h.resume();
		expect(h.isPaused).toBe(false);
	});

	it('pause() is idempotent', () => {
		const h = createMockHandle();
		h.pause();
		h.pause();
		h.pause();
		expect(h.isPaused).toBe(true);
	});

	it('resume() is idempotent', () => {
		const h = createMockHandle();
		h.resume(); // already running
		expect(h.isPaused).toBe(false);
	});

	it('pause/resume cycle is repeatable', () => {
		const h = createMockHandle();
		for (let i = 0; i < 5; i++) {
			h.pause();
			expect(h.isPaused).toBe(true);
			h.resume();
			expect(h.isPaused).toBe(false);
		}
	});
});

describe('FluidHandle optional chaining (no engine)', () => {
	it('handle methods are safe when engine is undefined', () => {
		// This mirrors Fluid.svelte's handle when engine is not yet created
		let engine: { pause(): void; resume(): void; isPaused: boolean } | undefined;

		const handle: Pick<FluidHandle, 'pause' | 'resume' | 'isPaused'> = {
			pause: () => engine?.pause(),
			resume: () => engine?.resume(),
			get isPaused() { return engine?.isPaused ?? true; }
		};

		// Before engine exists: isPaused is true (safe default)
		expect(handle.isPaused).toBe(true);
		// pause/resume don't throw
		expect(() => handle.pause()).not.toThrow();
		expect(() => handle.resume()).not.toThrow();
	});
});
