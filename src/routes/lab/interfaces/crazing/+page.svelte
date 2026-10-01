<script lang="ts">
	import MaterialSurface from '../../../../experiments/liquid/MaterialSurface.svelte';
	import { createCrazedEnamel, type CrazedEnamelExperiment } from '../../../../experiments/liquid/crazed-enamel.js';
	let surface = $state<{ refresh: () => void; reset: () => void }>();
	let specimen = $state<CrazedEnamelExperiment>();
	let interactive = $state(false), available = $state(false), light = $state(237), sequence = 0;
	const seeds = [[0.68, 0.64], [0.69, 0.25], [0.23, 0.7], [0.24, 0.23], [0.78, 0.82], [0.53, 0.77], [0.55, 0.26], [0.21, 0.45]];
	async function factory(device: GPUDevice, format: GPUTextureFormat) {
		const model = await createCrazedEnamel(device, format); specimen = model;
		model.setLight(light * Math.PI / 180); return model;
	}
	function addHistory() {
		if (!specimen) return;
		for (let i = 0; i < seeds.length; i++) { const p = seeds[sequence++ % seeds.length]; if (specimen.seed(p[0], p[1])) break; }
		surface?.refresh();
	}
	function turnLight(event: Event) {
		light = Number((event.currentTarget as HTMLInputElement).value);
		specimen?.setLight(light * Math.PI / 180); surface?.refresh();
	}
</script>

<svelte:head><title>Beautifully irreversible — crazed enamel</title><meta name="robots" content="noindex" /></svelte:head>

<main>
	<header><a href="/lab/interfaces">fluid <span>/ material studies</span></a><p>14 — SURFACE & HISTORY</p></header>
	<section aria-labelledby="title">
		<div class="intro"><p class="eyebrow">A surface with a past.</p><h1 id="title">Beautifully<br /><em>irreversible.</em></h1><p class="invitation">A new line meets an old one.<br />And knows where to stop.</p></div>
		<div class="ceramic">
			<div class="annotation" aria-hidden="true"><span>CELADON / GLAZE STUDY</span><span>THE FRACTURE REMAINS</span></div>
			<MaterialSurface bind:this={surface} bind:interactive bind:available {factory} settleMs={120} label="Celadon ceramic glaze with persistent hairline cracks. Sweep to initiate new fractures. New branches terminate at older cracks; turning the light changes the bevel reflections without changing the network." />
		</div>
		<div class="toolbar"><p>{interactive ? 'Sweep across untouched glaze. No click needed.' : 'A still specimen. Use the controls to add a fracture or move its light.'}</p><div><button onclick={addHistory} disabled={!available}>Add a fracture <span aria-hidden="true">↗</span></button><button onclick={() => { surface?.reset(); sequence = 0; }} disabled={!available}>Fresh glaze <span aria-hidden="true">↺</span></button></div></div>
		<label class="lighting"><span>Rake the light <small>The cracks stay; their edges catch a different light.</small></span><input type="range" min="0" max="360" step="1" bind:value={light} oninput={turnLight} disabled={!available} /><output>{light}°</output></label>
	</section>
	<div class="colophon"><p>The mark is permanent.<br /><em>The light is not.</em></p><details><summary>Under the surface <span aria-hidden="true">+</span></summary><p>A bounded explicit graph records each crack. Growing branches stop at the first older edge. A geometric relief band prevents new seeds too close to an existing fracture. This is a deliberately illustrative growth rule, not a tensor stress simulation or calibrated fracture mechanics.</p><p>At most 240 line segments, drawn as sparse native-pixel analytic bevels. There is no full-canvas crack texture and no pixel-sized simulation. The graph remains unchanged when lighting or display density changes. The material draws only while being edited, then rests.</p></details></div>
	<footer><a href="/lab/interfaces">All material studies <span aria-hidden="true">↗</span></a><p>Not noise. A small history.</p></footer>
</main>

