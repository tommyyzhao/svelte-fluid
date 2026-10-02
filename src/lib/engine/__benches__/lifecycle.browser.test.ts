import { mount, unmount } from 'svelte';
import { page } from 'vitest/browser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Fluid from '../../Fluid.svelte';
import FluidBackground from '../../FluidBackground.svelte';
import FluidDistortion from '../../FluidDistortion.svelte';
import FluidReveal from '../../FluidReveal.svelte';
import FluidStick from '../../FluidStick.svelte';
import FluidText from '../../FluidText.svelte';
import { FluidEngine } from '../FluidEngine.js';
import { activeFrameSubscribers } from '../frame-scheduler.js';

/* ADR 0085: frame-failure fallback and the reduced-motion still. */

const PIXEL =
	'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

interface Handle {
	isPaused: boolean;
	resume(): void;
}
const live: { app: object; host: HTMLElement }[] = [];

/** matchMedia stub whose reduced-motion state the test can flip live. */
function stubReducedMotion(initial: boolean) {
	let matches = initial;
	const listeners = new Set<() => void>();
	vi.stubGlobal('matchMedia', (query: string) => ({
		get matches() {
			return query.includes('prefers-reduced-motion') ? matches : false;
		},
		media: query,
		addEventListener: (_: string, l: () => void) => listeners.add(l),
		removeEventListener: (_: string, l: () => void) => listeners.delete(l)
	}));
	return {
		set(value: boolean) {
			matches = value;
			for (const l of [...listeners]) l();
		}
	};
}

function host(width = 320, height = 240): HTMLElement {
	const el = document.createElement('div');
	el.style.cssText = `width:${width}px;height:${height}px;position:relative`;
	document.body.append(el);
	return el;
}

function render(component: unknown, props: Record<string, unknown>, el = host()) {
	const app = mount(component as never, { target: el, props }) as object & { handle: Handle };
	live.push({ app, host: el });
	return { app, el };
}

const frames = (count: number) =>
	new Promise<void>((resolve) => {
		const next = () => (count-- <= 0 ? resolve() : requestAnimationFrame(next));
		next();
	});

const SMALL = { simResolution: 64, dyeResolution: 128, seed: 7, initialSplatCount: 10 };

