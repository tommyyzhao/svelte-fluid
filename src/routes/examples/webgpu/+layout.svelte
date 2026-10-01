<script lang="ts">
	import { base } from '$app/paths';
	import { page } from '$app/stores';
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();
	const links = [
		{ slug: '', label: 'Overview' },
		{ slug: 'canary', label: 'Demanding canary' },
		{ slug: 'performance', label: 'Performance probe' },
		{ slug: 'features', label: 'Feature matrix' },
		{ slug: 'replacement', label: 'Replacement record' }
	];
	const current = $derived($page.url.pathname.replace(/\/$/, '').split('/').pop() ?? '');
</script>

<div class="lab-nav-wrap">
	<nav aria-label="WebGPU lab routes">
		{#each links as link (link.slug)}
			<a href="{base}/examples/webgpu{link.slug ? `/${link.slug}` : ''}" class:active={current === (link.slug || 'webgpu')}>
				{link.label}
			</a>
		{/each}
	</nav>
</div>

{@render children()}

<style>
	.lab-nav-wrap {
		position: sticky;
		top: 41px;
		z-index: 45;
		display: flex;
		justify-content: center;
		padding: 0.45rem 0.75rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.08);
		background: rgba(7, 8, 12, 0.86);
		backdrop-filter: blur(10px);
	}
	nav {
		display: flex;
		gap: 0.25rem;
		overflow-x: auto;
	}
	a {
		padding: 0.36rem 0.58rem;
		border-radius: 0.35rem;
		white-space: nowrap;
		font-size: 0.76rem;
		color: #9099ac;
		text-decoration: none;
	}
	a:hover,
	a.active {
		color: #e6eeff;
		background: rgba(107, 148, 231, 0.13);
	}
</style>
