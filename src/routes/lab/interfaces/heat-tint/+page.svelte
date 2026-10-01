<script lang="ts">
	import HeatTint from '../../../../experiments/liquid/HeatTint.svelte';
	let surface: HeatTint;
	let interactive = $state(false), available = $state(false);
</script>

<svelte:head>
	<title>Afterheat — a surface with a memory</title>
	<meta name="robots" content="noindex" />
	<meta name="description" content="An interactive study in heat, time, and lasting color. Move over a metal surface to leave an oxide trace." />
</svelte:head>

<div class="page">
	<header><a href="/lab/interfaces">Material studies</a><span>NO. 06 / AFTERHEAT</span><a href="/lab/interfaces/membrane">Previous study ↗</a></header>
	<main>
		<div class="intro"><p class="eyebrow">An exploration of consequence</p><h1>After<span>heat.</span></h1><p class="lede">Some gestures don’t disappear.<br />They become part of the surface.</p></div>
		<div class="specimen"><HeatTint bind:this={surface} bind:interactive bind:available /></div>
		<div class="under-plate"><p>Move your pointer over the metal. No click needed.<br /><span>Return to the same place and build a different color.</span></p><div class="actions"><button onclick={() => surface?.demo()} disabled={!interactive}>Draw a trace <span>↗</span></button><button class="secondary" onclick={() => surface?.reset()} disabled={!available}>Start fresh</button></div></div>
		<section class="notes" aria-label="About the material"><h2>Heat is temporary.<br />History isn’t.</h2><div><p>The pointer supplies heat; heat spreads and cools. A second field accumulates a bounded oxide layer. Its thickness changes the optical path of reflected light, so the color stays after the surface cools.</p><p>This is an illustrative thermal-oxidation model, not calibrated metallurgy or electrochemical anodizing. Three representative wavelengths suggest thin-film color; real oxides also absorb light and need material-specific optical data. <a href="https://arxiv.org/abs/2107.07175">The research behind that distinction ↗</a></p><p class="fine">Marks survive idle, resizing, and presentation changes during this visit. Nothing is stored after leaving. Touch remains native scrolling; reduced motion keeps a still finish.</p></div></section>
	</main>
	<footer><span>Made by a gesture. Kept by a material.</span><a href="/lab/interfaces">Back to the collection ↗</a></footer>
</div>

<style>
	:global(body) { margin: 0; background: #121211; }
	.page { --ink: #e5e0d5; --muted: #aaa69d; color: var(--ink); background: #121211; font-family: Arial, sans-serif; min-height: 100vh; padding: 0 clamp(20px, 4vw, 68px); }
	header, footer { max-width: 1480px; margin: auto; display: flex; align-items: center; justify-content: space-between; gap: 20px; font-size: 11px; }
	header { height: 82px; border-bottom: 1px solid #343430; }
	a { color: inherit; text-underline-offset: 4px; }
	header a, footer a { text-decoration: none; }
	header span { font-size: 9px; letter-spacing: .18em; color: var(--muted); }
	main { max-width: 1480px; margin: auto; }
	.intro { position: relative; padding: 64px 0 46px; }
	.eyebrow { font-size: 10px; letter-spacing: .14em; text-transform: uppercase; color: var(--muted); margin: 0 0 16px; }
	h1 { font-size: clamp(76px, 11.5vw, 180px); letter-spacing: -.075em; font-weight: 400; line-height: .9; margin: 0; }
	h1 span { color: #b6b0a4; }
	.lede { position: absolute; right: 0; bottom: 43px; font-size: clamp(13px, 1.2vw, 18px); line-height: 1.6; color: #c5bfb3; }
	.specimen { overflow: hidden; border: 1px solid #9ba1a4; border-radius: 4px; box-shadow: 0 30px 80px #0006; }
	.under-plate { display: flex; align-items: center; justify-content: space-between; gap: 24px; padding: 22px 0 2px; }
	.under-plate p { font-size: 12px; line-height: 1.7; margin: 0; }
	.under-plate p span { color: var(--muted); }
	.actions { display: flex; gap: 9px; }
	button { color: #171816; border: 1px solid #e5e0d5; background: #e5e0d5; font: 11px Arial, sans-serif; padding: 13px 18px; cursor: pointer; white-space: nowrap; }
	button span { margin-left: 15px; } button.secondary { background: none; color: var(--ink); border-color: #5a5952; }
	button:disabled { opacity: .35; cursor: default; } button:focus-visible, a:focus-visible { outline: 2px solid #b5bdff; outline-offset: 5px; }
	.notes { border-top: 1px solid #343430; display: grid; grid-template-columns: 1fr 1fr; gap: 60px; padding: 54px 0 70px; margin-top: 20px; }
	h2 { font-size: clamp(28px, 3vw, 43px); line-height: 1.2; font-weight: 400; letter-spacing: -.04em; margin: 0; }
	.notes p { font-size: 13px; line-height: 1.8; color: #bbb6ac; max-width: 580px; margin: 0 0 18px; } .notes .fine { font-size: 11px; color: #908d83; }
	footer { border-top: 1px solid #343430; padding: 28px 0 36px; color: var(--muted); }
	@media (max-width: 720px) { header { height: 66px; } header > a:last-child { display: none; } .intro { padding: 46px 0 30px; } .lede { position: static; margin: 22px 0 0; } .under-plate { flex-direction: column; align-items: flex-start; gap: 16px; } .notes { grid-template-columns: 1fr; gap: 25px; padding: 36px 0; } footer { font-size: 10px; } }
</style>
