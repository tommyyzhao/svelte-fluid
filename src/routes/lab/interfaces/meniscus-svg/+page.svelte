<script lang="ts">
	import SvgMeniscus from '../../../../experiments/liquid/SvgMeniscus.svelte';
</script>
<svelte:head><title>Before the touch — matched SVG meniscus</title><meta name="robots" content="noindex" /></svelte:head>
<main>
	<header><a href="/lab/interfaces">← All material studies</a><a href="/lab/interfaces/meniscus">WebGPU comparator →</a></header>
	<p class="eyebrow">An edge can meet you halfway.</p><h1>Before<br /><em>the touch.</em></h1>
	<p class="intro">The same moving boundary, another way to draw it.<br />A native SVG clip and radial rim replace the WebGPU shader.</p>
	<SvgMeniscus />
	<footer>Private matched-renderer study. Same magnetic-inspired reduced model, not a magnetostatics solver. Geometry parity is bounded; lighting parity is not claimed.</footer>
</main>
<style>
	:global(body) { margin: 0; background: #182225; color: #d5dfd3; } main { max-width: 1160px; margin: auto; padding: 0 30px 30px; }
	header { display: flex; justify-content: space-between; padding: 28px 0; border-bottom: 1px solid #415451; font: 12px Arial, sans-serif; gap: 20px; } a { color: inherit; } header a { text-decoration: none; }
	.eyebrow { font: 10px Arial, sans-serif; text-transform: uppercase; letter-spacing: .13em; color: #8eaaa0; margin-top: 45px; }
	h1 { font: 400 clamp(45px, 7vw, 78px)/.96 Georgia, serif; letter-spacing: -.045em; margin: 18px 0; } h1 em { color: #9bb8aa; }
	.intro { font: 13px/1.8 Arial, sans-serif; color: #a2b7ad; margin: 24px 0 34px; } footer { margin-top: 36px; font: 10px/1.7 Arial, sans-serif; color: #91a89e; }
	@media(max-width: 600px) { main { padding-inline: 18px; } header { font-size: 10px; } }
</style>
