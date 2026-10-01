<script lang="ts">
	import { onDestroy } from 'svelte';
	import MaterialSurface from './MaterialSurface.svelte';
	import { loadCoverImage } from './living-cover.js';
	import { createAnnularFlow, type AnnularFlowExperiment } from './annular-flow.js';
	let { src = '/living-cover-arles.jpg' }: { src?: string } = $props();
	const id = $props.id(), abort = new AbortController();
	let model = $state.raw<AnnularFlowExperiment>(), surface: MaterialSurface, available = $state(false), interactive = $state(false);
	let still = $state(false), diagnostic = $state(false), disposed = false;
	async function factory(device: GPUDevice, format: GPUTextureFormat) {
		const bitmap = await loadCoverImage(src, abort.signal);
		try { const candidate = await createAnnularFlow(device, format, bitmap); if (!disposed) model = candidate; return candidate; }
		finally { bitmap.close(); }
	}
	function hold(direction: -1 | 1) { if (!available) return; surface.suspend(); model?.hold(direction); surface.refresh(); }
	function rest() { if (!available) return; surface.reset(); }
	onDestroy(() => { disposed = true; abort.abort(); });
</script>

<div class="annular-proof" data-ready={available}>
	<div class="sheet">
		<img class:hidden={available} {src} alt="Arles cloister, photographed by Édouard Baldus around 1861" />
		<MaterialSurface bind:this={surface} {factory} label="Circular image circulation around a protected bronze medallion. Brush around its rim." settleMs={1700} bind:available bind:interactive oninterrupt={() => model?.finish()} />
		<svg viewBox="0 0 1000 1000" aria-hidden="true" class="medallion">
			<defs>
				<radialGradient id={`${id}-bronze`} cx="32%" cy="22%" r="85%"><stop offset="0" stop-color="#e6c58e" /><stop offset=".38" stop-color="#b39560" /><stop offset=".78" stop-color="#645c42" /><stop offset="1" stop-color="#343d35" /></radialGradient>
				<linearGradient id={`${id}-edge`} x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fff0ca" /><stop offset=".5" stop-color="#786d4e" /><stop offset="1" stop-color="#262f29" /></linearGradient>
			</defs>
			<circle cx="500" cy="500" r="185" fill={`url(#${id}-bronze)`} stroke={`url(#${id}-edge)`} stroke-width="6" />
			<circle cx="500" cy="500" r="165" fill="none" stroke="#4d543d" stroke-width="2" />
			<circle cx="500" cy="499" r="161" fill="none" stroke="#e8d4a1" stroke-opacity=".55" stroke-width="1.5" />
			<g fill="none" stroke="#4e573e" stroke-width="5" stroke-linejoin="round">
				<path d="M500 368 526 474 632 500 526 526 500 632 474 526 368 500 474 474Z" />
				<circle cx="500" cy="500" r="62" /><circle cx="500" cy="500" r="13" />
			</g>
			<path d="M500 369 526 474 632 500 M500 632 474 526 368 500" fill="none" stroke="#f4dda9" stroke-opacity=".75" stroke-width="2" transform="translate(-2,-2)" />
			<g fill="#424c36" font-family="Georgia,serif" font-size="18" text-anchor="middle"><text x="500" y="354">N</text><text x="500" y="660">S</text><text x="348" y="506">W</text><text x="652" y="506">E</text></g>
		</svg>
		<div class="rim-hint">BRUSH AROUND THE RIM ↻</div>
	</div>
	<div class="controls" aria-label="Annular circulation controls">
		<button disabled={!available} onclick={() => hold(-1)}>Circle left</button>
		<button disabled={!available} onclick={() => hold(1)}>Circle right</button>
		<button disabled={!available} onclick={rest}>Rest</button>
		<label><input type="checkbox" checked={still} disabled={!available} onchange={(event) => { still = event.currentTarget.checked; model?.setStill(still); surface.refresh(); }} /> Unchanged source</label>
		<label><input type="checkbox" checked={diagnostic} disabled={!available} onchange={(event) => { diagnostic = event.currentTarget.checked; model?.setDiagnostic(diagnostic); surface.refresh(); }} /> Native grid</label>
	</div>
	<p class="hint">{interactive ? 'Sweep tangentially around the seal; a radial stroke deliberately contributes no spin.' : 'The left / right controls hold a still specimen, including with reduced motion.'} The center image is genuinely protected beneath the SVG.</p>
</div>

<style>
	.annular-proof { width: 100%; }
	.sheet { position: relative; width: 100%; aspect-ratio: 1; overflow: hidden; background: #b7ac92; isolation: isolate; user-select: none; -webkit-user-select: none; border-radius: 4px; }
	.sheet :global(.material) { position: absolute; inset: 0; min-height: 0; background: transparent; }
	.sheet > img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
	.sheet > img.hidden { visibility: hidden; }
	.medallion { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
	.rim-hint { position: absolute; top: 20px; left: 0; width: 100%; text-align: center; pointer-events: none; color: #fff4d8; text-shadow: 0 1px 4px #17251b; font: 10px/1.4 Arial,sans-serif; letter-spacing: .2em; }
	.controls { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; padding-top: 18px; }
	button { border: 1px solid #acb1a0; border-radius: 3px; background: #e8e4d7; color: #253a2b; padding: 10px 15px; font: 12px/1.3 Arial,sans-serif; cursor: pointer; }button:hover { background: #f8f4e7; }button:disabled { cursor: default; opacity: .45; }
	label { display: flex; align-items: center; gap: 5px; font: 11px/1.4 Arial,sans-serif; }
	.hint { color: #626b5f; font: 12px/1.6 Arial,sans-serif; max-width: 65ch; }
</style>
