/*
 * LiquidCaustics on hardware WebGL2 (ADR-0094).
 */
import { createRawSnippet, mount, unmount } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import LiquidCaustics from '../../LiquidCaustics.svelte';
import { activeFrameSubscribers } from '../frame-scheduler.js';
import { measureTextOverlayCap } from '../css-color.js';
import { acquireGlHost } from '../gl-host.js';
import { LABEL_MIN_CONTRAST, LOOKS, hexToSrgb, overlayCap, overlayContrast } from '../surface/look.js';
import { SurfaceEngine } from '../surface/SurfaceEngine.js';
import { seams } from './seams.js';

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

function stubReducedMotion() {
	vi.stubGlobal('matchMedia', (query: string) => ({
		matches: query.includes('prefers-reduced-motion'),
		media: query,
		addEventListener() {},
		removeEventListener() {}
	}));
}

/** Visible canvas pixels (top-down RGBA, straight alpha) through a 2D copy. */
function pixels(canvas: HTMLCanvasElement): Uint8ClampedArray {
	const copy = document.createElement('canvas');
	copy.width = canvas.width;
	copy.height = canvas.height;
	const ctx = copy.getContext('2d')!;
	ctx.drawImage(canvas, 0, 0);
	return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
}

/**
 * Largest straight-edge step allowed, in 8-bit sRGB luma codes (seams.ts): the
 * median one-pixel spike along 120 CSS px of a row or column boundary, or the
 * step from the page to the canvas's outermost pixels. 2 codes: dither alone is
 * ±1 LSB, so a 2-code straight line is the smallest that can stand out of it.
 * The rejected ambient build's canvas-edge cut measured 35–53 codes (dark) and
 * 13–19 (light); this build measures 0 there and ≤ 0.29 inside, in ripples.
 */
const SEAM_MAX = 2;

const PROSE =
	'Water is the oldest interface. You touch it and it answers, immediately and locally, then it forgets. A ripple carries the news of the touch outward and fades; a surface that kept trembling would be broken.';

function caustics(tone: 'light' | 'dark', props: Record<string, unknown> = {}) {
	const target = document.createElement('div');
	const page = LOOKS.button[tone].page;
	const text = tone === 'dark' ? '#e9edf4' : '#1a1c21';
	target.style.cssText = `padding:20px;background:${page};color:${text};font:17px/1.6 system-ui`;
	document.body.append(target);
	const children = createRawSnippet(() => ({ render: () => `<div style="padding:24px"><p style="margin:0">${PROSE}</p><a href="#a" style="color:inherit">Link</a></div>` }));
	const app = mount(LiquidCaustics, { target, props: { tone, children, style: 'width:720px;height:400px;box-sizing:border-box', ...props } });
	live.push(() => void unmount(app));
	return { root: target.querySelector<HTMLDivElement>('.liquid-caustics')!, page, text };
}

/** Overlay strength k (alpha, 0–1) at every device pixel inside `el`'s box. */
function strengthsUnder(canvas: HTMLCanvasElement, el: Element): number[] {
	const px = pixels(canvas);
	const cr = canvas.getBoundingClientRect();
	const r = el.getBoundingClientRect();
	const s = canvas.width / cr.width;
	const out: number[] = [];
	for (let y = Math.floor((r.top - cr.top) * s); y < (r.bottom - cr.top) * s; y++)
		for (let x = Math.floor((r.left - cr.left) * s); x < (r.right - cr.left) * s; x++) out.push(px[(y * canvas.width + x) * 4 + 3] / 255);
	return out;
}

