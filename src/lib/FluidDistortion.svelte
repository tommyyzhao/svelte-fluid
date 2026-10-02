<!--
  svelte-fluid — FluidDistortion component

  Fluid simulation as an image distortion layer. Cursor movement
  creates velocity splats that warp the underlying image like
  liquid glass.

  The canvas renders the distorted image directly — where there is
  velocity, the image UVs are offset, creating ripple / warp effects.

  Inspired by Ksenia Kondrashova's "Liquid Distortion Effect (WebGL)"
  CodePen, built on Pavel Dobryakov's fluid simulation.
-->

<script lang="ts" module>
	export type { FluidDistortionProps } from './engine/types.js';
</script>

<script lang="ts">
	import type { FluidDistortionProps, FluidHandle } from './engine/types.js';
	import { onMount, untrack } from 'svelte';
	import Fluid from './Fluid.svelte';
	import { createDistortionPresetSplats } from './engine/distortion-splats.js';
	import { notifyHost } from './engine/notify-host.js';
	import { DISABLED_PERFORMANCE_STATE } from './engine/performance-governor.js';
	import { randomSeed } from './engine/rng.js';

	let {
		src,
		strength = 0.4,
		intensity = 24,
		fit = 'cover',
		scale = 1.0,
		autoDistort = false,
		autoDistortSpeed = 1.0,
		initialSplats = 20,
		bleed = 60,
		lazy = false,
		autoPause = true,
		width,
		height,
		class: className,
		style,
		children,
		// Distortion-friendly defaults — larger splats and no pressure
		// retention produce smooth, blobby distortion like the reference.
		// initialDensityDissipation holds dye at full intensity during
		// the chaos phase, then ramps down to the steady-state dissipation.
		densityDissipation: densityDissipationProp = 0.98,
		initialDensityDissipation = 0.5,
		initialDensityDissipationDuration = 2,
		splatRadius = 1,
		splatOnHover = false,
		initialSplatCount = 0,
		bloom = false,
		sunrays = false,
		shading = false,
		velocityDissipation = 0.97,
		curl = 0,
		pressure = 0,
		pointerInput = false,
		backColor = { r: 0, g: 0, b: 0 },
		seed: seedProp,
		onReady,
		onError,
		poster,
		...fluidProps
	}: FluidDistortionProps = $props();

	let inner = $state<{ handle: FluidHandle } | undefined>(undefined);
	let canvasWrapperEl: HTMLDivElement | undefined = $state(undefined);
	// Gate programmatic splats until the inner engine exists.
	let fluidReady = false;

	// ---- Bleed: extend canvas beyond visible area ----
	let containerW = $state(0);
	let containerH = $state(0);
	// UV fraction of each side that's bleed (invisible overflow).
	// Formula: bleed_px / (container_px + 2 * bleed_px)
	let bleedFracX = $derived(containerW > 0 ? bleed / (containerW + 2 * bleed) : 0);
	let bleedFracY = $derived(containerH > 0 ? bleed / (containerH + 2 * bleed) : 0);

	// ---- Initial chaos splats (construct-only) ----
	// Seeded so a given `seed` reproduces the opening scene.
	// The initialDensityDissipation ramp burns them off over ~2 seconds.
	const stableSeed = untrack(() => (seedProp ?? randomSeed()) >>> 0);
	const stableInitialSplats = untrack(() => createDistortionPresetSplats(stableSeed, initialSplats));

	// ---- Pointer-driven distortion splats ----
	// Pixel-based velocity to match Ascend-Fluid reference (see FluidReveal).
	const MOUSE_FORCE = 5;
	const TOUCH_FORCE = 8;
	let prevClientX = -1;
	let prevClientY = -1;

	function handlePointerMove(e: PointerEvent) {
		const rect = canvasWrapperEl?.getBoundingClientRect();
		if (!rect || !inner || !fluidReady) return;
		const x = (e.clientX - rect.left) / rect.width;
		const y = 1.0 - (e.clientY - rect.top) / rect.height;
		if (prevClientX < 0) {
			prevClientX = e.clientX;
			prevClientY = e.clientY;
			return;
		}
		const force = e.pointerType === 'touch' ? TOUCH_FORCE : MOUSE_FORCE;
		const dx = (e.clientX - prevClientX) * force;
		const dy = -(e.clientY - prevClientY) * force;
		prevClientX = e.clientX;
		prevClientY = e.clientY;
		// Inject scalar intensity into dye — the distortion shader reads dye.r
		// as the offset amount, velocity provides the direction.
		inner.handle.splat(x, y, dx, dy, { r: intensity * 0.001, g: 0, b: 0 });
	}

	function handlePointerLeave() {
		prevClientX = -1;
		prevClientY = -1;
	}

	// ---- Auto-distort animation ----
	let autoDistortRaf: number | undefined;
	let autoDistortPrevX = 0.5;
	let autoDistortPrevY = 0.5;
	let userInteracted = false;

	function startAutoDistort() {
		// Accumulate elapsed time only across ready frames so a pause/resume (or a
		// not-yet-ready engine) never makes the curve jump.
		let elapsed = 0;
		let previousReadyFrame: number | undefined;
		function tick(now: number) {
			if (userInteracted) {
				autoDistortRaf = undefined;
				return;
			}
			if (!inner || !fluidReady || inner.handle.isPaused) {
				previousReadyFrame = undefined;
				autoDistortRaf = requestAnimationFrame(tick);
				return;
			}
			if (previousReadyFrame !== undefined) elapsed += now - previousReadyFrame;
			previousReadyFrame = now;
			// `autoDistortSpeed` scales curve time (it was previously ignored).
			const t = elapsed * 0.001 * autoDistortSpeed;
			const x = 0.5 + 0.25 * Math.sin(2 * t - Math.PI);
			const y = 0.5 + 0.1 * Math.sin(5 * t) * Math.cos(2 * t);
			const dx = 800 * (x - autoDistortPrevX);
			const dy = 800 * (y - autoDistortPrevY);
			autoDistortPrevX = x;
			autoDistortPrevY = y;
			inner.handle.splat(x, y, dx, dy, { r: intensity * 0.001, g: 0, b: 0 });
			autoDistortRaf = requestAnimationFrame(tick);
		}
		autoDistortRaf = requestAnimationFrame(tick);
	}

	function handleInteraction() {
		if (userInteracted) return;
		userInteracted = true;
		if (autoDistortRaf != null) {
			cancelAnimationFrame(autoDistortRaf);
			autoDistortRaf = undefined;
		}
	}

	onMount(() => {
		if (autoDistort) startAutoDistort();

		const wrapper = canvasWrapperEl;
		if (wrapper) {
			wrapper.addEventListener('pointermove', handlePointerMove);
			wrapper.addEventListener('pointerleave', handlePointerLeave);
			wrapper.addEventListener('pointerdown', handleInteraction);
			wrapper.addEventListener('touchstart', handleInteraction, { passive: true });
		}

		return () => {
			if (autoDistortRaf != null) cancelAnimationFrame(autoDistortRaf);
			if (wrapper) {
				wrapper.removeEventListener('pointermove', handlePointerMove);
				wrapper.removeEventListener('pointerleave', handlePointerLeave);
				wrapper.removeEventListener('pointerdown', handleInteraction);
				wrapper.removeEventListener('touchstart', handleInteraction);
			}
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
		},
		getPerformanceState: () => inner?.handle.getPerformanceState() ?? DISABLED_PERFORMANCE_STATE
	};
</script>

<div
	class={`svelte-fluid-distortion ${className ?? ''}`.trim()}
	{style}
	style:width={width ? `${width}px` : undefined}
	style:height={height ? `${height}px` : undefined}
	bind:clientWidth={containerW}
	bind:clientHeight={containerH}
>
	{#if children}
		<div class="svelte-fluid-distortion__content">
			{@render children()}
		</div>
	{/if}
	<div
		class="svelte-fluid-distortion__canvas"
		bind:this={canvasWrapperEl}
		style:inset="{-bleed}px"
	>
		<Fluid
			bind:this={inner}
			distortion={true}
			distortionPower={strength}
			distortionImageUrl={src}
			distortionFit={fit}
			distortionScale={scale}
			distortionBleedX={bleedFracX}
			distortionBleedY={bleedFracY}
			densityDissipation={densityDissipationProp}
			{initialDensityDissipation}
			{initialDensityDissipationDuration}
			{splatRadius}
			{splatOnHover}
			{initialSplatCount}
			presetSplats={stableInitialSplats}
			{bloom}
			{sunrays}
			{shading}
			{velocityDissipation}
			{curl}
			{pressure}
			{pointerInput}
			{backColor}
			{lazy}
			{autoPause}
			poster={poster ?? src}
			{...fluidProps}
			seed={stableSeed}
			onReady={() => {
				fluidReady = true;
				notifyHost(onReady, 'onReady');
			}}
			onError={(error) => {
				fluidReady = false;
				notifyHost(onError, 'onError', error);
			}}
		/>
	</div>
</div>

<style>
	.svelte-fluid-distortion {
		position: relative;
		overflow: hidden;
		overflow: clip;
		contain: layout paint;
		isolation: isolate;
		width: 100%;
		height: 100%;
	}
	.svelte-fluid-distortion__content {
		position: relative;
		z-index: 0;
		width: 100%;
		height: 100%;
	}
	.svelte-fluid-distortion__canvas {
		position: absolute;
		inset: 0;
		z-index: 1;
		pointer-events: auto;
	}
</style>
