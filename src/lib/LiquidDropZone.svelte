<!--
	A native file picker: a <label> around a visually hidden, focusable
	<input type="file"> (ADR-0094). Click, Enter, Space, touch and pen open the
	browser's picker. HTML5 drag and drop raises a meniscus along the zone's wall,
	highest on the side nearest the pointer; a drop sends one ripple from the drop
	point. Without WebGL2 it is a plain, fully styled native control.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { SURFACE_PAD, attachSurface, deliverFiles, pickFiles, rectIn, resolveTone } from './engine/surface/attach.js';
	import type { SurfaceBinding } from './engine/surface/attach.js';
	import { LOOKS } from './engine/surface/look.js';
	import type { SurfaceTone } from './engine/surface/look.js';
	import type { LiquidDropZoneProps } from './engine/types.js';

	let {
		accept,
		multiple = false,
		label = 'Choose a file or drop it here',
		children,
		onfiles,
		announce,
		tone = 'auto',
		disabled = false,
		name,
		class: className = '',
		...rest
	}: LiquidDropZoneProps = $props();

	let zone: HTMLLabelElement;
	let input: HTMLInputElement;
	let canvas: HTMLCanvasElement;
	let text: HTMLSpanElement;
	let live = $state(false);
	let focused = $state(false);
	let over = $state(false);
	let message = $state('');
	let resolved = $state<SurfaceTone>('light');
	let binding: SurfaceBinding | null = null;
	const look = $derived(LOOKS.dropzone[resolved]);

	function measure() {
		return {
			control: 'dropzone' as const,
			tone: resolved,
			rect: rectIn(zone, canvas),
			radius: parseFloat(getComputedStyle(zone).borderTopLeftRadius) || 0,
			labels: [rectIn(text, canvas)],
			focus: focused && input.matches(':focus-visible')
		};
	}

	const hasFiles = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].includes('Files');
	const local = (e: { clientX: number; clientY: number }) => {
		const r = canvas.getBoundingClientRect();
		return { x: e.clientX - r.left, y: e.clientY - r.top };
	};
	const settle = () => {
		over = false;
		binding?.update({ drag: null });
	};

	onMount(() => {
		resolved = resolveTone(tone, zone);
		binding = attachSurface(canvas, zone, measure, (v) => (live = v));
		// Approach is page-wide: the meniscus starts rising before the pointer reaches
		// the zone. Only file drags count; leaving the window or ending the drag settles.
		const track = (e: DragEvent) => {
			if (!disabled && hasFiles(e)) binding?.update({ drag: local(e) });
		};
		const leave = (e: DragEvent) => {
			if (!e.relatedTarget) settle();
		};
		addEventListener('dragover', track);
		addEventListener('dragleave', leave);
		addEventListener('drop', settle);
		addEventListener('dragend', settle);
		return () => {
			removeEventListener('dragover', track);
			removeEventListener('dragleave', leave);
			removeEventListener('drop', settle);
			removeEventListener('dragend', settle);
			binding?.destroy();
		};
	});

	$effect(() => {
		resolved = resolveTone(tone, zone);
	});
	$effect(() => {
		void resolved;
		void focused;
		binding?.update();
	});

	function deliver(files: File[]) {
		message = deliverFiles(files, onfiles, announce) || message;
	}

	function drop(e: DragEvent) {
		e.preventDefault();
		over = false;
		if (disabled || !e.dataTransfer) return;
		const files = pickFiles(e.dataTransfer.files, accept, multiple);
		const p = local(e);
		binding?.update({ drag: null });
		if (files.length) binding?.press(p.x, p.y);
		// Mirror the drop into the input so form submission sees it.
		try {
			const list = new DataTransfer();
			for (const f of files) list.items.add(f);
			if (files.length) input.files = list.files;
		} catch {
			// Older engines cannot construct a DataTransfer; onfiles still receives the files.
		}
		deliver(files);
	}
</script>

<label
	{...rest}
	bind:this={zone}
	class="liquid-dropzone {className}"
	class:live
	class:over
	class:disabled
	style:--liquid-fill={look.fill}
	style:--liquid-fill-low={look.fillLow}
	style:--liquid-text={look.text}
	style:--liquid-ring={look.ring}
	style:--liquid-pad="{SURFACE_PAD}px"
	ondragenter={(e) => {
		if (disabled || !hasFiles(e)) return;
		e.preventDefault();
		over = true;
	}}
	ondragover={(e) => {
		if (disabled || !hasFiles(e)) return;
		// Accepting the drag is what makes this element a drop target.
		e.preventDefault();
		e.dataTransfer!.dropEffect = 'copy';
		over = true;
	}}
	ondragleave={(e) => {
		if (!zone.contains(e.relatedTarget as Node | null)) over = false;
	}}
	ondrop={drop}
>
	<canvas bind:this={canvas} aria-hidden="true"></canvas>
	<input
		bind:this={input}
		type="file"
		class="input"
		{accept}
		{multiple}
		{disabled}
		{name}
		onchange={() => deliver(pickFiles(input.files ?? [], undefined, true))}
		onfocus={() => (focused = true)}
		onblur={() => (focused = false)}
	/>
	<span class="text" bind:this={text}>
		{#if children}{@render children()}{:else}{label}{/if}
	</span>
	<span class="status" role="status" aria-live="polite">{message}</span>
</label>

<style>
	.liquid-dropzone {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 8rem;
		padding: 1.5rem;
		border: 0;
		border-radius: 18px;
		background: linear-gradient(var(--liquid-fill), var(--liquid-fill-low));
		color: var(--liquid-text);
		font: inherit;
		text-align: center;
		cursor: pointer;
		isolation: isolate;
		box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--liquid-text) 35%, transparent);
	}
	.over {
		box-shadow: inset 0 0 0 2px var(--liquid-ring);
	}
	.disabled {
		cursor: not-allowed;
		opacity: 0.55;
	}
	/* Visually hidden, still focusable and in the accessibility tree. */
	.input {
		position: absolute;
		width: 1px;
		height: 1px;
		margin: -1px;
		padding: 0;
		border: 0;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
	.liquid-dropzone:has(.input:focus-visible) {
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
	.text {
		position: relative;
		pointer-events: none;
	}
	.status {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
	/* Live: the liquid paints the tray, the drag meniscus and the SDF focus ring. */
	.live,
	.live.over {
		background: transparent;
		box-shadow: none;
	}
	.live canvas {
		display: block;
	}
	.live:has(.input:focus-visible) {
		outline: none;
	}
	@media (forced-colors: active) {
		.liquid-dropzone {
			border: 2px dashed ButtonText;
			background: ButtonFace;
			color: ButtonText;
			box-shadow: none;
		}
		.liquid-dropzone.over {
			border-style: solid;
		}
		.liquid-dropzone canvas {
			display: none;
		}
		.liquid-dropzone:has(.input:focus-visible) {
			outline: 2px solid Highlight;
			outline-offset: 2px;
		}
	}
</style>
