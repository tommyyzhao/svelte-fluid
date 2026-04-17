<!--
  ShapePreview — SVG overlay showing container shape boundaries.
  Positioned absolutely over the playground canvas.
  Uses the same coordinate conventions as the GLSL SDFs:
  - UV origin bottom-left, SVG origin top-left (y is flipped)
  - Circle/annulus radii normalised by canvas height
  - Rect half-sizes in UV space (no aspect correction)
-->

<script lang="ts">
	import type { ContainerShape } from '../../lib/engine/types.js';

	let { shape, width, height }: {
		shape?: ContainerShape; width: number; height: number;
	} = $props();

	/** Rounded rect SVG path. Corner radius uses min(w,h) to stay circular. */
	function rrPath(
		cx: number, cy: number, hw: number, hh: number, cr: number,
		w: number, h: number
	): string {
		const x = (cx - hw) * w;
		const y = (1 - cy - hh) * h;
		const rw = hw * 2 * w;
		const rh = hh * 2 * h;
		const r = Math.min(cr * Math.min(w, h), rw / 2, rh / 2);
		if (r <= 0) return `M${x},${y}h${rw}v${rh}h${-rw}Z`;
		return `M${x + r},${y}h${rw - 2 * r}a${r},${r} 0 0 1 ${r},${r}v${rh - 2 * r}a${r},${r} 0 0 1 ${-r},${r}h${-(rw - 2 * r)}a${r},${r} 0 0 1 ${-r},${-r}v${-(rh - 2 * r)}a${r},${r} 0 0 1 ${r},${-r}Z`;
	}
</script>

{#if shape && width > 0 && height > 0}
	<!-- Small inset so strokes at the canvas edge (e.g. outerHalfW=0.5)
		 don't get clipped by the card's overflow:hidden -->
	{@const inset = 3}
	{@const vw = width - inset * 2}
	{@const vh = height - inset * 2}
	<svg class="shape-preview" viewBox="0 0 {width} {height}" preserveAspectRatio="none">
		<g transform="translate({inset},{inset}) scale({vw / width},{vh / height})">
			{#if shape.type === 'circle'}
				<circle cx={shape.cx * width} cy={(1 - shape.cy) * height} r={shape.radius * height} />
			{:else if shape.type === 'roundedRect'}
				<path d={rrPath(shape.cx, shape.cy, shape.halfW, shape.halfH, shape.cornerRadius, width, height)} />
			{:else if shape.type === 'frame'}
				<path class="inner" d={rrPath(shape.cx, shape.cy, shape.halfW, shape.halfH, shape.innerCornerRadius ?? 0, width, height)} />
				<path class="outer" d={rrPath(shape.cx, shape.cy, shape.outerHalfW ?? 0.5, shape.outerHalfH ?? 0.5, shape.outerCornerRadius ?? 0, width, height)} />
			{:else if shape.type === 'annulus'}
				{@const px = shape.cx * width}
				{@const py = (1 - shape.cy) * height}
				<circle class="outer" cx={px} cy={py} r={shape.outerRadius * height} />
				<circle class="inner" cx={px} cy={py} r={shape.innerRadius * height} />
			{/if}
		</g>
	</svg>
{/if}

<style>
	.shape-preview {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		pointer-events: none;
		z-index: 1;
	}
	.shape-preview :global(circle),
	.shape-preview :global(path) {
		fill: none;
		stroke: rgba(255, 255, 255, 0.5);
		stroke-width: 1.5;
		stroke-dasharray: 6 4;
	}
	.shape-preview :global(.inner) {
		stroke: rgba(255, 100, 100, 0.6);
	}
</style>
