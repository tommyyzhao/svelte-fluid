<script lang="ts">
	import { onMount } from 'svelte';
	import { Fluid, type FluidProps } from 'svelte-fluid';

	let props: FluidProps = $props();
	let reduceMotion = $state(true);

	onMount(() => {
		reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
	});
</script>

{#if !reduceMotion}
	<div class="splash-cursor" aria-hidden="true">
		<Fluid
			pointerTarget="window"
			splatOnHover
			transparent
			bloom={false}
			sunrays={false}
			simResolution={128}
			dyeResolution={512}
			densityDissipation={2}
			velocityDissipation={2}
			pressure={0.1}
			curl={3}
			splatRadius={0.25}
			{...props}
		/>
	</div>
{/if}

<style>
	.splash-cursor {
		position: fixed;
		inset: 0;
		z-index: 9999;
		pointer-events: none;
	}
</style>
