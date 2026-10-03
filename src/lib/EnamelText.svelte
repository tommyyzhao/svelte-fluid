<!--
	Display text shaded as soft, molded enamel (ADR-0097). The text is a native
	<span> inside the consumer's heading: it stays selectable, findable and
	zoomable. A decorative canvas draws the same glyphs; only after its first
	frame is on screen does the DOM text turn transparent, so any failure
	(no WebGL2, no float render targets, lost context, unsupported text) leaves
	plain text. Pointer presses are observed, never captured or prevented.
-->
<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { relativeLuminance } from './engine/contrast.js';
	import { cssColorToRgb, measurePageColor } from './engine/css-color.js';
	import { EnamelEngine } from './engine/enamel/EnamelEngine.js';
	import { watchReducedMotion } from './engine/reduced-motion.js';
	import type { EnamelTextProps, RGB } from './engine/types.js';

	let { text, tone = 'auto', color, class: className = '', ...rest }: EnamelTextProps = $props();

	let root: HTMLSpanElement;
	let source: HTMLSpanElement;
	let canvas: HTMLCanvasElement;
	let live = $state(false);
	let engine: EnamelEngine | null = null;

	function colors(): { page: RGB; body: RGB; tone: 'light' | 'dark' } {
		const page = measurePageColor(root.parentElement);
		// The root, not the source: once live the source text is transparent.
		const body = cssColorToRgb(getComputedStyle(root).color, page);
		const lp = relativeLuminance(page.r / 255, page.g / 255, page.b / 255);
		const resolved = tone === 'light' || tone === 'dark' ? tone : lp < 0.179 ? 'dark' : 'light';
		return { page, body, tone: resolved };
	}

	let canvasSize: DOMRectReadOnly | undefined;
	function layout() {
		if (!engine) return;
		const size = canvasSize ?? canvas.getBoundingClientRect();
		try {
			engine.resize(size.width, size.height, devicePixelRatio);
		} catch (error) {
			// Text this treatment cannot reproduce exactly stays plain.
			console.warn('svelte-fluid: EnamelText shows plain text', error);
			teardown();
		}
	}

	function teardown() {
		live = false;
		engine?.dispose();
		engine = null;
	}

	onMount(() => {
		try {
			engine = new EnamelEngine({
				canvas,
				source,
				config: colors(),
				onPresent: () => (live = true),
				onFrameError: teardown,
				onContextLost: () => (live = false)
			});
		} catch (error) {
			console.warn('svelte-fluid: EnamelText unavailable; showing plain text', error);
			return;
		}
		// Observe the canvas content box, not transformed visual bounds.
		const resize = new ResizeObserver(([entry]) => {
			canvasSize = entry.contentRect;
			layout();
		});
		resize.observe(canvas);
		window.addEventListener('resize', layout);
		const intersect = new IntersectionObserver(([entry]) => engine?.setVisible(entry.isIntersecting));
		intersect.observe(root);
		const unwatch = watchReducedMotion((reducedMotion) => engine?.setConfig({ reducedMotion }));
		document.fonts?.addEventListener('loadingdone', layout);
		void document.fonts?.ready.then(layout);
		layout();

		let pointer = -1;
		const at = (e: PointerEvent) => {
			const r = canvas.getBoundingClientRect();
			// Pen (and force-touch) pressure scales the dent; mouse reports a constant.
			const s = e.pointerType !== 'mouse' && e.pressure > 0 && e.pressure !== 0.5 ? 0.5 + e.pressure : 1;
			engine?.press(e.clientX - r.left, e.clientY - r.top, s);
		};
		const down = (e: PointerEvent) => {
			if (e.button !== 0) return;
			pointer = e.pointerId;
			at(e);
		};
		const move = (e: PointerEvent) => {
			if (e.pointerId === pointer) at(e);
		};
		const up = (e: PointerEvent) => {
			if (e.pointerId !== pointer) return;
			pointer = -1;
			engine?.release();
		};
		root.addEventListener('pointerdown', down);
		addEventListener('pointermove', move);
		addEventListener('pointerup', up);
		addEventListener('pointercancel', up);
		return () => {
			root.removeEventListener('pointerdown', down);
			removeEventListener('pointermove', move);
			removeEventListener('pointerup', up);
			removeEventListener('pointercancel', up);
			document.fonts?.removeEventListener('loadingdone', layout);
			resize.disconnect();
			window.removeEventListener('resize', layout);
			intersect.disconnect();
			unwatch();
			teardown();
		};
	});

	$effect(() => {
		void text;
		void tone;
		void color;
		if (!engine) return;
		// After the DOM has the new text/colour: re-rasterise and re-measure.
		void tick().then(() => {
			if (!engine) return;
			engine.setConfig(colors());
			layout();
		});
	});
</script>

<!-- No whitespace between tags: it would become part of the heading's text. -->
<span bind:this={root} class="enamel-text {className}" class:live style:color {...rest}
	><span class="source" bind:this={source}>{text}</span><canvas bind:this={canvas} aria-hidden="true"></canvas></span
>

<style>
	.enamel-text {
		position: relative;
		display: inline-block;
		max-width: 100%;
	}
	.source {
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	canvas {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		pointer-events: none;
		visibility: hidden;
	}
	.live canvas {
		visibility: visible;
	}
	/* The canvas is the glyph; the DOM text stays for selection, find and zoom. */
	.live .source {
		color: transparent;
	}
	@media (forced-colors: active) {
		.enamel-text canvas {
			display: none;
		}
		.live .source {
			color: CanvasText;
		}
	}
</style>
