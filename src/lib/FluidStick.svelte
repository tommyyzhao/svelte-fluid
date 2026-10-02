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
	export type { FluidStickProps } from './engine/types.js';
</script>

<script lang="ts">
	import type { FluidStickProps, FluidHandle, StickyMask } from './engine/types.js';
	import { onMount } from 'svelte';
	import Fluid from './Fluid.svelte';
	import { DISABLED_PERFORMANCE_STATE } from './engine/performance-governor.js';
	import { prefersReducedMotion } from './engine/reduced-motion.js';

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
		// Sticky uses multiplicative dissipation (like REVEAL mode).
		// 0.98 = 2%/frame off-mask fade — trails visible ~1-2s, matching
		// standard Fluid feel. On-mask (strength 0.95): mix → 0.999,
		// dye persists ~74% after 5s.
		densityDissipation = 0.98,
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
		autoSplatRate = 0.4,
		autoSplatCount = 3,
		autoSplatSwirl = 500,
		autoSplatBandHeight = 2.0,
		pointerInput = true,
		splatOnHover = true,
		...fluidProps
	}: FluidStickProps = $props();

	let inner = $state<{ handle: FluidHandle } | undefined>(undefined);
	let containerW = $state(0);
	let containerH = $state(0);

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
			// Wait for the engine, and while it is paused offscreen
			if (!inner || inner.handle.isPaused) {
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
			const dx = 3 * (x - prevX) * (containerW || 300);
			const dy = 3 * (y - prevY) * (containerH || 300);
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
		if (autoAnimate && !prefersReducedMotion()) startAutoAnimate();
		return () => {
			if (autoAnimateRaf != null) cancelAnimationFrame(autoAnimateRaf);
		};
	});

	export const handle: FluidHandle = {
		splat: (x, y, dx, dy, color) => inner?.handle.splat(x, y, dx, dy, color),
		randomSplats: (count) => inner?.handle.randomSplats(count),
		pause: () => inner?.handle.pause(),
		resume: () => inner?.handle.resume(),
		get isPaused() { return inner?.handle.isPaused ?? true; },
		getPerformanceState: () => inner?.handle.getPerformanceState() ?? DISABLED_PERFORMANCE_STATE
	};
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="svelte-fluid-stick {className ?? ''}"
	style:width={width != null ? `${width}px` : undefined}
	style:height={height != null ? `${height}px` : undefined}
	{style}
	role={text ? 'img' : undefined}
	aria-label={text || undefined}
	bind:clientWidth={containerW}
	bind:clientHeight={containerH}
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
		{autoSplatRate}
		{autoSplatCount}
		{autoSplatSwirl}
		{autoSplatBandHeight}
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
