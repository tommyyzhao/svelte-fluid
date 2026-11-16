<script lang="ts">
	import { base } from '$app/paths';
	import { page } from '$app/state';
</script>

<svelte:head>
	<title>{page.status} — svelte-fluid</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<main class="error">
	<p class="code">{page.status}</p>
	<h1>{page.status === 404 ? 'Page not found' : 'Something went wrong'}</h1>
	<p>{page.error?.message ?? ''}</p>
	<nav>
		<a href="{base}/">Home</a>
		<a href="{base}/docs">Docs</a>
	</nav>
</main>

<style>
	.error {
		min-height: 70vh;
		display: grid;
		place-content: center;
		gap: 0.75rem;
		text-align: center;
		padding: 2rem;
	}
	.code {
		font-size: 3rem;
		font-weight: 700;
		margin: 0;
		color: #888;
	}
	h1 {
		margin: 0;
		font-size: 1.75rem;
	}
	nav {
		display: flex;
		gap: 1.25rem;
		justify-content: center;
	}
	a {
		color: #e8e8e8;
	}
</style>
