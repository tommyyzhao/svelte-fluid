<script lang="ts">
	import ThreadStudy from '../../../../experiments/liquid/ThreadStudy.svelte';
	import type { ThreadStudyMode } from '../../../../experiments/liquid/thread-study.js';
	let surface: ThreadStudy;
	let mode = $state<ThreadStudyMode>('deposition'), ratio = $state(0.35), feed = $state(0.55), spacing = $state(0.14), turns = $state(3);
	let available = $state(false), running = $state(false), count = $state(0), full = $state(false), canFeed = $state(false);
</script>

<svelte:head><title>A little excess — deposited threads and braided form</title><meta name="robots" content="noindex" /></svelte:head>

<main>
	<header><a href="/lab/interfaces">fluid <span>/ material studies</span></a><p>CONTINUITY / CONTACT / EXCESS LENGTH</p></header>
	<section class="intro"><p class="eyebrow">A line can do more than follow.</p><h1>A little <em>excess.</em></h1><p class="invitation">Too much thread for a straight line.<br />Enough structure to hold together.</p></section>
	<div class="mode"><label>Study <select aria-label="Thread study" bind:value={mode}><option value="deposition">Deposited liquid thread</option><option value="braid">Authored over / under</option></select></label><span>{mode === 'braid' ? 'Three coherent strands' : `${count} / 1536 retained nodes`}</span></div>
	<section class="specimen"><ThreadStudy bind:this={surface} bind:available bind:running bind:count bind:full bind:canFeed {mode} {ratio} {feed} {spacing} {turns} /></section>
	<div class="controls">
		{#if mode === 'deposition'}
			<label>Belt / feed speed <output>{ratio.toFixed(2)}</output><input aria-label="Belt to feed ratio" type="range" min="0" max="1" step="0.01" bind:value={ratio} disabled={!available} /></label>
			<label>Feed rate <output>{feed.toFixed(2)} units / s</output><input aria-label="Thread feed rate" type="range" min="0.15" max="1.2" step="0.05" bind:value={feed} disabled={!available} /></label>
			<div class="actions"><button onclick={() => running ? surface?.pause() : surface?.start()} disabled={!canFeed}>{running ? 'Pause feed' : 'Start feed'}</button><button onclick={() => surface?.sample()} disabled={!available || full}>Add a short sample</button><button onclick={() => surface?.reset()} disabled={!available}>New thread</button></div>
		{:else}
			<label>Strand spacing <output>{spacing.toFixed(3)}</output><input aria-label="Braid spacing" type="range" min="0.075" max="0.2" step="0.005" bind:value={spacing} disabled={!available} /></label>
			<label>Weave turns <output>{turns.toFixed(1)}</output><input aria-label="Braid turns" type="range" min="1.5" max="4" step="0.1" bind:value={turns} disabled={!available} /></label>
		{/if}
	</div>
	<p class="hint">{mode === 'deposition' ? 'Change the speed ratio, then feed more material. Older deposits retain their shape and move with the belt. At zero belt speed, the planar traces overlap; this model does not build a 3D pile. Add a short sample makes a still; continuous feed pauses out of view.' : 'Spacing and weave pitch change the authored arrangement. Crossings remain ordered in depth; this is geometry with measured clearance, not simulated knots or friction.'}</p>
	<div class="notes"><p>Continuous matter.<br /><em>Different reasons to bend.</em></p><details><summary>What governs the shape?</summary><p>The deposited trace follows the three-variable geometrical liquid-rope model of Brun and colleagues (2015), with its fitted quasi-static curvature law. The contact-point motion balances arriving thread against belt speed. Coils are an integrated result, not a scripted spiral. Lengths and feed rates use dimensionless study units.</p><p>The fit comes from a limited viscous-thread regime. This study does not solve a hanging viscous rod, inertia, 3D pileup, or thread self-contact. Constant-radius volume is nominal feed length × cross-sectional area; overlapping planar traces are not fused. History stops at 1536 nodes rather than evicting earlier material.</p><p>The braid is a separate authored arrangement with positive conservative surface clearance across its controls. Both use smooth round native-pixel geometry, real depth, and four-sample edge coverage. Live output/attachments have a 256 MiB budget; resize has a 384 MiB bound. Unsupported native sizes show a fallback.</p><p><a href="https://arxiv.org/abs/1410.5382">Liquid ropes, 2015 ↗</a> · <a href="https://arxiv.org/abs/2302.05853">Fluid-rope writing, 2023 ↗</a>. The later writing work uses viscous-filament simulation and reinforcement learning; neither is claimed here.</p></details></div>
	<footer><a href="/lab/interfaces/filaments">Original connected filament ↗</a><a href="/lab/interfaces/mercury">Earlier MELT reference ↗</a></footer>
</main>

<style>
	:global(body) { margin: 0; min-height: 100vh; background: #e9e6de; color: #333e43; }
	main { max-width: 1440px; margin: auto; padding: 0 40px; font-family: 'Helvetica Neue', Arial, sans-serif; }
	a { color: inherit; text-decoration: none; } header { display: flex; justify-content: space-between; align-items: center; min-height: 86px; border-bottom: 1px solid #333e432c; gap: 20px; }
	header a { font-size: 21px; font-weight: 650; letter-spacing: -.8px; } header a span { color: #8c989a; font-size: 11px; font-weight: 400; letter-spacing: 0; } header p { font-size: 8px; letter-spacing: .12em; color: #8c989a; }
	.intro { position: relative; padding: 37px 0 34px; } .eyebrow { font-size: 9px; text-transform: uppercase; letter-spacing: .12em; color: #a77455; margin: 0 0 18px; }
	h1 { margin: 0; font: 400 clamp(62px, 7vw, 96px)/1.04 Georgia, serif; letter-spacing: -.06em; } h1 em { color: #9b7961; } .invitation { position: absolute; right: 0; bottom: 33px; font-size: 12px; line-height: 1.7; color: #8c989a; }
	.mode { display: flex; justify-content: space-between; align-items: center; gap: 20px; padding: 14px 0; border-top: 1px solid #333e432c; font-size: 10px; color: #829091; } .mode label { display: flex; align-items: center; gap: 15px; }
	select { font: 11px Arial, sans-serif; border: 1px solid #333e4333; padding: 9px 11px; background: #f1eee6; color: #4b595e; }
	.specimen { height: clamp(340px, 39vw, 560px); overflow: hidden; }
	.controls { display: flex; gap: 30px; align-items: end; padding: 20px 0; border-bottom: 1px solid #333e432c; } .controls > label { flex: 1; font-size: 10px; color: #7e8c8d; } output { float: right; font-variant-numeric: tabular-nums; } input { display: block; width: 100%; margin: 13px 0 3px; accent-color: #a77455; }
	.actions { display: flex; gap: 8px; } button { border: 1px solid #333e4333; padding: 12px 14px; font: 10px Arial, sans-serif; background: transparent; color: #526067; cursor: pointer; } button:first-child { background: #425059; color: #f5eee4; } button:disabled { opacity: .4; cursor: default; }
	.hint { margin: 13px 0; font-size: 10px; line-height: 1.7; color: #8a9698; }
	.notes { display: grid; grid-template-columns: 1fr 1fr; gap: 80px; margin: 40px 0; } .notes > p { margin: 0; font: 28px/1.25 Georgia, serif; letter-spacing: -.7px; } .notes em { color: #9b7961; } details { font-size: 11px; line-height: 1.8; color: #829091; } summary { cursor: pointer; border-bottom: 1px solid #333e4323; padding-bottom: 10px; }
	footer { display: flex; justify-content: space-between; gap: 20px; border-top: 1px solid #333e432c; padding: 24px 0 28px; font-size: 9px; color: #8a9698; }
	a:focus-visible, select:focus-visible, button:focus-visible, input:focus-visible, summary:focus-visible { outline: 2px solid #a77455; outline-offset: 4px; }
	@media (max-width: 850px) { main { padding: 0 22px; } .invitation { display: none; } .controls { flex-wrap: wrap; } .controls > label { min-width: 35%; } .actions { width: 100%; } .actions button { flex: 1; } .notes { gap: 30px; } }
	@media (max-width: 480px) { header a span { display: none; } header p { max-width: 125px; font-size: 7px; text-align: right; line-height: 1.5; } h1 { font-size: 60px; } .intro { padding: 30px 0; } .mode { align-items: start; } .mode label { display: block; } select { display: block; margin-top: 8px; } .mode > span { margin-top: 10px; font-size: 9px; max-width: 90px; text-align: right; } .notes { grid-template-columns: 1fr; } .specimen { height: 330px; } }
</style>
