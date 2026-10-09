/*
 * LiquidDropZone on hardware WebGL2 (ADR-0094).
 */
import { flushSync, mount, unmount } from 'svelte';
import { userEvent } from 'vitest/browser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import LiquidDropZone from '../../LiquidDropZone.svelte';
import { activeFrameSubscribers } from '../frame-scheduler.js';
import { acquireGlHost } from '../gl-host.js';
import { SurfaceEngine } from '../surface/SurfaceEngine.js';
import type { SurfaceConfig } from '../surface/SurfaceEngine.js';
import { waitForSurfaceSettle } from './renderer.js';

const live: (() => void)[] = [];
afterEach(() => {
	for (const done of live.splice(0)) done();
	document.body.replaceChildren();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

const frames = (n: number) =>
	new Promise<void>((r) => {
		const f = () => (n-- <= 0 ? r() : requestAnimationFrame(f));
		f();
	});

function stubReducedMotion(initial: boolean) {
	vi.stubGlobal('matchMedia', (query: string) => ({
		matches: query.includes('prefers-reduced-motion') ? initial : false,
		media: query,
		addEventListener() {},
		removeEventListener() {}
	}));
}

function dragEvent(type: string, x: number, y: number, files: File[] = []) {
	const dt = new DataTransfer();
	for (const f of files) dt.items.add(f);
	return new DragEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, dataTransfer: dt });
}

/** Visible canvas pixels (top-down RGBA) through a 2D copy. */
function pixels(canvas: HTMLCanvasElement): Uint8ClampedArray {
	const copy = document.createElement('canvas');
	copy.width = canvas.width;
	copy.height = canvas.height;
	const ctx = copy.getContext('2d')!;
	ctx.drawImage(canvas, 0, 0);
	return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
}

const ZONE: SurfaceConfig = { control: 'dropzone', tone: 'dark', rect: { x: 6, y: 6, width: 480, height: 200 }, radius: 18 };

function engine(config: SurfaceConfig, css = { w: 492, h: 212 }, dpr = 2) {
	const canvas = document.createElement('canvas');
	canvas.style.cssText = `width:${css.w}px;height:${css.h}px`;
	document.body.append(canvas);
	const e = new SurfaceEngine({ canvas, config });
	e.resize(css.w, css.h, dpr);
	live.push(() => e.dispose());
	return e;
}

function zone(props: Record<string, unknown> = {}) {
	const target = document.createElement('div');
	target.style.cssText = 'padding:40px;background:#0b0d12';
	document.body.append(target);
	const app = mount(LiquidDropZone, { target, props: { tone: 'dark', label: 'Drop files', style: 'width:480px;height:200px;box-sizing:border-box', ...props } });
	live.push(() => void unmount(app));
	return target.querySelector('label')!;
}

