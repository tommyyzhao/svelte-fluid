/*
 * DOM wiring shared by the liquid controls (ADR-0092): size, visibility,
 * reduced motion and page tone feed a SurfaceEngine; any failure reports
 * `live = false` so the component shows its plain native styling. No Svelte.
 */
import { measurePageColor } from '../css-color.js';
import { notifyHost } from '../notify-host.js';
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
	let canvasSize: DOMRectReadOnly | undefined;
	const sync = () => {
		const size = canvasSize ?? canvas.getBoundingClientRect();
		engine.resize(size.width, size.height, devicePixelRatio);
		engine.setConfig(measure());
	};
	const resize = new ResizeObserver((entries) => {
		canvasSize = entries.find((entry) => entry.target === canvas)?.contentRect ?? canvasSize;
		sync();
	});
	resize.observe(box);
	resize.observe(canvas);
	window.addEventListener('resize', sync);
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
			window.removeEventListener('resize', sync);
			intersect.disconnect();
			unwatch();
			engine.dispose();
		}
	};
	return binding;
}

/** Whether `file` matches a native `accept` list (`.ext`, `type/*`, `type/sub`). Empty accepts all. */
export function acceptsFile(file: { name: string; type: string }, accept: string | undefined): boolean {
	const tokens = (accept ?? '')
		.split(',')
		.map((t) => t.trim().toLowerCase())
		.filter(Boolean);
	if (!tokens.length) return true;
	const name = file.name.toLowerCase();
	const type = file.type.toLowerCase();
	return tokens.some((t) => (t.startsWith('.') ? name.endsWith(t) : t.endsWith('/*') ? type.startsWith(t.slice(0, -1)) : type === t));
}

/** Dropped files the input itself would have allowed: filtered by `accept`, one unless `multiple`. */
export function pickFiles<F extends { name: string; type: string }>(files: Iterable<F>, accept: string | undefined, multiple: boolean | undefined): F[] {
	const kept = [...files].filter((f) => acceptsFile(f, accept));
	return multiple ? kept : kept.slice(0, 1);
}

/** Default polite announcement for a result. */
export function filesMessage(files: unknown[]): string {
	return `${files.length} ${files.length === 1 ? 'file' : 'files'} selected`;
}

/**
 * Hand `files` to the consumer and return the live-region text. Both callbacks
 * are untrusted: a throw is logged, never propagated. Nothing happens for an
 * empty list (a cancelled picker or a drop of rejected types).
 */
export function deliverFiles<F>(files: F[], onfiles?: (files: F[]) => void, announce?: (files: F[]) => string): string {
	if (!files.length) return '';
	notifyHost(onfiles, 'onfiles', files);
	let message = filesMessage(files);
	notifyHost((f: F[]) => (message = announce?.(f) || message), 'announce', files);
	return message;
}
