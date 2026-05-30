<script lang="ts">
	import Maze from '../obstruction-demos/Maze.svelte';

	// Mirror of the maze wall geometry (viewBox 135x80) for an alignment overlay.
	const rect = (x0: number, y0: number, x1: number, y1: number) =>
		`M ${x0} ${y0} L ${x1} ${y0} L ${x1} ${y1} L ${x0} ${y1} Z`;
	const MAZE = [
		rect(0, 0, 60, 5),
		rect(75, 0, 135, 5),
		rect(0, 0, 5, 80),
		rect(130, 0, 135, 80),
		rect(0, 75, 105, 80),
		rect(120, 75, 135, 80),
		rect(5, 22, 118, 27),
		rect(17, 39, 130, 44),
		rect(5, 56, 118, 61)
	].join(' ');

	let showOverlay = $state(true);
</script>

<div class="page">
	<button onclick={() => (showOverlay = !showOverlay)}>
		{showOverlay ? 'Hide' : 'Show'} wall overlay
	</button>
	<div class="stage">
		<Maze seed={104} aria-label="maze test" />
		{#if showOverlay}
			<svg class="overlay" viewBox="0 0 135 80" preserveAspectRatio="none">
				<path d={MAZE} fill="rgba(255,40,40,0.45)" stroke="rgba(255,80,80,0.9)" stroke-width="0.4" />
			</svg>
		{/if}
	</div>
</div>

<style>
	.page {
		min-height: 100vh;
		background: #0a0a0a;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 12px;
		padding: 16px;
	}
	button {
		background: #1a1a1a;
		color: #ddd;
		border: 1px solid #333;
		padding: 6px 12px;
		border-radius: 6px;
		cursor: pointer;
	}
	.stage {
		position: relative;
		width: 810px;
		height: 480px;
	}
	.overlay {
		position: absolute;
		inset: 0;
		width: 810px;
		height: 480px;
		pointer-events: none;
	}
</style>
