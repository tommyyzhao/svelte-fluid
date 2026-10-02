<!--
	Native radio group (<fieldset>, <legend>, <input type="radio">) whose selected
	option sits on a shallow liquid lens that sloshes across on change
	(ADR-0092). Arrow keys, Tab and form submission are the browser's own.
	Without WebGL2 it is a plain, fully styled segmented control.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { SURFACE_PAD, attachSurface, rectIn, resolveTone } from './engine/surface/attach.js';
	import type { SurfaceBinding } from './engine/surface/attach.js';
	import { LOOKS } from './engine/surface/look.js';
	import type { SurfaceTone } from './engine/surface/look.js';
	import type { LiquidSegmentedProps } from './engine/types.js';

	let { options, value = $bindable(), name, legend, tone = 'auto', disabled = false, class: className = '' }: LiquidSegmentedProps = $props();

	let track: HTMLDivElement;
	let canvas: HTMLCanvasElement;
	const labels: HTMLLabelElement[] = [];
	let live = $state(false);
	let focused = $state(false);
	let resolved = $state<SurfaceTone>('light');
	let binding: SurfaceBinding | null = null;
	const look = $derived(LOOKS.segmented[resolved]);
	const selected = $derived(options.findIndex((o) => o.value === value));

	function measure() {
		const radius = parseFloat(getComputedStyle(track).borderTopLeftRadius) || 0;
		const chosen = labels[selected];
		return {
			control: 'segmented' as const,
			tone: resolved,
			rect: rectIn(track, canvas),
			radius,
			lens: chosen ? rectIn(chosen, canvas) : null,
			labels: labels.filter(Boolean).map((l) => rectIn(l.querySelector('span')!, canvas)),
			focus: focused && !!track.querySelector('input:focus-visible')
		};
	}

	onMount(() => {
		resolved = resolveTone(tone, track);
		binding = attachSurface(canvas, track, measure, (v) => (live = v));
		return () => binding?.destroy();
	});

	$effect(() => {
		resolved = resolveTone(tone, track);
	});
	$effect(() => {
		void resolved;
		void selected;
		void focused;
		void options.length;
		binding?.update();
	});
</script>

<fieldset class="liquid-segmented {className}" class:live {disabled}>
	<legend>{legend}</legend>
	<div
		class="track"
		bind:this={track}
		style:--liquid-fill={look.fill}
		style:--liquid-fill-low={look.fillLow}
		style:--liquid-text={look.text}
		style:--liquid-ring={look.ring}
		style:--liquid-pad="{SURFACE_PAD}px"
		onfocusin={() => (focused = true)}
		onfocusout={() => (focused = false)}
	>
		<canvas bind:this={canvas} aria-hidden="true"></canvas>
		{#each options as option, i (option.value)}
			<label bind:this={labels[i]}>
				<input type="radio" {name} value={option.value} bind:group={value} />
				<span>{option.label}</span>
			</label>
		{/each}
	</div>
</fieldset>

<style>
	.liquid-segmented {
		margin: 0;
		padding: 0;
		border: 0;
		min-inline-size: 0;
	}
	legend {
		padding: 0;
		margin-bottom: 0.4rem;
		font-size: 0.85em;
	}
	.track {
		position: relative;
		display: inline-flex;
		border-radius: 999px;
		background: linear-gradient(var(--liquid-fill), var(--liquid-fill-low));
		color: var(--liquid-text);
		isolation: isolate;
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
	label {
		position: relative;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-height: 2.75rem;
		min-width: 5.5rem;
		padding: 0 1.1rem;
		border-radius: 999px;
		font-weight: 600;
		cursor: pointer;
	}
	/* The radio stays in the accessibility tree and keyboard order. */
	input {
		position: absolute;
		inset: 0;
		margin: 0;
		opacity: 0;
		cursor: inherit;
	}
	label:has(input:checked) {
		background: color-mix(in srgb, var(--liquid-ring) 22%, transparent);
	}
	label:has(input:focus-visible) {
		outline: 2px solid var(--liquid-ring);
		outline-offset: -3px;
	}
	.liquid-segmented:disabled label {
		cursor: not-allowed;
		opacity: 0.55;
	}
	span {
		position: relative;
		pointer-events: none;
	}
	/* Live: the liquid paints fill, selection lens and the track's focus ring. */
	.live .track {
		background: transparent;
	}
	.live canvas {
		display: block;
	}
	.live label:has(input:checked) {
		background: transparent;
	}
	.live label:has(input:focus-visible) {
		outline: none;
		box-shadow: inset 0 -2px 0 var(--liquid-ring);
	}
	@media (forced-colors: active) {
		.track {
			border: 1px solid ButtonText;
			background: ButtonFace;
		}
		.track canvas {
			display: none;
		}
		label:has(input:checked) {
			background: Highlight;
			color: HighlightText;
			forced-color-adjust: none;
		}
		label:has(input:focus-visible) {
			outline: 2px solid ButtonText;
			box-shadow: none;
		}
	}
</style>
