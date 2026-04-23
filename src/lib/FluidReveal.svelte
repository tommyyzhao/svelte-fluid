<!--
  svelte-fluid — FluidReveal component

  Fluid simulation as an opacity mask over slotted content. Cursor
  movement injects dye, and the REVEAL display shader converts dye
  intensity to transparency — "revealing" the children underneath.

  The canvas sits on top of the content (z-index 1). Where the shader
  outputs alpha < 1, browser compositing shows the content below.

  See ADR-0027 for design rationale.
-->

<script lang="ts" module>
	import type { Snippet } from 'svelte';
	import type { FluidConfig, FluidHandle, RGB } from './engine/types.js';

	export interface FluidRevealProps extends FluidConfig {
		/**
		 * How easily areas reveal. Multiplier on dye intensity before
		 * the power curve. Higher = less dye needed. Default 0.1.
		 */
		sensitivity?: number;
		/**
		 * Power exponent for the reveal alpha curve. Lower values create
		 * a steeper threshold (more binary), higher values create a
		 * softer gradient. Default 0.1.
		 */
		curve?: number;
		/**
		 * Whether revealed areas gradually fade back to covered.
		 * `true` → multiplicative dissipation 0.995 (slow fade-back).
		 * `false` → multiplicative dissipation 1.0 (permanent reveal).
		 * Overridden by `fadeSpeed` if both are provided.
		 * Default `true`.
		 */
		fadeBack?: boolean;
		/**
		 * Explicit density dissipation value (multiplicative).
		 * 1.0 = permanent reveal, 0.99 = slow fade-back, 0.9 = fast fade.
		 * Takes precedence over `fadeBack` when provided.
		 */
		fadeSpeed?: number;
		/**
		 * Enable automatic Lissajous curve animation before user interaction.
		 * The animation injects dye along a smooth path, gradually revealing
		 * content. Stops on the first pointer/touch event. Default `false`.
		 */
		autoReveal?: boolean;
		/**
		 * Speed multiplier for the auto-reveal animation. Higher values
		 * make the Lissajous curve trace faster. Default `1.0`.
		 */
		autoRevealSpeed?: number;
		/** Optional fixed width in CSS pixels. Omit to fill the parent container. */
		width?: number;
		/** Optional fixed height in CSS pixels. Omit to fill the parent container. */
		height?: number;
		/**
		 * Defer engine creation until the container enters the viewport.
		 * Recommended on pages with many instances. Default `false`.
		 */
		lazy?: boolean;
		/**
		 * Automatically pause when not visible. Default `true`.
		 */
		autoPause?: boolean;
		/** Class applied to the outer wrapper div. */
		class?: string;
		/** Inline style applied to the outer wrapper div. */
		style?: string;
		/**
		 * Content rendered behind the fluid mask, revealed by interaction.
		 *
		 * **Note:** The canvas sits on top of the content for alpha compositing.
		 * Interactive elements (links, buttons) inside children will not receive
		 * pointer events because the canvas layer intercepts them. Use FluidReveal
		 * for visual/decorative content. For interactive content, set
		 * `pointerInput={false}` and drive splats manually via `handle.splat()`.
		 */
		children?: Snippet;
	}
</script>

