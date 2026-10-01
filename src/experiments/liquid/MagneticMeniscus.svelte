<script lang="ts">
	import { onMount } from 'svelte';
	import MaterialSurface from './MaterialSurface.svelte';
	import { createMagneticMeniscus, type MagneticMeniscus } from './magnetic-meniscus.js';
	let surface = $state<MaterialSurface>(), model: MagneticMeniscus | undefined, host: HTMLDivElement;
	let interactive = $state(false), available = $state(false), baseline = $state(false), strength = $state(1);
	let requested: { x: number; y: number; active: boolean } = { x: .5, y: .5, active: false };
	let pointerOwned = false;
	async function factory(device: GPUDevice, format: GPUTextureFormat) {
		const candidate = await createMagneticMeniscus(device, format); model = candidate;
		candidate.setStrength(strength); candidate.setMagnet(requested.x, requested.y, requested.active, true);
		return candidate;
	}
	function setMagnet(x: number, y: number, active: boolean, fromPointer = false) {
		pointerOwned = fromPointer;
		requested = { x, y, active }; model?.setMagnet(x, y, active, !interactive);
		if (!surface?.wake()) model?.finish(); surface?.refresh();
	}
	function interrupt() {
		// Native buttons own a still configuration; only a transient hover load
		// is released by visibility/focus interruptions.
		if (!pointerOwned) return;
		pointerOwned = false; requested = { x: .5, y: .5, active: false };
		model?.setMagnet(.5, .5, false, true);
	}
	function changeStrength(event: Event) {
		strength = Number((event.currentTarget as HTMLInputElement).value); model?.setStrength(strength);
		if (!surface?.wake()) model?.finish(); surface?.refresh();
	}
	onMount(() => {
		const move = (event: PointerEvent) => {
			if (!event.isPrimary || !interactive || baseline) return;
			const r = host.getBoundingClientRect(); if (r.width <= 0 || r.height <= 0) return;
			setMagnet((event.clientX - r.left) / r.width, (event.clientY - r.top) / r.height, true, true);
		};
		const leave = () => { if (pointerOwned) setMagnet(.5, .5, false); };
		host.addEventListener('pointermove', move, { passive: true }); host.addEventListener('pointerleave', leave); host.addEventListener('pointercancel', leave);
		return () => { host.removeEventListener('pointermove', move); host.removeEventListener('pointerleave', leave); host.removeEventListener('pointercancel', leave); model = undefined; };
	});
</script>

<section aria-label="Field-attracted meniscus">
	<div class="controls">
		<button onclick={() => setMagnet(.82, .5, true)} disabled={baseline || !available}>Magnet at right</button>
		<button onclick={() => setMagnet(.32, .2, true)} disabled={baseline || !available}>Magnet above left</button>
		<button onclick={() => setMagnet(.5, .5, false)} disabled={baseline || !available}>Remove field</button>
		<label>Attraction <input type="range" min="0" max="1.5" step="0.05" value={strength} oninput={changeStrength} /> {strength.toFixed(2)}</label>
		<label><input type="checkbox" bind:checked={baseline} /> Plain circular aperture</label>
	</div>
	<div class="aperture" bind:this={host} class:plain={baseline || !available}>
		<img src="/living-cover-arles.jpg" alt="Arles cloister, Edouard Baldus, public-domain photograph" draggable="false" />
		{#if !baseline}<div class="material-layer"><MaterialSurface bind:this={surface} {factory} label="A constant-area liquid rim attracted toward a nearby field" settleMs={700} oninterrupt={interrupt} bind:interactive bind:available /></div>{/if}
		{#if baseline}<span class="baseline-label">Still circle · no WebGPU model mounted</span>{/if}
	</div>
	<p class="caption">Move near the rim without touching it. The edge reaches toward the field; the photograph never warps. Remove the field to recover the circle.</p>
	<details><summary>What is actually being simulated?</summary><p>Twelve radial modes relax toward an authored distance-dependent attraction. Analytic normalization preserves enclosed area at every intermediate state; positive radius keeps one simple boundary. This is a magnetic-inspired interaction, not a magnetostatic induction solver or ferrofluid-spike simulation. The reduced response is deliberately non-oscillatory.</p><p>Controls provide still configurations under reduced motion. The plain circle unmounts WebGPU. Native photographic detail is provided by the original 3803 × 3162 image; the GPU draws only the rim and outside mask at actual display density.</p></details>
</section>

<style>
	section { font-family: Arial, sans-serif; }
	.controls { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-bottom: 20px; font-size: 12px; }
	button { color: #c7d6d0; background: #243336; border: 1px solid #526966; border-radius: 4px; padding: 10px 13px; font: inherit; cursor: pointer; }
	button:disabled { opacity: .45; cursor: default; } label { display: flex; align-items: center; gap: 8px; } input { accent-color: #a7c1b1; }
	.aperture { position: relative; width: 100%; aspect-ratio: 1.5; background: #141c1d; overflow: hidden; user-select: none; -webkit-user-select: none; }
	.aperture img { position: absolute; width: 100%; height: 100%; object-fit: cover; }
	.aperture.plain img { clip-path: ellipse(18.8% 28.2% at 50% 50%); }
	.material-layer { position: absolute; inset: 0; }
	.material-layer :global(.material) { background: transparent; min-height: 0; }
	.baseline-label { position: absolute; bottom: 20px; left: 20px; background: #101b20; padding: 8px; font-size: 11px; }
	.caption, details { color: #a9bbb4; font-size: 12px; line-height: 1.8; } details { max-width: 760px; margin-top: 24px; } summary { cursor: pointer; }
	button:focus-visible, input:focus-visible, summary:focus-visible { outline: 2px solid #bed2b2; outline-offset: 4px; }
	@media(max-width: 600px) { .aperture { aspect-ratio: 1; } .aperture.plain img { clip-path: circle(28.2% at 50% 50%); } }
</style>
