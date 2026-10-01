<script lang="ts">
	import { onMount } from 'svelte';
	import { LabSession } from './LabSession.js';
	import { loadCoverImage } from './living-cover.js';
	import { createImageWake, WAKE_CAPACITY, type ImageWakeExperiment } from './image-wake.js';
	let { src = '/living-cover-arles.jpg', available = $bindable(false), interactive = $bindable(false),
		reference = false, diagnostic = false, still = false }: { src?: string; available?: boolean; interactive?: boolean; reference?: boolean; diagnostic?: boolean; still?: boolean } = $props();
	let host: HTMLDivElement, canvas: HTMLCanvasElement, session: LabSession | undefined;
	let model = $state.raw<ImageWakeExperiment>();
	let ready = $state(false), error = $state(''), reduced = $state(false), visible = $state(true), sleeping = $state(true), held = $state(false), occupancy = $state(0);
	let pending = false, continuous = false, last = { x: 0.5, y: 0.5 };
	let releaseTimer: ReturnType<typeof setTimeout> | undefined, settleTimer: ReturnType<typeof setTimeout> | undefined;
	$effect(() => { available = ready && !error; interactive = available && !reduced && visible; });
	$effect(() => { model?.setReference(reference); model?.setDiagnostic(diagnostic); model?.setStill(still); session?.invalidate(); });
	function release() { clearTimeout(releaseTimer); session?.pointer(last.x, last.y, false); session?.cancelContact(); }
	function pause() {
		clearTimeout(settleTimer); release(); session?.cancelNudge();
		if (session && !session.state.paused) session.pause(); sleeping = true;
	}
	function breakStroke() { continuous = false; model?.breakStroke(); }
	function checkSettled() {
		clearTimeout(settleTimer); occupancy = model?.occupancy ?? 0;
		if (!ready || error || reduced || !visible || document.hidden || model?.settled) { pause(); return; }
		settleTimer = setTimeout(checkSettled, 90);
	}
	function wake() {
		if (!ready || error || reduced || !visible || document.hidden) return false;
		clearTimeout(settleTimer); held = false; sleeping = false;
		if (session?.state.paused) session.pause(); settleTimer = setTimeout(checkSettled, 90); return true;
	}
	function suspend() { pending ||= !sleeping; breakStroke(); pause(); }
	function resume() { if (!held && (pending || model && !model.settled) && wake()) pending = false; }
	export function demo() { if (!wake()) return; breakStroke(); release(); session?.nudge(); releaseTimer = setTimeout(release, 750); }
	export function reset() { pending = false; held = false; breakStroke(); pause(); if (ready && !error) { model?.reset(); occupancy = 0; session?.invalidate(); } }
	/** A deliberately held, native static control, including under reduced motion. */
	export function holdTrace() { if (!ready || error) return; pending = false; breakStroke(); pause(); model?.showTrace(); occupancy = model?.occupancy ?? 0; held = true; session?.invalidate(); }
	onMount(() => {
		let disposed = false; const controller = new AbortController(), media = matchMedia('(prefers-reduced-motion: reduce)'); reduced = media.matches;
		function preferences() { reduced = media.matches; if (reduced) suspend(); else resume(); }
		function visibility() { if (document.hidden) suspend(); else resume(); }
		function move(event: PointerEvent) {
			if (!event.isPrimary || !wake()) return;
			const rect = canvas.getBoundingClientRect(); if (!rect.width || !rect.height) return;
			// Restore actual endpoints across the idle force timeout. This primes
			// geometry AND the clock; inactive repeated steps never draw a segment.
			if (continuous) { session?.pointer(last.x, last.y, true); model?.primeInput(last.x, last.y); }
			else model?.breakStroke();
			last = { x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) };
			session?.pointer(last.x, last.y, true); continuous = true; clearTimeout(releaseTimer); releaseTimer = setTimeout(release, 80);
		}
		// The clock may still owe the final in-host endpoint a step. Release
		// lets its deferred endInput hook deliver that segment; a new entry
		// resets the arc remainder above, without ever connecting two gestures.
		function leave() { continuous = false; release(); }
		function resize() { breakStroke(); release(); const rect = canvas.getBoundingClientRect(); session?.resize(rect.width, rect.height); }
		const size = new ResizeObserver(resize); size.observe(host);
		const intersection = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; if (visible) resume(); else suspend(); }); intersection.observe(host);
		host.addEventListener('pointermove', move, { passive: true }); host.addEventListener('pointerleave', leave); host.addEventListener('pointercancel', leave);
		window.addEventListener('blur', suspend); window.addEventListener('focus', resume); document.addEventListener('visibilitychange', visibility); media.addEventListener('change', preferences);
		void LabSession.create(canvas, (state) => { if (!disposed) { ready = state.ready; error = state.error; if (error) pause(); } }, 'premultiplied').then(async (created) => {
			if (disposed) { created.dispose(); return; } session = created; session.pause(); resize();
			await session.load(async (device, format) => {
				const bitmap = await loadCoverImage(src, controller.signal);
				try { const candidate = await createImageWake(device, format, bitmap); candidate.setReference(reference); candidate.setDiagnostic(diagnostic); candidate.setStill(still); if (!disposed) model = candidate; return candidate; }
				finally { bitmap.close(); }
			});
		}).catch((reason) => { if (!disposed) error = String(reason); });
		return () => {
			disposed = true; controller.abort(); clearTimeout(releaseTimer); clearTimeout(settleTimer); size.disconnect(); intersection.disconnect();
			host.removeEventListener('pointermove', move); host.removeEventListener('pointerleave', leave); host.removeEventListener('pointercancel', leave);
			window.removeEventListener('blur', suspend); window.removeEventListener('focus', resume); document.removeEventListener('visibilitychange', visibility); media.removeEventListener('change', preferences); session?.dispose();
		};
	});
