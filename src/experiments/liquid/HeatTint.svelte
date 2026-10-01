<script lang="ts">
	import { onMount } from 'svelte';
	import { LabSession } from './LabSession.js';
	import { createHeatTint, type HeatTintExperiment } from './heat-tint.js';

	let { interactive = $bindable(false), available = $bindable(false) }: {
		interactive?: boolean; available?: boolean;
	} = $props();
	let host: HTMLDivElement, canvas: HTMLCanvasElement;
	let session: LabSession | undefined, engine: HeatTintExperiment | undefined;
	let ready = $state(false), error = $state(''), reduced = $state(false), sleeping = $state(true);
	let visible = $state(true), last = { x: 0.5, y: 0.5 };
	let timer: ReturnType<typeof setTimeout> | undefined;
	let pendingTail = false;
	$effect(() => { available = ready && !error; interactive = available && !reduced && visible; });

	function rest() {
		clearTimeout(timer); sleeping = true; pendingTail = false;
		if (!ready || error) return;
		session?.pointer(last.x, last.y, false); session?.cancelContact(); session?.cancelNudge();
		// Idle finishes only the imperceptible heat tail. Oxide is never reset here.
		engine?.cool(); session?.invalidate();
		if (session && !session.state.paused) session.pause();
	}
	function suspend() {
		clearTimeout(timer); pendingTail ||= !sleeping;
		if (!ready || error) return;
		session?.pointer(last.x, last.y, false); session?.cancelContact(); session?.cancelNudge();
		// Freeze both fields during absence. Discarding heat here would also
		// discard the oxidation it would have caused while naturally cooling.
		if (session && !session.state.paused) session.pause();
	}
	function resume() { if (pendingTail && wake()) pendingTail = false; }
	function wake() {
		if (!ready || error || reduced || !visible || document.hidden) return false;
		clearTimeout(timer); sleeping = false;
		if (session?.state.paused) session.pause();
		timer = setTimeout(rest, 4500);
		return true;
	}
	export function demo() {
		if (!wake()) return;
		session?.nudge(); clearTimeout(timer); timer = setTimeout(rest, 5200);
	}
	export function reset() { if (ready && !error) { session?.reset(); rest(); } }
	onMount(() => {
		let disposed = false;
		const motion = matchMedia('(prefers-reduced-motion: reduce)'); reduced = motion.matches;
		function preferences() { reduced = motion.matches; if (reduced) suspend(); else resume(); }
		function visibility() { if (document.hidden) suspend(); else resume(); }
		function move(event: PointerEvent) {
			if (!event.isPrimary || !wake()) return;
			const bounds = host.getBoundingClientRect();
			last = { x: (event.clientX - bounds.left) / bounds.width, y: (event.clientY - bounds.top) / bounds.height };
			session?.pointer(last.x, last.y, true);
		}
		function leave() { session?.pointer(last.x, last.y, false); }
		function resize() {
			const { width, height } = canvas.getBoundingClientRect();
			session?.resize(width, height); session?.invalidate();
		}
		const size = new ResizeObserver(resize); size.observe(host);
		const intersection = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; if (!visible) suspend(); else resume(); }); intersection.observe(host);
		host.addEventListener('pointermove', move, { passive: true }); host.addEventListener('pointerleave', leave);
		host.addEventListener('pointercancel', leave); window.addEventListener('blur', suspend); window.addEventListener('focus', resume);
		document.addEventListener('visibilitychange', visibility); motion.addEventListener('change', preferences);
		void LabSession.create(canvas, (state) => {
			if (!disposed) {
				ready = state.ready; error = state.error;
				if (error) { clearTimeout(timer); sleeping = true; pendingTail = false; }
			}
		}).then(async (created) => {
			if (disposed) { created.dispose(); return; }
			session = created; resize();
			await session.load(async (device, format) => {
				const material = await createHeatTint(device, format);
				if (!disposed) engine = material;
				return material;
			});
			if (!disposed) rest();
		}).catch((reason) => { if (!disposed) error = String(reason); });
		return () => {
			disposed = true; clearTimeout(timer); size.disconnect(); intersection.disconnect();
			host.removeEventListener('pointermove', move); host.removeEventListener('pointerleave', leave);
			host.removeEventListener('pointercancel', leave); window.removeEventListener('blur', suspend); window.removeEventListener('focus', resume);
			document.removeEventListener('visibilitychange', visibility); motion.removeEventListener('change', preferences);
			session?.dispose();
		};
	});
</script>

<div class="heat-surface" bind:this={host} role="img" aria-label="A satin metal plate. Pointer movement leaves lasting iridescent oxide traces while its heat fades.">
	<canvas bind:this={canvas} class:unavailable={!ready || Boolean(error)} aria-hidden="true"></canvas>
	<div class="plate-label" aria-hidden="true"><span>ATELIER / 06</span><span>THERMAL MEMORY</span></div>
	<div class="status" role="status">{error ? 'Static finish · WebGPU unavailable' : reduced ? 'Still finish · reduced motion' : !ready ? 'Preparing the plate…' : sleeping ? 'Move slowly. Leave a trace.' : 'Heat fades. Color stays.'}</div>
	{#if error}<details class="error"><summary>Why the effect is unavailable</summary><p>{error}</p></details>{/if}
</div>

<style>
	.heat-surface { position: relative; width: 100%; aspect-ratio: 12 / 7; isolation: isolate; overflow: hidden; user-select: none; -webkit-user-select: none; background: radial-gradient(ellipse at 25% 10%, #a4a6a9, #72777f 65%, #676d78); }
	canvas { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
	canvas.unavailable { visibility: hidden; }
	.plate-label { position: absolute; inset: 26px 28px auto; display: flex; justify-content: space-between; color: #171b22b0; font: 10px/1.5 Arial, sans-serif; letter-spacing: .15em; pointer-events: none; }
	.status { position: absolute; bottom: 26px; left: 28px; color: #121722; font: 11px/1.5 Arial, sans-serif; pointer-events: none; padding: 6px 9px; background: #c9cdd474; border-radius: 2px; }
	.error { position: absolute; top: 56px; left: 28px; right: 28px; max-width: 700px; color: #171b22; font: 11px/1.6 Arial, sans-serif; background: #d9dce4d9; padding: 8px; overflow-wrap: anywhere; }
	@media (max-width: 600px) { .plate-label { inset: 16px 16px auto; font-size: 8px; } .status { bottom: 16px; left: 16px; font-size: 9px; } }
</style>
