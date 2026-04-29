<script lang="ts">
	import { base } from '$app/paths';
	import { page } from '$app/stores';

	let { children } = $props();

	const siteUrl = 'https://tommyyzhao.github.io/svelte-fluid';
	let canonicalUrl = $derived.by(() => {
		const path = $page.url.pathname;
		const localPath = base && path.startsWith(base) ? path.slice(base.length) || '/' : path;
		return `${siteUrl}${localPath}`;
	});
</script>

<svelte:head>
	<link rel="canonical" href={canonicalUrl} />
	<meta property="og:url" content={canonicalUrl} />
</svelte:head>

{@render children?.()}

<style>
	:global(html, body) {
		margin: 0;
		padding: 0;
		min-height: 100%;
		background: #0a0a0a;
		color: #e8e8e8;
		font-family:
			ui-sans-serif,
			system-ui,
			-apple-system,
			Segoe UI,
			Roboto,
			sans-serif;
		-webkit-font-smoothing: antialiased;
	}

	:global(*, *::before, *::after) {
		box-sizing: border-box;
	}
</style>
