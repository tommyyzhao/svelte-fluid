<script lang="ts">
	import { onMount } from 'svelte';
	import { attachMaterialImage } from './engine/webgpu/materials/controllers.js';
	import type { MaterialImageProps, MaterialStatus } from './engine/types.js';
	let { src, alt, width, height, enabled = true, class: className = '', onStatus }: MaterialImageProps = $props();
	let canvas: HTMLCanvasElement;
	let runtime = $state<ReturnType<typeof attachMaterialImage>>();
	let mounted = $state(false), imageFailed = $state(false), retryKey = $state(0);
	let status = $state<MaterialStatus>({ state: 'loading' });
	function report(next: MaterialStatus) { status = next; onStatus?.(next); }
	$effect(() => {
		if (!mounted) return;
		void retryKey; const source = src;
		imageFailed = false;
		const instance = attachMaterialImage(canvas, source, enabled, report); runtime = instance;
		return () => { instance.dispose(); runtime = undefined; };
	});
	$effect(() => runtime?.setEnabled(enabled));
	export function retry() { retryKey++; }
	onMount(() => { mounted = true; });
</script>

<span class="material-image {className}" style:aspect-ratio="{width} / {height}" data-material-state={status.state}>
	{#key `${src}:${retryKey}`}<img {src} {alt} {width} {height} decoding="async" onerror={() => { imageFailed = true; }} />{/key}
	<canvas bind:this={canvas} aria-hidden="true" class:visible={status.state === 'ready' && !imageFailed}></canvas>
	{#if imageFailed}<span class="image-error" role="status">Image unavailable. {alt}</span>{/if}
</span>

<style>
	.material-image { display: block; position: relative; inline-size: 100%; overflow: hidden; background: var(--material-image-surface, transparent); }
	img { display: block; inline-size: 100%; block-size: 100%; object-fit: cover; }
	canvas { position: absolute; inset: 0; inline-size: 100%; block-size: 100%; pointer-events: none; visibility: hidden; }
	canvas.visible { visibility: visible; }
	.image-error { position: absolute; inset: 0; display: grid; place-content: center; padding: 1rem; color: var(--text-primary, currentColor); background: var(--surface-base, Canvas); font: inherit; }
	@media (forced-colors: active) { canvas { display: none; } }
</style>
