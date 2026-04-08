<script lang="ts">
	let { children } = $props();
</script>

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
