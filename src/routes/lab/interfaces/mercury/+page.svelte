<script lang="ts">
	import EffectSurface from '../../../../experiments/liquid/EffectSurface.svelte';
	import { createMercury } from '../../../../experiments/liquid/mercury.js';
	let surface = $state<{ demo: () => void; reset: () => void }>();
	let interactive = $state(false);
</script>

<svelte:head>
	<title>MELT — mercury typography study</title>
	<meta name="robots" content="noindex" />
	<meta name="description" content="Move through chrome lettering to pull filaments, separate droplets, and watch the material rejoin. An illustrative WebGPU particle surface study." />
</svelte:head>

<main>
	<header><a class="wordmark" href="/lab/interfaces">fluid<span> / material experiments</span></a><span class="edition">05 — MERCURY</span></header>
	<section aria-labelledby="title">
		<div class="intro"><p class="eyebrow"><span></span> A temporary loss of form</p><h1 id="title">Nothing stays solid.</h1><p>Move through the letters. Pull a thread.<br />Let the pieces find their way back.</p></div>
		<div class="specimen">
			<div class="specimen-top" aria-hidden="true"><span>MATERIAL NO. 05</span><span>CHROME / ANCHORED PARTICLES</span></div>
			<EffectSurface bind:this={surface} bind:interactive factory={createMercury} label="Mercury lettering. Move the pointer through MELT to pull reflective strands and droplets." />
			<div class="crosshair left" aria-hidden="true">+</div><div class="crosshair right" aria-hidden="true">+</div>
			<div class="specimen-bottom"><span>{interactive ? 'HOVER TO DISTURB' : 'STILL SURFACE'}<br /><small>{interactive ? 'No click needed' : 'Motion requires WebGPU and motion enabled'}</small></span><div class="actions"><button disabled={!interactive} onclick={() => surface?.demo()}>Pull a thread <span aria-hidden="true">↗</span></button><button disabled={!interactive} class="quiet" onclick={() => surface?.reset()}>Re-form <span aria-hidden="true">↺</span></button></div></div>
		</div>
		<div class="caption"><p>One word. A surface that can split.</p><p>The lettering is a home, not a cage. A moving pointer displaces anchored particles; their overlapping fields form a reflective silhouette.</p></div>
	</section>
	<footer><p>Illustrative metaball dynamics, not a calibrated liquid-metal simulation.</p><a href="/lab/interfaces">All material studies <span aria-hidden="true">↗</span></a></footer>
</main>

