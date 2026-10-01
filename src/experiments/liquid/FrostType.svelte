<script lang="ts">
	import { onMount } from 'svelte';
	import MaterialSurface from './MaterialSurface.svelte';
	import { createFrostPhase, type FrostPhaseExperiment } from './frost-phase.js';
	import { FROST_COLD, FROST_WARM } from './frost-phase-model.js';
	import { measureFrostType, rasterFrostType, type FrostTypeLine } from './frost-type-source.js';
	let host: HTMLDivElement, heading: HTMLHeadingElement;
	let surface = $state<{ wake(): boolean; refresh(): void; reset(): void; suspend(): void }>();
	let model: FrostPhaseExperiment | undefined;
	let available = $state(false), interactive = $state(false), baseline = $state(false), bath = $state(FROST_COLD);
	let lines = $state<FrostTypeLine[]>([]), expansion = $state(20), message = $state(''), started = false, generation = 0;
	let sourceWidth = $state(0), sourceHeight = $state(0);
	const filterId = $props.id();
	function run() {
		if (!available || baseline || document.hidden) return;
		if (!surface?.wake()) { model?.advanceStill(); surface?.refresh(); }
	}
	function setBath(value: number) { bath = value; model?.setOptions({ bath }); run(); surface?.refresh(); }
	function reseed() {
		if (!available || baseline) return;
		try {
			const source = rasterFrostType(host, heading); lines = source.lines;
			model?.seedFromCoverage?.(source.coverage); sourceWidth = source.width; sourceHeight = source.height;
			message = ''; run(); surface?.refresh();
		} catch (reason) { message = String(reason); }
	}
	function toggleBaseline(event: Event) {
		generation++; baseline = (event.currentTarget as HTMLInputElement).checked;
		surface?.suspend(); available = false; interactive = false; model = undefined; started = false; bath = FROST_COLD;
		lines = measureFrostType(host, heading); message = '';
	}
	async function factory(device: GPUDevice, format: GPUTextureFormat) {
		const token = generation; await document.fonts.ready;
		if (token !== generation) throw new Error('Frost typography startup was superseded.');
		const source = rasterFrostType(host, heading);
		const candidate = await createFrostPhase(device, format, source.coverage);
		if (token !== generation) { candidate.dispose(); throw new Error('Frost typography startup was superseded.'); }
		lines = source.lines; sourceWidth = source.width; sourceHeight = source.height; model = candidate;
		return candidate;
	}
	$effect(() => { if (available && interactive && !document.hidden && !started) { started = true; run(); } });
	onMount(() => { lines = measureFrostType(host, heading); return () => { generation++; }; });
	export async function inspect() { return model?.inspect(); }
</script>

