<script lang="ts">
	import { Aurora, CircularFluid, InkInWater, LavaLamp } from '$lib/index.js';
</script>

<svelte:head>
	<title>svelte-fluid capture</title>
</svelte:head>

<div class="grid">
	<div class="cell">
		<LavaLamp seed={101} aria-label="LavaLamp" />
	</div>
	<div class="cell">
		<Aurora seed={505} aria-label="Aurora" />
	</div>
	<div class="cell">
		<InkInWater seed={303} aria-label="InkInWater" />
	</div>
	<div class="cell">
		<CircularFluid seed={606} aria-label="CircularFluid" />
	</div>
</div>

<style>
	.grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		grid-template-rows: 1fr 1fr;
		width: 100vw;
		height: 100vh;
		gap: 0;
		background: #0a0a0a;
	}
	.cell {
		position: relative;
		overflow: hidden;
	}
</style>
