<!-- Native checkbox; the existing surface lens gathers at either end of a shallow liquid track. -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { notifyHost } from './engine/notify-host.js';
	import { SURFACE_PAD, attachSurface, rectIn, resolveTone } from './engine/surface/attach.js';
	import type { SurfaceBinding } from './engine/surface/attach.js';
	import { LOOKS } from './engine/surface/look.js';
	import type { SurfaceTone } from './engine/surface/look.js';
	import type { LiquidToggleProps } from './engine/types.js';

	let { checked = $bindable(false), tone = 'auto', disabled = false, onchange, onclick, children, class: className = '', ...rest }: LiquidToggleProps = $props();
	let track: HTMLSpanElement;
	let input: HTMLInputElement;
	let canvas: HTMLCanvasElement;
	let off: HTMLSpanElement;
	let on: HTMLSpanElement;
	let live = $state(false);
	let resolved = $state<SurfaceTone>('light');
	let binding: SurfaceBinding | null = null;
	const look = $derived(LOOKS.segmented[resolved]);

	function measure() {
		const rect = rectIn(track, canvas);
		return {
			control: 'segmented' as const,
			tone: resolved,
			rect,
			radius: rect.height / 2,
			lens: { ...rect, x: rect.x + (checked ? rect.width / 2 : 0), width: rect.width / 2 },
			labels: [rectIn(off, canvas), rectIn(on, canvas)],
			focus: false
		};
	}

	onMount(() => {
		input.defaultChecked = checked;
		resolved = resolveTone(tone, track);
		binding = attachSurface(canvas, track, measure, (v) => (live = v));
		return () => binding?.destroy();
	});
	$effect(() => {
		resolved = resolveTone(tone, track);
	});
	$effect(() => {
		void checked;
		void resolved;
		binding?.update();
	});

	function press(e: PointerEvent) {
		if (disabled || !e.isPrimary || e.button !== 0) return;
		const r = canvas.getBoundingClientRect();
		binding?.press(Math.max(0, Math.min(r.width, e.clientX - r.left)), Math.max(0, Math.min(r.height, e.clientY - r.top)), e.pointerType === 'pen' ? 0.5 + e.pressure : 1);
	}
</script>

<label class="liquid-toggle {className}" class:live class:disabled style:--liquid-fill={look.fill} style:--liquid-fill-low={look.fillLow} style:--liquid-text={look.text} style:--liquid-ring={look.ring} style:--liquid-pad="{SURFACE_PAD}px">
	<input bind:this={input} type="checkbox" role="switch" bind:checked {disabled}
		onclick={(e) => notifyHost(onclick, 'onclick', e)}
		onchange={() => { binding?.update(); notifyHost(onchange, 'onchange', input.checked); }}
		onpointerdown={press}
		onkeydown={(e) => { if (e.code === 'Space' && !e.repeat && !disabled) { const r = measure().rect; binding?.press(r.x + r.width / 2, r.y + r.height / 2); } }}
		{...rest} />
	<span class="track" bind:this={track} aria-hidden="true">
		<canvas bind:this={canvas}></canvas>
		<span class="end" class:selected={!checked}><span bind:this={off}>Off</span></span>
		<span class="end" class:selected={checked}><span bind:this={on}>On</span></span>
	</span>
	{#if children}<span class="label">{@render children()}</span>{/if}
</label>

<style>
	.liquid-toggle { position: relative; display: inline-flex; align-items: center; gap: 0.75rem; min-height: 3rem; color: inherit; font: inherit; cursor: pointer; touch-action: manipulation; }
	input { position: absolute; inset: 0; width: 100%; height: 100%; margin: 0; opacity: 0; cursor: inherit; z-index: 1; }
	.track { position: relative; display: inline-flex; width: 6rem; height: 3rem; border-radius: 999px; background: linear-gradient(var(--liquid-fill), var(--liquid-fill-low)); color: var(--liquid-text); isolation: isolate; pointer-events: none; }
	.end { display: flex; align-items: center; justify-content: center; width: 50%; border-radius: 999px; font-size: 0.75rem; }
	.selected { font-weight: 700; text-decoration: underline; text-underline-offset: 3px; background: color-mix(in srgb, var(--liquid-ring) 22%, transparent); }
	canvas { position: absolute; inset: calc(-1 * var(--liquid-pad)); width: calc(100% + 2 * var(--liquid-pad)); height: calc(100% + 2 * var(--liquid-pad)); z-index: -1; display: none; pointer-events: none; }
	.live .track, .live .selected { background: transparent; }
	.live canvas { display: block; }
	.liquid-toggle:has(input:focus-visible) { outline: 2px solid var(--liquid-ring); outline-offset: 5px; }
	.disabled { cursor: not-allowed; opacity: 0.55; }
	@media (forced-colors: active) {
		input { position: static; width: auto; height: auto; opacity: 1; accent-color: auto; }
		.track { display: none; }
		.liquid-toggle:has(input:focus-visible) { outline-color: Highlight; }
	}
</style>
