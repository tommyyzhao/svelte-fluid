<script lang="ts">
	import { onMount } from 'svelte';
	import { LabSession } from './LabSession.js';
	import type { LiquidExperiment } from './types.js';

	// Unlike the reversible EffectSurface, sleep must not erase material history.
	let { factory, label, settleMs = 4200, decorative = false, oninterrupt,
		interactive = $bindable(false), available = $bindable(false) }: {
		factory: (device: GPUDevice, format: GPUTextureFormat) => Promise<LiquidExperiment>;
		label: string;
		settleMs?: number;
		/** A separate native control owns the accessible name and input. */
		decorative?: boolean;
		/** Clear externally held transient loads before a forced lifecycle pause. */
		oninterrupt?: () => void;
		interactive?: boolean;
		available?: boolean;
	} = $props();
	let host: HTMLDivElement, canvas: HTMLCanvasElement;
	let session: LabSession | undefined;
	let ready = $state(false), error = $state(''), reduced = $state(false);
	// Exposure is established by the first intersection/visibility observations,
	// not assumed while an asynchronous material is still preparing.
	let visible = $state(false), pageVisible = $state(false), sleeping = $state(true);
	let last = { x: 0.5, y: 0.5 };
	// Ending a transient force is not leaving the surface. Retain the last
	// in-host position across the 80ms idle release, including deliberate slow
	// movement; actual entry/exit and layout/lifecycle changes break the stroke.
	let continuous = false;
	let timer: ReturnType<typeof setTimeout> | undefined;
	$effect(() => {
		available = ready && !error;
		interactive = available && !reduced && visible && pageVisible;
	});

	function sleep() {
		clearTimeout(timer);
		session?.pointer(last.x, last.y, false);
		session?.cancelContact(); session?.cancelNudge();
		if (session && !session.state.paused) session.pause();
		sleeping = true;
	}
	function interrupt() {
		continuous = false;
		// Private consumers may hold a load outside LiquidInput. A callback must
		// not prevent the shared clock from pausing or releasing its resources.
		try { oninterrupt?.(); } catch (reason) { console.warn('Material interruption callback failed:', reason); }
		sleep();
		// Pausing does not redraw by itself. An external owner may have removed
		// a held load; present that neutral state once, deferred while hidden.
		if (oninterrupt) session?.invalidate();
	}
	function release() {
		clearTimeout(timer);
		session?.pointer(last.x, last.y, false);
		session?.cancelContact(); session?.cancelNudge();
		// Release is an input transition, not an instantaneous freeze. Give
		// reversible loads time to relax; persistent histories remain untouched.
		if (!sleeping) timer = setTimeout(sleep, Math.max(50, settleMs));
	}
	export function wake(): boolean {
		if (!session || !ready || error || reduced || !visible || document.hidden) return false;
		clearTimeout(timer);
		if (session.state.paused) session.pause();
		sleeping = false;
		timer = setTimeout(release, 80);
		return true;
	}
	/** Native controls can update a still specimen, including under reduced motion. */
	export function refresh() { if (ready && !error) session?.invalidate(); }
	/** Stop external loads/timers when a parent switches to a non-GPU baseline. */
	export function suspend() { interrupt(); }
	export function reset() { continuous = false; sleep(); if (ready && !error) session?.reset(); }
	export function demo() {
		if (!wake()) return;
		continuous = false;
		session?.pointer(last.x, last.y, false);
		session?.nudge();
		clearTimeout(timer); timer = setTimeout(release, 750);
	}

	onMount(() => {
		let disposed = false;
		pageVisible = !document.hidden;
		const motion = matchMedia('(prefers-reduced-motion: reduce)'); reduced = motion.matches;
		function preferences() { reduced = motion.matches; interrupt(); }
		function visibility() { pageVisible = !document.hidden; if (!pageVisible) interrupt(); }
		function move(event: PointerEvent) {
			if (!event.isPrimary || !wake()) return;
			const rect = canvas.getBoundingClientRect();
			if (rect.width <= 0 || rect.height <= 0) return;
			// Re-prime only a genuinely continuous in-surface stroke. LabSession
			// still rejects stale entry coordinates everywhere else, and its force
			// can decay normally between events without dropping the next delta.
			if (continuous) session?.pointer(last.x, last.y, true);
			last = { x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
				y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) };
			session?.pointer(last.x, last.y, true);
			continuous = true;
		}
		function leave() { continuous = false; release(); }
		function resize() {
			continuous = false;
			session?.pointer(last.x, last.y, false);
			const { width, height } = canvas.getBoundingClientRect();
			session?.resize(width, height);
		}
		const size = new ResizeObserver(resize); size.observe(host);
		const intersection = new IntersectionObserver(([entry]) => {
			visible = entry.isIntersecting;
			if (!visible) interrupt();
		}); intersection.observe(host);
		host.addEventListener('pointermove', move, { passive: true });
		host.addEventListener('pointerleave', leave); host.addEventListener('pointercancel', leave);
		window.addEventListener('blur', interrupt); document.addEventListener('visibilitychange', visibility);
		motion.addEventListener('change', preferences);
		void LabSession.create(canvas, (state) => {
			if (!disposed) { ready = state.ready; error = state.error; }
		}, 'premultiplied').then(async (created) => {
			if (disposed) { created.dispose(); return; }
			session = created;
			// Start with one still frame, not an unobserved burst of simulation.
			session.pause(); resize(); await session.load(factory);
		}).catch((reason) => { if (!disposed) error = String(reason); });
		return () => {
			disposed = true; interrupt();
			size.disconnect(); intersection.disconnect();
			host.removeEventListener('pointermove', move); host.removeEventListener('pointerleave', leave);
			host.removeEventListener('pointercancel', leave); window.removeEventListener('blur', interrupt);
			document.removeEventListener('visibilitychange', visibility); motion.removeEventListener('change', preferences);
			session?.dispose();
		};
	});
</script>

<div class="material" bind:this={host} role={decorative ? undefined : 'img'} aria-label={decorative ? undefined : label}
	aria-hidden={decorative ? 'true' : undefined}
	data-ready={ready && !error} data-sleeping={sleeping} data-reduced={reduced}>
	<canvas bind:this={canvas} class:unavailable={!ready || Boolean(error)} aria-hidden="true"></canvas>
	<div class="status" class:error role="status">{error ? 'WebGPU unavailable — material disabled. ' + error : !ready ? 'Preparing the material…' : reduced ? 'Still specimen · reduced motion' : sleeping ? 'Material at rest · move to explore' : 'Responding to movement'}</div>
</div>

<style>
	.material { position: relative; width: 100%; height: 100%; min-height: 260px; isolation: isolate; user-select: none; -webkit-user-select: none; background: #172127; }
	canvas { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
	canvas.unavailable { visibility: hidden; }
	.status { position: absolute; bottom: 16px; left: 18px; right: 18px; width: fit-content; max-width: calc(100% - 36px); color: #e7e4dc; background: #0c131bd9; padding: 7px 10px; border-radius: 3px; font: 10px/1.5 Arial, sans-serif; pointer-events: none; }
	.status.error { color: #ffcdc2; }
</style>