describe('LiquidCaustics', () => {
	it.each(['light', 'dark'] as const)('%s: text pixels stay within the contrast budget; text stays selectable DOM', async (tone) => {
		const { root, page, text } = caustics(tone);
		const canvas = root.querySelector('canvas')!;
		expect(canvas.getAttribute('aria-hidden')).toBe('true');
		expect(getComputedStyle(canvas).pointerEvents).toBe('none');
		const p = root.querySelector('p')!;
		const sel = getSelection()!;
		sel.selectAllChildren(p);
		expect(sel.toString()).toContain('oldest interface');
		sel.removeAllRanges();
		await frames(2);
		// Dark tone screens light on; light tone shades with plain alpha.
		expect(getComputedStyle(canvas).mixBlendMode).toBe(tone === 'dark' ? 'screen' : 'normal');
		const cap = overlayCap(undefined, hexToSrgb(text), hexToSrgb(page), tone);
		let peak = 0;
		// A pointer ripple straight under the paragraph, followed until it fades.
		const pr = p.getBoundingClientRect();
		root.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: pr.left + 200, clientY: pr.top + 30 }));
		for (let i = 0; i < 12; i++) {
			await frames(3);
			for (const k of strengthsUnder(canvas, p)) peak = Math.max(peak, k);
		}
		// Never above the clamp (one 8-bit step of rounding), and the proof holds at the peak.
		expect(peak).toBeLessThanOrEqual(cap + 1 / 255);
		expect(peak).toBeGreaterThan(0);
		expect(overlayContrast(hexToSrgb(text), hexToSrgb(page), peak, tone)).toBeGreaterThanOrEqual(LABEL_MIN_CONTRAST);
	});

	it.each(['light', 'dark'] as const)('%s: every native text run limits the overlay; mutation restores plain failing content', async (tone) => {
		const { root, page, text } = caustics(tone);
		const canvas = root.querySelector('canvas')!;
		const link = root.querySelector('a')!;
		const descendant = tone === 'light' ? '#585858' : '#919191';
		link.style.color = descendant;
		const label = document.createElement('label');
		label.textContent = 'Native label';
		label.style.cssText = `color:${descendant};background:${page}`;
		root.prepend(document.createTextNode('Root text'), label);
		await frames(3);
		const cap = Math.min(overlayCap(undefined, hexToSrgb(text), hexToSrgb(page), tone), overlayCap(undefined, hexToSrgb(descendant), hexToSrgb(page), tone));
		expect(cap).toBeGreaterThan(0);
		expect(measureTextOverlayCap(root, canvas, undefined, tone)).toBeCloseTo(cap, 5);
		link.focus();
		expect(document.activeElement).toBe(link);
		const selection = getSelection()!;
		selection.selectAllChildren(label);
		expect(selection.toString()).toBe('Native label');
		selection.removeAllRanges();
		let peak = 0;
		for (let i = 0; i < 12; i++) {
			await frames(3);
			for (const k of strengthsUnder(canvas, link)) peak = Math.max(peak, k);
		}
		expect(peak).toBeGreaterThan(0);
		expect(peak).toBeLessThanOrEqual(cap + 1 / 255);
		link.style.color = page;
		await frames(2);
		expect(getComputedStyle(link).color).toBe(getComputedStyle(root.parentElement!).backgroundColor);
		expect(measureTextOverlayCap(root, canvas, undefined, tone)).toBe(0);
		expect(getComputedStyle(canvas).visibility).toBe('hidden');
		link.style.color = descendant;
		await frames(2);
		expect(getComputedStyle(canvas).visibility).toBe('visible');
		root.parentElement!.style.backgroundColor = descendant;
		await frames(2);
		expect(getComputedStyle(canvas).visibility).toBe('hidden');
	});

	it.each([
		'background:linear-gradient(white,black)', 'background-image:url(data:image/png;base64,AA==)',
		'filter:blur(1px)', 'opacity:0.9', 'text-shadow:0 0 1px black', 'mix-blend-mode:multiply',
		'animation:unsupported 1s infinite', 'transition:color 1s', 'display:contents',
		'position:relative;top:-30px', 'margin-top:-30px', 'display:grid', 'display:list-item'
	])('unsupported %s disables the whole overlay without changing content', async (css) => {
		const { root } = caustics('light');
		const p = root.querySelector('p')!;
		const original = p.textContent;
		p.style.cssText += `;${css}`;
		await frames(2);
		const canvas = root.querySelector('canvas')!;
		expect(measureTextOverlayCap(root, canvas, undefined, 'light')).toBe(0);
		expect(getComputedStyle(canvas).visibility).toBe('hidden');
		expect(p.textContent).toBe(original);
	});

	it('transparent page with a light dark declaration does not guess a Canvas background', async () => {
		const htmlStyle = document.documentElement.style.cssText;
		const bodyStyle = document.body.style.cssText;
		live.push(() => { document.documentElement.style.cssText = htmlStyle; document.body.style.cssText = bodyStyle; });
		document.documentElement.style.cssText = 'background:transparent;color-scheme:light dark';
		document.body.style.background = 'transparent';
		const { root } = caustics('dark');
		root.parentElement!.style.background = 'transparent';
		root.querySelector('a')!.style.color = '#999';
		await frames(2);
		const canvas = root.querySelector('canvas')!;
		expect(measureTextOverlayCap(root, canvas, undefined, 'dark')).toBe(0);
		expect(getComputedStyle(canvas).visibility).toBe('hidden');
		expect(getComputedStyle(root.querySelector('a')!).color).toBe('rgb(153, 153, 153)');
	});

	it('generated, embedded and overflow content fail closed; resize remeasures', async () => {
		const { root } = caustics('light');
		const canvas = root.querySelector('canvas')!;
		await frames(2);
		root.style.width = '710px';
		await frames(3);
		expect(getComputedStyle(canvas).visibility).toBe('visible');
		const sheet = document.createElement('style');
		sheet.textContent = '.generated::before { content: "Unmeasured"; } .letter::first-letter { color: #aaa; } .line::first-line { color: #aaa; }';
		document.head.append(sheet);
		live.push(() => sheet.remove());
		root.querySelector('p')!.className = 'generated';
		await frames(2);
		expect(getComputedStyle(canvas).visibility).toBe('hidden');
		for (const className of ['letter', 'line']) {
			root.querySelector('p')!.className = className;
			await frames(2);
			expect(getComputedStyle(canvas).visibility).toBe('hidden');
		}
		root.querySelector('p')!.className = '';
		const custom = document.createElement('custom-text');
		root.prepend(custom);
		await frames(2);
		expect(getComputedStyle(canvas).visibility).toBe('hidden');
		custom.remove();
		for (let i = 0; i < 129; i++) {
			const span = document.createElement('span');
			span.textContent = 'text ';
			root.prepend(span);
		}
		await frames(2);
		expect(getComputedStyle(canvas).visibility).toBe('hidden');
	});

	it.each(['light', 'dark'] as const)('%s: at rest nothing is drawn; a ripple settles back to nothing and zero subscriptions', async (tone) => {
		const { root } = caustics(tone);
		await frames(4);
		await vi.waitFor(() => expect(activeFrameSubscribers()).toBe(0), { timeout: 3000 });
		const canvas = root.querySelector('canvas')!;
		const blank = (px: Uint8ClampedArray) => px.every((v, i) => i % 4 !== 3 || v === 0);
		expect(blank(pixels(canvas))).toBe(true);
		const r = root.getBoundingClientRect();
		root.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: r.left + 360, clientY: r.top + 200 }));
		expect(activeFrameSubscribers()).toBeGreaterThan(0);
		await frames(10);
		expect(blank(pixels(canvas))).toBe(false);
		await vi.waitFor(() => expect(activeFrameSubscribers()).toBe(0), { timeout: 4000 });
		expect(blank(pixels(canvas))).toBe(true);
	});

	it('the seam metric detects a straight hard cut (self-check)', () => {
		// A 2 CSS px soft-edged ring and a 3-code vertical cut, drawn as overlay alpha.
		const c = document.createElement('canvas');
		c.width = 1440;
		c.height = 800;
		c.style.cssText = 'width:720px;height:400px';
		document.body.append(c);
		const g = c.getContext('2d')!;
		// Soft like a real caustic line (≈ 2 CSS px), not a hard canvas stroke.
		g.filter = 'blur(2px)';
		g.strokeStyle = 'rgba(0,0,0,0.3)';
		g.lineWidth = 4;
		g.beginPath();
		g.arc(700, 400, 200, 0, 2 * Math.PI);
		g.stroke();
		g.filter = 'none';
		expect(seams(c, 'dark').interior).toBeLessThan(SEAM_MAX);
		// 0.03 alpha screened over the dark page ≈ 3 sRGB-luma codes.
		g.fillStyle = 'rgba(0,0,0,0.03)';
		g.fillRect(900, 0, 540, 800);
		expect(seams(c, 'dark').interior).toBeGreaterThan(SEAM_MAX);
		expect(seams(c, 'dark').border).toBeGreaterThan(SEAM_MAX);
	});

	it.each(['light', 'dark'] as const)('%s: ripple frames have no straight-edge discontinuities', async (tone) => {
		const canvas = document.createElement('canvas');
		canvas.style.cssText = 'width:720px;height:400px';
		document.body.append(canvas);
		const e = new SurfaceEngine({ canvas, config: { control: 'overlay', tone, rect: { x: 0, y: 0, width: 720, height: 400 }, radius: 16, overlay: 0.3 } });
		live.push(() => e.dispose());
		e.resize(720, 400, 2);
		await e.advance(2);
		// Centre, near an edge, and a corner: the edge fade and the field walls are exercised.
		e.press(360, 200, 1.1);
		e.press(690, 120, 1.1);
		e.press(40, 370, 1.5);
		let worst = { interior: 0, border: 0 };
		for (let i = 0; i < 30; i++) {
			await e.advance(2);
			const m = seams(canvas, tone);
			worst = { interior: Math.max(worst.interior, m.interior), border: Math.max(worst.border, m.border) };
		}
		expect(worst.interior).toBeLessThan(SEAM_MAX);
		expect(worst.border).toBeLessThan(SEAM_MAX);
	});

	it('pointer moves and focus ripple; offscreen schedules nothing', async () => {
		const { root } = caustics('dark');
		await frames(5);
		const r = root.getBoundingClientRect();
		for (let i = 0; i < 50; i++) root.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: r.left + 100 + i, clientY: r.top + 200 }));
		root.querySelector('a')!.focus();
		expect(activeFrameSubscribers()).toBeGreaterThan(0);
		root.style.position = 'fixed';
		root.style.top = '-5000px';
		await vi.waitFor(() => expect(activeFrameSubscribers()).toBe(0), { timeout: 3000 });
	});

	it('a throwing forwarded onpointermove still ripples and is logged once', async () => {
		const err = vi.spyOn(console, 'error').mockImplementation(() => {});
		const { root } = caustics('dark', { onpointermove: () => { throw new Error('consumer'); } });
		await frames(4);
		await vi.waitFor(() => expect(activeFrameSubscribers()).toBe(0), { timeout: 3000 });
		const r = root.getBoundingClientRect();
		root.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: r.left + 100, clientY: r.top + 200 }));
		expect(activeFrameSubscribers()).toBeGreaterThan(0);
		expect(err).toHaveBeenCalledOnce();
	});

	it('reduced motion: one still frame, no loop, no ripples', async () => {
		stubReducedMotion();
		const { root } = caustics('dark');
		await frames(6);
		await vi.waitFor(() => expect(activeFrameSubscribers()).toBe(0), { timeout: 3000 });
		const canvas = root.querySelector('canvas')!;
		const before = pixels(canvas);
		// The effect carries no information, so the still final state is the content alone.
		expect(before.every((v, i) => i % 4 !== 3 || v === 0)).toBe(true);
		const r = root.getBoundingClientRect();
		root.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: r.left + 300, clientY: r.top + 200 }));
		root.querySelector('a')!.focus();
		await frames(3);
		expect(activeFrameSubscribers()).toBe(0);
		expect(pixels(canvas)).toEqual(before);
	});

	it('plain content without WebGL2', async () => {
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
		const { root } = caustics('light');
		await frames(2);
		expect(root.classList.contains('live')).toBe(false);
		expect(getComputedStyle(root.querySelector('canvas')!).display).toBe('none');
		expect(root.textContent).toContain('oldest interface');
	});

	it('the overlay survives context loss and restore', async () => {
		const lost = vi.fn();
		const restored = vi.fn();
		const canvas = document.createElement('canvas');
		document.body.append(canvas);
		const e = new SurfaceEngine({
			canvas,
			config: { control: 'overlay', tone: 'dark', rect: { x: 0, y: 0, width: 720, height: 400 }, radius: 0, overlay: 0.3 },
			onContextLost: lost,
			onContextRestored: restored
		});
		live.push(() => e.dispose());
		e.resize(720, 400, 2);
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
		e.press(360, 200);
		await e.advance(8);
		const px = pixels(e.canvas);
		let lit = 0;
		for (let i = 3; i < px.length; i += 4) if (px[i] > 8) lit++;
		expect(lit).toBeGreaterThan(0);
		expect(host.gl.getError()).toBe(host.gl.NO_ERROR);
		e.dispose();
		expect(activeFrameSubscribers()).toBe(0);
	});
});
