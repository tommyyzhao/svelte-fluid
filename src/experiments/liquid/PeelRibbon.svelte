<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import MaterialSurface from './MaterialSurface.svelte';
	import { createPeelRibbon, type PeelRibbonModel } from './peel-ribbon.js';
	let { baseline = false }: { baseline?: boolean } = $props();
	let peel = $state(0.62), lift = $state(0.8), hasCrease = $state(false), available = $state(false), reduced = $state(false);
	let model: PeelRibbonModel | undefined, surface: { wake(): boolean; refresh(): void; suspend(): void } | undefined;
	let message = $state('Lift the band, press a crease, then lay it down and lift again.');
	async function factory(device: GPUDevice, format: GPUTextureFormat) {
		const result = await createPeelRibbon(device, format); result.set(peel, lift, true); model = result; return result;
	}
	function show() {
		if (baseline) return;
		// A native control may be visible while its canvas is offscreen. If its
		// clock cannot wake, commit a still endpoint for the next presentation.
		if (reduced || !surface?.wake()) model?.finish();
		surface?.refresh();
	}
	function change(nextPeel: number, nextLift: number) { peel = nextPeel; lift = nextLift; model?.set(peel, lift, reduced || baseline); show(); }
	function remember() {
		if (!model?.remember(reduced || baseline)) return;
		hasCrease = true; message = 'A rest-angle crease is stored at this material location. Lay down, then lift again: the fold returns.'; show();
	}
	function clearMemory() { hasCrease = false; model?.clearMemory(reduced || baseline); message = 'Virgin material again. Peel and lift settings are unchanged.'; show(); }
	function interrupt() { model?.finish(); }
	onMount(() => {
		const motion = matchMedia('(prefers-reduced-motion: reduce)'); reduced = motion.matches;
		const change = () => { reduced = motion.matches; model?.finish(); if (!baseline) surface?.refresh(); };
		motion.addEventListener('change', change); return () => motion.removeEventListener('change', change);
	});
	$effect(() => { if (baseline) surface?.suspend(); else untrack(() => { model?.finish(); surface?.refresh(); }); });
	export async function inspect() { return model?.inspect(); }
</script>

<div class="peel" class:baseline data-peel={peel} data-lift={lift} data-crease={hasCrease}>
	<div class="stage">
		<div class="underprint" aria-hidden="true"><span>OPEN FOR</span><strong>possibility.</strong><i>Something worth uncovering.</i></div>
		<div class="flat" class:visible={baseline || !available} style:width="{76 * (1 - peel)}%" aria-hidden="true"></div>
		<div class="render" class:concealed={baseline}><MaterialSurface bind:this={surface} bind:available {factory} decorative label="Inextensible material ribbon with stored rest curvature" settleMs={1100} oninterrupt={interrupt} /></div>
		<p class="material-note">{hasCrease ? 'A MATERIAL THAT REMEMBERS' : 'A FRESH PIECE OF MATERIAL'}</p>
	</div>
	<div class="controls">
		<label><span>Peel from the right <output>{Math.round(peel * 100)}%</output></span><input type="range" min="0" max="0.82" step="0.01" value={peel} oninput={(event) => change(Number(event.currentTarget.value), lift)} /></label>
		<label><span>Lift angle <output>{Math.round(lift * 1.3 * 180 / Math.PI)}°</output></span><input type="range" min="0" max="1" step="0.01" value={lift} oninput={(event) => change(peel, Number(event.currentTarget.value))} /></label>
		<div class="actions"><button onclick={() => change(peel > 0 ? 0 : 0.62, lift)}>{peel > 0 ? 'Lay down' : 'Lift again'}</button><button disabled={!available || peel < 0.08 || baseline} onclick={remember}>Press a crease</button><button disabled={!hasCrease || baseline} onclick={clearMemory}>Flatten memory</button></div>
	</div>
	<p class="message" role="status">{message}</p>
	<p class="support">{baseline ? 'Flat reveal baseline · no fold or material-memory simulation' : reduced ? 'Static constrained geometry · reduced motion' : available ? 'Native WebGPU geometry · fixed material length · finite response, then rest' : 'WebGPU preparing or unavailable · flat reveal and native controls remain usable; crease authoring needs the material model'}</p>
</div>

<style>
	.peel { color: #3b4531; }.stage { position: relative; height: clamp(310px, 47vw, 510px); isolation: isolate; overflow: hidden; }
	.underprint { position: absolute; left: 44%; right: 13%; top: 53%; height: 29%; display: flex; flex-direction: column; justify-content: center; align-items: flex-end; text-align: right; gap: 8px; user-select: none; }.underprint > span { font-size: 9px; letter-spacing: .2em; color: #7b8d61; }.underprint strong { font: italic 400 clamp(34px, 5.8vw, 67px)/.9 Georgia, serif; letter-spacing: -.05em; color: #405d39; }.underprint i { font-size: 9px; color: #8d9c71; font-style: normal; }
	.render { position: absolute; inset: 0; pointer-events: none; }.concealed { visibility: hidden; }.peel :global(.material) { min-height: 0; background: transparent; }.peel :global(.status) { display: none; }
	.flat { position: absolute; left: 12%; top: 52.5%; height: 29%; background: #c59756; opacity: 0; border-top: 3px double #8b6a3670; border-bottom: 3px double #8b6a3670; box-sizing: border-box; }.flat.visible { opacity: 1; }
	.material-note { position: absolute; left: 12%; bottom: 6%; color: #9b9f7f; font-size: 7px; letter-spacing: .15em; }
	.controls { display: flex; align-items: end; flex-wrap: wrap; gap: 24px; padding-top: 22px; border-top: 1px solid #9aa67c45; } label { flex: 1; min-width: 160px; color: #7c8965; font-size: 10px; } label > span { display: flex; justify-content: space-between; gap: 15px; } output { color: #495c34; font-variant-numeric: tabular-nums; } input { width: 100%; margin: 12px 0 0; accent-color: #8b824c; min-height: 24px; }
	.actions { display: flex; flex-wrap: wrap; gap: 8px; } button { min-height: 40px; padding: 9px 12px; font: 10px 'Helvetica Neue', Arial, sans-serif; color: #5c6744; background: #f6f2df; border: 1px solid #a8aa8270; cursor: pointer; } button:disabled { color: #a6ac93; cursor: default; background: transparent; }.message { min-height: 30px; margin: 18px 0 0; color: #8c9677; font-size: 10px; line-height: 1.7; }.support { color: #9ca585; font-size: 8px; margin: 5px 0 0; }:is(button,input):focus-visible { outline: 2px solid #788553; outline-offset: 3px; }
	@media(max-width: 540px) { .controls { gap: 15px; } label { min-width: 130px; } .underprint { gap: 7px; }.underprint > span { font-size: 7px; }.underprint i { font-size: 7px; }.actions { width: 100%; } }
</style>