<style>
	:global(body) { margin: 0; background: #e8e9df; color: #2d4139; }
	main { max-width: 1500px; margin: 0 auto; padding: 0 42px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; } a { color: inherit; text-decoration: none; }
	header { display: flex; justify-content: space-between; align-items: center; gap: 22px; min-height: 86px; border-bottom: 1px solid #2d413929; } header a { font-size: 20px; font-weight: 650; letter-spacing: -.7px; } header a span { color: #7e9084; font-size: 12px; font-weight: 400; letter-spacing: 0; margin-left: 5px; } header p { font-size: 9px; letter-spacing: .11em; color: #7e9084; }
	.intro { position: relative; padding: 36px 0 30px; } .eyebrow { color: #728c73; text-transform: uppercase; font-size: 9px; letter-spacing: .12em; margin: 0 0 18px; }
	h1 { margin: 0; font-family: Georgia, 'Times New Roman', serif; font-weight: 400; font-size: clamp(64px, 7vw, 106px); letter-spacing: -.065em; line-height: .96; } h1 em { font-weight: 400; color: #79917c; }
	.invitation { position: absolute; right: 0; bottom: 34px; font-size: 12px; line-height: 1.7; color: #7e9084; margin: 0; }
	.ceramic { position: relative; height: clamp(400px, 42vw, 640px); overflow: hidden; background: #15241f; } .ceramic :global(.material) { background: radial-gradient(ellipse at center, #a4bca6 0 45%, #19322a 65%); } .ceramic :global(.status) { font-size: 8px; bottom: 17px; left: 23px; color: #bfd1c5; background: #0d1d17a6; }
	.annotation { position: absolute; inset: 22px 24px auto; z-index: 2; display: flex; justify-content: space-between; font-size: 7px; letter-spacing: .14em; color: #afc0b4; pointer-events: none; }
	.toolbar { display: flex; justify-content: space-between; align-items: center; gap: 20px; padding: 18px 0; border-bottom: 1px solid #2d413929; } .toolbar p { font-size: 10px; line-height: 1.6; color: #7e9084; margin: 0; } .toolbar > div { display: flex; gap: 9px; }
	button { padding: 11px 15px; border: 1px solid #2d413938; color: #3c5446; background: transparent; font: inherit; font-size: 10px; cursor: pointer; } button:first-child { background: #385143; color: #e4eadf; border-color: #385143; } button:hover:not(:disabled) { background: #6c896e; border-color: #6c896e; color: white; } button:disabled, input:disabled { opacity: .4; cursor: default; } button span { margin-left: 18px; }
	.lighting { display: grid; grid-template-columns: 1fr minmax(120px, 310px) 38px; align-items: center; gap: 15px; padding: 19px 0; border-bottom: 1px solid #2d413929; font-size: 11px; } .lighting small { display: block; margin-top: 5px; color: #7e9084; font-size: 9px; } input { width: 100%; accent-color: #607f63; } output { text-align: right; color: #7e9084; font-size: 10px; }
	a:focus-visible, button:focus-visible, summary:focus-visible, input:focus-visible { outline: 2px solid #709178; outline-offset: 5px; }
	.colophon { display: grid; grid-template-columns: 1fr 1fr; gap: 80px; padding: 33px 0 41px; } .colophon > p { margin: 0; font: 400 28px/1.23 Georgia, serif; letter-spacing: -.9px; } .colophon em { color: #809684; }
	details { font-size: 11px; color: #738477; line-height: 1.8; } summary { display: flex; justify-content: space-between; cursor: pointer; list-style: none; font-size: 10px; border-bottom: 1px solid #2d413920; padding-bottom: 9px; } summary::-webkit-details-marker { display: none; }
	footer { display: flex; justify-content: space-between; gap: 20px; border-top: 1px solid #2d413929; padding: 22px 0 28px; font-size: 9px; color: #7e9084; } footer p { margin: 0; } footer a span { margin-left: 12px; }
	@media (max-width: 650px) { main { padding: 0 18px; } header a span { display: none; } header p { font-size: 7px; } .intro { padding: 31px 0 25px; } h1 { font-size: 61px; } .invitation { position: static; margin-top: 21px; font-size: 11px; } .ceramic { height: 430px; } .annotation { inset: 19px 17px auto; font-size: 6px; } .annotation span:last-child { max-width: 73px; text-align: right; line-height: 1.5; } .toolbar { display: block; } .toolbar > div { margin-top: 14px; } button { flex: 1; } .lighting { grid-template-columns: 1fr 130px 28px; gap: 10px; } .lighting small { max-width: 135px; line-height: 1.5; } .colophon { grid-template-columns: 1fr; gap: 24px; } }
</style>