<style>
	:global(body) { margin: 0; background: #080a0e; color: #e8eaef; }
	main { max-width: 1600px; margin: 0 auto; padding: 0 44px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; }
	a { color: inherit; text-decoration: none; }
	header { height: 93px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #292d35; gap: 20px; }
	.wordmark { font-size: 19px; letter-spacing: -.7px; font-weight: 650; }
	.wordmark span { font-weight: 400; color: #68717e; font-size: 12px; margin-left: 4px; letter-spacing: -.1px; }
	.edition, .eyebrow { font-size: 10px; letter-spacing: .12em; }
	.edition { color: #68717e; }
	.intro { display: grid; grid-template-columns: 1fr 300px; align-items: end; padding: 45px 0 34px; }
	.eyebrow { grid-column: 1 / -1; text-transform: uppercase; color: #728dff; margin: 0 0 16px; }
	.eyebrow span { display: inline-block; width: 5px; height: 5px; border-radius: 50%; background: #456fff; vertical-align: 2px; margin-right: 9px; }
	h1 { font-size: clamp(35px, 4vw, 62px); line-height: 1; font-weight: 500; letter-spacing: -.058em; margin: 0; }
	.intro > p:last-child { color: #8a929e; font-size: 12px; line-height: 1.75; margin: 0 0 2px; }
	.specimen { position: relative; height: clamp(600px, 44vw, 720px); background: radial-gradient(ellipse at 50% 40%, #111724 0, #0c0f16 52%, #090c11 100%); border: 1px solid #272e3b; overflow: hidden; }
	.specimen :global(.effect) { background: transparent; }
	.specimen :global(.status) { bottom: 80px; left: 27px; opacity: .7; }
	.specimen :global(.status:not(.error)) { display: none; }
	.specimen-top { position: absolute; z-index: 2; left: 25px; right: 25px; top: 22px; display: flex; justify-content: space-between; font-family: ui-monospace, monospace; color: #556174; font-size: 8px; letter-spacing: .1em; pointer-events: none; }
	.specimen-bottom { position: absolute; z-index: 2; bottom: 26px; left: 27px; right: 27px; display: flex; justify-content: space-between; align-items: end; pointer-events: none; }
	.specimen-bottom > span { font-size: 9px; line-height: 1.8; letter-spacing: .08em; color: #8997ae; }
	.specimen-bottom small { font-size: 9px; letter-spacing: 0; color: #566273; }
	.actions { display: flex; gap: 10px; pointer-events: auto; }
	button { color: #f1f3ff; background: #244deb; border: 1px solid #4267ff; padding: 12px 17px; font: inherit; font-size: 10px; cursor: pointer; }
	button:hover { background: #385ff5; }
	button:disabled { cursor: default; opacity: .35; }
	button span { margin-left: 17px; }
	button.quiet { background: #111723; border-color: #2c3548; color: #8493ab; }
	button.quiet:hover { background: #1c2638; color: #d2dbef; }
	a:focus-visible, button:focus-visible { outline: 2px solid #728dff; outline-offset: 5px; }
	.crosshair { position: absolute; z-index: 2; top: 50%; color: #324056; font-size: 16px; font-weight: 300; pointer-events: none; }
	.crosshair.left { left: 22px; }.crosshair.right { right: 22px; }
	.caption { display: grid; grid-template-columns: 1fr 1fr; gap: 50px; padding: 27px 0 35px; border-bottom: 1px solid #292d35; }
	.caption p { color: #798394; font-size: 12px; line-height: 1.75; max-width: 450px; margin: 0; }
	.caption p:first-child { color: #b8c0cc; font-size: 16px; letter-spacing: -.35px; }
	footer { display: flex; justify-content: space-between; align-items: center; gap: 20px; padding: 20px 0 28px; font-size: 9px; color: #555f6e; }
	footer a { color: #8c97a8; white-space: nowrap; }
	footer a span { margin-left: 10px; }
	@media (max-width: 850px) { main { padding: 0 24px; } .intro { grid-template-columns: 1fr; gap: 15px; padding: 32px 0 26px; } .eyebrow { margin-bottom: 2px; } h1 { font-size: 43px; } .intro > p:last-child br { display: none; } .specimen { min-height: 520px; } .caption { gap: 25px; } }
	@media (max-width: 520px) { main { padding: 0 17px; } header { height: 76px; } .wordmark span { display: none; } .edition { font-size: 8px; } h1 { font-size: 37px; } .intro > p:last-child {font-size: 11px; max-width: 285px; } .specimen { height: 370px; min-height: 370px; } .specimen :global(.status.error) { bottom: 120px; left: 16px; } .specimen-top { left: 16px; right: 16px; top: 17px; font-size: 6px; } .specimen-top span:last-child { max-width: 92px; text-align: right; line-height: 1.7; } .crosshair { display: none; } .specimen-bottom { left: 16px; right: 16px; bottom: 20px; flex-wrap: wrap; gap: 18px; } .specimen-bottom > span { width: 100%; font-size: 8px; } .actions { width: 100%; } .actions button { flex: 1; padding: 11px 9px; font-size: 9px; } button span { margin-left: 9px; } .caption { grid-template-columns: 1fr; gap: 12px; padding: 22px 0; } .caption p { font-size: 11px; } .caption p:first-child { font-size: 15px; } footer { align-items: start; } footer p { line-height: 1.65; margin: 0; max-width: 200px; } footer a { font-size: 8px; } }
</style>
