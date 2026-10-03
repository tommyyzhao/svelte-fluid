<!--
	A native <button role="switch"> whose state is a bistable metal arch
	(ADR-0096): arched = off, bowed = on. Borderless: the foil is the
	affordance and the button supplies the full hit area. The canvas is
	decorative (aria-hidden, pointer-events none). Without WebGL2, and in
	forced-colors mode, a vector arch shows the same state.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { measurePageColor } from './engine/css-color.js';
	import { FoilEngine } from './engine/foil/FoilEngine.js';
	import { FOIL_LOOKS } from './engine/foil/look.js';
	import { notifyHost } from './engine/notify-host.js';
	import { watchReducedMotion } from './engine/reduced-motion.js';
	import { resolveTone } from './engine/surface/attach.js';
	import type { SurfaceTone } from './engine/surface/look.js';
	import type { FoilSwitchProps } from './engine/types.js';

	let { checked = $bindable(false), tone = 'auto', disabled = false, onchange, onclick, children, class: className = '', ...rest }: FoilSwitchProps = $props();

	let button: HTMLButtonElement;
	let canvas: HTMLCanvasElement;
	let live = $state(false);
	let resolved = $state<SurfaceTone>('light');
	let engine: FoilEngine | null = null;
	const look = $derived(FOIL_LOOKS[resolved]);

	onMount(() => {
		resolved = resolveTone(tone, button);
		let destroyed = false;
		const forced = matchMedia('(forced-colors: active)');
		let onscreen = true;
		const visibility = () => engine?.setVisible(onscreen && !forced.matches && !document.hidden);
		try {
			engine = new FoilEngine({
				canvas,
				config: { checked, page: measurePageColor(button.parentElement) },
				onFrameError: () => {
					live = false;
					teardown();
				},
				onContextLost: () => (live = false),
				onContextRestored: () => (live = true)
			});
		} catch (error) {
			console.warn('svelte-fluid: foil unavailable; showing the vector switch', error);
			return;
		}
		let canvasSize: DOMRectReadOnly | undefined;
		const sync = () => {
			const size = canvasSize ?? canvas.getBoundingClientRect();
			engine?.resize(size.width, size.height, devicePixelRatio);
		};
		// Content-box observation also catches changes within the same rounded device pixel.
		const resize = new ResizeObserver(([entry]) => {
			canvasSize = entry.contentRect;
			sync();
		});
		resize.observe(canvas);
		// A screen move can change DPR without changing the CSS viewport.
		const pixels = new ResizeObserver(sync);
		try {
			pixels.observe(canvas, { box: 'device-pixel-content-box' });
		} catch {
			// Older browsers notify zoom through the window resize fallback.
		}
		window.addEventListener('resize', sync);
		const intersect = new IntersectionObserver(([entry]) => {
			onscreen = entry.isIntersecting;
			visibility();
		});
		intersect.observe(button);
		forced.addEventListener('change', visibility);
		document.addEventListener('visibilitychange', visibility);
		const unwatch = watchReducedMotion((reducedMotion) => engine?.setConfig({ reducedMotion }));
		sync();
		visibility();
		void engine.show().then(() => {
			if (!destroyed) live = true;
		});
		function teardown() {
			if (destroyed) return;
			destroyed = true;
			resize.disconnect();
			pixels.disconnect();
			window.removeEventListener('resize', sync);
			intersect.disconnect();
			forced.removeEventListener('change', visibility);
			document.removeEventListener('visibilitychange', visibility);
			unwatch();
			engine?.dispose();
			engine = null;
		}
		return teardown;
	});

	$effect(() => {
		engine?.setConfig({ checked });
	});
	$effect(() => {
		// Re-measure the page per tone or state change, not per frame. A switch
		// often drives the page theme itself: wait a frame for that to land.
		void checked;
		const t = tone;
		const id = requestAnimationFrame(() => {
			resolved = resolveTone(t, button);
			engine?.setConfig({ page: measurePageColor(button.parentElement) });
		});
		return () => cancelAnimationFrame(id);
	});
	$effect(() => {
		if (disabled) engine?.setConfig({ hover: null });
	});

	function hover(e: PointerEvent) {
		// Touch has no hover; a disabled switch does not respond.
		if (e.pointerType === 'touch' || !e.isPrimary || button.disabled) return;
		const r = canvas.getBoundingClientRect();
		if (!r.width || !r.height) return;
		const clamp = (v: number) => Math.min(1, Math.max(0, v));
		engine?.setConfig({ hover: { x: clamp((e.clientX - r.left) / r.width), y: clamp((e.clientY - r.top) / r.height) } });
	}
</script>

<button
	bind:this={button}
	type="button"
	role="switch"
	aria-checked={checked}
	{disabled}
	class="foil-switch {className}"
	class:live
	style:--foil-metal={look.metal}
	style:--foil-ring={look.ring}
	onclick={(e) => {
		// Isolated: a throwing consumer handler cannot block the toggle.
		// preventDefault() in it still vetoes the flip.
		notifyHost(onclick, 'onclick', e);
		if (e.defaultPrevented) return;
		// State flips now; the physics follows and never delays it.
		checked = !checked;
		engine?.setConfig({ checked });
		notifyHost(onchange, 'onchange', checked);
	}}
	onpointerenter={hover}
	onpointermove={hover}
	onpointerleave={() => engine?.setConfig({ hover: null })}
	onpointercancel={() => engine?.setConfig({ hover: null })}
	{...rest}
>
	{#if children}<span class="label">{@render children()}</span>{/if}
	<span class="foil" aria-hidden="true">
		<svg viewBox="0 0 96 48" focusable="false"><path d={checked ? 'M14 24 Q48 48 82 24' : 'M14 24 Q48 0 82 24'} /><path class="mounts" d="M14 17 V31 M82 17 V31" /></svg>
		<canvas bind:this={canvas}></canvas>
	</span>
</button>

<style>
	/* No chrome: the foil is the affordance. Only keyboard focus draws an outline. */
	.foil-switch {
		display: inline-flex;
		align-items: center;
		gap: 0.2rem;
		min-block-size: 3rem;
		min-inline-size: 3rem;
		padding: 0;
		border: 0;
		border-radius: 0;
		box-shadow: none;
		background: transparent;
		appearance: none;
		color: inherit;
		font: inherit;
		cursor: pointer;
		touch-action: manipulation;
		-webkit-tap-highlight-color: transparent;
	}
	.foil-switch:disabled {
		cursor: not-allowed;
		opacity: 0.55;
	}
	.foil-switch:focus {
		outline: none;
	}
	.foil-switch:focus-visible {
		outline: 2px solid var(--foil-ring);
		outline-offset: 5px;
	}
	.foil {
		position: relative;
		display: inline-block;
		flex: 0 0 auto;
		inline-size: 6rem;
		block-size: 3rem;
		pointer-events: none;
		color: var(--foil-metal);
	}
	canvas,
	svg {
		position: absolute;
		inset: 0;
		inline-size: 100%;
		block-size: 100%;
	}
	canvas {
		visibility: hidden;
	}
	path {
		fill: none;
		stroke: currentColor;
		stroke-width: 6;
		stroke-linecap: round;
	}
	path.mounts {
		stroke-width: 8;
	}
	.live canvas {
		visibility: visible;
	}
	.live svg {
		visibility: hidden;
	}
	@media (forced-colors: active) {
		.foil {
			color: ButtonText;
		}
		.foil-switch:focus-visible {
			outline-color: Highlight;
		}
		.live canvas {
			display: none;
		}
		.live svg {
			visibility: visible;
		}
	}
</style>
