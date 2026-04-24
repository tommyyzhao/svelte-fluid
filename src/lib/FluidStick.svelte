<!--
  svelte-fluid — FluidStick component

  Fluid simulation where dye "sticks" to a mask shape (text or SVG path).
  The mask modulates three physics shaders: advection (reduced dissipation
  so dye persists on the mask), pressure (artificial repulsion so fluid
  flows around the shape), and splat (amplified intensity so more dye
  deposits on the mask).

  Unlike container shapes which *confine* fluid, sticky masks *attract*
  and retain dye while the fluid flows freely everywhere.
-->

<script lang="ts" module>
	import type { FluidConfig, FluidHandle, RGB, StickyMask } from './engine/types.js';

	export interface FluidStickProps extends FluidConfig {
		/** Text to render as the sticky mask. Takes precedence over `d`. */
		text?: string;
		/** CSS font string for text mode. Default `'bold 72px sans-serif'`. */
		font?: string;
		/** SVG path data for the sticky mask. */
		d?: string;
		/** viewBox for path mode. Default `[0, 0, 100, 100]`. */
		maskViewBox?: [number, number, number, number];
		/** Fill rule for path mode. Default `'nonzero'`. */
		maskFillRule?: 'nonzero' | 'evenodd';
		/** Mask rasterization resolution. Default 512. */
		maskResolution?: number;
		/** Blur radius on the mask (mask pixels). Default 4. */
		maskBlur?: number;
		/**
		 * How strongly dye dissipation is reduced on the mask.
		 * 0 = no effect, 1 = dye never fades on mask. Default 0.9.
		 */
		strength?: number;
		/**
		 * Artificial pressure on the mask to push fluid around it.
		 * 0 = no effect. Default 0.15.
		 */
		stickyPressureAmount?: number;
		/**
		 * Splat intensity multiplier on the mask. Default 0.3.
		 */
		amplify?: number;
		/**
		 * Enable automatic Lissajous curve animation. Splats trace
		 * a path to deposit dye on the mask before user interaction.
		 * Default `true`.
		 */
		autoAnimate?: boolean;
		/** Speed multiplier for auto-animation. Default 1.0. */
		autoAnimateSpeed?: number;
		/** Optional fixed width in CSS pixels. */
		width?: number;
		/** Optional fixed height in CSS pixels. */
		height?: number;
		/** Defer engine creation until visible. Default false. */
		lazy?: boolean;
		/** Auto-pause when not visible. Default true. */
		autoPause?: boolean;
		/** Class applied to the outer wrapper. */
		class?: string;
		/** Inline style applied to the outer wrapper. */
		style?: string;
	}
</script>

<script lang="ts">
	import { onMount } from 'svelte';
	import Fluid from './Fluid.svelte';

	let {
		text,
		font = 'bold 72px sans-serif',
		d,
		maskViewBox,
		maskFillRule,
		maskResolution = 512,
		maskBlur = 4,
		strength = 1.0,
		stickyPressureAmount = 0.15,
		amplify = 0.3,
		autoAnimate = true,
		autoAnimateSpeed = 1.0,
		lazy = false,
		autoPause = true,
		width,
		height,
		class: className,
		style,
		// Sticky uses multiplicative dissipation for dye (like REVEAL mode).
		// 0.85 = aggressive 15%/frame off-mask fade so sticky contrast
		// is immediately visible. On-mask: dissipation → 1.0 (never fades).
		densityDissipation = 0.85,
		velocityDissipation = 0.2,
		curl = 20,
		splatRadius = 0.25,
		splatForce = 6000,
		shading = true,
		colorful = true,
		bloom = false,
		sunrays = false,
		initialSplatCount = 20,
		backColor = { r: 0, g: 0, b: 0 },
		transparent = false,
		randomSplatRate = 0,
		randomSplatCount = 0,
		pointerInput = true,
		splatOnHover = true,
		...fluidProps
	}: FluidStickProps = $props();

	let inner = $state<{ handle: FluidHandle } | undefined>(undefined);

	let stickyMask = $derived.by((): StickyMask => ({
		text,
		font,
		d,
		viewBox: maskViewBox,
		fillRule: maskFillRule,
		maskResolution,
		blur: maskBlur,
	}));

	// Auto-animate: Lissajous curve deposits dye before user interaction
	let autoAnimateRaf: number | undefined;
	let prevX = 0.5;
	let prevY = 0.5;
	let userInteracted = false;

	function onPointerActivity() {
		userInteracted = true;
	}

	function startAutoAnimate() {
		const startTime = performance.now();
		function tick(now: number) {
			if (userInteracted) {
				autoAnimateRaf = undefined;
				return;
			}
			if (!inner) {
				autoAnimateRaf = requestAnimationFrame(tick);
				return;
			}
			const t = (now - startTime) * 0.001 * autoAnimateSpeed;
			const x = 0.5 - 0.45 * Math.sin(0.003 * (now - startTime) - 2);
			const y = 0.5 + 0.1 * Math.sin(0.0025 * (now - startTime)) + 0.1 * Math.cos(0.002 * (now - startTime));
			const dx = 5 * (x - prevX) * innerWidth;
			const dy = 5 * (y - prevY) * innerHeight;
			prevX = x;
			prevY = y;
			// Low-intensity splat: off-mask dye fades quickly,
			// on-mask accumulates to reveal the shape over time
			inner.handle.splat(x, y, dx, -dy, { r: 0.3, g: 0.15, b: 0.3 });
			autoAnimateRaf = requestAnimationFrame(tick);
		}
		autoAnimateRaf = requestAnimationFrame(tick);
	}

	onMount(() => {
		if (autoAnimate) startAutoAnimate();
		return () => {
			if (autoAnimateRaf != null) cancelAnimationFrame(autoAnimateRaf);
		};
	});

	export const handle: FluidHandle = {
		splat: (x, y, dx, dy, color) => inner?.handle.splat(x, y, dx, dy, color),
		randomSplats: (count) => inner?.handle.randomSplats(count),
		pause: () => inner?.handle.pause(),
		resume: () => inner?.handle.resume(),
		get isPaused() { return inner?.handle.isPaused ?? true; }
	};
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="svelte-fluid-stick {className ?? ''}"
	style:width={width != null ? `${width}px` : undefined}
	style:height={height != null ? `${height}px` : undefined}
	{style}
	onpointerdown={onPointerActivity}
	onpointermove={onPointerActivity}
>
	<Fluid
		bind:this={inner}
		sticky={true}
		{stickyMask}
		stickyStrength={strength}
		stickyPressure={stickyPressureAmount}
		stickyAmplify={amplify}
		{densityDissipation}
		{velocityDissipation}
		{curl}
		{splatRadius}
		{splatForce}
		{shading}
		{colorful}
		{bloom}
		{sunrays}
		{initialSplatCount}
		{backColor}
		{transparent}
		{randomSplatRate}
		{randomSplatCount}
		{pointerInput}
		{splatOnHover}
		{lazy}
		{autoPause}
		{...fluidProps}
	/>
</div>

<style>
	.svelte-fluid-stick {
		width: 100%;
		height: 100%;
		position: relative;
	}
</style>