</script>

<div class="image-wake material" bind:this={host} role="img" aria-label="An archival cloister photograph with small pointer-drawn local wakes."
	data-ready={ready && !error} data-reduced={reduced} data-sleeping={sleeping} data-packets={occupancy} data-held={held} data-reference={reference}>
	<img {src} alt="Arles, Cloître St. Trophime, photographed by Édouard Baldus around 1861" class:hidden={ready && !error} />
	<canvas bind:this={canvas} class:unavailable={!ready || Boolean(error)} aria-hidden="true"></canvas>
	<div class="status" role="status">{error ? 'Static photograph · WebGPU unavailable. ' + error : !ready ? 'Preparing the original photograph…' : held ? 'Held trace · move to release, or compare with the still source' : reduced ? 'Still photograph · reduced motion. Show a held trace to compare.' : still ? 'Unchanged original · the wake continues underneath' : reference ? 'Earlier six-center reference · broad response' : occupancy === WAKE_CAPACITY ? WAKE_CAPACITY + ' / ' + WAKE_CAPACITY + ' authored wakes · let a tail clear before adding more' : sleeping ? 'Move across the photograph. The trace follows your hand.' : occupancy + ' / ' + WAKE_CAPACITY + ' authored wakes · retained briefly, then restored'}</div>
</div>

<style>
	.image-wake { position: relative; width: 100%; aspect-ratio: 1; overflow: hidden; isolation: isolate; user-select: none; -webkit-user-select: none; background: #d9d5c8; }
	canvas, img { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }img { object-fit: cover; }img.hidden,canvas.unavailable { visibility: hidden; }
	.status { position: absolute; bottom: 14px; left: 14px; max-width: calc(100% - 48px); padding: 7px 10px; background: #172921df; color: #f3efe3; font: 10px/1.5 Arial,sans-serif; pointer-events: none; overflow-wrap: anywhere; }
</style>
