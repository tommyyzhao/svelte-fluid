<script lang="ts">
	import ImprintSurface from '../../../../experiments/liquid/ImprintSurface.svelte';
	import { ORIGINAL_SIGNET, type ImprintToolShape } from '../../../../experiments/liquid/imprint-tools.js';
	let surface: ImprintSurface;
	let marked = $state(false), available = $state(false), count = $state(0);
	let shape = $state<ImprintToolShape>('signet'), size = $state(0.46), rotation = $state(0), depth = $state(1), bevel = $state(0.012);
	let tool = $derived({ shape, size, rotation, depth, bevel });
	function original() {
		({ shape, size, rotation, depth, bevel } = ORIGINAL_SIGNET); surface?.original();
	}
</script>

<svelte:head><title>Correspondence — a material with memory</title><meta name="robots" content="noindex" /></svelte:head>

<main>
	<header><a class="brand" href="/lab/interfaces">correspondence<span>№ 03</span></a><a href="/lab/interfaces">The material studies ↗</a></header>
	<section class="intro"><p class="eyebrow">A small ritual for a digital world</p><h1>Make your mark.</h1><p>Some things should remember<br />that you were here.</p></section>
	<section class="workbench" aria-labelledby="letter-heading">
		<article class="letter">
			<div class="letter-top"><span>AN OPEN INVITATION</span><span>21 / 09</span></div>
			<span class="ornament" aria-hidden="true">✳</span>
			<h2 id="letter-heading">A table.<br />A few good people.<br /><em>No particular occasion.</em></h2>
			<p>Come as you are. Bring a story.<br />We’ll leave a place for you.</p>
			<div class="signature"><span>With warmth,</span><b>matter.</b></div>
			<div class="letter-status"><span class:marked></span>{marked ? 'Your impression is on the seal.' : 'An invitation waiting for your touch.'}</div>
		</article>
		<div class="seal-station">
			<div class="station-label"><span>THE FINISHING TOUCH</span><span>WAX / OXBLOOD</span></div>
			<ImprintSurface bind:this={surface} bind:available bind:count {tool} onChange={(value) => marked = value} />
			<fieldset disabled={!available} class="tool-settings"><legend>The next impression <span>{count} / 32 retained</span></legend>
				<label class="head">Tool head<select aria-label="Tool head" bind:value={shape}><option value="signet">Original signet</option><option value="rosette">Rosette</option><option value="comb">Fine comb</option><option value="ring">Ring</option></select></label>
				<label>Tool size <output>{Math.round(size * 100)}%</output><input aria-label="Tool size" type="range" min="0.2" max="0.6" step="0.01" bind:value={size} /></label>
				<label>Rotation <output>{rotation}°</output><input aria-label="Tool rotation" type="range" min="0" max="180" step="5" bind:value={rotation} /></label>
				<label>Impression depth <output>{Math.round(depth * 100)}%</output><input aria-label="Impression depth" type="range" min="0.2" max="1" step="0.05" bind:value={depth} /></label>
				<label>Edge softness <output>{bevel <= 0.008 ? 'Crisp' : bevel >= 0.025 ? 'Round' : 'Soft'}</output><input aria-label="Edge softness" type="range" min="0.003" max="0.035" step="0.001" bind:value={bevel} /></label>
			</fieldset>
			<div class="tools"><button disabled={!available || count >= 32} onclick={() => surface?.stamp()}>Press current tool <span>↓</span></button><button class="warm" disabled={!available || !marked} onclick={() => surface?.smooth()}>Warm & smooth <span>↺</span></button></div>
			<div class="examples"><button disabled={!available || count > 29} onclick={() => surface?.example()}>Add a mixed trio</button><button disabled={!available} onclick={original} title="Clear the seal and restore the original signet">Original seal</button></div>
			<p class="small">Each impression keeps its own tool settings.<br />An impression is not a send button. Nothing is submitted or shared.</p>
		</div>
	</section>
	<footer><p><b>Memory, not another hover effect.</b> Up to 32 impressions are retained until explicit smoothing; older marks are never silently replaced. Native-pixel relief replaces the old 192-cell visual field. The original signet now has a native raster distance profile; other tool heads are analytic. Maximum-depth material memory, not calibrated wax or a volume-conserving fluid simulation.</p><a href="/lab/interfaces/selection">Next: a material that follows a choice ↗</a></footer>
</main>

