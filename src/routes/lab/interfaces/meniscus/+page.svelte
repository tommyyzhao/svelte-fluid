<script lang="ts">
	import MagneticMeniscus from '../../../../experiments/liquid/MagneticMeniscus.svelte';
</script>
<svelte:head><title>Before the touch — a magnetic-inspired meniscus</title><meta name="robots" content="noindex" /></svelte:head>
<main>
	<header><a href="/lab/interfaces">← All material studies</a><span>NON-CONTACT / CONSTANT AREA</span></header>
	<p class="eyebrow">An edge can meet you halfway.</p><h1>Before<br /><em>the touch.</em></h1>
	<p class="intro">A field reaches farther than a brush.<br />A dark liquid rim leans toward your hand while the image stays still.</p>
	<MagneticMeniscus />
	<footer>Private reduced-model study. Research inspiration: <a href="https://ferrofluid-simulation.github.io/">Induce-on-Boundary, SIGGRAPH 2024</a>; no claim to implement its magnetostatics. <a href="/lab/interfaces/meniscus-svg">Renderer diagnostic: the same boundary in SVG</a>.</footer>
</main>
<style>
	:global(body) { margin: 0; background: #182225; color: #d5dfd3; } main { max-width: 1160px; margin: auto; padding: 0 30px 30px; }
	header { display: flex; justify-content: space-between; padding: 28px 0; border-bottom: 1px solid #415451; font: 12px Arial, sans-serif; gap: 20px; } a { color: inherit; } header a { text-decoration: none; } header span { font-size: 9px; letter-spacing: .12em; }
	.eyebrow { font: 10px Arial, sans-serif; text-transform: uppercase; letter-spacing: .13em; color: #8eaaa0; margin-top: 45px; }
	h1 { font: 400 clamp(45px, 7vw, 78px)/.96 Georgia, serif; letter-spacing: -.045em; margin: 18px 0; } h1 em { color: #9bb8aa; }
	.intro { font: 13px/1.8 Arial, sans-serif; color: #a2b7ad; margin: 24px 0 34px; } footer { margin-top: 36px; font: 10px/1.7 Arial, sans-serif; color: #91a89e; }
	@media(max-width: 600px) { main { padding-inline: 18px; } header span { display: none; } }
</style>
