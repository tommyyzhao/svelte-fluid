<script lang="ts">
	import LivingCover from '../../../../experiments/liquid/LivingCover.svelte';
	import type { CoverVariant } from '../../../../experiments/liquid/living-cover.js';
	let surface = $state<{ demo(): void; reset(): void; replayReveal(): void }>();
	let available = $state(false), interactive = $state(false), baseline = $state(false), diagnostic = $state(false), revealed = $state(false);
	let variant = $state<CoverVariant>('aperture');
	const variants: { id: CoverVariant; label: string; copy: string }[] = [
		{ id: 'aperture', label: 'Wet aperture', copy: 'Only the boundary moves. The photograph stays still; the page shows through.' },
		{ id: 'reveal', label: 'Directed reveal', copy: 'Selecting this study reveals the photograph. Replay the finite edge, or conceal it again.' }
	];
	function reset() { revealed = false; surface?.reset(); }
	function replay() { revealed = true; surface?.replayReveal(); }
	function selectVariant(next: CoverVariant) {
		variant = next;
		if (next === 'reveal') replay();
	}
</script>

<svelte:head><title>Still, for a moment — living photographs</title><meta name="robots" content="noindex" /></svelte:head>
<main>
	<header><a href="/lab/interfaces">fluid / explorations</a><span>THE MEMORY OF AN IMAGE</span></header>
	<section class="composition" aria-labelledby="title">
		<div class="story"><p class="eyebrow">Arles · ca. 1861 / now</p><h1 id="title">Still,<br />for a <em>moment.</em></h1><p class="description">Keep the photograph still.<br />Let its boundary respond.</p><nav aria-label="Photograph experiments">{#each variants as item}<button aria-pressed={variant === item.id} onclick={() => selectVariant(item.id)}><span>0{variants.indexOf(item) + 1}</span>{item.label} <b aria-hidden="true">↗</b></button>{/each}</nav><p class="variant-copy">{variants.find((item) => item.id === variant)?.copy}</p>{#if variant === 'reveal'}<div class="reveal-controls"><button onclick={replay} disabled={!available}>{revealed ? 'Replay reveal' : 'Reveal photograph'}</button><button onclick={() => { revealed = false; }} disabled={!available || !revealed}>Hide photograph</button></div>{/if}</div>
		<figure><LivingCover bind:this={surface} bind:available bind:interactive {variant} {baseline} {diagnostic} {revealed} /><figcaption><span>Édouard Baldus / Cloître St. Trophime</span><span>THE MET · PUBLIC DOMAIN</span></figcaption></figure>
	</section>
	<div class="controls"><div><button onclick={() => surface?.demo()} disabled={!interactive}>Send a sweep ↗</button><button onclick={reset} disabled={!available}>Reset</button></div><div><button aria-pressed={baseline} onclick={() => { baseline = !baseline; }} disabled={!available}>Single ripple baseline</button><button aria-pressed={diagnostic} onclick={() => { diagnostic = !diagnostic; }} disabled={!available}>Native grid</button></div></div>
	<div class="notes"><p>A photograph.<br /><em>A responsive boundary.</em></p><details><summary>How the boundary moves <span>+</span></summary><p>Six compact twists change the aperture edge or reveal front. Passing movements combine and settle, while the photograph keeps its shape. This is authored boundary motion, not a calibrated fluid solver.</p><p>Aperture and directed reveal keep the photograph still while the cutout or finite reveal front moves. The concealed region is transparent, exposing the page. The original 3803 × 3162 photograph remains intact with a one-time linear-light mip pyramid and anisotropic filtering.</p><p>Photograph by Édouard Baldus, ca. 1861. <a href="https://www.metmuseum.org/art/collection/search/283136">The Metropolitan Museum of Art</a>, Public Domain / CC0. The print border is cropped in source coordinates, not edited in the asset.</p></details></div>
	<footer><a href="/lab/interfaces">All explorations ↗</a><span>A small representation. A real image.</span></footer>
</main>

<style>
	:global(body) { margin: 0; background: #f1eee5; color: #293c32; }
	main { max-width: 1300px; margin: 0 auto; padding: 0 34px; font-family: 'Helvetica Neue', Arial, sans-serif; }
	a { color: inherit; text-decoration: none; }
	header, footer { display: flex; justify-content: space-between; align-items: center; gap: 20px; padding: 25px 0; border-bottom: 1px solid #293c3229; font-size: 10px; }header span { font-size: 8px; letter-spacing: .13em; color: #8d8c7b; }
	.composition { display: grid; grid-template-columns: 0.7fr 1.3fr; gap: 55px; align-items: center; padding: 44px 0 22px; }.eyebrow { font-size: 9px; letter-spacing: .13em; text-transform: uppercase; color: #9b684f; }
	h1 { margin: 20px 0 24px; font: 400 clamp(56px,6.3vw,91px)/.98 Georgia,serif; letter-spacing: -.065em; }h1 em { color: #899782; }.description { font-size: 12px; line-height: 1.8; color: #7d857b; }
	nav { margin-top: 34px; border-top: 1px solid #293c3229; }nav button { display: flex; width: 100%; border: 0; border-bottom: 1px solid #293c3229; padding: 15px 0; text-align: left; background: none; font: inherit; font-size: 11px; color: #8b9288; cursor: pointer; }nav button span { width: 38px; font-size: 8px; padding-top: 2px; }nav button b { margin-left: auto; font-weight: 400; }nav button[aria-pressed='true'] { color: #2b4937; }nav button[aria-pressed='true'] span { color: #af6f4e; }.variant-copy { color: #8b9288; font-size: 10px; line-height: 1.8; min-height: 36px; margin: 18px 0 0; }
	figure { margin: 0; min-width: 0; }figcaption { display: flex; justify-content: space-between; gap: 15px; font-size: 7px; color: #8d8c7b; padding-top: 12px; }
	.reveal-controls { display: flex; gap: 8px; flex-wrap: wrap; margin: 12px 0; }.reveal-controls button { border: 1px solid #293c3255; padding: 11px 13px; background: #2c493b; color: #f5edde; font: 11px Arial,sans-serif; cursor: pointer; }.reveal-controls button:disabled { opacity: .4; cursor: default; }
	.controls { display: flex; justify-content: space-between; gap: 12px; padding: 22px 0; border-bottom: 1px solid #293c3229; }.controls > div { display: flex; gap: 8px; flex-wrap: wrap; }.controls button { border: 1px solid #293c3233; background: transparent; padding: 11px 14px; font: inherit; font-size: 9px; color: #516251; cursor: pointer; }.controls button[aria-pressed='true'], .controls button:hover:not(:disabled) { background: #2c493b; color: #f5edde; }.controls button:disabled { cursor: default; opacity: .45; }
	a:focus-visible,button:focus-visible,summary:focus-visible { outline: 2px solid #a86e4a; outline-offset: 4px; }
	.notes { display: grid; grid-template-columns: 1fr 1fr; gap: 80px; padding: 32px 0 40px; }.notes > p { margin: 0; font: 29px/1.24 Georgia,serif; letter-spacing: -.8px; }.notes em { color: #899782; }details { font-size: 10px; line-height: 1.85; color: #8b9288; }summary { display: flex; justify-content: space-between; cursor: pointer; list-style: none; padding-bottom: 8px; border-bottom: 1px solid #293c3220; color: #62705f; }summary::-webkit-details-marker { display: none; }details a { text-decoration: underline; text-underline-offset: 3px; }footer { border-bottom: 0; border-top: 1px solid #293c3229; font-size: 8px; color: #8b9288; }
	@media (max-width: 820px) { main { padding: 0 22px; }.composition { gap: 27px; grid-template-columns: .8fr 1.2fr; }h1 { font-size: 55px; }nav { margin-top: 22px; }nav button { font-size: 10px; }.notes { gap: 36px; } }
	@media (max-width: 600px) { main { padding: 0 18px; }.composition { grid-template-columns: 1fr; padding-top: 28px; gap: 25px; }h1 { font-size: 65px; }.description { display: none; }.story nav { display: flex; margin-top: 24px; }.story nav button { font-size: 9px; gap: 7px; padding: 12px 3px; }.story nav button span { width: auto; }.story nav button b { display: none; }.variant-copy { min-height: 0; margin-top: 13px; }figcaption { font-size: 6px; }.controls { flex-wrap: wrap; padding: 18px 0; }.controls button { padding: 10px 12px; }.notes { grid-template-columns: 1fr; gap: 24px; }header span { font-size: 6px; } }
</style>
