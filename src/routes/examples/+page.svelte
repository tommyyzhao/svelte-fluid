<!--
  /examples index — a curated grid of feature demos (unlisted for now).
-->
<script lang="ts">
	import { base } from '$app/paths';

	const demos = [
		{
			slug: 'backgrounds',
			title: 'Backgrounds',
			blurb: 'FluidBackground behind real page content, with DOM exclusion zones so text stays readable.'
		},
		{
			slug: 'reveal',
			title: 'Reveal',
			blurb: 'FluidReveal — drag to wipe fluid across content and reveal what is underneath.'
		},
		{
			slug: 'shapes',
			title: 'Container shapes',
			blurb: 'Confine fluid to circles, frames, annuli, and arbitrary SVG paths / text glyphs.'
		},
		{
			slug: 'flow',
			title: 'Flow & obstructions',
			blurb: 'Solver-native flow scenes routing around obstructions — airfoils, mazes, and channels.'
		}
	];
</script>

<svelte:head>
	<title>Examples — svelte-fluid</title>
	<meta name="description" content="Feature demos for svelte-fluid: backgrounds, reveal, container shapes, and flow." />
</svelte:head>

<main class="examples-index">
	<h1>Examples</h1>
	<p class="lede">
		Focused demos of individual svelte-fluid features. For the full API see the
		<a href="{base}/docs">docs</a>; for the interactive playground and presets, the
		<a href="{base}/">home page</a>.
	</p>

	<div class="examples-grid">
		{#each demos as d (d.slug)}
			<a class="example-card" href="{base}/examples/{d.slug}">
				<span class="example-title">{d.title} →</span>
				<span class="example-blurb">{d.blurb}</span>
			</a>
		{/each}
	</div>
</main>

<style>
	.examples-index {
		max-width: 720px;
		margin: 0 auto;
		padding: 3rem 1.25rem 4rem;
		color: #e8e8f0;
	}
	h1 {
		font-size: clamp(2rem, 5vw, 2.75rem);
		margin: 0 0 0.5rem;
		letter-spacing: -0.02em;
	}
	.lede {
		opacity: 0.75;
		line-height: 1.6;
		margin: 0 0 2rem;
	}
	.lede a {
		color: #8ab4ff;
	}
	.examples-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
		gap: 1rem;
	}
	.example-card {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		padding: 1.1rem 1.25rem;
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 0.6rem;
		text-decoration: none;
		color: inherit;
		background: rgba(255, 255, 255, 0.02);
		transition: border-color 0.15s, background 0.15s, transform 0.15s;
	}
	.example-card:hover {
		border-color: #8ab4ff;
		background: rgba(138, 180, 255, 0.08);
		transform: translateY(-2px);
	}
	.example-title {
		font-weight: 600;
		font-size: 1.05rem;
	}
	.example-blurb {
		font-size: 0.9rem;
		opacity: 0.7;
		line-height: 1.5;
	}
</style>