<section class="frost-type-proof" data-ready={available && !baseline} data-baseline={baseline}
	data-source-width={sourceWidth} data-source-height={sourceHeight}>
	<div class="glass" bind:this={host}>
		<div class="glass-label" aria-hidden="true"><span>LETTER / PHASE STUDY</span><span>{baseline ? 'GEOMETRIC REFERENCE' : bath < 0 ? 'COLD SUBSTRATE' : 'WARM SUBSTRATE'}</span></div>
		<h2 bind:this={heading}><span data-frost-line>Cold</span><span data-frost-line>type.</span></h2>
		{#if baseline}
			<svg viewBox="0 0 1000 1000" aria-hidden="true" class="reference">
				<defs><filter id={filterId} x="-25%" y="-25%" width="150%" height="150%" color-interpolation-filters="sRGB"><feMorphology operator="dilate" radius={expansion} /></filter></defs>
				<g filter={`url(#${filterId})`} fill="#90b6bd" opacity=".75">
					{#each lines as line}<text x={line.x} y={line.y} font-family={line.family} font-size={line.size} font-weight={line.weight} font-style={line.style} letter-spacing={line.spacing}>{line.text}</text>{/each}
				</g>
			</svg>
		{:else}
			<MaterialSurface bind:this={surface} bind:available bind:interactive {factory} settleMs={bath > 0 ? 8000 : 320}
				label="The actual letters plant cold crystalline material. A phase field then grows independently. Move slowly through the frost for a second to warm a window; the underlying native text remains legible." />
		{/if}
		<p class="caption" aria-hidden="true">{baseline ? 'A shape expanded. No heat. No memory.' : 'The letters begin it. Warmth changes it.'}</p>
	</div>
	<div class="tools">
		<div><button disabled={!available || baseline} aria-pressed={bath < 0} onclick={() => setBath(FROST_COLD)}>Cold grows</button><button disabled={!available || baseline} aria-pressed={bath > 0} onclick={() => setBath(FROST_WARM)}>Warm melts</button></div>
		<div><button disabled={!available || baseline} onclick={reseed}>Reseed the letters</button><button disabled={!available || baseline} onclick={() => surface?.reset()}>Clear frost</button></div>
	</div>
	<div class="references">
		<label><input type="checkbox" checked={baseline} onchange={toggleBaseline} /> SVG expansion baseline</label>
		{#if baseline}<label>Expansion <input type="range" min="0" max="65" step="1" bind:value={expansion} aria-label="SVG expansion" /></label>{:else}<button disabled={!available} onclick={run}>{interactive ? 'Continue the change' : 'Advance one snapshot'}</button>{/if}
	</div>
	<p class="explanation" role="status">{message || (baseline ? 'Only vector dilation is mounted. Returning restarts from freshly sampled letters; it does not restore the previous ice.' : interactive ? 'Brush slowly for a second to warm a window. Heat stops when movement stops. Thin details may melt or merge: the letters are seeds, not a permanent mask.' : 'Native text remains. Each advance requests one finite snapshot; Cold, Warm, Clear and Reseed also work in reduced motion.')}</p>
</section>

<style>
	.frost-type-proof{color:#dce6df;}.glass{position:relative;aspect-ratio:1;isolation:isolate;overflow:hidden;background:radial-gradient(ellipse at 78% 18%,#334b50,#162b32 68%);user-select:none;-webkit-user-select:none;container-type:inline-size;}
	h2{position:absolute;z-index:2;left:8%;right:8%;top:25%;margin:0;color:#e5e5cd;font:900 25cqw/.88 'Arial Black',Arial,sans-serif;letter-spacing:-.075em;pointer-events:none;}h2 span{display:block;}
	.glass-label{position:absolute;z-index:3;inset:25px 25px auto;display:flex;justify-content:space-between;pointer-events:none;font:8px Arial,sans-serif;letter-spacing:.12em;color:#9cbbb9;}
	.glass :global(.material){min-height:0;background:transparent;}.glass :global(.status){background:transparent;color:#aac3bd;font-size:8px;left:18px;bottom:15px;z-index:3;}
	.reference{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;}.caption{position:absolute;z-index:3;left:8%;bottom:17%;margin:0;color:#89a9a8;font:9px Arial,sans-serif;letter-spacing:.08em;pointer-events:none;}
	.tools{display:flex;justify-content:space-between;gap:18px;padding:18px 0;border-bottom:1px solid #bed2c82e;}.tools>div{display:flex;gap:7px;flex-wrap:wrap;}
	button{border:1px solid #a8c2b44a;background:transparent;color:#b7cebf;padding:12px 15px;font:10px/1.3 Arial,sans-serif;cursor:pointer;}button:hover:not(:disabled),button[aria-pressed=true]{background:#c7d5c3;color:#1d3439;border-color:#c7d5c3;}button:disabled{opacity:.35;cursor:default;}button:focus-visible,input:focus-visible{outline:2px solid #ede9b9;outline-offset:4px;}
	.references{display:flex;justify-content:space-between;align-items:center;gap:18px;padding:17px 0 0;font:10px Arial,sans-serif;color:#a4beb5;}.references label{display:flex;align-items:center;gap:10px;}.references input{accent-color:#bdcdad;}.references button{font-size:9px;padding:9px 10px;}.explanation{font:10px/1.7 Arial,sans-serif;color:#819f9c;margin:15px 0 0;max-width:700px;}
	@media(max-width:600px){.tools{display:block;}.tools>div+div{margin-top:9px;}.glass-label{font-size:6px;inset:16px;}.glass :global(.status){font-size:6px;left:9px;bottom:8px;}.caption{font-size:6px;}.references{align-items:flex-start;flex-wrap:wrap;}.explanation{font-size:9px;}}
</style>
