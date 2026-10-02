<!--
  svelte-fluid — FluidReveal component

  Fluid simulation as an opacity mask over slotted content. Cursor
  movement injects dye, and the REVEAL display shader converts dye
  intensity to transparency — "revealing" the children underneath.

  The canvas sits on top of the content (z-index 1). Where the shader
  outputs alpha < 1, browser compositing shows the content below.

  See ADR-0027 for design rationale.

  Contrast: the children are plain DOM, so their contrast is the consumer's
  text colour vs the page. Fully revealed pixels (cover alpha < 0.1) keep >= 80%
  of it (measured). The cover/fringe is a deliberate partial state and is not
  AA-guaranteed; reduced motion drops the cover entirely (ADR-0086).
-->

<script lang="ts" module>
	export type { FluidRevealProps } from './engine/types.js';
</script>

<script lang="ts">
	import type { FluidRevealProps, FluidHandle, RGB } from './engine/types.js';
	import { onMount } from 'svelte';
	import Fluid from './Fluid.svelte';
	import { DISABLED_PERFORMANCE_STATE } from './engine/performance-governor.js';
	import { prefersReducedMotion, watchReducedMotion } from './engine/reduced-motion.js';

	let {
		sensitivity = 0.1,
		curve = 0.5,
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
		// curl=0 skips vorticity passes; pressure=1.0 disables pressure
		// relaxation for clean laminar flow (matches Ascend-Fluid reference);
		// multiplicative dissipation (activated by reveal=true) matches
		// the reference physics.
		densityDissipation: densityDissipationProp,
		splatRadius = 0.2,
		splatOnHover = false,
		initialSplatCount = 0,
		bloom = false,
		sunrays = false,
		shading = false,
		velocityDissipation = 0.98,
		pressure = 1.0,
		curl = 0,
		openBoundary = true,
		pointerInput = false,
		backColor = { r: 0, g: 0, b: 0 },
		coverColor,
		accentColor,
		fringeColor,
		...fluidProps
	}: FluidRevealProps = $props();

	let inner = $state<{ handle: FluidHandle } | undefined>(undefined);
	let canvasWrapperEl: HTMLDivElement | undefined = $state(undefined);
	// Reduced motion: drop the cover canvas so the content is shown still, in full.
	let reduced = $state(prefersReducedMotion());

	// ---- Pointer-driven reveal splats ----
	// The display shader blends coverColor → accentColor based on dye
	// intensity, so the dye only needs to provide nonzero intensity for
	// the reveal threshold — the actual RGB doesn't affect output color.
	// White dye gives maximum intensity per splat.
	const revealDye: RGB = { r: 1, g: 1, b: 1 };
	// Pixel-based velocity to match Ascend-Fluid reference.
	// Ascend uses 5× pixel delta for mouse, 8× for touch.
	// The old approach (normalized delta × 6000) was canvas-size-dependent —
	// small canvases produced disproportionately high velocities.
	const MOUSE_FORCE = 5;
	const TOUCH_FORCE = 8;
	let prevClientX = -1;
	let prevClientY = -1;

	function handlePointerMove(e: PointerEvent) {
		const rect = canvasWrapperEl?.getBoundingClientRect();
		if (!rect || !inner) return;
		const x = (e.clientX - rect.left) / rect.width;
		// Flip to GL space (0 = bottom, 1 = top) — engine.splat() expects this.
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
		inner.handle.splat(x, y, dx, dy, revealDye);
	}

	function handlePointerLeave() {
		prevClientX = -1;
		prevClientY = -1;
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
			// inner may not be bound on the first tick, or the engine paused offscreen — keep retrying
			if (!inner || inner.handle.isPaused) {
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

	// Live reduced-motion toggle: the cover is hidden and auto-reveal stops while
	// reduced (ADR 0085); both come back when the preference clears.
	$effect(() => {
		if (!autoReveal || reduced) return;
		startAutoReveal();
		return () => {
			if (autoRevealRaf != null) cancelAnimationFrame(autoRevealRaf);
			autoRevealRaf = undefined;
		};
	});

	onMount(() => {
		const stopReduced = watchReducedMotion((v) => (reduced = v));

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
			stopReduced();
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
		},
		getPerformanceState: () => inner?.handle.getPerformanceState() ?? DISABLED_PERFORMANCE_STATE
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
	<div class="svelte-fluid-reveal__canvas" class:reduced bind:this={canvasWrapperEl}>
		<Fluid
			bind:this={inner}
			reveal={true}
			revealSensitivity={sensitivity}
			revealCurve={curve}
			revealCoverColor={coverColor}
			revealAccentColor={accentColor}
			revealFringeColor={fringeColor}
			densityDissipation={dissipation}
			{splatRadius}
			{splatOnHover}
			{initialSplatCount}
			{bloom}
			{sunrays}
			{shading}
			{velocityDissipation}
			{pressure}
			{curl}
			{openBoundary}
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
	/* prefers-reduced-motion: no cover, so nothing is hidden or intercepted. */
	.svelte-fluid-reveal__canvas.reduced {
		display: none;
	}
</style>
