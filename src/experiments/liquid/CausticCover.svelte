<script lang="ts">
	import { onMount } from 'svelte';
	import MaterialSurface from './MaterialSurface.svelte';
	import { CAUSTIC_DEFAULTS, causticPhotoCrop, createCausticLight, type CausticLight, type PhotonGrid } from './caustic-light.js';
	import { loadCoverImage } from './living-cover.js';
	type View = 'caustic' | 'original' | 'radial';
	let view = $state<View>('caustic'), ready = $state(false), interactive = $state(false), failure = $state(''), reduced = $state(false);
	let surface = $state<{ refresh(): void; reset(): void; suspend(): void }>();
	let model: CausticLight | undefined, controller: AbortController | undefined, generation = 0, disposed = false;
	let relief = $state(CAUSTIC_DEFAULTS.relief), grid = $state<PhotonGrid>(128), phase = 0;
	let last = { x: CAUSTIC_DEFAULTS.centerX, y: CAUSTIC_DEFAULTS.centerY };
	let radialX = $state(last.x), radialY = $state(last.y);
	const crop = causticPhotoCrop(1, 3803 / 3162);
	const available = $derived(ready && !failure);
	async function factory(device: GPUDevice, format: GPUTextureFormat) {
		const token = ++generation; controller = new AbortController();
		const image = await loadCoverImage('/living-cover-arles.jpg', controller.signal);
		try {
			const candidate = await createCausticLight(device, format, { image, photonGrid: grid, onError(message) {
				if (!disposed && token === generation) { failure = message; surface?.suspend(); }
			} });
			candidate.setRelief(relief); candidate.setPhase(phase); candidate.setPosition(last.x, last.y);
			if (!disposed && token === generation) model = candidate;
			return candidate;
		} finally { image.close(); }
	}
	function choose(next: View) { if (view === next) return; generation++; controller?.abort(); model = undefined; ready = false; failure = ''; view = next; }
	function move(event: PointerEvent) {
		if (!event.isPrimary || reduced) return;
		const rect = event.currentTarget instanceof HTMLElement ? event.currentTarget.getBoundingClientRect() : undefined;
		if (!rect?.width || !rect.height) return;
		last = { x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) };
		if (view === 'radial') { radialX = last.x; radialY = last.y; }
	}
	function shift() { phase = (phase + 0.25) % (Math.PI * 20); model?.setPhase(phase); radialX = 0.5 + 0.3 * Math.sin(phase * 3); radialY = 0.5 + 0.25 * Math.cos(phase * 4); surface?.refresh(); }
	function reset() {
		phase = 0; relief = CAUSTIC_DEFAULTS.relief; grid = 128; last = { x: CAUSTIC_DEFAULTS.centerX, y: CAUSTIC_DEFAULTS.centerY }; radialX = last.x; radialY = last.y;
		model?.setRelief(relief); model?.setPhotonGrid(grid); surface?.reset();
	}
	onMount(() => {
		const media = matchMedia('(prefers-reduced-motion: reduce)'); const update = () => { reduced = media.matches; }; update(); media.addEventListener('change', update);
		return () => { disposed = true; generation++; controller?.abort(); media.removeEventListener('change', update); };
	});
</script>

