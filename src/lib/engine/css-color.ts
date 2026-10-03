/**
 * Browser colour measurement for the contrast floor (ADR-0086). DOM-only, no
 * Svelte, no GL. A 1x1 2D canvas normalises every CSS colour syntax the browser
 * understands (`oklch()`, `lab()`, `color()`, `rgb(r g b / a)`, named, ...) and
 * does the alpha compositing, so no colour string is ever parsed by hand.
 */
import type { RGB } from './types.js';
import { overlayCap, type Srgb, type SurfaceTone } from './surface/look.js';

let ctx: CanvasRenderingContext2D | null | undefined;
let warnedGradient = false;

function get2d(): CanvasRenderingContext2D | null {
	if (ctx === undefined) {
		const c = document.createElement('canvas');
		c.width = c.height = 1;
		ctx = c.getContext('2d', { willReadFrequently: true });
	}
	return ctx;
}

/** Paint `layers` (CSS colours, bottom first) over `base` and read the opaque result. */
function composite(base: RGB, layers: string[]): RGB {
	const g = get2d();
	if (!g) return base;
	g.clearRect(0, 0, 1, 1);
	g.fillStyle = `rgb(${base.r} ${base.g} ${base.b})`;
	g.fillRect(0, 0, 1, 1);
	for (const color of layers) {
		g.fillStyle = color;
		g.fillRect(0, 0, 1, 1);
	}
	const d = g.getImageData(0, 0, 1, 1).data;
	return { r: d[0], g: d[1], b: d[2] };
}

/** Alpha (0-255) of a CSS colour, read back from a cleared 1x1 canvas. */
function alphaOf(color: string): number {
	const g = get2d();
	if (!g) return 255;
	g.clearRect(0, 0, 1, 1);
	g.fillStyle = color;
	g.fillRect(0, 0, 1, 1);
	return g.getImageData(0, 0, 1, 1).data[3];
}

/** CSS colour (any syntax, any alpha) composited over `over`, as opaque 0-255 RGB. */
export function cssColorToRgb(color: string, over: RGB): RGB {
	return composite(over, [color]);
}

/**
 * Effective page colour behind `start`: ancestor `background-color`s up to the
 * first opaque one, composited down over white (black for `color-scheme: dark`),
 * so translucent layers blend with whatever is under them. Gradients and
 * images cannot be measured; their `background-color` is used and a one-time
 * dev warning asks for an explicit `contrastColor`.
 */
export function measurePageColor(start: Element | null): RGB {
	const layers: string[] = [];
	let gradient = false;
	for (let el = start; el; el = el.parentElement) {
		const cs = getComputedStyle(el);
		if (cs.backgroundImage && cs.backgroundImage !== 'none') gradient = true;
		layers.push(cs.backgroundColor);
		// Walk up only until the layers stack opaque; ancestors beyond are invisible.
		if (alphaOf(cs.backgroundColor) === 255) break;
	}
	if (gradient && !warnedGradient) {
		warnedGradient = true;
		console.warn(
			'svelte-fluid: an ancestor has a background-image/gradient, which cannot be measured for minContrast; ' +
				'using its background-color. Pass `contrastColor` for the real colour.'
		);
	}
	const dark = getComputedStyle(document.documentElement).colorScheme.includes('dark');
	return composite(dark ? { r: 0, g: 0, b: 0 } : { r: 255, g: 255, b: 255 }, layers.reverse());
}

/**
 * Caustics support plain, static native text over solid ancestor backgrounds.
 * Anything unmeasurable disables the whole overlay, never substitutes a colour.
 * ponytail: 128 runs / 512 elements / 1024 nodes / 64 ancestors; larger or richer content stays native.
 */
