<!--
  Shared chrome for the /examples/* demos: a slim breadcrumb bar + noindex.

  Kept minimal so it doesn't fight full-bleed demos (e.g. FluidBackground).
  These routes are intentionally UNLISTED for now — noindex, not in nav or the
  sitemap — until we choose to feature them. See
  dev-docs/plans/scratch-route-consolidation.md.
-->
<script lang="ts">
	import { base } from '$app/paths';
	import { page } from '$app/stores';
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();

	const examples = [
		{ slug: '', label: 'Examples' },
		{ slug: 'backgrounds', label: 'Backgrounds' },
		{ slug: 'reveal', label: 'Reveal' },
		{ slug: 'shapes', label: 'Shapes' },
		{ slug: 'flow', label: 'Flow' }
	];

	const current = $derived($page.url.pathname.replace(/\/$/, '').split('/').pop() ?? '');
</script>

<svelte:head>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="examples-bar">
	<a class="brand" href="{base}/">svelte-fluid</a>
	<span class="sep">/</span>
	<a href="{base}/examples">examples</a>
	<nav class="examples-nav">
		{#each examples.slice(1) as e (e.slug)}
			<a href="{base}/examples/{e.slug}" class:active={current === e.slug}>{e.label}</a>
		{/each}
	</nav>
</div>

{@render children()}

<style>
	.examples-bar {
		position: sticky;
		top: 0;
		z-index: 50;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.6rem 1rem;
		font-size: 0.85rem;
		background: rgba(10, 10, 14, 0.72);
		backdrop-filter: blur(8px);
		border-bottom: 1px solid rgba(255, 255, 255, 0.08);
		color: #cfcfe0;
	}
	.examples-bar a {
		color: inherit;
		text-decoration: none;
	}
	.examples-bar .brand {
		font-weight: 600;
	}
	.examples-bar .sep {
		opacity: 0.4;
	}
	.examples-nav {
		display: flex;
		gap: 0.85rem;
		margin-left: auto;
		flex-wrap: wrap;
	}
	.examples-nav a {
		opacity: 0.65;
	}
	.examples-nav a:hover,
	.examples-nav a.active {
		opacity: 1;
		color: #fff;
	}
</style>
