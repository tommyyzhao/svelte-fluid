<script lang="ts">
	import { onMount } from 'svelte';
	import { LabSession } from './LabSession.js';
	import type { LiquidExperiment } from './types.js';

	// A private reversible-effect harness, not a public material component.
	let { factory, label, interactive = $bindable(false) }: {
		factory: (device: GPUDevice, format: GPUTextureFormat) => Promise<LiquidExperiment>;
		label: string; interactive?: boolean;
	} = $props();
	let host: HTMLDivElement, canvas: HTMLCanvasElement;
	let session: LabSession | undefined;
	let ready = $state(false), error = $state(''), reduced = $state(false), sleeping = $state(true);
	let visible = $state(true), last = { x: 0.5, y: 0.5 };
	$effect(() => { interactive = ready && !error && !reduced && visible; });
	let restTimer: ReturnType<typeof setTimeout> | undefined;

	function rest() {
		clearTimeout(restTimer); sleeping = true;
		session?.pointer(last.x, last.y, false); session?.cancelContact();
		session?.reset();
		if (session && !session.state.paused) session.pause();
	}
	function wake() {
		if (!ready || reduced || !visible || document.hidden) return false;
		clearTimeout(restTimer); sleeping = false;
		if (session?.state.paused) session.pause();
		restTimer = setTimeout(rest, 4500);
		return true;
	}
	export function demo() { if (wake()) { clearTimeout(restTimer); session?.nudge(); restTimer = setTimeout(rest, 5200); } }
	export function reset() { rest(); }
	onMount(() => {
		let disposed = false;
		const motion = matchMedia('(prefers-reduced-motion: reduce)'); reduced = motion.matches;
		function preferences() { reduced = motion.matches; rest(); }
		function visibility() { if (document.hidden) rest(); }
		function move(event: PointerEvent) {
			if (!event.isPrimary || !wake()) return;
			const rect = host.getBoundingClientRect();
			last = { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height };
			session?.pointer(last.x, last.y, true);
			// These effects respond to velocity, which the frame clock consumes.
			// No per-move timeout: a stationary pointer already has zero velocity.
		}
		function leave() { session?.pointer(last.x, last.y, false); }
		function resize() {
			const { width, height } = canvas.getBoundingClientRect();
			session?.resize(width, height); session?.invalidate();
		}
		const size = new ResizeObserver(resize); size.observe(host);
		const intersection = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; if (!visible) rest(); }); intersection.observe(host);
		host.addEventListener('pointermove', move, { passive: true }); host.addEventListener('pointerleave', leave);
		host.addEventListener('pointercancel', leave); window.addEventListener('blur', rest);
		document.addEventListener('visibilitychange', visibility); motion.addEventListener('change', preferences);
		void LabSession.create(canvas, (state) => { if (!disposed) { ready = state.ready; error = state.error; } }, 'premultiplied').then(async (created) => {
			if (disposed) { created.dispose(); return; }
			session = created; resize(); await session.load(factory);
			if (!disposed) rest();
		}).catch((reason) => { if (!disposed) error = String(reason); });
		return () => {
			disposed = true; clearTimeout(restTimer);
			size.disconnect(); intersection.disconnect(); host.removeEventListener('pointermove', move);
			host.removeEventListener('pointerleave', leave); host.removeEventListener('pointercancel', leave);
			window.removeEventListener('blur', rest); document.removeEventListener('visibilitychange', visibility);
			motion.removeEventListener('change', preferences); session?.dispose();
		};
	});
</script>

<div class="effect" bind:this={host} role="img" aria-label={label}>
	<canvas bind:this={canvas} class:unavailable={!ready || Boolean(error)} aria-hidden="true"></canvas>
	<div class="status" class:error role="status">{error ? 'WebGPU unavailable — effect disabled. ' + error : reduced ? 'Still surface · reduced motion' : !ready ? 'Preparing the material…' : sleeping ? 'Move across the surface · no click needed' : 'Responding to movement'}</div>
</div>

<style>
	.effect { position: relative; width: 100%; height: 100%; min-height: 280px; background: radial-gradient(ellipse at 25% 35%, #574577, #202938 45%, #07080c); isolation: isolate; user-select: none; -webkit-user-select: none; }
	canvas { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
	canvas.unavailable { visibility: hidden; }
	.status { position: absolute; bottom: 20px; left: 22px; right: 22px; width: fit-content; max-width: calc(100% - 44px); background: #07080ccc; padding: 8px 11px; border-radius: 4px; color: #e6e5ee; font: 10px/1.5 Arial, sans-serif; pointer-events: none; }
	.status.error { color: #f1cbc6; }
</style>
