/*
 * DOM wiring shared by the liquid controls (ADR-0092): size, visibility,
 * reduced motion and page tone feed a SurfaceEngine; any failure reports
 * `live = false` so the component shows its plain native styling. No Svelte.
 */
import { measurePageColor } from '../css-color.js';
import { relativeLuminance } from '../contrast.js';
import { watchReducedMotion } from '../reduced-motion.js';
import type { LiquidTone } from '../types.js';
import { SurfaceEngine } from './SurfaceEngine.js';
import type { SurfaceConfig, SurfaceRect } from './SurfaceEngine.js';
import type { SurfaceTone } from './look.js';

/** Canvas overhang around the control, CSS px: room for the focus ring. */
export const SURFACE_PAD = 6;

export interface SurfaceBinding {
	/** Re-measure geometry and apply `patch`. */
	update(patch?: SurfaceConfig): void;
	press(x: number, y: number, strength?: number): void;
	destroy(): void;
}

/** `el`'s border box relative to `canvas`, CSS px. */
export function rectIn(el: Element, canvas: Element): SurfaceRect {
	const a = el.getBoundingClientRect();
	const c = canvas.getBoundingClientRect();
	return { x: a.left - c.left, y: a.top - c.top, width: a.width, height: a.height };
}

/** Resolve `'auto'` from the page colour behind `el`; dark below the WCAG crossover luminance. */
export function resolveTone(tone: LiquidTone | undefined, el: Element): SurfaceTone {
	if (tone === 'light' || tone === 'dark') return tone;
	const { r, g, b } = measurePageColor(el.parentElement);
	return relativeLuminance(r / 255, g / 255, b / 255) < 0.179 ? 'dark' : 'light';
}

let seed = 1;

/**
 * Bind `canvas` (overhanging `box` by SURFACE_PAD) to a new engine. `measure`
 * returns the live geometry. Returns null when WebGL2/the shared host is
 * unavailable; the control then stays a plain native control.
 */
export function attachSurface(
	canvas: HTMLCanvasElement,
	box: HTMLElement,
	measure: () => SurfaceConfig,
	onLive: (live: boolean) => void
): SurfaceBinding | null {
	let engine: SurfaceEngine;
	try {
		engine = new SurfaceEngine({
			canvas,
			seed: seed++,
			config: measure(),
			onFrameError: () => {
				onLive(false);
				binding.destroy();
			},
			onContextLost: () => onLive(false),
			onContextRestored: () => onLive(true)
		});
	} catch (error) {
		console.warn('svelte-fluid: liquid surface unavailable; showing the native control', error);
		return null;
	}
	const sync = () => {
		engine.resize(canvas.clientWidth, canvas.clientHeight, devicePixelRatio);
		engine.setConfig(measure());
	};
	const resize = new ResizeObserver(sync);
	resize.observe(box);
	const intersect = new IntersectionObserver(([entry]) => engine.setVisible(entry.isIntersecting));
	intersect.observe(box);
	const unwatch = watchReducedMotion((reducedMotion) => engine.setConfig({ reducedMotion }));
	sync();
	onLive(true);
	let destroyed = false;
	const binding: SurfaceBinding = {
		update(patch) {
			if (destroyed) return;
			engine.setConfig({ ...measure(), ...patch });
		},
		press(x, y, strength) {
			if (!destroyed) engine.press(x, y, strength);
		},
		destroy() {
			if (destroyed) return;
			destroyed = true;
			resize.disconnect();
			intersect.disconnect();
			unwatch();
			engine.dispose();
		}
	};
	return binding;
}
