<script lang="ts">
	import { base } from '$app/paths';
	import { page } from '$app/stores';

	let { children } = $props();

	const siteUrl = 'https://svelte-fluid.dev';
	let canonicalUrl = $derived.by(() => {
		const path = $page.url.pathname;
		const localPath = base && path.startsWith(base) ? path.slice(base.length) || '/' : path;
		return `${siteUrl}${localPath}`;
	});
</script>

<svelte:head>
	<link rel="canonical" href={canonicalUrl} />
	<meta property="og:url" content={canonicalUrl} />
	<!-- name="description" is per page (SvelteKit does not dedupe head tags, so a layout copy would double up). -->
	<meta
		property="og:description"
		content="Multi-instance, resize-stable, deterministic-seeded port of Pavel Dobryakov's WebGL-Fluid-Simulation. Fourteen presets, 90+ configurable props, zero runtime dependencies."
	/>
	<meta
		name="twitter:description"
		content="WebGL fluid simulation as a Svelte 5 component. Fourteen presets, 90+ configurable props."
	/>
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
