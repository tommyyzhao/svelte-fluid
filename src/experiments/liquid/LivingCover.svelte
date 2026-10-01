<script lang="ts">
	import { onMount } from 'svelte';
	import { LabSession } from './LabSession.js';
	import { createLivingCover, loadCoverImage, type CoverVariant, type LivingCoverExperiment } from './living-cover.js';
	let { src = '/living-cover-arles.jpg', available = $bindable(false), interactive = $bindable(false),
		variant = 'aperture', baseline = false, diagnostic = false, revealed = false }: {
		src?: string; available?: boolean; interactive?: boolean; variant?: CoverVariant;
		baseline?: boolean; diagnostic?: boolean; revealed?: boolean;
	} = $props();
	let host: HTMLDivElement, canvas: HTMLCanvasElement, session: LabSession | undefined;
	let model = $state.raw<LivingCoverExperiment>();
	let ready = $state(false), error = $state(''), reduced = $state(false), visible = $state(true), sleeping = $state(true);
	let pending = false, last = { x: 0.5, y: 0.5 };
	let releaseTimer: ReturnType<typeof setTimeout> | undefined, settleTimer: ReturnType<typeof setTimeout> | undefined;
	$effect(() => { available = ready && !error; interactive = available && !reduced && visible; });
	$effect(() => { model?.setVariant(variant); model?.setBaseline(baseline); model?.setDiagnostic(diagnostic); session?.invalidate(); });
	$effect(() => {
		if (!model) return;
		model.setReveal(revealed, reduced); session?.invalidate();
		if (ready && !reduced && !model.settled) wake();
	});

	function pause() {
		clearTimeout(releaseTimer); clearTimeout(settleTimer);
		session?.pointer(last.x, last.y, false); session?.cancelContact(); session?.cancelNudge();
		if (session && !session.state.paused) session.pause();
		sleeping = true;
	}
	function settled() {
		clearTimeout(settleTimer);
		if (!model || !ready || error || reduced || !visible || document.hidden) { pause(); return; }
		if (model.settled) pause(); else settleTimer = setTimeout(settled, 90);
	}
	function wake() {
		if (!ready || error || reduced || !visible || document.hidden) return false;
		clearTimeout(settleTimer); sleeping = false;
		if (session?.state.paused) session.pause();
		settleTimer = setTimeout(settled, 90); return true;
	}
	function release() { clearTimeout(releaseTimer); session?.pointer(last.x, last.y, false); session?.cancelContact(); }
	function suspend() { pending ||= !sleeping; pause(); }
	function resume() { if ((pending || model && !model.settled) && wake()) pending = false; }
	export function demo() { if (!wake()) return; session?.nudge(); clearTimeout(releaseTimer); releaseTimer = setTimeout(release, 750); }
	export function reset() { pending = false; pause(); if (ready && !error) { model?.reset(); session?.invalidate(); } }
	/** A deliberate navigation/replay action starts one finite transition. */
	export function replayReveal() {
		if (!model || !ready || error) return;
		model.clearMotion(); model.setReveal(false, true); model.setReveal(true, reduced);
		session?.invalidate();
		if (!reduced && !wake()) pending = true;
	}

	onMount(() => {
		let disposed = false; const controller = new AbortController();
		const media = matchMedia('(prefers-reduced-motion: reduce)'); reduced = media.matches;
		function preferences() { reduced = media.matches; if (reduced) suspend(); else resume(); }
		function visibility() { if (document.hidden) suspend(); else resume(); }
		function move(event: PointerEvent) {
			if (!event.isPrimary || !wake()) return;
			const rect = canvas.getBoundingClientRect(); if (!rect.width || !rect.height) return;
			last = { x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) };
			session?.pointer(last.x, last.y, true); clearTimeout(releaseTimer); releaseTimer = setTimeout(release, 80);
		}
		function resize() { const rect = canvas.getBoundingClientRect(); session?.resize(rect.width, rect.height); }
		const size = new ResizeObserver(resize); size.observe(host);
		const intersection = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; if (visible) resume(); else suspend(); }); intersection.observe(host);
		host.addEventListener('pointermove', move, { passive: true }); host.addEventListener('pointerleave', release); host.addEventListener('pointercancel', release);
		window.addEventListener('blur', suspend); window.addEventListener('focus', resume); document.addEventListener('visibilitychange', visibility); media.addEventListener('change', preferences);
		void LabSession.create(canvas, (state) => { if (!disposed) { ready = state.ready; error = state.error; if (error) pause(); } }, 'premultiplied').then(async (created) => {
			if (disposed) { created.dispose(); return; } session = created; session.pause(); resize();
			await session.load(async (device, format) => {
				const bitmap = await loadCoverImage(src, controller.signal);
				try {
					const candidate = await createLivingCover(device, format, bitmap);
					candidate.setVariant(variant); candidate.setBaseline(baseline); candidate.setDiagnostic(diagnostic); candidate.setReveal(revealed, true);
					if (!disposed) model = candidate; return candidate;
				} finally { bitmap.close(); }
			});
		}).catch((reason) => { if (!disposed) error = String(reason); });
		return () => {
			disposed = true; controller.abort(); clearTimeout(releaseTimer); clearTimeout(settleTimer); size.disconnect(); intersection.disconnect();
			host.removeEventListener('pointermove', move); host.removeEventListener('pointerleave', release); host.removeEventListener('pointercancel', release);
			window.removeEventListener('blur', suspend); window.removeEventListener('focus', resume); document.removeEventListener('visibilitychange', visibility); media.removeEventListener('change', preferences); session?.dispose();
		};
	});