<script lang="ts">
	import { onMount } from 'svelte';
	import Fluid from './Fluid.svelte';

	let {
		sensitivity = 0.1,
		curve = 0.1,
		fadeBack = true,
		fadeSpeed,
		autoReveal = false,
		autoRevealSpeed = 1.0,
		lazy = false,
		autoPause = true,
		width,
		height,
		class: className,
		style,
		children,
		// Reveal-friendly defaults (consumer can override).
		// curl=0 skips vorticity passes; multiplicative dissipation
		// (activated by reveal=true) matches the reference physics.
		densityDissipation: densityDissipationProp,
		splatRadius = 0.2,
		splatOnHover = false,
		initialSplatCount = 0,
		bloom = false,
		sunrays = false,
		shading = false,
		velocityDissipation = 0.9,
		curl = 0,
		pointerInput = false,
		backColor = { r: 0, g: 0, b: 0 },
		...fluidProps
	}: FluidRevealProps = $props();

	let inner = $state<{ handle: FluidHandle } | undefined>(undefined);
	let canvasWrapperEl: HTMLDivElement | undefined = $state(undefined);

	// ---- Pointer-driven reveal splats ----
	// Non-uniform dye color: display shader inverts to (1-r, 1-g, 1-b),
	// producing iridescent blue-tinted fringes at reveal edges.
	const REVEAL_DYE: RGB = { r: 0.95, g: 0.84, b: 0.68 };
	const SPLAT_FORCE = 6000;
	let prevPtrX = -1;
	let prevPtrY = -1;

	function handlePointerMove(e: PointerEvent) {
		const rect = canvasWrapperEl?.getBoundingClientRect();
		if (!rect || !inner) return;
		const x = (e.clientX - rect.left) / rect.width;
		// Flip to GL space (0 = bottom, 1 = top) — engine.splat() expects this.
		const y = 1.0 - (e.clientY - rect.top) / rect.height;
		if (prevPtrX < 0) {
			prevPtrX = x;
			prevPtrY = y;
			return;
		}
		const dx = (x - prevPtrX) * SPLAT_FORCE;
		const dy = (y - prevPtrY) * SPLAT_FORCE;
		prevPtrX = x;
		prevPtrY = y;
		inner.handle.splat(x, y, dx, dy, REVEAL_DYE);
	}

	function handlePointerLeave() {
		prevPtrX = -1;
		prevPtrY = -1;
	}

	// ---- Auto-reveal animation ----
	let autoRevealRaf: number | undefined;
	let autoRevealPrevX = 0.5;
	let autoRevealPrevY = 0.5;
	let userInteracted = false;

	function startAutoReveal() {
		const startTime = performance.now();
		function tick(now: number) {
			if (userInteracted) {
				autoRevealRaf = undefined;
				return;
			}
			// inner may not be bound on the first tick — keep retrying
			if (!inner) {
				autoRevealRaf = requestAnimationFrame(tick);
				return;
			}
			const t = (now - startTime) * 0.001 * autoRevealSpeed;
			const x = 0.5 + 0.25 * Math.cos(0.7 * t) * Math.sin(0.9 * t);
			const y = 0.5 + 0.15 * Math.sin(1.1 * t);
			const dx = 800 * (x - autoRevealPrevX);
			const dy = 800 * (y - autoRevealPrevY);
			autoRevealPrevX = x;
			autoRevealPrevY = y;
			// High-intensity white — dye color doesn't matter for reveal, only intensity
			inner.handle.splat(x, y, dx, dy, { r: 10, g: 10, b: 10 });
			autoRevealRaf = requestAnimationFrame(tick);
		}
		autoRevealRaf = requestAnimationFrame(tick);
	}

	function handleInteraction() {
		if (userInteracted) return;
		userInteracted = true;
		if (autoRevealRaf != null) {
			cancelAnimationFrame(autoRevealRaf);
			autoRevealRaf = undefined;
		}
	}

	// Multiplicative dissipation: 1.0 = no fade, 0.995 = slow fade.
	// Precedence: fadeSpeed > densityDissipation prop > fadeBack default.
	const dissipation = $derived(
		fadeSpeed !== undefined
			? fadeSpeed
			: densityDissipationProp !== undefined
				? densityDissipationProp
				: fadeBack
					? 0.995
					: 1.0
	);

	onMount(() => {
		if (autoReveal) startAutoReveal();

		const wrapper = canvasWrapperEl;
		if (wrapper) {
			// Pointer-driven reveal splats
			wrapper.addEventListener('pointermove', handlePointerMove);
			wrapper.addEventListener('pointerleave', handlePointerLeave);
			// Stop auto-reveal on first user interaction
			wrapper.addEventListener('pointerdown', handleInteraction);
			wrapper.addEventListener('touchstart', handleInteraction, { passive: true });
		}

		return () => {
			if (autoRevealRaf != null) cancelAnimationFrame(autoRevealRaf);
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
		}
	};
</script>

<div
	class={`svelte-fluid-reveal ${className ?? ''}`.trim()}
	{style}
	style:width={width ? `${width}px` : undefined}
	style:height={height ? `${height}px` : undefined}
>
	<div class="svelte-fluid-reveal__content">
		{@render children?.()}
	</div>
	<div class="svelte-fluid-reveal__canvas" bind:this={canvasWrapperEl}>
		<Fluid
			bind:this={inner}
			reveal={true}
			revealSensitivity={sensitivity}
			revealCurve={curve}
			densityDissipation={dissipation}
			{splatRadius}
			{splatOnHover}
			{initialSplatCount}
			{bloom}
			{sunrays}
			{shading}
			{velocityDissipation}
			{curl}
			{pointerInput}
			{backColor}
			{lazy}
			{autoPause}
			{...fluidProps}
		/>
	</div>
</div>

<style>
	.svelte-fluid-reveal {
		position: relative;
		overflow: hidden;
		width: 100%;
		height: 100%;
	}
	.svelte-fluid-reveal__content {
		position: relative;
		z-index: 0;
		width: 100%;
		height: 100%;
	}
	.svelte-fluid-reveal__canvas {
		position: absolute;
		inset: 0;
		z-index: 1;
		pointer-events: auto;
	}
</style>
