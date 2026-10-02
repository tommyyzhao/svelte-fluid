<!--
  @component
  Pigment on paper (ADR-0090). A `<div>` whose background is a sheet of
  paper: pointer, touch and pen strokes lay watercolour that spreads, darkens
  at its edges and dries into the grain. Children render above the paper.

  - `data-ink-resist` on a descendant keeps its box (plus a small margin) dry.
  - Focusing (or hovering) a `data-ink-wick` descendant blooms pigment along
    its lower edge; an integer attribute value picks the pigment.

  Owns DOM concerns only: sizing at native DPR, visibility, reduced motion,
  resist rects and input. All GL lives in PigmentEngine. Without WebGL2 the
  div is plain paper colour and every child still works.
-->
<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { PigmentEngine } from './engine/pigment/PigmentEngine.js';
	import type { ResistRect } from './engine/pigment/PigmentEngine.js';
	import { attachBrush, parseCornerRadius, wick } from './engine/pigment/brush.js';
	import { PIGMENT_DEFAULTS, isHexColour, resolvePigmentOptions } from './engine/pigment/options.js';
	import { cssColorToRgb } from './engine/css-color.js';
	import { watchReducedMotion } from './engine/reduced-motion.js';
	import type { InkPaperProps } from './engine/types.js';

	let { paper, pigments, brush, seed, class: className = '', children, ...rest }: InkPaperProps = $props();

	let root: HTMLDivElement;
	let canvas: HTMLCanvasElement;
	let engine: PigmentEngine | null = null;
	let failed = $state(false);
	let mounted = $state(false);

	/**
	 * Any CSS colour to opaque hex (the spectral solver's input). DOM-only, so
	 * it runs after mount; on the server the raw string styles the background.
	 * Unparseable colours read as "not supplied".
	 */
	function paperHex(value: string | undefined): string | undefined {
		if (value === undefined || isHexColour(value)) return value;
		if (typeof CSS === 'undefined' || !CSS.supports('color', value)) return undefined;
		const { r, g, b } = cssColorToRgb(value, { r: 255, g: 255, b: 255 });
		return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
	}

	// Resolved like the engine resolves them: undefined/invalid keeps the last value.
	let resolved = $state(
		resolvePigmentOptions(
			PIGMENT_DEFAULTS,
			untrack(() => ({ pigments, brush, seed, paper: isHexColour(paper) ? paper : undefined }))
		)
	);

	function resistRects(): ResistRect[] {
		const base = root.getBoundingClientRect();
		const out: ResistRect[] = [];
		for (const el of root.querySelectorAll<HTMLElement>('[data-ink-resist]')) {
			const b = el.getBoundingClientRect();
			if (!b.width || !b.height) continue;
			// The control's own outline, so pigment meets its rounded border.
			const cs = getComputedStyle(el);
			const corner = (v: string) => parseCornerRadius(v, b.width, b.height);
			out.push({
				x: b.left - base.left,
				y: b.top - base.top,
				w: b.width,
				h: b.height,
				radii: [
					corner(cs.borderTopLeftRadius),
					corner(cs.borderTopRightRadius),
					corner(cs.borderBottomRightRadius),
					corner(cs.borderBottomLeftRadius)
				]
			});
		}
		return out;
	}

	function wickChannel(el: HTMLElement, count: number, fallback: number): number {
		const n = Number.parseInt(el.dataset.inkWick ?? '', 10);
		return Number.isFinite(n) && n >= 0 ? n % count : fallback % count;
	}

	onMount(() => {
		let reduced = false;
		let wickCount = 0;
		resolved = resolvePigmentOptions(resolved, { paper: paperHex(paper) });
		mounted = true;
		try {
			engine = new PigmentEngine({
				canvas,
				...resolved,
				onError: () => {
					failed = true;
				}
			});
		} catch {
			// No WebGL2 / shared host: plain paper, content untouched.
			failed = true;
			return;
		}
		const e = engine;

		const layout = () => {
			const r = root.getBoundingClientRect();
			e.resize(r.width, r.height, window.devicePixelRatio || 1);
			e.setResist(resistRects());
		};
		const stopReduced = watchReducedMotion((v) => {
			reduced = v;
			e.setStill(v);
		});
		layout();

		const ro = new ResizeObserver(layout);
		ro.observe(root);
		// Resist children can move or appear without the root resizing.
		// ponytail: pure position changes (transforms, sibling reflow without a
		// mutation) are picked up on the next interaction, not continuously.
		const mo = new MutationObserver(() => e.setResist(resistRects()));
		mo.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-ink-resist', 'class', 'style'] });
		// Zoom changes devicePixelRatio and fires resize, not ResizeObserver.
		window.addEventListener('resize', layout);
		const io = new IntersectionObserver(([entry]) => e.setVisible(entry.isIntersecting), { rootMargin: '50px' });
		io.observe(root);

		const detachBrush = attachBrush(
			root,
			(dabs) => {
				if (!reduced) e.paint(dabs);
			},
			() => ({ size: e.brush.size, water: e.brush.water, channel: e.brush.pigment, channels: e.pigmentCount })
		);
		const onDown = () => e.setResist(resistRects());

		const bloomAt = (el: HTMLElement, entryX: number | null) => {
			e.setResist(resistRects());
			const base = root.getBoundingClientRect();
			const b = el.getBoundingClientRect();
			const box = { x: b.left - base.left, y: b.top - base.top, w: b.width, h: b.height };
			e.paint(wick(box, wickChannel(el, e.pigmentCount, wickCount++), entryX === null ? null : entryX - base.left));
		};
		const wickTarget = (t: EventTarget | null) => {
			const el = t instanceof Element ? t.closest<HTMLElement>('[data-ink-wick]') : null;
			return el && root.contains(el) ? el : null;
		};
		const onFocus = (ev: FocusEvent) => {
			const el = wickTarget(ev.target);
			if (el && el !== wickTarget(ev.relatedTarget)) bloomAt(el, null);
		};
		const onOver = (ev: PointerEvent) => {
			const el = wickTarget(ev.target);
			if (el && el !== wickTarget(ev.relatedTarget) && ev.pointerType !== 'touch') bloomAt(el, ev.clientX);
		};
		root.addEventListener('pointerdown', onDown);
		root.addEventListener('focusin', onFocus);
		root.addEventListener('pointerover', onOver);

		return () => {
			stopReduced();
			ro.disconnect();
			mo.disconnect();
			io.disconnect();
			window.removeEventListener('resize', layout);
			detachBrush();
			root.removeEventListener('pointerdown', onDown);
			root.removeEventListener('focusin', onFocus);
			root.removeEventListener('pointerover', onOver);
			e.dispose();
			engine = null;
		};
	});

	$effect(() => {
		const raw = { paper, pigments, brush, seed };
		if (!mounted) return;
		untrack(() => {
			const patch = { ...raw, paper: paperHex(raw.paper) };
			resolved = resolvePigmentOptions(resolved, patch);
			engine?.setOptions(patch);
		});
	});
</script>

<div {...rest} bind:this={root} class="svelte-fluid-ink-paper {className}" style:background-color={mounted ? resolved.paper : (paper ?? resolved.paper)}>
	<canvas bind:this={canvas} aria-hidden="true" class:failed></canvas>
	{@render children?.()}
</div>

<style>
	.svelte-fluid-ink-paper {
		position: relative;
		isolation: isolate;
		/* Horizontal touch drags paint; vertical ones still scroll the page. */
		touch-action: pan-y pinch-zoom;
	}
	canvas {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		display: block;
		/* Below every child, above the paper background (isolated context). */
		z-index: -1;
		pointer-events: none;
	}
	canvas.failed {
		display: none;
	}
</style>