<div class="cover-study" data-caustic-cover-view={view} data-caustic-cover-ready={view !== 'caustic' || available}>
	<div class="sheet" onpointermove={move} role="img" aria-label="Arles cloister photograph. Its printed details stay registered while illumination changes." style={`--light-x:${radialX * 100}%;--light-y:${radialY * 100}%`}>
		<!-- SVG's source transform keeps the fractional crop. HTML image paint
			boxes rounded to CSS pixels shifted the native 3x reference by ~.8px. -->
		<svg class="poster" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true"><image href="/living-cover-arles.jpg" x={0.5 - 0.5 / crop[0]} y={0.5 - 0.475 / crop[1]} width={1 / crop[0]} height={1 / crop[1]} preserveAspectRatio="none" /></svg>
		{#if view === 'caustic'}
			<div class="gpu" class:failed={Boolean(failure)}><MaterialSurface bind:this={surface} bind:available={ready} bind:interactive {factory} decorative settleMs={120} label="A fixed photograph receiving focused light. Native controls select a still illumination under reduced motion." /></div>
			{#if failure}<p class="fallback" role="status">Static photograph · WebGPU unavailable. {failure}</p>{/if}
		{:else if view === 'radial'}<div class="radial" aria-hidden="true"></div>{/if}
		<div class="registration" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
	</div>
	<div class="controls">
		<label>View <select aria-label="View" value={view} onchange={(event) => choose(event.currentTarget.value as View)}><option value="caustic">Caustic light</option><option value="original">Original photo</option><option value="radial">CSS radial highlight</option></select></label>
		<label>Surface relief <input type="range" min="0" max="1" step="0.01" value={relief} disabled={view !== 'caustic' || !available} oninput={(event) => { relief = +event.currentTarget.value; model?.setRelief(relief); surface?.refresh(); }} /></label>
		<label>Light samples <select aria-label="Light samples" value={grid} disabled={view !== 'caustic' || !available} onchange={(event) => { grid = +event.currentTarget.value as PhotonGrid; model?.setPhotonGrid(grid); surface?.refresh(); }}><option value={64}>4,096</option><option value={128}>16,384</option><option value={256}>65,536</option></select></label>
		<button onclick={shift} disabled={view === 'original' || view === 'caustic' && !available}>Shift light</button><button onclick={reset}>Reset</button>
	</div>
	<p class="instruction">{view === 'original' ? 'The registered source. No GPU model is mounted.' : view === 'radial' ? 'A cheap CSS comparison: one radial highlight, no light transport or GPU model.' : !available ? 'The original remains available while the optical material prepares, or if WebGPU cannot run.' : interactive ? 'Move across the print. The light moves; the architecture does not.' : 'Shift light selects another still illumination. Pointer animation is not required.'} {view === 'caustic' ? 'Set relief to zero to recover the original illumination.' : ''}</p>
</div>

<style>
	.sheet { position: relative; aspect-ratio: 1; overflow: hidden; isolation: isolate; user-select: none; -webkit-user-select: none; background: #ad9e7e; }
	.poster { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
	.gpu, .radial, .registration { position: absolute; inset: 0; } .gpu :global(.material) { min-height: 0; background: transparent; } .gpu.failed :global(canvas) { visibility: hidden; }
	.gpu :global(.status) { background: #28241bdf; color: #f2e6c6; font-size: 9px; }
	.radial { pointer-events: none; background: radial-gradient(circle at var(--light-x) var(--light-y), #fff2cf9c 0, #e9c57938 15%, transparent 35%); mix-blend-mode: screen; }
	.registration { pointer-events: none; } i { position: absolute; width: 8px; height: 8px; border: 1px solid #fff0bf9c; } i:nth-child(1) { left: 15px; top: 15px; border-right: 0; border-bottom: 0; } i:nth-child(2) { right: 15px; top: 15px; border-left: 0; border-bottom: 0; } i:nth-child(3) { left: 15px; bottom: 15px; border-right: 0; border-top: 0; } i:nth-child(4) { right: 15px; bottom: 15px; border-left: 0; border-top: 0; }
	.fallback { position: absolute; bottom: 12px; left: 12px; right: 12px; padding: 12px; background: #28241be8; color: #ead7b5; font-size: 10px; }
	.controls { display: flex; flex-wrap: wrap; gap: 14px 18px; align-items: center; padding: 22px 0 8px; } label { display: flex; gap: 10px; align-items: center; font-size: 10px; } input { width: 90px; accent-color: #736f45; } select, button { background: transparent; padding: 8px 10px; border: 1px solid #80765e77; color: inherit; font: 10px Arial, sans-serif; } button { cursor: pointer; } :is(button,select,input):disabled { opacity: .45; cursor: default; } :is(button,select,input):focus-visible { outline: 2px solid #676634; outline-offset: 4px; } .instruction { color: #796e54; font-size: 10px; line-height: 1.7; margin: 10px 0 0; }
</style>