describe('LiquidDropZone', () => {
	it('is a label around a focusable native file input; Enter and Space open the picker', async () => {
		const z = zone({ accept: 'image/*', multiple: true, name: 'upload', 'aria-describedby': 'hint' });
		await frames(2);
		const input = z.querySelector<HTMLInputElement>('input[type=file]')!;
		expect(input.accept).toBe('image/*');
		expect(input.multiple).toBe(true);
		expect(input.name).toBe('upload');
		expect(z.getAttribute('aria-describedby')).toBe('hint');
		expect(z.querySelector('canvas')!.getAttribute('aria-hidden')).toBe('true');
		expect(z.querySelector('[aria-live=polite]')).not.toBeNull();
		expect(z.classList.contains('live')).toBe(true);
		// Showing a picker is a click on the input (browsers never show it in tests).
		const picks: string[] = [];
		input.addEventListener('click', (e) => {
			picks.push('click');
			e.preventDefault();
		});
		document.body.focus();
		await userEvent.tab();
		expect(document.activeElement).toBe(input);
		await userEvent.keyboard('{Enter}');
		expect(picks).toHaveLength(1);
		await userEvent.keyboard(' ');
		expect(picks).toHaveLength(2);
		// Clicking the label also opens it (pointer, touch, pen).
		await userEvent.click(z);
		expect(picks).toHaveLength(3);
	});

	it('a synthetic file drag raises the meniscus on the wall nearest the pointer', async () => {
		const e = engine(ZONE);
		await e.advance(2);
		const rise = () => {
			const { width, data } = e.readSlope('surface');
			// Device px at DPR 2; rows bottom-up. Mid-height, 3 CSS px inside each side wall.
			const row = Math.round(106 * 2);
			const at = (cssX: number) => data[(row * width + Math.round(cssX * 2)) * 4];
			return { left: at(9), right: at(483) };
		};
		const rest = rise();
		expect(Math.abs(rest.left - rest.right)).toBeLessThan(0.05);
		e.setConfig({ drag: { x: -10, y: 106 } });
		await e.advance(40);
		const near = rise();
		expect(near.left).toBeGreaterThan(rest.left + 4);
		expect(near.left).toBeGreaterThan(near.right + 3);
		// The other side: the high wall follows the pointer.
		e.setConfig({ drag: { x: 500, y: 106 } });
		await e.advance(40);
		const far = rise();
		expect(far.right).toBeGreaterThan(far.left + 3);
		// Leave: the climb settles back and the loop stops.
		e.setConfig({ drag: null });
		for (let i = 0; i < 240 && e.running; i++) await frames(1);
		expect(e.running).toBe(false);
		expect(Math.abs(rise().left - rest.left)).toBeLessThan(0.05);
	});

	it('DOM drag events drive the component: dragover rises, drop calls onfiles exactly once and announces', async () => {
		const onfiles = vi.fn();
		const z = zone({ onfiles, multiple: true });
		await frames(3);
		await waitForSurfaceSettle(activeFrameSubscribers, 4000);
		const r = z.getBoundingClientRect();
		const files = [new File(['a'], 'a.txt', { type: 'text/plain' }), new File(['b'], 'b.txt', { type: 'text/plain' })];
		z.dispatchEvent(dragEvent('dragenter', r.left + 10, r.top + 100, files));
		const over = dragEvent('dragover', r.left + 10, r.top + 100, files);
		z.dispatchEvent(over);
		// Accepting the drag makes the label a drop target.
		expect(over.defaultPrevented).toBe(true);
		flushSync();
		expect(z.classList.contains('over')).toBe(true);
		expect(activeFrameSubscribers()).toBeGreaterThan(0);
		const drop = dragEvent('drop', r.left + 200, r.top + 100, files);
		z.dispatchEvent(drop);
		expect(drop.defaultPrevented).toBe(true);
		expect(onfiles).toHaveBeenCalledOnce();
		expect(onfiles.mock.calls[0][0].map((f: File) => f.name)).toEqual(['a.txt', 'b.txt']);
		expect(z.querySelector<HTMLInputElement>('input')!.files).toHaveLength(2);
		await frames(1);
		expect(z.querySelector('[aria-live=polite]')!.textContent).toBe('2 files selected');
		expect(z.classList.contains('over')).toBe(false);
		// The ripple and the climb settle; then nothing is scheduled.
		await waitForSurfaceSettle(activeFrameSubscribers, 5000);
	});

	it('a throwing onfiles cannot break the zone; the announcement still happens', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const z = zone({
			onfiles: () => {
				throw new Error('consumer');
			},
			announce: (f: File[]) => `${f.length} attached`
		});
		await frames(2);
		const r = z.getBoundingClientRect();
		z.dispatchEvent(dragEvent('drop', r.left + 50, r.top + 50, [new File(['a'], 'a.txt')]));
		await frames(1);
		expect(z.querySelector('[aria-live=polite]')!.textContent).toBe('1 attached');
		expect(z.classList.contains('live')).toBe(true);
	});

	it('reduced motion: a drag-over shows a static climb with no animation loop', async () => {
		stubReducedMotion(true);
		const e = engine({ ...ZONE, reducedMotion: true });
		await e.advance(1);
		for (let i = 0; i < 4 && e.running; i++) await frames(1);
		e.setConfig({ drag: { x: -10, y: 106 } });
		await e.advance(1);
		// Full height in the first frame (snapped), and the loop stops right after.
		const { width, data } = e.readSlope('surface');
		const row = 212;
		expect(data[(row * width + 18) * 4]).toBeGreaterThan(data[(row * width + 966) * 4] + 3);
		await frames(2);
		expect(e.running).toBe(false);
		e.press(100, 100);
		expect(e.running).toBe(false);
	});

	it('shows the plain native control without WebGL2', async () => {
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
		const z = zone();
		await frames(2);
		expect(z.classList.contains('live')).toBe(false);
		expect(getComputedStyle(z).backgroundImage).toContain('gradient');
		expect(getComputedStyle(z.querySelector('canvas')!).display).toBe('none');
		expect(z.querySelector('input[type=file]')).not.toBeNull();
	});
});

describe('drop zone lifecycle', () => {
	it('a drop zone schedules no frames once settled', async () => {
		const e = engine(ZONE);
		for (let i = 0; i < 240 && e.running; i++) await frames(1);
		expect(e.running).toBe(false);
		expect(activeFrameSubscribers()).toBe(0);
	});

	it('survives context loss and restore', async () => {
		const lost = vi.fn();
		const restored = vi.fn();
		const canvas = document.createElement('canvas');
		document.body.append(canvas);
		const e = new SurfaceEngine({ canvas, config: ZONE, onContextLost: lost, onContextRestored: restored });
		live.push(() => e.dispose());
		e.resize(492, 212, 2);
		await e.advance(1);
		const host = acquireGlHost(e);
		const lose = host.gl.getExtension('WEBGL_lose_context')!;
		const surface = host.gl.canvas;
		const lostEvent = new Promise((r) => surface.addEventListener('webglcontextlost', r, { once: true }));
		lose.loseContext();
		await lostEvent;
		expect(lost).toHaveBeenCalledOnce();
		expect(e.running).toBe(false);
		await new Promise((r) => setTimeout(r, 0));
		const restoredEvent = new Promise((r) => surface.addEventListener('webglcontextrestored', r, { once: true }));
		lose.restoreContext();
		await restoredEvent;
		expect(restored).toHaveBeenCalledOnce();
		await e.advance(1);
		const px = pixels(e.canvas);
		let lit = 0;
		for (let i = 3; i < px.length; i += 4) if (px[i] > 20) lit++;
		expect(lit).toBeGreaterThan(0);
		expect(host.gl.getError()).toBe(host.gl.NO_ERROR);
	});

	it('dispose releases the shared host', async () => {
		const e = engine(ZONE);
		await e.advance(1);
		const gl = acquireGlHost(e).gl;
		e.dispose();
		expect(gl.isContextLost()).toBe(true);
		expect(activeFrameSubscribers()).toBe(0);
		e.dispose();
	});
});
