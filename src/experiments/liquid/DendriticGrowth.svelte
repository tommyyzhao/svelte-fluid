<script lang="ts">
	import MaterialSurface from './MaterialSurface.svelte';
	import { createDendriticGrowth,type DendriticGrowthExperiment } from './dendritic-growth.js';
	let surface=$state<{wake():boolean;refresh():void;reset():void;suspend():void}>();
	let model:DendriticGrowthExperiment|undefined;
	let available=$state(false),interactive=$state(false),heat=$state(false),isotropic=$state(false),angle=$state(0),started=false;
	async function factory(device:GPUDevice,format:GPUTextureFormat){model=await createDendriticGrowth(device,format);return model;}
	function run(){if(!available||document.hidden)return;if(!surface?.wake()){model?.advanceStill();surface?.refresh();}}
	function restart(round=isotropic,rotation=angle){
		if(!available||document.hidden)return;surface?.suspend();isotropic=round;angle=rotation;
		model?.restart({anisotropy:isotropic?0:.02,angle:angle*Math.PI/180});surface?.refresh();run();
	}
	function advance(){if(!available||document.hidden)return;surface?.suspend();model?.advanceStill();surface?.refresh();}
	function grown(){if(!available||document.hidden)return;surface?.suspend();model?.restart();model?.advanceStill(6.5);surface?.refresh();}
	function clear(){if(available&&!document.hidden)surface?.reset();}
	function view(){if(!available||document.hidden)return;heat=!heat;model?.setHeatView(heat);surface?.refresh();}
	$effect(()=>{if(available&&interactive&&!document.hidden&&!started){started=true;run();}});
	export async function inspect(){return model?.inspect();}
</script>

<div class="dendrite-proof" data-available={available} data-isotropic={isotropic} data-angle={angle}>
	<div class="specimen">
		{#if !available}<div class="static-seed" aria-hidden="true"></div>{/if}
		<MaterialSurface bind:this={surface} bind:available bind:interactive {factory} settleMs={6500}
			label="A growing supercooled melt crystal. The native controls restart, rotate, advance, and reveal latent heat. Pointer hovering does not edit this sample." />
		<div class="corners" aria-hidden="true"><span>{heat?'LATENT HEAT':'THE ACTUAL PHASE FRONT'}</span><span>{isotropic?'NO PREFERRED DIRECTION':`SIX DIRECTIONS / ${angle}°`}</span></div>
		<p class="caption">{available?'A finite growth interval. Then stillness.':'A static nucleus remains when WebGPU is unavailable.'}</p>
	</div>
	<div class="controls">
		<button disabled={!available} onclick={()=>restart()}>Restart cold growth</button>
		<button disabled={!available} onclick={()=>restart(isotropic,(angle+15)%60)}>Restart rotated +15°</button>
		<button disabled={!available} aria-pressed={isotropic} onclick={()=>restart(!isotropic)}> {isotropic?'Restore six directions':'Remove anisotropy'}</button>
	</div>
	<div class="tools">
		<p>{interactive?'Heat released by the solid must find a way out.':'Still specimen · every advance is one finite requested snapshot.'}</p>
		<button disabled={!available} onclick={grown}>Show grown specimen</button>
		<button disabled={!available} onclick={advance}>Advance one snapshot</button>
		<button disabled={!available} aria-pressed={heat} onclick={view}>{heat?'See the crystal':'See the heat'}</button>
		<button disabled={!available} onclick={clear}>Clear nucleus</button>
	</div>
</div>

<style>
	.dendrite-proof{color:#e5e6da;}.specimen{position:relative;aspect-ratio:1;isolation:isolate;overflow:hidden;background:#131713;user-select:none;-webkit-user-select:none;}
	.specimen :global(.material){min-height:0;background:transparent;pointer-events:none;}.specimen :global(.status:not(.error)){display:none;}.specimen :global(.status.error){font-size:9px;bottom:44px;}
	.static-seed{position:absolute;left:47.5%;top:47.5%;width:5%;height:5%;background:#e7e7dc;border-radius:50%;}
	.corners{position:absolute;inset:22px 23px auto;display:flex;justify-content:space-between;gap:20px;pointer-events:none;color:#7a8376;font:8px/1.4 Arial,sans-serif;letter-spacing:.12em;}
	.caption{position:absolute;bottom:20px;left:23px;margin:0;max-width:75%;font:9px/1.5 Arial,sans-serif;color:#7a8376;pointer-events:none;}
	.controls{display:flex;flex-wrap:wrap;gap:8px;padding:20px 0;border-bottom:1px solid #505948;}.tools{display:flex;align-items:center;flex-wrap:wrap;gap:8px;padding:18px 0;}.tools p{flex:1;min-width:180px;color:#8a9381;font:10px/1.5 Arial,sans-serif;margin:0;}
	button{background:transparent;border:1px solid #5b6552;color:#d6dbcb;font:10px/1.35 Arial,sans-serif;padding:11px 13px;cursor:pointer;}button:hover:not(:disabled),button[aria-pressed=true]{background:#d7dec9;color:#152017;}button:disabled{opacity:.35;cursor:default;}button:focus-visible{outline:2px solid #e1e9b9;outline-offset:4px;}
	@media(max-width:600px){.corners{font-size:6px;inset:13px;}.caption{font-size:7px;left:13px;bottom:11px;}.tools p{flex-basis:100%;margin:0 0 8px;}.controls{gap:6px;}button{font-size:9px;padding:9px 10px;}}
</style>
