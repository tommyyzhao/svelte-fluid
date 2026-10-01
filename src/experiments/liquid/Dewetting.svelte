<script lang="ts">
	import { onMount } from 'svelte';
	import MaterialSurface from './MaterialSurface.svelte';
	import { createDewetting, type DewettingExperiment } from './dewetting.js';
	let surface: { wake(): boolean; refresh(): void; reset(): void; suspend(): void } | undefined;
	let model: DewettingExperiment | undefined;
	let available = $state(false), interactive = $state(false), open = $state(false), baseline = $state(false);
	let spreading = $state(0.68), viscosity = $state(1.4), seedX = $state(0.5), seedY = $state(0.5), serial = $state(0);
	let gpuSerial = 0;
	let plate: HTMLButtonElement;
	const instance = $props.id();
	let timer: ReturnType<typeof setTimeout> | undefined;
	function stopWatching() { clearTimeout(timer); }
	function watch() {
		clearTimeout(timer);
		if (model?.moving) timer = setTimeout(watch, 80);
		else surface?.suspend();
	}
	function resume() {
		if (!baseline && interactive && !document.hidden && model?.moving && surface?.wake()) watch();
	}
	$effect(() => { if (interactive && !baseline) resume(); });
	onMount(() => {
		window.addEventListener('focus', resume); document.addEventListener('visibilitychange', resume);
		return () => { stopWatching(); window.removeEventListener('focus', resume); document.removeEventListener('visibilitychange', resume); };
	});
	async function factory(device: GPUDevice, format: GPUTextureFormat) {
		const candidate = await createDewetting(device, format);
		candidate.setSpreading(spreading); candidate.setViscosity(viscosity);
		if (open) candidate.seed(seedX, seedY, true);
		gpuSerial = serial;
		model = candidate; return candidate;
	}
	function seed(x = 0.5, y = 0.5) {
		seedX = Math.max(0.1, Math.min(0.9, x)); seedY = Math.max(0.18, Math.min(0.82, y));
		open = true; serial++;
		if (!baseline) { model?.seed(seedX, seedY, !interactive); gpuSerial = serial; surface?.refresh(); if (interactive && surface?.wake()) watch(); }
	}
	function press(event: MouseEvent) {
		const rect = plate.getBoundingClientRect();
		seed(event.detail ? (event.clientX - rect.left) / rect.width : 0.5,
			event.detail ? (event.clientY - rect.top) / rect.height : 0.5);
	}
	function recoat() { stopWatching(); open = false; serial++; if (!baseline) { surface?.reset(); gpuSerial = serial; } }
	function change() {
		model?.setSpreading(spreading); model?.setViscosity(viscosity);
		if (!interactive) model?.finish();
		if (!baseline) { surface?.refresh(); if (interactive && open && surface?.wake()) watch(); }
	}
	function compare(value: boolean) {
		baseline = value;
		if (baseline) surface?.suspend();
		else {
			// Merely inspecting the cheaper comparison must not erase held state.
			// Only actions performed in the comparison need a new still specimen.
			if (gpuSerial !== serial) { model?.reset(); if (open) model?.seed(seedX, seedY, true); gpuSerial = serial; }
			surface?.refresh(); if (model?.moving && interactive && surface?.wake()) watch();
		}
	}
	export async function inspect() { return model?.inspect(); }
</script>