export function measureTextOverlayCap(root: HTMLElement, canvas: HTMLCanvasElement, intensity: number | undefined, tone: SurfaceTone): number {
	if (!get2d()) return 0;
	const styles = new Map<Element, CSSStyleDeclaration>();
	const style = (el: Element) => {
		let cs = styles.get(el);
		if (!cs) styles.set(el, (cs = getComputedStyle(el)));
		return cs;
	};
	const unsupported = (el: Element) => {
		const cs = style(el);
		return el.localName.includes('-') || !!el.shadowRoot ||
			/^(img|svg|canvas|video|audio|iframe|object|embed|input|textarea|select)$/.test(el.localName) ||
			cs.backgroundImage !== 'none' || cs.filter !== 'none' ||
			(cs.backdropFilter && cs.backdropFilter !== 'none') || cs.mixBlendMode !== 'normal' ||
			cs.opacity !== '1' || cs.textShadow !== 'none' || cs.boxShadow !== 'none' ||
			cs.transform !== 'none' || cs.backgroundClip === 'text' || cs.display === 'contents' ||
			(cs.position === 'relative' && [cs.top, cs.right, cs.bottom, cs.left].some((offset) => offset !== 'auto')) ||
			[cs.marginTop, cs.marginRight, cs.marginBottom, cs.marginLeft].some((margin) => parseFloat(margin) < 0) ||
			cs.display.includes('grid') || cs.display.includes('list-item') ||
			(cs.getPropertyValue('-webkit-text-fill-color') && cs.getPropertyValue('-webkit-text-fill-color') !== cs.color) ||
			parseFloat(cs.getPropertyValue('-webkit-text-stroke-width')) > 0 ||
			cs.animationName.split(',').some((name) => name.trim() !== 'none') ||
			cs.transitionDuration.split(',').some((duration) => parseFloat(duration) > 0) ||
			['::first-letter', '::first-line'].some((pseudo) => {
				const ps = getComputedStyle(el, pseudo);
				return alphaOf(ps.backgroundColor) > 0 || ps.backgroundImage !== 'none' ||
					['color', 'text-shadow', '-webkit-text-fill-color', '-webkit-text-stroke-width'].some((property) => ps.getPropertyValue(property) !== cs.getPropertyValue(property));
			}) ||
			['::before', '::after'].some((pseudo) => {
				const content = getComputedStyle(el, pseudo).content;
				return content !== 'none' && content !== 'normal';
			});
	};
	const ancestors: Element[] = [];
	for (let el: Element | null = root; el; el = el.parentElement) {
		if (ancestors.length === 64 || unsupported(el)) return 0;
		ancestors.push(el);
	}
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
	const runs: Element[] = [];
	let elements = 0;
	let nodes = 0;
	for (let node = walker.nextNode(); node; node = walker.nextNode()) {
		if (++nodes > 1024) return 0;
		if (node === canvas || canvas.contains(node)) continue;
		if (node instanceof Element) {
			if (++elements > 512 || unsupported(node)) return 0;
			// Out-of-flow layers cannot be represented by an ancestor background stack.
			if (['absolute', 'fixed', 'sticky'].includes(style(node).position)) return 0;
		} else if (node.textContent?.trim() && node.parentElement) {
			const el = node.parentElement;
			if (style(el).visibility !== 'visible' || !el.getClientRects().length) continue;
			if (runs.length === 128) return 0;
			runs.push(el);
		}
	}
	const backgrounds = new Map<Element, RGB>();
	// No opaque page background means the browser Canvas colour is unknown here.
	// Fail closed rather than guessing from the declared (possibly `light dark`) scheme.
	if (!ancestors.some((el) => alphaOf(style(el).backgroundColor) === 255)) return 0;
	const base = { r: 255, g: 255, b: 255 };
	const background = (el: Element): RGB => {
		let bg = backgrounds.get(el);
		if (!bg) {
			const layers: string[] = [];
			for (let parent: Element | null = el; parent; parent = parent.parentElement) layers.push(style(parent).backgroundColor);
			backgrounds.set(el, (bg = composite(base, layers.reverse())));
		}
		return bg;
	};
	const srgb = (c: RGB): Srgb => [c.r / 255, c.g / 255, c.b / 255];
	let cap = 1;
	for (const el of runs) {
		const bg = background(el);
		cap = Math.min(cap, overlayCap(intensity, srgb(cssColorToRgb(style(el).color, bg)), srgb(bg), tone));
		if (!cap) return 0;
	}
	return runs.length ? cap : 0;
}

/** @internal Test hook. */
export function resetCssColorWarnings(): void {
	warnedGradient = false;
}
