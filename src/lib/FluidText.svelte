<!--
  svelte-fluid — FluidText component

  Fluid simulation confined inside text letterforms. The text is
  rasterized to a mask texture via the engine's svgPath text mode,
  and the component auto-sizes its aspect ratio from text metrics
  so the font appears the same visual size regardless of text length.
-->

<script lang="ts" module>
	import type { FluidConfig, FluidHandle } from './engine/types.js';

	export interface FluidTextProps extends FluidConfig {
		/** The text to render as fluid-filled letterforms. */
		text: string;
		/**
		 * CSS font string for the mask rasterization.
		 * Default `'bold 100px "Helvetica Neue", Arial, sans-serif'`.
		 */
		font?: string;
		/** Mask rasterization resolution. Default 512. */
		maskResolution?: number;
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
	import Fluid from './Fluid.svelte';
	import type { ContainerShape } from './engine/types.js';

	let {
		text,
		font = 'bold 100px "Helvetica Neue", Arial, sans-serif',
		maskResolution = 512,
		height,
		lazy = false,
		autoPause = true,
		transparent = true,
		class: className,
		style,
		...fluidProps
	}: FluidTextProps = $props();

	let inner = $state<{ handle: FluidHandle } | undefined>(undefined);

	// Measure text to compute natural aspect ratio so font appears
	// the same visual size regardless of text length.
	let aspectRatio = $derived.by(() => {
		if (typeof OffscreenCanvas === 'undefined') {
			// SSR fallback: rough estimate
			return Math.max(text.length * 0.6, 1);
		}
		const canvas = new OffscreenCanvas(1, 1);
		const ctx = canvas.getContext('2d')!;
		ctx.font = font;
		const metrics = ctx.measureText(text);
		const textW = metrics.width;
		const ascent = metrics.actualBoundingBoxAscent;
		const descent = metrics.actualBoundingBoxDescent;
		const textH = ascent + descent;
		if (textH <= 0) return Math.max(text.length * 0.6, 1);
		return textW / textH;
	});

	let shape = $derived<ContainerShape>({
		type: 'svgPath',
		text,
		font,
		maskResolution
	});

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
	class="svelte-fluid-text {className ?? ''}"
	style:height={height != null ? `${height}px` : undefined}
	style:aspect-ratio={aspectRatio}
	{style}
	aria-label={text}
>
	<Fluid
		bind:this={inner}
		containerShape={shape}
		{transparent}
		{lazy}
		{autoPause}
		{...fluidProps}
	/>
</div>

<style>
	.svelte-fluid-text {
		position: relative;
		display: inline-block;
	}
</style>