</script>

<div class="living-cover material" bind:this={host} role="img" aria-label={variant === 'reveal' ? 'An archival photograph of a Romanesque cloister with a finite reveal transition.' : 'An archival photograph of a Romanesque cloister inside a pointer-responsive aperture.'}
	data-ready={ready && !error} data-reduced={reduced} data-sleeping={sleeping} data-variant={variant}>
	<div class="underprint" aria-hidden="true"><span>LIGHT<br />LEAVES<br />A TRACE.</span><i>THE SPACE AROUND AN IMAGE</i></div>
	<img {src} alt="Arles, Cloître St. Trophime, photographed by Édouard Baldus around 1861" class:hidden={ready && !error} />
	<canvas bind:this={canvas} class:unavailable={!ready || Boolean(error)} aria-hidden="true"></canvas>
	<div class="status" role="status">{error ? 'Static photograph · WebGPU unavailable. ' + error : !ready ? 'Preparing the photograph…' : variant === 'reveal' ? reduced ? 'Still state · reduced motion' : !sleeping ? 'A finite edge brings the photograph into view' : revealed ? 'Photograph revealed · replay to see the edge again' : 'Photograph concealed · choose Reveal photograph' : reduced ? 'Still photograph · reduced motion' : sleeping ? 'Brush the aperture edge' : 'Responding to the sweep'}</div>
</div>

<style>
	.living-cover { position: relative; width: 100%; aspect-ratio: 1; overflow: hidden; isolation: isolate; user-select: none; -webkit-user-select: none; background: #d6e0d7; }
	canvas, img { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }img { object-fit: cover; }img.hidden { visibility: hidden; }canvas.unavailable { visibility: hidden; }
	.underprint { position: absolute; inset: 0; padding: 7%; box-sizing: border-box; background-image: linear-gradient(#7b938626 1px, transparent 1px),linear-gradient(90deg,#7b938626 1px,transparent 1px); background-size: 28px 28px; color: #587162; }
	.underprint span { position: absolute; inset: 7% auto auto 7%; font: 600 clamp(21px,4vw,50px)/.96 Arial,sans-serif; letter-spacing: -.06em; }.underprint i { position: absolute; bottom: 4%; right: 4%; font: 8px Arial,sans-serif; letter-spacing: .14em; }
	.status { position: absolute; bottom: 14px; left: 14px; max-width: calc(100% - 48px); padding: 7px 9px; border-radius: 2px; background: #18251dd6; color: #f2eddf; font: 9px/1.5 Arial,sans-serif; pointer-events: none; overflow-wrap: anywhere; }
</style>
