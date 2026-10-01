<script lang="ts">
	import MaterialSurface from './MaterialSurface.svelte';
	import { createFrostPhase, type FrostPhaseExperiment } from './frost-phase.js';
	import { FROST_COLD, FROST_WARM } from './frost-phase-model.js';
	let surface=$state<{wake():boolean;refresh():void;reset():void;suspend():void}>();
	let model:FrostPhaseExperiment|undefined;
	let available=$state(false),interactive=$state(false),bath=$state(FROST_COLD),heat=$state(false),started=false;
	function run(){
		if(!available||document.hidden)return;
		if(!surface?.wake()){model?.advanceStill();surface?.refresh();}
	}
	function setBath(value:number){bath=value;model?.setOptions({bath});run();surface?.refresh();}
	function seed(){model?.seed();run();surface?.refresh();}
	function clear(){surface?.reset();}
	function view(){heat=!heat;model?.setHeatView(heat);surface?.refresh();}
	async function factory(device:GPUDevice,format:GPUTextureFormat){model=await createFrostPhase(device,format);return model;}
	// Show one bounded growth interval only when the new specimen is visible.
	$effect(()=>{if(available&&interactive&&!document.hidden&&!started){started=true;run();}});
	export async function inspect(){return model?.inspect();}
</script>

<div class="frost-proof">
	<div class="glass">
		<div class="underprint" aria-hidden="true"><span>NOTHING<br />STAYS<br /><em>STILL.</em></span><small>THE QUIET BEFORE A CHANGE</small></div>
		<MaterialSurface bind:this={surface} bind:available bind:interactive {factory} settleMs={8000}
			label="Cold grows a planted crystal. Slowly brush through the ice without clicking for a second to warm a window. Heat input stops when movement stops. The visible edge follows the phase field." />
		<div class="glass-label" aria-hidden="true"><span>ICE / PHASE STUDY</span><span>{heat?'THERMAL VIEW':bath<0?'COLD SUBSTRATE':'WARM SUBSTRATE'}</span></div>
	</div>
	<div class="tools">
		<div class="temperatures"><button disabled={!available} aria-pressed={bath<0} onclick={()=>setBath(FROST_COLD)}>Cold grows</button><button disabled={!available} aria-pressed={bath>0} onclick={()=>setBath(FROST_WARM)}>Warm melts</button></div>
		<div><button disabled={!available} onclick={seed}>Plant a cold crystal ↗</button><button disabled={!available} onclick={clear}>Clear glass</button></div>
	</div>
	<div class="readout"><p>{interactive?'Brush slowly for a second. Movement warms the glass; resting stops the heat.':'Still specimen · each advance requests one finite snapshot.'}</p><button disabled={!available} onclick={run}>{interactive?'Continue the change':'Advance one snapshot'}</button><button disabled={!available} aria-pressed={heat} onclick={view}>{heat?'Return to the glass':'See the heat'}</button></div>
</div>

<style>
	.frost-proof{color:#d7e6e8;}.glass{position:relative;aspect-ratio:1;isolation:isolate;overflow:hidden;background:#102d3c;user-select:none;-webkit-user-select:none;}
	.underprint{position:absolute;inset:0;background:radial-gradient(ellipse at 75% 22%,#355259,#0b202b 72%);padding:12%;box-sizing:border-box;}
	.underprint:after{content:'';position:absolute;inset:0;background-image:linear-gradient(#bedad410 1px,transparent 1px),linear-gradient(90deg,#bedad410 1px,transparent 1px);background-size:42px 42px;}
	.underprint>span{position:absolute;top:21%;left:12%;font:500 clamp(30px,6.7vw,87px)/.91 Georgia,serif;letter-spacing:-.07em;color:#a0bbb08c;}.underprint em{color:#678887;font-weight:400;}.underprint small{position:absolute;bottom:14%;left:12%;font:8px Arial,sans-serif;letter-spacing:.17em;color:#769594;}
	.glass :global(.material){min-height:0;background:transparent;}.glass :global(.status){background:#0d2431d9;color:#a3bdc3;font-size:8px;left:20px;bottom:16px;}
	.glass-label{position:absolute;inset:21px 23px auto;display:flex;justify-content:space-between;pointer-events:none;font:8px/1.4 Arial,sans-serif;letter-spacing:.12em;color:#94b4bb;}
	.tools{display:flex;justify-content:space-between;gap:18px;padding:20px 0;border-bottom:1px solid #87a4a82e;}.tools>div{display:flex;gap:7px;flex-wrap:wrap;}
	button{border:1px solid #87a4a84a;background:transparent;color:#aec9cb;padding:12px 15px;font:10px/1.3 Arial,sans-serif;cursor:pointer;}button:hover:not(:disabled),button[aria-pressed=true]{background:#bad2d4;color:#132e3a;border-color:#bad2d4;}button:disabled{opacity:.35;cursor:default;}button:focus-visible{outline:2px solid #d4e49c;outline-offset:4px;}
	.readout{display:flex;align-items:center;gap:9px;padding:17px 0;}.readout p{flex:1;color:#789aa3;font:10px/1.6 Arial,sans-serif;}.readout button{font-size:9px;padding:9px 10px;}
	@media(max-width:600px){.tools{display:block;}.tools>div+div{margin-top:10px;}.readout{flex-wrap:wrap;}.readout p{flex-basis:100%;margin:0 0 8px;}.glass-label{font-size:6px;inset:13px 15px auto;}.glass :global(.status){font-size:6px;left:12px;bottom:10px;}.underprint small{font-size:6px;}}
</style>
