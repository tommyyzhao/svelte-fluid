import { afterEach, describe, expect, it, vi } from 'vitest';
import { LabSession } from './LabSession.js';
import type { LiquidExperiment } from './types.js';

const frames = async (count = 4) => { for (let i = 0; i < count; i++) await new Promise<void>((resolve) => requestAnimationFrame(() => resolve())); };
afterEach(() => vi.restoreAllMocks());

async function fixture() {
	expect(navigator.gpu, 'Use an ordinary hardware WebGPU browser').toBeDefined();
	const canvas = document.createElement('canvas'); canvas.style.cssText = 'width:320.25px;height:180.25px'; document.body.append(canvas);
	const session = await LabSession.create(canvas, () => {}, 'premultiplied');
	let callbacks = 0, renders = 0, steps = 0;
	const tick = (session as unknown as { tick: FrameRequestCallback }).tick;
	const request = window.requestAnimationFrame.bind(window);
	vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => request((time) => { if (callback === tick) callbacks++; callback(time); }));
	const model: LiquidExperiment = {
		memoryBytes: 0, resize() {}, reset() {}, step() { steps++; },
		render(encoder, target) { renders++; const pass = encoder.beginRenderPass({ colorAttachments: [{ view: target, loadOp: 'clear', storeOp: 'store', clearValue: [0.2, 0.4, 0.6, 1] }] }); pass.end(); },
		async inspect() { return { finite: true, mass: 0, initialMass: 0, min: 0, max: 0, kinetic: 0, details: { renders, steps } }; }, dispose() {}
	};
	session.pause(); await session.load(async () => model);
	return { session, canvas, counts: () => ({ callbacks, renders, steps }), dispose() { session.dispose(); canvas.remove(); } };
}

describe('hardware-backed demand-driven lab clock', () => {
	it('has zero idle JavaScript callbacks and gives each paused invalidation only one native presentation', async () => {
		const f = await fixture();
		try {
			await frames(); expect(f.counts()).toEqual({ callbacks: 1, renders: 1, steps: 0 });
			await frames(12); expect(f.counts()).toEqual({ callbacks: 1, renders: 1, steps: 0 });
			f.session.invalidate(); f.session.invalidate(); await frames(); expect(f.counts()).toEqual({ callbacks: 2, renders: 2, steps: 0 });
			f.session.resize(321.25, 180.25); await frames(); expect(f.counts()).toEqual({ callbacks: 3, renders: 3, steps: 0 });
			f.session.reset(); await frames(); expect(f.counts()).toEqual({ callbacks: 4, renders: 4, steps: 0 });
			expect(f.session.state.error).toBe('');
		} finally { f.dispose(); }
	});
	it('restarts on actual unpause, cancels clean pause, and presents hidden dirty state exactly once on return', async () => {
		let hidden = false; vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
		const f = await fixture();
		try {
			await frames(); f.session.pause(); await frames(6); expect(f.counts().steps).toBeGreaterThan(0);
			f.session.pause(); const stopped = f.counts(); await frames(10); expect(f.counts()).toEqual(stopped);
			hidden = true; document.dispatchEvent(new Event('visibilitychange')); f.session.invalidate(); await frames(10); expect(f.counts()).toEqual(stopped);
			hidden = false; document.dispatchEvent(new Event('visibilitychange')); await frames(6);
			expect(f.counts()).toEqual({ ...stopped, callbacks: stopped.callbacks + 1, renders: stopped.renders + 1 });
			const returned = f.counts(); await frames(10); expect(f.counts()).toEqual(returned); expect(f.session.state.error).toBe('');
		} finally { hidden = false; f.dispose(); }
	});
	it('runs an explicit measurement without RAF polling and rearms one paused result, then owns no callbacks after disposal', async () => {
		const f = await fixture();
		try {
			await frames(); const before = f.counts(); const result = await f.session.measure();
			expect(result.snapshot.finite).toBe(true); await frames(8);
			expect(f.counts()).toEqual({ callbacks: before.callbacks + 1, renders: before.renders + 31, steps: before.steps + 70 });
			const final = f.counts(); f.dispose(); document.dispatchEvent(new Event('visibilitychange')); await frames(10);
			expect(f.counts()).toEqual(final);
		} finally { f.dispose(); }
	});
});
