<script lang="ts">
	import { onMount } from 'svelte';
	import { Fluid } from '$lib/index.js';
	import { PRESETS } from '$lib/presets/registry.js';

	let selected = $state('Plasma');
	let swapped = $state(false);
	let rafHz = $state<number | null>(null);
	const preset = $derived(PRESETS.find((entry) => entry.id === selected) ?? PRESETS[0]);
	const rates = $derived(swapped ? [60, 0] : [0, 60]);

	onMount(() => {
		let request = 0;
		let start = 0;
		let previous = 0;
		let frames = 0;
		const sample = (now: number) => {
			// Hidden tabs/suspension are not display-cadence samples.
			if (!previous || now - previous > 100 || document.hidden) {
				start = now;
				frames = 0;
				rafHz = null;
			} else {
				frames += 1;
				if (now - start >= 1000) {
					rafHz = (frames * 1000) / (now - start);
					start = now;
					frames = 0;
				}
			}
			previous = now;
			request = requestAnimationFrame(sample);
		};
		request = requestAnimationFrame(sample);
		return () => cancelAnimationFrame(request);
	});
</script>

<svelte:head>
	<title>maxFps — owner motion review · svelte-fluid</title>
</svelte:head>

<main>
	<h1>maxFps — owner motion review</h1>
	<p>On your 120 Hz display, is maxFps=60 visually indistinguishable or acceptable as the default?</p>
	<p>Evidence only. Library default remains 0. Use a ProMotion display at 120 Hz, with this tab visible.</p>
	<div class="controls">
		<label for="preset">Preset</label>
		<select id="preset" bind:value={selected}>
			{#each PRESETS as entry (entry.id)}
				<option value={entry.id}>{entry.name}</option>
			{/each}
		</select>
		<label><input type="checkbox" bind:checked={swapped} /> Swap sides</label>
	</div>
	<p>Measured page RAF: {rafHz === null ? 'measuring…' : `${rafHz.toFixed(1)} Hz`} (shared by both sides, not presented fps).</p>
	<p>Presented fps is not exposed by Fluid's public API/handle; no per-side measurement is available.</p>
	{#key selected}
		<div class="comparison">
			{#each rates as rate, side (rate)}
				<section aria-labelledby={`rate-${rate}`}>
					<h2 id={`rate-${rate}`}>{side === 0 ? 'Left' : 'Right'}: maxFps={rate} — {rate === 0 ? 'uncapped' : '60 fps cap'}</h2>
					<Fluid
						{...preset.config}
						seed={5}
						maxFps={rate}
						pointerInput={true}
						height={420}
						aria-label={`${preset.name}, maxFps ${rate}`}
					/>
				</section>
			{/each}
		</div>
	{/key}
	<p>Try fast pointer drags on each side, then watch auto-splat motion (Plasma has auto-splats). Look for judder and uneven motion; swap sides to check side bias.</p>
	<p>Both instances use registry configuration and seed 5. Preset changes restart both; swapping moves the existing instances. Pointer input is independent, not replayed. Same seed does not promise lockstep live simulation. Toroidal uses registry initial splats, not its wrapper's periodic reinjection.</p>
	<p>If RAF is near 60 Hz, this is not a 120 Hz comparison. Close other GPU-heavy tabs; sustained lower RAF may reflect workload or browser/display limits, not just display refresh.</p>
</main>

<style>
	main {
		max-width: 1440px;
		margin: 0 auto;
		padding: 1.5rem;
	}
	.controls {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.75rem;
	}
	select {
		font: inherit;
	}
	.comparison {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 1rem;
	}
	h2 {
		font-size: 1rem;
	}
</style>