afterEach(() => {
	for (const { app, host: el } of live.splice(0)) {
		void unmount(app);
		el.remove();
	}
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('frame-scheduler eviction', () => {
	it('reports once through onError and shows the fallback without retrying', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const onReady = vi.fn();
		const onError = vi.fn();
		const { app, el } = render(Fluid, { ...SMALL, onReady, onError, fallbackText: 'frame failed' });
		await vi.waitFor(() => expect(onReady).toHaveBeenCalled());
		expect(onError).not.toHaveBeenCalled();
		expect(el.querySelector('.svelte-fluid-fallback')).toBeNull();

		const proto = WebGL2RenderingContext.prototype;
		const draw = proto.drawElements;
		let failures = 0;
		proto.drawElements = function () {
			failures++;
			throw new Error('injected frame failure');
		};
		try {
			await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
			await frames(10);
		} finally {
			proto.drawElements = draw;
		}
		expect(onError).toHaveBeenCalledTimes(1);
		expect((onError.mock.calls[0][0] as Error).message).toBe('injected frame failure');
		expect(el.querySelector('.svelte-fluid-fallback')).not.toBeNull();
		expect(el.querySelector('canvas')?.getAttribute('aria-hidden')).toBe('true');
		expect(activeFrameSubscribers()).toBe(0);

		// Evicted and torn down: resume is a no-op, never a retry loop.
		const before = failures;
		app.handle.resume();
		await frames(5);
		expect(failures).toBe(before);
		expect(onError).toHaveBeenCalledTimes(1);
	});
});

describe('reduced-motion still', () => {
	it('Fluid settles once, holds with no RAF, and follows live toggles', async () => {
		const media = stubReducedMotion(true);
		const onReady = vi.fn();
		const { app } = render(Fluid, { ...SMALL, onReady });
		await vi.waitFor(() => expect(onReady).toHaveBeenCalled());
		expect(app.handle.isPaused).toBe(true);
		await frames(5);
		expect(activeFrameSubscribers()).toBe(0);

		media.set(false);
		await vi.waitFor(() => expect(app.handle.isPaused).toBe(false));
		expect(activeFrameSubscribers()).toBe(1);
		media.set(true);
		await vi.waitFor(() => expect(app.handle.isPaused).toBe(true));
		expect(activeFrameSubscribers()).toBe(0);
	});

	it('settleStill advects the opening deterministically', () => {
		const run = (settle: boolean) => {
			const canvas = document.createElement('canvas');
			canvas.width = 128;
			canvas.height = 96;
			const engine = new FluidEngine({
				canvas,
				autoStart: false,
				config: { ...SMALL, pointerInput: false }
			});
			if (settle) engine.settleStill();
			const velocity = engine.readField('velocity').data;
			expect(engine.isPaused).toBe(true);
			engine.dispose();
			return velocity.reduce((sum, v) => sum + Math.abs(v), 0);
		};
		const raw = run(false);
		const settled = run(true);
		expect(settled).not.toBe(raw);
		expect(run(true)).toBe(settled);
	});

	it('FluidReveal drops the cover so content shows in full', async () => {
		stubReducedMotion(true);
		const { el } = render(FluidReveal, { autoReveal: true, ...SMALL, initialSplatCount: 0 });
		await frames(5);
		const cover = el.querySelector('.svelte-fluid-reveal__canvas') as HTMLElement;
		expect(cover.classList.contains('reduced')).toBe(true);
		expect(getComputedStyle(cover).display).toBe('none');
		expect(activeFrameSubscribers()).toBe(0);
	});

	it('FluidDistortion ignores pointer motion and auto-distort while reduced', async () => {
		const media = stubReducedMotion(true);
		const onReady = vi.fn();
		const { el } = render(FluidDistortion, { src: PIXEL, autoDistort: true, onReady, ...SMALL });
		await vi.waitFor(() => expect(onReady).toHaveBeenCalled());
		const splat = vi.spyOn(FluidEngine.prototype, 'splat');
		const wrapper = el.querySelector('.svelte-fluid-distortion__canvas')!;
		for (const x of [20, 60, 100]) {
			wrapper.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: 40, bubbles: true }));
		}
		await frames(5);
		expect(splat).not.toHaveBeenCalled();
		expect(activeFrameSubscribers()).toBe(0);

		media.set(false);
		await vi.waitFor(() => expect(activeFrameSubscribers()).toBe(1));
		await vi.waitFor(() => expect(splat).toHaveBeenCalled());
	});

	it('FluidStick does not auto-animate while reduced and resumes live', async () => {
		const media = stubReducedMotion(true);
		const onReady = vi.fn();
		const { app } = render(FluidStick, { text: 'Hi', onReady, ...SMALL, maskResolution: 128 });
		await vi.waitFor(() => expect(onReady).toHaveBeenCalled());
		const splat = vi.spyOn(FluidEngine.prototype, 'splat');
		await frames(8);
		expect(splat).not.toHaveBeenCalled();
		expect(app.handle.isPaused).toBe(true);
		media.set(false);
		await vi.waitFor(() => expect(splat).toHaveBeenCalled());
	});

	it('FluidText and FluidBackground settle to a still', async () => {
		stubReducedMotion(true);
		const textReady = vi.fn();
		const bgReady = vi.fn();
		const t = render(FluidText, { text: 'Hi', onReady: textReady, ...SMALL }, host(300, 120));
		const b = render(FluidBackground, { onReady: bgReady, initialSplatCount: 6, seed: 3 }, host());
		await vi.waitFor(() => expect(textReady).toHaveBeenCalled());
		await vi.waitFor(() => expect(bgReady).toHaveBeenCalled());
		await frames(4);
		expect(t.app.handle.isPaused).toBe(true);
		expect(b.app.handle.isPaused).toBe(true);
		expect(activeFrameSubscribers()).toBe(0);
	});
});
