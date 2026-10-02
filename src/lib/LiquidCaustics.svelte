<!--
	Caustic light over live content, only where you act (ADR-0094). Pointer
	moves and focus send a ripple whose refracted light spreads and fades over
	about a second; at rest the overlay draws nothing and schedules nothing.
	The canvas sits above the children with pointer-events none and
	aria-hidden, and only adds light (dark tone, screen blend) or a soft shade
	(light tone): content is never resampled, so text stays crisp, selectable
	and zoomable. The peak strength is clamped so body text keeps ≥ 4.5:1
	against the measured background. Reduced motion, forced colours, offscreen
	or no WebGL2: the content alone.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { cssColorToRgb, measurePageColor } from './engine/css-color.js';
	import { attachSurface, rectIn, resolveTone } from './engine/surface/attach.js';
	import type { SurfaceBinding } from './engine/surface/attach.js';
	import { overlayCap } from './engine/surface/look.js';
	import type { Srgb, SurfaceTone } from './engine/surface/look.js';
	import { OVERLAY_RIPPLE } from './engine/surface/SurfaceEngine.js';
	import { admitRipple } from './engine/surface/wave.js';
	import type { LiquidCausticsProps } from './engine/types.js';

	let { tone = 'auto', intensity, children, class: className = '', onpointermove, onfocusin, ...rest }: LiquidCausticsProps = $props();

	let root: HTMLDivElement;
	let canvas: HTMLCanvasElement;
	let live = $state(false);
	let resolved = $state<SurfaceTone>('light');
	let binding: SurfaceBinding | null = null;
	const gate = { t: -Infinity, x: -Infinity, y: -Infinity };

	/** Peak overlay strength for the measured text and background colours. */
	function strength(): number {
		const bg = measurePageColor(root);
		const text = cssColorToRgb(getComputedStyle(root).color, bg);
		const srgb = (c: { r: number; g: number; b: number }): Srgb => [c.r / 255, c.g / 255, c.b / 255];
		return overlayCap(intensity, srgb(text), srgb(bg), resolved);
	}

	function measure() {
		return {
			control: 'overlay' as const,
			tone: resolved,
			rect: rectIn(root, canvas),
			radius: parseFloat(getComputedStyle(root).borderTopLeftRadius) || 0,
			overlay: strength()
		};
	}

	onMount(() => {
		resolved = resolveTone(tone, root);
		binding = attachSurface(canvas, root, measure, (v) => (live = v));
		return () => binding?.destroy();
	});

	$effect(() => {
		resolved = resolveTone(tone, root);
	});
	$effect(() => {
		void resolved;
		void intensity;
		binding?.update();
	});

	function ripple(x: number, y: number, strength = OVERLAY_RIPPLE) {
		const r = canvas.getBoundingClientRect();
		if (admitRipple(gate, performance.now(), x - r.left, y - r.top)) binding?.press(x - r.left, y - r.top, strength);
	}
</script>

<div
	bind:this={root}
	class="liquid-caustics {className}"
	class:live
	onpointermove={(e) => {
		onpointermove?.(e);
		ripple(e.clientX, e.clientY);
	}}
	onfocusin={(e) => {
		onfocusin?.(e);
		const t = (e.target as Element).getBoundingClientRect();
		// One impulse, not a stroke's several: the strongest press.
		ripple(t.left + t.width / 2, t.top + t.height / 2, 1.5);
	}}
	{...rest}
>
	{@render children?.()}
	<canvas bind:this={canvas} class:screen={resolved === 'dark'} aria-hidden="true"></canvas>
</div>

<style>
	.liquid-caustics {
		position: relative;
	}
	canvas {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		pointer-events: none;
		display: none;
	}
	/* Dark tone adds light: screen never darkens, and caps at white. */
	.screen {
		mix-blend-mode: screen;
	}
	.live > canvas {
		display: block;
	}
	@media (forced-colors: active) {
		.liquid-caustics > canvas {
			display: none;
		}
	}
</style>
