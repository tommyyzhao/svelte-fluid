<!--
	A native <button> with a lit liquid surface beneath its DOM label (ADR-0092).
	The canvas is decorative (aria-hidden, pointer-events none) and overhangs the
	button so the focus ring can follow its SDF. Without WebGL2 the button is
	a plain, fully styled native control.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { notifyHost } from './engine/notify-host.js';
	import { SURFACE_PAD, attachSurface, rectIn, resolveTone } from './engine/surface/attach.js';
	import type { SurfaceBinding } from './engine/surface/attach.js';
	import { LOOKS } from './engine/surface/look.js';
	import type { SurfaceTone } from './engine/surface/look.js';
	import type { LiquidButtonProps } from './engine/types.js';

	let { tone = 'auto', type = 'button', children, class: className = '', onpointerdown, onkeydown, onfocus, onblur, ...rest }: LiquidButtonProps = $props();

	let button: HTMLButtonElement;
	let canvas: HTMLCanvasElement;
	let label: HTMLSpanElement;
	let live = $state(false);
	let focused = $state(false);
	let resolved = $state<SurfaceTone>('light');
	let binding: SurfaceBinding | null = null;
	const look = $derived(LOOKS.button[resolved]);

	function measure() {
		const radius = parseFloat(getComputedStyle(button).borderTopLeftRadius) || 0;
		return {
			control: 'button' as const,
			tone: resolved,
			rect: rectIn(button, canvas),
			radius,
			labels: [rectIn(label, canvas)],
			focus: focused && button.matches(':focus-visible')
		};
	}

	onMount(() => {
		resolved = resolveTone(tone, button);
		binding = attachSurface(canvas, button, measure, (v) => (live = v));
		return () => binding?.destroy();
	});

	$effect(() => {
		// Re-resolve on prop change; 'auto' is measured once per change, not per frame.
		resolved = resolveTone(tone, button);
	});
	$effect(() => {
		void resolved;
		void focused;
		binding?.update();
	});

	function local(e: { clientX: number; clientY: number }) {
		const r = canvas.getBoundingClientRect();
		return { x: e.clientX - r.left, y: e.clientY - r.top };
	}
</script>

<button
	bind:this={button}
	{type}
	class="liquid-button {className}"
	class:live
	style:--liquid-fill={look.fill}
	style:--liquid-fill-low={look.fillLow}
	style:--liquid-text={look.text}
	style:--liquid-ring={look.ring}
	style:--liquid-pad="{SURFACE_PAD}px"
	onpointerdown={(e) => {
		// Own behaviour first; consumer handlers are isolated so a throw cannot break it.
		if (e.button === 0 && !button.disabled) {
			const p = local(e);
			// Pen pressure scales the impulse (ADR-0083); mouse/touch pressure is unreliable.
			binding?.press(p.x, p.y, e.pointerType === 'pen' ? 0.5 + e.pressure : 1);
		}
		notifyHost(onpointerdown, 'onpointerdown', e);
	}}
	onkeydown={(e) => {
		if ((e.key === 'Enter' || e.key === ' ') && !e.repeat && !button.disabled) {
			const r = rectIn(button, canvas);
			binding?.press(r.x + r.width / 2, r.y + r.height / 2);
		}
		notifyHost(onkeydown, 'onkeydown', e);
	}}
	onfocus={(e) => {
		focused = true;
		notifyHost(onfocus, 'onfocus', e);
	}}
	onblur={(e) => {
		focused = false;
		notifyHost(onblur, 'onblur', e);
	}}
	{...rest}
>
	<canvas bind:this={canvas} aria-hidden="true"></canvas>
	<span class="label" bind:this={label}>{@render children?.()}</span>
</button>

<style>
	.liquid-button {
		position: relative;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-height: 2.75rem;
		padding: 0.65rem 1.4rem;
		border: 0;
		border-radius: 999px;
		background: linear-gradient(var(--liquid-fill), var(--liquid-fill-low));
		color: var(--liquid-text);
		font: inherit;
		font-weight: 600;
		cursor: pointer;
		touch-action: manipulation;
		-webkit-tap-highlight-color: transparent;
		isolation: isolate;
	}
	.liquid-button:disabled {
		cursor: not-allowed;
		opacity: 0.55;
	}
	.liquid-button:focus-visible {
		outline: 2px solid var(--liquid-ring);
		outline-offset: 2px;
	}
	canvas {
		position: absolute;
		inset: calc(-1 * var(--liquid-pad));
		width: calc(100% + 2 * var(--liquid-pad));
		height: calc(100% + 2 * var(--liquid-pad));
		z-index: -1;
		pointer-events: none;
		display: none;
	}
	.label {
		position: relative;
	}
	/* Live: the liquid paints the fill and the ring, which follows the button's SDF. */
	.live {
		background: transparent;
	}
	.live canvas {
		display: block;
	}
	.live:focus-visible {
		outline: none;
	}
	@media (forced-colors: active) {
		.liquid-button {
			border: 1px solid ButtonText;
			background: ButtonFace;
			color: ButtonText;
		}
		.liquid-button canvas {
			display: none;
		}
		.liquid-button:focus-visible {
			outline: 2px solid Highlight;
			outline-offset: 2px;
		}
	}
</style>
