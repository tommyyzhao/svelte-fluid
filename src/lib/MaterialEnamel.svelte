<script lang="ts">
	import { onMount } from 'svelte';
	import { attachMaterialEnamel } from './engine/webgpu/materials/controllers.js';
	import type { MaterialEnamelProps, MaterialStatus } from './engine/types.js';
	let { text, enabled = true, class: className = '', onStatus }: MaterialEnamelProps = $props();
	let canvas: HTMLCanvasElement, source: HTMLSpanElement;
	let runtime = $state<ReturnType<typeof attachMaterialEnamel>>();
	let status = $state<MaterialStatus>({ state: 'loading' });
	let previousText: string | undefined;
	function report(next: MaterialStatus) { status = next; onStatus?.(next); }
	$effect(() => runtime?.setEnabled(enabled));
	$effect(() => { if (previousText !== undefined && text !== previousText) runtime?.refresh(true); previousText = text; });
	export function retry() { runtime?.retry(); }
	onMount(() => {
		runtime = attachMaterialEnamel(canvas, source, enabled, report);
		const refresh = () => runtime?.refresh(true);
		document.fonts.addEventListener('loadingdone', refresh);
		const styles = new MutationObserver(refresh);
		for (let ancestor: HTMLElement | null = source.parentElement; ancestor; ancestor = ancestor.parentElement) styles.observe(ancestor, { attributes: true, attributeFilter: ['style', 'class', 'dir'] });
		return () => { styles.disconnect(); document.fonts.removeEventListener('loadingdone', refresh); runtime?.dispose(); };
	});
</script>

<span class="material-enamel {className}" data-material-state={status.state}>
	<span class="source" bind:this={source}>{text}</span>
	<canvas bind:this={canvas} aria-hidden="true" class:visible={status.state === 'ready'}></canvas>
</span>

<style>
	.material-enamel { display: block; position: relative; min-inline-size: 0; max-inline-size: 100%; isolation: isolate; }
	.source { display: block; white-space: pre-wrap; overflow-wrap: anywhere; }
	canvas { position: absolute; inset: 0; inline-size: 100%; block-size: 100%; pointer-events: none; visibility: hidden; }
	canvas.visible { visibility: visible; }
	@media (forced-colors: active) { canvas { display: none; } }
</style>
