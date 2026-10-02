/**
 * Browser colour measurement for the contrast floor (ADR-0086). DOM-only, no
 * Svelte, no GL. A 1x1 2D canvas normalises every CSS colour syntax the browser
 * understands (`oklch()`, `lab()`, `color()`, `rgb(r g b / a)`, named, ...) and
 * does the alpha compositing, so no colour string is ever parsed by hand.
 */
import type { RGB } from './types.js';

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

/** @internal Test hook. */
export function resetCssColorWarnings(): void {
	warnedGradient = false;
}
