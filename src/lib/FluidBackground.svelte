<!--
  svelte-fluid — FluidBackground component

  Full-viewport fluid canvas that sits behind page content, with
  automatic DOM element exclusion. The fluid physically cannot enter
  regions matched by the `exclude` CSS selector — velocity and dye
  are zeroed inside those zones every physics step.

  Implementation: measures excluded element bounding rects, generates
  an evenodd SVG path (outer viewport rect minus inner rounded-rect
  holes), and passes it as a `containerShape: 'svgPath'` to the
  engine's existing mask pipeline. Mask rebuilds are throttled to
  at most one per 80 ms and skipped when the path string is unchanged.

  See ADR-0026 for design rationale and performance analysis.
-->

<script lang="ts" module>
	import type { Snippet } from 'svelte';
	import type { FluidConfig, FluidHandle } from './engine/types.js';

	export interface FluidBackgroundProps extends FluidConfig {
		/**
		 * CSS selector for elements within the content slot to exclude
		 * from the fluid. Matched elements become "holes" — the fluid
		 * pools around them. Queried on scroll, resize, and DOM mutation.
		 * Example: `".card, .sidebar"`
		 */
		exclude?: string;
		/** Border radius of exclusion zones in CSS px. Default 16. */
		excludeRadius?: number;
		/** Padding around exclusion zones in CSS px. Default 4. */
		excludePad?: number;
		/** Class applied to the outer wrapper div. */
		class?: string;
		/** Inline style applied to the outer wrapper div. */
		style?: string;
		/** Page content rendered above the fluid canvas. */
		children?: Snippet;
	}
</script>

<script lang="ts">
	import { onMount } from 'svelte';
	import Fluid from './Fluid.svelte';
	import type { ContainerShape } from './engine/types.js';

	let {
		exclude: excludeSelector,
		excludeRadius = 16,
		excludePad = 4,
		class: className,
		style,
		children,
		// Background-optimized defaults (consumer can override)
		simResolution = 64,
		dyeResolution = 512,
		pressureIterations = 6,
		bloomIterations = 4,
		randomSplatRate = 0,
		initialSplatCount = 0,
		backColor = { r: 8, g: 8, b: 16 },
		...fluidProps
	}: FluidBackgroundProps = $props();

	const MASK_RES = 512;
	const THROTTLE_MS = 80;

	let contentEl: HTMLDivElement | undefined = $state(undefined);
	let shape: ContainerShape | null = $state(null);
	let inner = $state<{ handle: FluidHandle } | undefined>(undefined);

	/** Build an SVG rounded-rect subpath for one exclusion zone. */
	function rrPath(x: number, y: number, w: number, h: number, r: number): string {
		r = Math.min(r, w / 2, h / 2);
		if (r <= 0) return `M${x},${y}h${w}v${h}h${-w}Z`;
		return (
			`M${x + r},${y}H${x + w - r}` +
			`A${r},${r},0,0,1,${x + w},${y + r}V${y + h - r}` +
			`A${r},${r},0,0,1,${x + w - r},${y + h}H${x + r}` +
			`A${r},${r},0,0,1,${x},${y + h - r}V${y + r}` +
			`A${r},${r},0,0,1,${x + r},${y}Z`
		);
	}

	function buildPath(): string | null {
		if (!excludeSelector || !contentEl) return null;
		const vw = window.innerWidth;
		const vh = window.innerHeight;
		const pad = excludePad;
		const r = excludeRadius;

		let d = `M0,0H${vw}V${vh}H0Z`;
		const els = contentEl.querySelectorAll(excludeSelector);
		for (const el of els) {
			const b = el.getBoundingClientRect();
			if (b.bottom < -pad || b.top > vh + pad || b.right < -pad || b.left > vw + pad)
				continue;
			d += rrPath(b.left - pad, b.top - pad, b.width + pad * 2, b.height + pad * 2, r + pad);
		}
		return d;
	}

	let prevD = '';
	function sync() {
		const d = buildPath();
		if (d === null) {
			if (shape !== null) {
				shape = null;
				prevD = '';
			}
			return;
		}
		if (d === prevD) return;
		prevD = d;
		shape = {
			type: 'svgPath',
			d,
			viewBox: [0, 0, window.innerWidth, window.innerHeight],
			fillRule: 'evenodd',
			maskResolution: MASK_RES
		};
	}

	onMount(() => {
		sync();

		let timer: ReturnType<typeof setTimeout> | undefined;
		const kick = () => {
			if (timer != null) return;
			timer = setTimeout(() => {
				timer = undefined;
				sync();
			}, THROTTLE_MS);
		};

		window.addEventListener('resize', kick);
		window.addEventListener('scroll', kick, { passive: true });

		// Detect content DOM changes (elements added/removed)
		const mo = new MutationObserver(kick);
		if (contentEl) mo.observe(contentEl, { childList: true, subtree: true });

		return () => {
			window.removeEventListener('resize', kick);
			window.removeEventListener('scroll', kick);
			mo.disconnect();
			clearTimeout(timer);
		};
	});

	/** Imperative API forwarded to the inner Fluid. */
	export const handle: FluidHandle = {
		splat: (x, y, dx, dy, color) => inner?.handle.splat(x, y, dx, dy, color),
		randomSplats: (count) => inner?.handle.randomSplats(count),
		pause: () => inner?.handle.pause(),
		resume: () => inner?.handle.resume(),
		get isPaused() {
			return inner?.handle.isPaused ?? true;
		}
	};
</script>

<div class={`svelte-fluid-bg ${className ?? ''}`.trim()} {style}>
	<div class="svelte-fluid-bg__canvas">
		<Fluid
			bind:this={inner}
			containerShape={shape}
			{simResolution}
			{dyeResolution}
			{pressureIterations}
			{bloomIterations}
			{randomSplatRate}
			{initialSplatCount}
			{backColor}
			{...fluidProps}
		/>
	</div>
	<div class="svelte-fluid-bg__content" bind:this={contentEl}>
		{@render children?.()}
	</div>
</div>

<style>
	.svelte-fluid-bg {
		position: relative;
		min-height: 100vh;
	}
	.svelte-fluid-bg__canvas {
		position: fixed;
		inset: 0;
		z-index: 0;
	}
	.svelte-fluid-bg__canvas :global(canvas) {
		touch-action: pan-y !important;
		cursor: crosshair;
	}
	.svelte-fluid-bg__content {
		position: relative;
		z-index: 1;
		pointer-events: none;
	}
</style>
