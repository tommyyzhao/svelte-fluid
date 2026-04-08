<!--
  svelte-fluid — Fluid component
  Derivative work of WebGL-Fluid-Simulation by Pavel Dobryakov (c) 2017, MIT.

  Thin Svelte 5 wrapper around `FluidEngine`. Owns:
  - the canvas element + its parent container
  - the ResizeObserver that triggers teardown+rebuild
  - the stable seed that survives across resizes
  - the imperative `handle` exposed to parents via bind:this
  - the $effect that propagates prop changes via engine.setConfig()
-->

<script lang="ts" module>
	import type { HTMLCanvasAttributes } from 'svelte/elements';
	import type { FluidConfig } from './engine/types.js';

	/** Public props for the `<Fluid />` component. */
	export interface FluidProps
		extends Omit<HTMLCanvasAttributes, 'width' | 'height'>,
			FluidConfig {
		/** Optional fixed width in CSS pixels. Omit to fill the parent container. */
		width?: number;
		/** Optional fixed height in CSS pixels. Omit to fill the parent container. */
		height?: number;
		/** Class applied to the wrapper container. */
		class?: string;
		/** Inline style applied to the wrapper container. */
		style?: string;
	}
</script>

<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { FluidEngine } from './engine/FluidEngine.js';
	import { randomSeed } from './engine/rng.js';
	import type { FluidHandle } from './engine/types.js';

	let {
		width,
		height,
		class: className,
		style,
		seed: seedProp,
		simResolution,
		dyeResolution,
		densityDissipation,
		initialDensityDissipation,
		initialDensityDissipationDuration,
		velocityDissipation,
		pressure,
		pressureIterations,
		curl,
		splatRadius,
		splatForce,
		shading,
		colorful,
		colorUpdateSpeed,
		paused,
		backColor,
		transparent,
		bloom,
		bloomIterations,
		bloomResolution,
		bloomIntensity,
		bloomThreshold,
		bloomSoftKnee,
		sunrays,
		sunraysResolution,
		sunraysWeight,
		initialSplatCount,
		initialSplatCountMin,
		initialSplatCountMax,
		pointerInput = true,
		presetSplats,
		...rest
	}: FluidProps = $props();

	let canvasEl = $state<HTMLCanvasElement | undefined>(undefined);
	let container = $state<HTMLDivElement | undefined>(undefined);
	let engine: FluidEngine | undefined;

	/**
	 * Stable seed: generated once per mount, reused across every
	 * teardown/rebuild so resizing produces the same initial splat pattern.
	 * Intentionally NOT $state — we don't want it to be reactive.
	 * `untrack` reads `seedProp` once without subscribing.
	 */
	const stableSeed = ((untrack(() => seedProp) ?? randomSeed()) >>> 0) as number;

	/**
	 * Stable preset splats. Like `seed`, this is construct-only — the
	 * engine consumes it once during construction. Snapshot via `untrack`
	 * so the `$effect` below doesn't subscribe to a per-render array
	 * reference and so resize re-creates the same opening scene.
	 */
	const stablePresetSplats = untrack(() => presetSplats);

	let cssW = $state(0);
	let cssH = $state(0);

	function buildConfig() {
		return {
			simResolution,
			dyeResolution,
			densityDissipation,
			initialDensityDissipation,
			initialDensityDissipationDuration,
			velocityDissipation,
			pressure,
			pressureIterations,
			curl,
			splatRadius,
			splatForce,
			shading,
			colorful,
			colorUpdateSpeed,
			paused,
			backColor,
			transparent,
			bloom,
			bloomIterations,
			bloomResolution,
			bloomIntensity,
			bloomThreshold,
			bloomSoftKnee,
			sunrays,
			sunraysResolution,
			sunraysWeight,
			initialSplatCount,
			initialSplatCountMin,
			initialSplatCountMax,
			pointerInput,
			seed: stableSeed,
			presetSplats: stablePresetSplats
		};
	}

	function teardown() {
		engine?.dispose();
		engine = undefined;
	}

	function instantiate() {
		if (!canvasEl || cssW === 0 || cssH === 0) return;
		const dpr = window.devicePixelRatio || 1;
		canvasEl.width = Math.max(1, Math.floor(cssW * dpr));
		canvasEl.height = Math.max(1, Math.floor(cssH * dpr));
		engine = new FluidEngine({ canvas: canvasEl, config: buildConfig() });
	}

	/** Imperative API exposed to parents via `bind:this`. */
	export const handle: FluidHandle = {
		splat: (x, y, dx, dy, color) => engine?.splat(x, y, dx, dy, color),
		randomSplats: (count) => engine?.randomSplats(count)
	};

	onMount(() => {
		if (!container) return;
		const ro = new ResizeObserver((entries) => {
			for (const entry of entries) {
				const box = entry.contentBoxSize?.[0];
				const w = box ? box.inlineSize : entry.contentRect.width;
				const h = box ? box.blockSize : entry.contentRect.height;
				if (w === cssW && h === cssH) continue;
				cssW = w;
				cssH = h;
				teardown();
				instantiate();
			}
		});
		ro.observe(container);
		return () => {
			ro.disconnect();
			teardown();
		};
	});

	/**
	 * Hot prop updates. Buckets A/B/C are handled inside `engine.setConfig`.
	 * Bucket D fields (seed / pointerInput / initialSplatCount*) are
	 * applied only at construction time and ignored here.
	 */
	$effect(() => {
		// Touch every tracked field so the effect re-runs on any change.
		const cfg = buildConfig();
		if (engine) engine.setConfig(cfg);
	});
</script>

<div
	bind:this={container}
	class={`svelte-fluid-container ${className ?? ''}`.trim()}
	style:width={width != null ? `${width}px` : undefined}
	style:height={height != null ? `${height}px` : undefined}
	{style}
>
	<canvas bind:this={canvasEl} {...rest}></canvas>
</div>

<style>
	.svelte-fluid-container {
		width: 100%;
		height: 100%;
		position: relative;
		overflow: hidden;
	}
	.svelte-fluid-container canvas {
		display: block;
		width: 100%;
		height: 100%;
		touch-action: none;
	}
</style>
