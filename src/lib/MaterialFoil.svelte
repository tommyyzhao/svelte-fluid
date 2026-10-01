<script lang="ts">
	import { onMount } from 'svelte';
	import { attachMaterialFoil } from './engine/webgpu/materials/controllers.js';
	import type { MaterialFoilProps, MaterialStatus } from './engine/types.js';
	let { selected, enabled = true, class: className = '', onStatus }: MaterialFoilProps = $props();
	let canvas: HTMLCanvasElement;
	let runtime = $state<ReturnType<typeof attachMaterialFoil>>();
	let status = $state<MaterialStatus>({ state: 'loading' });
	function report(next: MaterialStatus) { status = next; onStatus?.(next); }
	$effect(() => runtime?.setSelected(selected));
	$effect(() => runtime?.setEnabled(enabled));
	export function retry() { runtime?.retry(); }
	onMount(() => { runtime = attachMaterialFoil(canvas, selected, enabled, report); return () => runtime?.dispose(); });
</script>

<span class="material-foil {className}" aria-hidden="true" data-material-state={status.state} data-selected={selected}>
	<svg viewBox="0 0 96 48" class:covered={status.state === 'ready'}><path d={selected ? 'M14 24 Q48 48 82 24' : 'M14 24 Q48 0 82 24'} /><path class="mounts" d="M14 17 V31 M82 17 V31" /></svg>
	<canvas bind:this={canvas} class:visible={status.state === 'ready'}></canvas>
</span>

<style>
	.material-foil { display: inline-block; position: relative; inline-size: 6rem; block-size: 3rem; flex: 0 0 auto; vertical-align: middle; pointer-events: none; color: var(--material-metal, currentColor); }
	canvas, svg { position: absolute; inset: 0; inline-size: 100%; block-size: 100%; }
	canvas { visibility: hidden; } canvas.visible { visibility: visible; } svg.covered { visibility: hidden; }
	path { fill: none; stroke: currentColor; stroke-width: 6; stroke-linecap: round; } path.mounts { stroke-width: 8; }
	@media (forced-colors: active) { canvas { display: none; } svg.covered { visibility: visible; } }
</style>
