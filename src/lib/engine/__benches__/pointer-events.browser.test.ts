import { describe, expect, it } from 'vitest';
import { FluidEngine } from '../FluidEngine.js';
import type { FluidConfig } from '../types.js';
import { fieldEnergy } from './reducers.js';

interface Internals {
	pointers: { down: boolean; id: number; moved: boolean }[];
	capturedPointers: Set<number>;
}

function setup(config: FluidConfig = {}) {
	const canvas = document.createElement('canvas');
	canvas.width = 128;
	canvas.height = 128;
	canvas.style.cssText = 'position:fixed;left:0;top:0;width:128px;height:128px';
	document.body.appendChild(canvas);
	const engine = new FluidEngine({
		canvas,
		config: { initialSplatCount: 0, ...config },
		autoStart: false
	});
	return {
		canvas,
		engine,
		internals: engine as unknown as Internals,
		done() {
			engine.dispose();
			canvas.remove();
		}
	};
}

const pe = (type: string, init: PointerEventInit) =>
	new PointerEvent(type, { bubbles: true, cancelable: true, isPrimary: true, ...init });

const energy = (engine: FluidEngine, field: 'velocity' | 'dye' = 'velocity') =>
	fieldEnergy(engine.readField(field).data);

function stroke(target: EventTarget, init: PointerEventInit, xs: number[], y = 64) {
	target.dispatchEvent(pe('pointerdown', { ...init, clientX: xs[0], clientY: y, buttons: 1 }));
	for (const x of xs.slice(1)) {
		target.dispatchEvent(pe('pointermove', { ...init, clientX: x, clientY: y, buttons: 1 }));
	}
}

// advance() skips queued pointer input; update() is the per-frame path that
// applies it (same harness as paused-dirty-render).
const run = (engine: FluidEngine) => {
	const harness = engine as unknown as { rafRunning: boolean; update(): void };
	harness.rafRunning = true;
	harness.update();
	harness.rafRunning = false;
	engine.advance(5, 1 / 60);
};

describe('Pointer Events input', () => {
	for (const pointerType of ['mouse', 'touch', 'pen'] as const) {
		it(`${pointerType} drag raises velocity and dye energy`, () => {
			const { canvas, engine, done } = setup();
			try {
				expect(energy(engine)).toBe(0);
				stroke(
					canvas,
					{ pointerType, pointerId: pointerType === 'mouse' ? 1 : 5, pressure: 0.5 },
					[20, 40, 60, 80, 100]
				);
				run(engine);
				expect(energy(engine)).toBeGreaterThan(0);
				expect(energy(engine, 'dye')).toBeGreaterThan(0);
			} finally {
				done();
			}
		});
	}

	it('hover splats for mouse and pen but never touch', () => {
		for (const [pointerType, expected] of [
			['mouse', true],
			['pen', true],
			['touch', false]
		] as const) {
			const { canvas, engine, done } = setup({ splatOnHover: true });
			try {
				for (const x of [20, 40, 60, 80]) {
					canvas.dispatchEvent(
						pe('pointermove', { pointerType, pointerId: 3, clientX: x, clientY: 64, buttons: 0 })
					);
				}
				run(engine);
				expect(energy(engine) > 0).toBe(expected);
			} finally {
				done();
			}
		}
	});

	it('does not splat on hover without splatOnHover', () => {
		const { canvas, engine, done } = setup();
		try {
			for (const x of [20, 40, 60, 80]) {
				canvas.dispatchEvent(
					pe('pointermove', { pointerType: 'mouse', pointerId: 1, clientX: x, clientY: 64 })
				);
			}
			run(engine);
			expect(energy(engine)).toBe(0);
		} finally {
			done();
		}
	});

	it('tracks two touches independently per pointerId', () => {
		const { canvas, engine, internals, done } = setup();
		try {
			canvas.dispatchEvent(
				pe('pointerdown', { pointerType: 'touch', pointerId: 11, clientX: 20, clientY: 30, buttons: 1 })
			);
			canvas.dispatchEvent(
				pe('pointerdown', { pointerType: 'touch', pointerId: 12, clientX: 20, clientY: 100, buttons: 1 })
			);
			for (const x of [40, 60, 80]) {
				canvas.dispatchEvent(
					pe('pointermove', { pointerType: 'touch', pointerId: 11, clientX: x, clientY: 30, buttons: 1 })
				);
			}
			const { pointers } = internals;
			expect(
				pointers
					.filter((p) => p.down)
					.map((p) => p.id)
					.sort()
			).toEqual([11, 12]);
			expect(pointers[1].moved).toBe(true);
			expect(pointers[2].moved).toBe(false);
			// Lifting one finger leaves the other down.
			window.dispatchEvent(pe('pointerup', { pointerType: 'touch', pointerId: 11 }));
			expect(pointers.filter((p) => p.down).map((p) => p.id)).toEqual([12]);
			run(engine);
			expect(energy(engine)).toBeGreaterThan(0);
		} finally {
			done();
		}
	});

	it('capture: strokes continue outside the canvas until release', () => {
		const { canvas, engine, internals, done } = setup();
		try {
			const id = 21;
			const captures: number[] = [];
			canvas.setPointerCapture = (pointerId: number) => {
				captures.push(pointerId);
			};
			canvas.dispatchEvent(
				pe('pointerdown', { pointerType: 'mouse', pointerId: id, clientX: 60, clientY: 64, buttons: 1 })
			);
			expect(captures).toEqual([id]);
			// Synthetic events cannot acquire real capture, so stand in for the
			// browser's retargeting: deliver moves to the canvas at coordinates
			// outside its bounds. The stroke must stay down and keep splatting at
			// the (clamped) positions, here just past the right edge.
			for (const x of [135, 145, 155, 400]) {
				canvas.dispatchEvent(
					pe('pointermove', { pointerType: 'mouse', pointerId: id, clientX: x, clientY: 64, buttons: 1 })
				);
			}
			expect(internals.pointers[0].down).toBe(true);
			expect(internals.pointers[0].moved).toBe(true);
			run(engine);
			expect(energy(engine)).toBeGreaterThan(0);
			// Release outside the canvas (window-level) ends the stroke.
			window.dispatchEvent(pe('pointerup', { pointerType: 'mouse', pointerId: id }));
			expect(internals.pointers[0].down).toBe(false);
			expect(internals.capturedPointers.has(id)).toBe(false);
			canvas.dispatchEvent(
				pe('pointermove', { pointerType: 'mouse', pointerId: id, clientX: 330, clientY: 64, buttons: 0 })
			);
			expect(internals.pointers[0].moved).toBe(false);
		} finally {
			done();
		}
	});

	it('window target receives events anywhere', () => {
		const { engine, done } = setup({ pointerTarget: 'window' });
		try {
			stroke(window, { pointerType: 'mouse', pointerId: 1 }, [10, 30, 50, 70]);
			run(engine);
			expect(energy(engine)).toBeGreaterThan(0);
		} finally {
			done();
		}
	});

	it('touch-action is none only while the canvas owns input', () => {
		const { canvas, engine, done } = setup();
		try {
			expect(canvas.style.touchAction).toBe('none');
			engine.setConfig({ pointerInput: false });
			expect(canvas.style.touchAction).toBe('');
			engine.setConfig({ pointerInput: true });
			expect(canvas.style.touchAction).toBe('none');
			engine.setConfig({ pointerTarget: 'window' });
			expect(canvas.style.touchAction).toBe('');
		} finally {
			done();
		}
	});
});
