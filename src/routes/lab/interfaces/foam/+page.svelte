<script lang="ts">
	import FoamNetwork from '../../../../experiments/liquid/FoamNetwork.svelte';
</script>

<svelte:head><title>Different neighbours — four-cell soap-film study</title><meta name="robots" content="noindex" /></svelte:head>
<main>
	<header><a href="/lab/interfaces">fluid <span>/ topology study</span></a><span>FOUR CELLS · ONE EXCHANGE</span></header>
	<div class="intro"><p class="eyebrow">Not just a change of colour.</p><h1>Different <em>neighbours.</em></h1><p>Stretch the frame. Watch one contact disappear and a different one emerge.<br />Then return to a square: the network can remember which way it arrived.</p></div>
	<FoamNetwork />
	<div class="notes"><p><strong>A real change in the graph.</strong> A, B, C and D keep their identities. B–D is replaced by A–C only when the internal edge collapses. Four outer contacts remain. The native contact readout follows the visible graph, not the last button pressed.</p><p><strong>The smallest useful model.</strong> Five equal-tension segments relax toward shorter length. Settled junctions meet at 120°; the fourfold transition is not forced to obey that equilibrium rule. Cell areas and real surfactant rheology are not modeled.</p><p><strong>Research, with a boundary.</strong> <a href="https://www.nature.com/articles/s41467-025-64412-z">2025 foam experiments</a> measure lost/gained contacts. <a href="https://arxiv.org/abs/cond-mat/0608426">Durand–Stone</a> shows why real T1 timing depends on film rheology. Our response time and three-wavelength finish are authored, not calibrated.</p></div>
	<footer><a href="/lab/interfaces">All material studies ↗</a><span>Native pixels · explicit topology · bounded work</span></footer>
</main>

<style>
	:global(body) { margin: 0; background: #e9e5eb; color: #403a49; } main { max-width: 1180px; margin: auto; padding: 0 34px; font-family: 'Helvetica Neue', Arial, sans-serif; } a { color: inherit; text-decoration: none; }
	header { display: flex; justify-content: space-between; align-items: center; gap: 18px; min-height: 79px; border-bottom: 1px solid #55495e26; } header a { font-size: 20px; font-weight: 600; letter-spacing: -.6px; } header a span, header > span { font-size: 8px; letter-spacing: .1em; font-weight: 400; color: #9a8da3; } header a span { margin-left: 8px; }
	.intro { padding: 36px 0 31px; } .eyebrow { color: #a188a3; font-size: 8px; text-transform: uppercase; letter-spacing: .14em; } h1 { font: 400 clamp(53px, 7vw, 96px)/1.08 Georgia, serif; letter-spacing: -.055em; margin: 13px 0 20px; } h1 em { color: #a184a6; } .intro > p:last-child { color: #968b9c; font-size: 12px; line-height: 1.8; }
	.notes { display: grid; grid-template-columns: repeat(3, 1fr); gap: 33px; margin: 31px 0; } .notes p { margin: 0; color: #968b9c; font-size: 10px; line-height: 1.8; } .notes strong { display: block; color: #807286; font-weight: 500; margin-bottom: 6px; } .notes a { text-decoration: underline; text-underline-offset: 3px; }
	footer { display: flex; justify-content: space-between; gap: 18px; border-top: 1px solid #55495e26; padding: 22px 0 28px; color: #9c8fa5; font-size: 9px; } a:focus-visible { outline: 2px solid #b68db9; outline-offset: 5px; }
	@media(max-width: 600px) { main { padding: 0 16px; } header a span { display: none; } .intro { padding-top: 23px; } .notes { grid-template-columns: 1fr; gap: 18px; } footer { font-size: 8px; } }
</style>
