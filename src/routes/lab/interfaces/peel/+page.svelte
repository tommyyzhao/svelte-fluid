<script lang="ts">
	import PeelRibbon from '../../../../experiments/liquid/PeelRibbon.svelte';
	let baseline = $state(false);
</script>

<svelte:head><title>A fold it remembers — material peel</title><meta name="robots" content="noindex" /></svelte:head>
<main>
	<header><a href="/lab/interfaces">fluid / material studies</a><span>GEOMETRY & MEMORY</span></header>
	<div class="intro"><p class="eyebrow">The fold is in the material, not painted on top.</p><h1>A fold it<br /><em>remembers.</em></h1><p>Peel back a narrow band. Press a crease.<br />Lay it down, lift again, and the same material bends differently.</p></div>
	<section aria-label="Ribbon peel with geometric crease memory"><div class="toolbar"><span>FIXED LENGTH · CHANGING SHAPE</span><label><input type="checkbox" bind:checked={baseline} /> Flat reveal baseline</label></div><PeelRibbon {baseline} /></section>
	<details><summary>What is real here—and what is deliberately bounded?</summary><p>The ribbon is a chain of 96 fixed-length segments. Attached material stays on the plane. Detached material minimizes a small bending objective against stored rest angles, with a prescribed lift angle. A crease changes the geometric rest state at a fixed material location, so the same peel and lift settings produce a different shape afterward. Flatten memory compares those shapes without changing the controls.</p><p>Positive angles below 75° guarantee plane clearance and a monotone, non-self-intersecting centerline. This narrow, untwisted 2.5D envelope avoids a depth attachment and general shell collision machinery. It is an illustrative ribbon model, not calibrated adhesive fracture, plasticity or a full thin-shell solver. The input controls—not pointer timing—own the attached/free boundary.</p><p><a href="https://github.com/evouga/better-bending" target="_blank" rel="noreferrer">Better Bending (Chen, Kaufman & Vouga, 2026)</a> motivates checking geometric bending and crease behavior explicitly. This prototype does not implement its BAC model or claim its validation results. The transfer is the verification question: does retained curvature actually change the next deformation?</p></details>
	<footer><a href="/lab/interfaces">Back to the studies ↗</a><span>Native pixels. Constant geometry density. No idle draws.</span></footer>
</main>

<style>
	:global(body) { margin: 0; background: #edf0df; color: #414d34; } main { max-width: 1120px; margin: auto; padding: 0 36px; font-family: 'Helvetica Neue', Arial, sans-serif; } a { color: inherit; text-decoration: none; }
	header,footer { display: flex; justify-content: space-between; align-items: center; gap: 20px; padding: 27px 0; border-bottom: 1px solid #939f7340; font-size: 10px; } header > span,footer > span { color: #929e79; font-size: 8px; letter-spacing: .09em; }.intro { padding: 43px 0 30px; }.eyebrow { font-size: 9px; text-transform: uppercase; letter-spacing: .1em; color: #8a9774; } h1 { font: 400 clamp(57px,8.5vw,100px)/.98 Georgia,serif; letter-spacing: -.06em; margin: 18px 0 24px; } h1 em { color: #a19360; }.intro > p:last-child { color: #8b9678; font-size: 12px; line-height: 1.85; }
	section { background: #f2f2e1; border: 1px solid #a6b08b40; padding: 25px 30px; }.toolbar { display: flex; justify-content: space-between; align-items: center; gap: 15px; font-size: 9px; color: #8b9575; }.toolbar > span { font-size: 8px; letter-spacing: .09em; } label { display: flex; gap: 7px; align-items: center; } input { accent-color: #8e8958; }
	details { margin: 31px 0; color: #879373; font-size: 11px; line-height: 1.85; } summary { cursor: pointer; color: #67764f; } details p { max-width: 820px; } details a { text-decoration: underline; text-underline-offset: 3px; } footer { border-top: 1px solid #939f7340; border-bottom: 0; margin-top: 30px; }:is(a,input,summary):focus-visible { outline: 2px solid #7d8955; outline-offset: 4px; }
	@media(max-width: 540px) { main { padding: 0 18px; } section { padding: 18px 10px; }.intro { padding-top: 28px; } header > span { display: none; }.toolbar { font-size: 8px; }.toolbar > span { font-size: 7px; } footer > span { max-width: 130px; text-align: right; line-height: 1.7; } }
</style>