<style>
	:global(body) { margin: 0; background: #e9e2d8; color: #443b38; }
	main { max-width: 1260px; margin: auto; padding: 0 54px; font-family: Arial, sans-serif; }
	header { display: flex; justify-content: space-between; align-items: center; padding: 30px 0; border-bottom: 1px solid #b6a79877; gap: 25px; }
	a { color: inherit; text-decoration: none; }
	header > a:last-child { font-size: 11px; }
	.brand { font: italic 27px Georgia, serif; letter-spacing: -.7px; }
	.brand span { font: 9px Arial, sans-serif; margin-left: 12px; vertical-align: middle; letter-spacing: .1em; }
	.intro { text-align: center; margin: 48px 0 35px; }
	.eyebrow { font-size: 9px; letter-spacing: .15em; text-transform: uppercase; color: #827167; }
	h1 { font: 400 clamp(45px, 5.6vw, 78px)/1.06 Georgia, serif; letter-spacing: -.045em; margin: 18px 0; }
	.intro > p:last-child { color: #827167; font: 14px/1.5 Georgia, serif; }
	.workbench { display: grid; grid-template-columns: 1fr 1fr; gap: 42px; align-items: center; max-width: 1050px; margin: auto; }
	.letter { background: #faf6ed; padding: 32px 44px 25px; box-shadow: 0 3px 3px #443b380a, 0 20px 35px #443b3811; }
	.letter-top, .station-label { display: flex; justify-content: space-between; gap: 15px; font-size: 8px; letter-spacing: .12em; color: #918177; }
	.ornament { display: block; color: #823b48; font-size: 33px; margin: 34px 0 26px; }
	h2 { font: 400 clamp(25px, 2.5vw, 34px)/1.25 Georgia, serif; letter-spacing: -.02em; margin: 0; }
	h2 em { font-size: .8em; }
	.letter > p { font: 13px/1.8 Georgia, serif; margin: 25px 0; color: #8a776a; }
	.signature { display: flex; flex-direction: column; gap: 10px; margin: 25px 0; }
	.signature span { font: italic 12px Georgia, serif; color: #8a776a; }
	.signature b { font: bold 25px Georgia, serif; letter-spacing: -1px; }
	.letter-status { border-top: 1px solid #b6a79855; padding-top: 17px; font-size: 9px; color: #8a776a; display: flex; align-items: center; gap: 8px; }
	.letter-status span { width: 5px; height: 5px; border: 1px solid #aa9281; border-radius: 50%; }
	.letter-status .marked { background: #823b48; border-color: #823b48; }
	.seal-station { min-width: 0; }
	.station-label { padding: 0 15px; }
	.tool-settings { border: 1px solid #b6a79866; margin: 18px 6px 0; padding: 15px 16px 10px; display: grid; grid-template-columns: 1fr 1fr; gap: 13px 22px; }
	.tool-settings legend { padding: 0 7px; color: #746761; font-size: 10px; } .tool-settings legend span { color: #aa9281; margin-left: 25px; font-size: 9px; font-variant-numeric: tabular-nums; }
	.tool-settings label { font-size: 9px; color: #8a776a; } .tool-settings .head { grid-column: 1 / -1; display: flex; align-items: center; justify-content: space-between; gap: 20px; }
	select { font: 11px Arial, sans-serif; color: #643442; background: #faf6ed; border: 1px solid #b6a79888; padding: 7px 10px; min-width: 160px; }
	input[type='range'] { display: block; width: 100%; margin: 8px 0 0; accent-color: #823b48; } output { float: right; font-size: 9px; font-variant-numeric: tabular-nums; color: #643442; }
	.examples { display: flex; justify-content: center; gap: 20px; margin-top: 15px; } .examples button { font-size: 9px; background: transparent; color: #8a776a; padding: 2px 0; border-bottom: 1px solid #b6a79866; border-radius: 0; }
	.tools { display: flex; justify-content: center; gap: 12px; margin-top: 16px; }
	button { border: 0; background: #643442; color: #fff9ed; padding: 12px 18px; border-radius: 2px; font: 11px Arial, sans-serif; cursor: pointer; }
	button span { margin-left: 12px; }
	button.warm { color: #765c57; background: transparent; border: 1px solid #b6a79888; }
	button:disabled { opacity: .4; cursor: default; }
	.small { text-align: center; color: #9c8a7d; font: 10px/1.6 Arial, sans-serif; margin-top: 18px; }
	footer { display: flex; justify-content: space-between; align-items: center; gap: 40px; margin: 46px 0 24px; padding-top: 22px; border-top: 1px solid #b6a79877; font-size: 10px; line-height: 1.7; color: #8a776a; }
	footer p { max-width: 650px; margin: 0; } footer b { font-weight: 500; color: #5b4942; } footer a { flex: 0 0 auto; }
	a:focus-visible, button:focus-visible, input:focus-visible, select:focus-visible { outline: 2px solid #823b48; outline-offset: 4px; }
	@media(max-width: 760px) { main { padding: 0 22px; } header { padding: 23px 0; } .brand { font-size: 24px; } .brand span { display: none; } .intro { margin: 34px 0; } .workbench { grid-template-columns: 1fr; gap: 35px; max-width: 480px; } .letter { padding: 27px 30px; } .seal-station { grid-row: 1; } footer { display: block; } footer a { display: inline-block; margin-top: 15px; } }
</style>