<div class="study" data-baseline={baseline} data-open={open} data-seed={serial}>
	<div class="scene">
		<div class="print" aria-hidden="true"><span>BELOW THE SURFACE</span><strong>Stay<br /><em>curious.</em></strong><span>What leaves can leave something behind.</span></div>
		<div class="gpu" class:concealed={baseline}><MaterialSurface bind:this={surface} bind:available bind:interactive {factory} decorative oninterrupt={stopWatching} settleMs={12000} label="A coating retracts into a raised rim around one opening." /></div>
		{#if baseline || !available}
			{#key serial}
				<svg class="wipe" class:static={!baseline} viewBox="0 0 180 100" aria-hidden="true">
					<defs><mask id={`${instance}-wipe`} maskUnits="userSpaceOnUse" x="0" y="0" width="180" height="100"><rect width="180" height="100" fill="white" /><circle class:opened={open} cx={seedX * 180} cy={seedY * 100} r="35" fill="black" style:transform-origin={`${seedX * 180}px ${seedY * 100}px`} /></mask></defs>
					<rect width="180" height="100" fill="#baab8c" mask={`url(#${instance}-wipe)`} />
				</svg>
			{/key}
		{/if}
		<button bind:this={plate} type="button" class="touch" onclick={press} aria-label="Recoat and open a new dewetting hole here" title="Click to recoat and start one new opening"><span>{open ? 'A new touch starts a fresh film.' : 'Touch the coating.'}</span><span>{baseline ? 'SIMPLE RADIAL WIPE' : 'VOLUME INTO THE RIM'}</span></button>
	</div>
	<div class="actions"><button type="button" onclick={() => seed()}>Open at the centre</button><button type="button" onclick={recoat}>Recoat</button><label><input type="checkbox" checked={baseline} onchange={(event) => compare(event.currentTarget.checked)} /> Compare simple wipe</label></div>
	<div class="sliders"><label>Retraction drive <output>{spreading.toFixed(2)}</output><input type="range" min="0.3" max="0.85" step="0.01" value={spreading} disabled={baseline || !available} oninput={(event) => { spreading = Number(event.currentTarget.value); change(); }} /></label><label>Viscous resistance <output>{viscosity.toFixed(1)}</output><input type="range" min="0.7" max="3" step="0.1" value={viscosity} disabled={baseline || !available} oninput={(event) => { viscosity = Number(event.currentTarget.value); change(); }} /></label></div>
	<p class="status" role="status">{baseline ? 'A keyframed SVG opening: no displaced liquid or WebGPU simulation.' : !available ? 'Preparing WebGPU, or using a static radial opening if unavailable.' : !interactive ? 'Still specimen: reduced motion or paused visibility.' : 'One bounded hole. Its missing coating is held in the rim; a fresh click recoats first.'}</p>
</div>

<style>
	.study { user-select: none; -webkit-user-select: none; }
	.scene { position: relative; aspect-ratio: 1.8; overflow: hidden; isolation: isolate; background: #123f48; }
	.print { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; color: #eef1ce; background: repeating-linear-gradient(0deg, #123f48, #123f48 18px, #25565b 19px, #123f48 20px); }
	.print strong { font: 500 clamp(40px, 8vw, 110px)/.87 Georgia, serif; letter-spacing: -.06em; text-align: center; } .print em { font-weight: 400; color: #c8e3b5; }
	.print > span { font: 8px/1.6 Arial, sans-serif; letter-spacing: .1em; }
	.gpu, .wipe { position: absolute; inset: 0; width: 100%; height: 100%; } .gpu.concealed { visibility: hidden; }
	.gpu :global(.material) { min-height: 0; background: transparent; } .gpu :global(.status) { display: none; }
	.gpu :global(.status.error) { display: block; bottom: 48px; z-index: 3; }
	.wipe { pointer-events: none; } .wipe circle { transform: scale(0); } .wipe circle.opened { animation: wipe-open 1.8s cubic-bezier(.15,.6,.3,1) forwards; }
	@keyframes wipe-open { to { transform: scale(1); } }
	.wipe.static circle.opened { animation: none; transform: scale(1); }
	.touch { position: absolute; inset: 0; display: flex; justify-content: space-between; align-items: start; gap: 15px; width: 100%; height: 100%; border: 0; padding: 20px; color: #493f33; background: transparent; cursor: crosshair; text-align: left; touch-action: pan-y; font: 9px/1.5 Arial, sans-serif; }
	.touch > span:last-child { font-size: 7px; letter-spacing: .12em; }
	.touch:focus-visible { outline: 3px solid #294f4e; outline-offset: -7px; }
	.actions { display: flex; flex-wrap: wrap; align-items: center; gap: 9px; padding: 20px 0; }
	.actions button { border: 1px solid #4b5c4f55; background: transparent; color: #344f43; padding: 11px 15px; font: 11px Arial, sans-serif; cursor: pointer; }
	.actions button:first-child { background: #315f50; color: #edf0df; border-color: #315f50; } .actions label { margin-left: auto; font: 10px Arial, sans-serif; color: #657867; }
	.sliders { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; border-top: 1px solid #4b5c4f33; padding-top: 19px; }
	.sliders label { color: #657867; font: 10px Arial, sans-serif; } output { float: right; font-variant-numeric: tabular-nums; } .sliders input { display: block; width: 100%; margin: 12px 0; accent-color: #426d56; }
	.status { color: #788372; font: 10px/1.7 Arial, sans-serif; }
	@media (max-width: 550px) { .touch { padding: 12px; font-size: 8px; } .touch > span:last-child { font-size: 6px; } .print { gap: 7px; } .print strong { font-size: clamp(23px, 6vw, 33px); } .print > span { font-size: 5px; } .actions label { width: 100%; margin: 6px 0 0; } .sliders { gap: 20px; } }
	@media (prefers-reduced-motion: reduce) { .wipe circle.opened { animation: none; transform: scale(1); } }
</style>
