<script lang="ts">
	import AnnularFlow from '../../../../experiments/liquid/AnnularFlow.svelte';
</script>
<svelte:head><title>Annular circulation — WebGPU material studies</title><meta name="description" content="A bounded circular image circulation around an immovable, native SVG medallion." /></svelte:head>
<main>
	<a href="/lab/interfaces">← Material studies</a>
	<header><p class="eyebrow">IMAGE / IMMUTABLE CENTER / 016</p><h1>A still point.<br />A moving world.</h1><p>Brush around the bronze seal. The photograph circulates through a narrow ring while the center and the world beyond stay perfectly still.</p></header>
	<AnnularFlow />
	<footer><p>A deliberately narrow proof: exact circular circulation, not a general obstacle solver or a fluid simulation. One native-pixel image pass, an invertible area-preserving map, no image feedback texture.</p><p>Photograph: Édouard Baldus, <a href="https://www.metmuseum.org/art/collection/search/283136">Arles, Cloître St. Trophime, ca. 1861</a>. The Metropolitan Museum of Art, public domain. Native SVG medallion drawn for this study.</p></footer>
</main>
<style>
	:global(body) { margin: 0; background: #e8e6dc; color: #273b2d; }
	main { max-width: 880px; margin: 0 auto; padding: 38px 28px 70px; }a { color: inherit; text-underline-offset: 3px; font: 12px/1.5 Arial,sans-serif; }
	header { margin: 44px 0 34px; }.eyebrow { font: 10px/1.4 Arial,sans-serif; letter-spacing: .18em; color: #67725e; }h1 { font: 500 clamp(44px,8vw,78px)/.98 Georgia,serif; letter-spacing: -.045em; margin: 20px 0; }header > p:last-child { max-width: 47ch; color: #5b6759; font: 15px/1.6 Arial,sans-serif; }
	footer { border-top: 1px solid #c8cbbb; margin-top: 30px; padding-top: 18px; color: #667060; font: 12px/1.6 Arial,sans-serif; }footer a { font: inherit; }
	@media(max-width:600px) { main { padding: 24px 16px 40px; }header { margin: 28px 0; } }
</style>
