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
	import { notifyHost } from './engine/notify-host.js';
	import { measureTextOverlayCap } from './engine/css-color.js';
	import { attachSurface, rectIn, resolveTone } from './engine/surface/attach.js';
	import type { SurfaceBinding } from './engine/surface/attach.js';
	import type { SurfaceTone } from './engine/surface/look.js';
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

	let invalidate = () => {};

	/** Measured only at startup/update/resize, never during rendering. */
	function strength(): number {
		return measureTextOverlayCap(root, canvas, intensity, resolved);
	}

	function measure() {
		const overlay = strength();
		canvas.style.visibility = overlay > 0 ? '' : 'hidden';
		return {
			control: 'overlay' as const,
			tone: resolved,
			rect: rectIn(root, canvas),
			radius: parseFloat(getComputedStyle(root).borderTopLeftRadius) || 0,
			overlay
		};
	}

	onMount(() => {
		resolved = resolveTone(tone, root);
		binding = attachSurface(canvas, root, measure, (v) => (live = v));
		let pending = 0;
		invalidate = () => {
			canvas.style.visibility = 'hidden';
			if (pending) return;
			pending = requestAnimationFrame(() => {
				pending = 0;
				resolved = resolveTone(tone, root);
				binding?.update();
			});
		};
		const observer = new MutationObserver((records) => {
			if (records.some((record) => {
				if (record.target === canvas || canvas.contains(record.target)) return false;
				// The surface's own live class changes no authored colours.
				if (record.target === root && record.attributeName === 'class') {
					const authored = (value: string | null) => (value ?? '').split(/\s+/).filter((c) => c !== 'live').join(' ');
					return authored(record.oldValue) !== authored(root.className);
				}
				return true;
			})) invalidate();
		});
		observer.observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class', 'style', 'hidden'], attributeOldValue: true });
		for (let el = root.parentElement; el; el = el.parentElement) observer.observe(el, { attributes: true, attributeFilter: ['class', 'style'], attributeOldValue: true });
		const events = ['pointerover', 'pointerout', 'pointerdown', 'pointerup', 'focusin', 'focusout'] as const;
		for (const event of events) root.addEventListener(event, invalidate, true);
		document.fonts.addEventListener('loadingdone', invalidate);
		return () => {
			observer.disconnect();
			cancelAnimationFrame(pending);
			for (const event of events) root.removeEventListener(event, invalidate, true);
			document.fonts.removeEventListener('loadingdone', invalidate);
			invalidate = () => {};
			binding?.destroy();
		};
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
		ripple(e.clientX, e.clientY);
		notifyHost(onpointermove, 'onpointermove', e);
	}}
	onfocusin={(e) => {
		const t = (e.target as Element).getBoundingClientRect();
		// One impulse, not a stroke's several: the strongest press.
		ripple(t.left + t.width / 2, t.top + t.height / 2, 1.5);
		notifyHost(onfocusin, 'onfocusin', e);
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
