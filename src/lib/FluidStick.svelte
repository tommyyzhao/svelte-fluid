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
		 * How much of the mask texture the text fills (text mode only).
		 * 0.9 = text fills 90% of the texture (default). Use smaller
		 * values when combining with a container shape (e.g. 0.5 to fit
		 * text inside a circle). Default 0.9.
		 */
		maskPadding?: number;
		/**
		 * How strongly dye dissipation is reduced on the mask.
		 * 0 = no effect, 1 = dye never fades on mask. Default 0.95.
		 */
		strength?: number;
		/**
		 * Artificial pressure on the mask to push fluid around it.
		 * 0 = no effect. Default 0.15.
		 */
		stickyPressureAmount?: number;
		/**
		 * Splat intensity multiplier on the mask. Default 2.0.
		 */
		amplify?: number;
		/**
		 * Enable automatic Lissajous curve animation. Splats trace
		 * a path to deposit dye on the mask before user interaction.
		 * Default `true`.
		 */
		autoAnimate?: boolean;
		/** Speed multiplier for auto-animation. Default 2.0. */
		autoAnimateSpeed?: number;
		/**
		 * How many seconds auto-animation runs before stopping.
		 * Once stopped, off-mask dye fades away, revealing the sticky shape.
		 * 0 = run indefinitely (until user interacts). Default 5.0.
		 */
		autoAnimateDuration?: number;
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
		maskPadding,
		strength = 0.95,
		stickyPressureAmount = 0.15,
		amplify = 2.0,
		autoAnimate = true,
		autoAnimateSpeed = 2.0,
		autoAnimateDuration = 5.0,
		lazy = false,
		autoPause = true,
		width,
		height,
		class: className,
		style,
		// Sticky uses multiplicative dissipation for dye (like REVEAL mode).
		// 0.85 = 15%/frame off-mask fade — dye trails clear within ~500ms,
		// giving clear contrast once auto-animate stops. On-mask: → 1.0.
		densityDissipation = 0.85,
		velocityDissipation = 0.2,
		curl = 20,
		splatRadius = 1.0,
		splatForce = 6000,
		shading = true,
		colorful = true,
		bloom = false,
		sunrays = false,
		initialSplatCount = 20,
		backColor = { r: 0, g: 0, b: 0 },
		transparent = false,
		randomSplatRate = 0.6,
		randomSplatCount = 3,
		randomSplatSwirl = 150,
		randomSplatSpread = 2.0,
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
		padding: maskPadding,
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
		// Defer the clock start: first few frames may be no-ops while
		// the engine is being created (ResizeObserver + lazy loading).
		// Splats silently no-op until the engine exists, then the clock
		// starts on the first frame where inner is available.
		let animStartTime: number | undefined;

		function tick(now: number) {
			if (userInteracted) {
				autoAnimateRaf = undefined;
				return;
			}
			if (!inner) {
				autoAnimateRaf = requestAnimationFrame(tick);
				return;
			}
			if (!animStartTime) animStartTime = now;
			const elapsed = (now - animStartTime) * 0.001;
			if (autoAnimateDuration > 0 && elapsed > autoAnimateDuration) {
				autoAnimateRaf = undefined;
				return;
			}
			const t = elapsed * autoAnimateSpeed;
			const x = 0.5 - 0.45 * Math.sin(3.0 * t - 2);
			const y = 0.5 + 0.15 * Math.sin(2.5 * t) + 0.12 * Math.cos(2.0 * t);
			const dx = 3 * (x - prevX) * innerWidth;
			const dy = 3 * (y - prevY) * innerHeight;
			prevX = x;
			prevY = y;
			// Color-cycling splats: on-mask dye accumulates vivid
			// rainbow hues, off-mask fades once animation stops
			const hue = t * 2.0;
			const r = 1.5 * (Math.sin(hue) * 0.5 + 0.5);
			const g = 1.5 * (Math.sin(hue + 2.094) * 0.5 + 0.5);
			const b = 1.5 * (Math.sin(hue + 4.189) * 0.5 + 0.5);
			inner.handle.splat(x, y, dx, -dy, { r, g, b });
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
