<script lang="ts">
	import { page } from '$app/stores';
	import { base } from '$app/paths';

	let { children } = $props();

	let menuOpen = $state(false);

	const nav = [
		{ label: 'Getting Started', href: `${base}/docs` },
		{ label: 'Components', href: `${base}/docs/components` },
		{ label: 'Configuration', href: `${base}/docs/configuration` },
		{ label: 'Container Shapes', href: `${base}/docs/shapes` },
		{ label: 'Presets', href: `${base}/docs/presets` },
		{ label: 'API Reference', href: `${base}/docs/api` }
	];

	function isActive(href: string, path: string): boolean {
		if (href === `${base}/docs`) return path === `${base}/docs` || path === `${base}/docs/`;
		return path.startsWith(href);
	}
</script>

<div class="docs-shell">
	<button class="mobile-menu-btn" onclick={() => (menuOpen = !menuOpen)} aria-label="Toggle menu">
		{#if menuOpen}✕{:else}☰{/if}
	</button>

	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<aside class="sidebar" class:open={menuOpen} onclick={() => (menuOpen = false)}>
		<div class="sidebar-header">
			<a href="{base}/" class="sidebar-logo">svelte-fluid</a>
			<span class="sidebar-version">docs</span>
		</div>

		<nav class="sidebar-nav" aria-label="Documentation">
			{#each nav as item}
				<a
					href={item.href}
					class="nav-link"
					class:active={isActive(item.href, $page.url.pathname)}
					aria-current={isActive(item.href, $page.url.pathname) ? 'page' : undefined}
				>
					{item.label}
				</a>
			{/each}
		</nav>

		<div class="sidebar-footer">
			<a href="{base}/" class="back-link">← Back to demo</a>
			<a href="https://github.com/tommyyzhao/svelte-fluid" rel="noreferrer" target="_blank" class="back-link">
				GitHub
			</a>
		</div>
	</aside>

	<main class="docs-content">
		{@render children?.()}
	</main>
</div>

<style>
	.docs-shell {
		display: flex;
		min-height: 100vh;
	}

	/* ---- Sidebar ---- */

	.sidebar {
		position: fixed;
		top: 0;
		left: 0;
		width: 240px;
		height: 100vh;
		display: flex;
		flex-direction: column;
		padding: 24px 0;
		background: #0f1117;
		border-right: 1px solid #1e2330;
		overflow-y: auto;
		z-index: 50;
	}

	.sidebar-header {
		padding: 0 20px 20px;
		border-bottom: 1px solid #1e2330;
		margin-bottom: 12px;
	}

	.sidebar-logo {
		font-size: 0.95rem;
		font-weight: 700;
		color: #e8e8e8;
		text-decoration: none;
		letter-spacing: -0.02em;
	}

	.sidebar-version {
		font-size: 0.65rem;
		color: #556;
		margin-left: 6px;
		vertical-align: middle;
	}

	.sidebar-nav {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 0 8px;
	}

	.nav-link {
		display: block;
		padding: 7px 12px;
		font-size: 0.82rem;
		color: #8892a8;
		text-decoration: none;
		border-radius: 6px;
		transition: all 100ms;
	}

	.nav-link:hover {
		color: #c8d0e0;
		background: rgba(255, 255, 255, 0.04);
	}

	.nav-link.active {
		color: #e8ecf4;
		background: rgba(99, 140, 255, 0.1);
		font-weight: 500;
	}

	.sidebar-footer {
		padding: 16px 20px 0;
		border-top: 1px solid #1e2330;
		margin-top: 12px;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.back-link {
		font-size: 0.75rem;
		color: #556;
		text-decoration: none;
		transition: color 100ms;
	}
	.back-link:hover {
		color: #8892a8;
	}

	/* ---- Content ---- */

	.docs-content {
		margin-left: 240px;
		flex: 1;
		min-width: 0;
		padding: 48px 56px 80px;
		max-width: calc(740px + 240px + 112px);
	}

	/* ---- Mobile ---- */

	.mobile-menu-btn {
		display: none;
		position: fixed;
		top: 14px;
		left: 14px;
		z-index: 60;
		width: 36px;
		height: 36px;
		font-size: 1.2rem;
		background: #0f1117;
		border: 1px solid #1e2330;
		border-radius: 8px;
		color: #8892a8;
		cursor: pointer;
	}

	@media (max-width: 768px) {
		.mobile-menu-btn {
			display: flex;
			align-items: center;
			justify-content: center;
		}

		.sidebar {
			transform: translateX(-100%);
			transition: transform 200ms ease;
		}
		.sidebar.open {
			transform: translateX(0);
		}

		.docs-content {
			margin-left: 0;
			padding: 56px 20px 60px;
		}
	}

	/* ---- Prose styling ---- */

	.docs-content :global(h1) {
		font-size: 1.85rem;
		font-weight: 700;
		letter-spacing: -0.03em;
		margin: 0 0 8px;
		color: #f0f0f0;
	}

	.docs-content :global(.subtitle) {
		font-size: 1rem;
		color: #6b7a90;
		margin: 0 0 40px;
		line-height: 1.6;
	}

	.docs-content :global(h2) {
		font-size: 1.3rem;
		font-weight: 650;
		margin: 48px 0 16px;
		color: #e0e4ec;
		letter-spacing: -0.02em;
	}

	.docs-content :global(h3) {
		font-size: 1.05rem;
		font-weight: 600;
		margin: 32px 0 12px;
		color: #ccd2de;
	}

	.docs-content :global(p) {
		font-size: 0.9rem;
		line-height: 1.7;
		color: #9aa5b8;
		margin: 0 0 16px;
	}

	.docs-content :global(a) {
		color: #7ba4d9;
		text-decoration: none;
	}
	.docs-content :global(a:hover) {
		text-decoration: underline;
	}

	.docs-content :global(code) {
		font-family: 'SF Mono', 'Fira Code', 'JetBrains Mono', monospace;
		font-size: 0.82em;
		background: rgba(255, 255, 255, 0.06);
		padding: 2px 6px;
		border-radius: 4px;
		color: #c4cee0;
	}

	.docs-content :global(pre) {
		background: #0a0c12;
		border: 1px solid #1a1e2a;
		border-radius: 8px;
		padding: 16px 20px;
		overflow-x: auto;
		margin: 0 0 20px;
		line-height: 1.6;
	}

	.docs-content :global(pre code) {
		background: none;
		padding: 0;
		font-size: 0.8rem;
		color: #b0bcd0;
	}

	.docs-content :global(table) {
		width: 100%;
		border-collapse: collapse;
		margin: 0 0 24px;
		font-size: 0.82rem;
	}

	.docs-content :global(th) {
		text-align: left;
		padding: 8px 12px;
		font-weight: 600;
		color: #a0aab8;
		border-bottom: 1px solid #1e2330;
		white-space: nowrap;
	}

	.docs-content :global(td) {
		padding: 8px 12px;
		color: #8892a8;
		border-bottom: 1px solid rgba(30, 35, 48, 0.5);
		vertical-align: top;
	}

	.docs-content :global(td code) {
		font-size: 0.78rem;
		white-space: nowrap;
	}

	.docs-content :global(ul),
	.docs-content :global(ol) {
		padding-left: 24px;
		margin: 0 0 16px;
	}

	.docs-content :global(li) {
		font-size: 0.9rem;
		line-height: 1.7;
		color: #9aa5b8;
		margin-bottom: 6px;
	}

	.docs-content :global(hr) {
		border: none;
		border-top: 1px solid #1e2330;
		margin: 40px 0;
	}

	.docs-content :global(.callout) {
		background: rgba(99, 140, 255, 0.06);
		border: 1px solid rgba(99, 140, 255, 0.15);
		border-radius: 8px;
		padding: 14px 18px;
		margin: 0 0 20px;
		font-size: 0.85rem;
		color: #9aa5b8;
		line-height: 1.6;
	}

	.docs-content :global(.callout strong) {
		color: #b8c4d8;
	}
</style>
