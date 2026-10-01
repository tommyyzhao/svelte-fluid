<script lang="ts">
	import { onDestroy } from 'svelte';
	import MaterialSurface from './MaterialSurface.svelte';
	import { createAdhesivePigment, type PigmentExperiment } from './capillary-pigment.js';
	import { PIGMENT_SHEET_DOSE, type PigmentView } from './capillary-pigment-model.js';
	let surface = $state<{ refresh(): void; reset(): void; wake(): boolean; suspend(): void }>();
	let model: PigmentExperiment | undefined;
	let available = $state(false), interactive = $state(false), view = $state<PigmentView>('combined');
	let remaining = $state([2, 3, 3]), mobile = $state([PIGMENT_SHEET_DOSE, 0, 0]), attached = $state([0, 0, 0]), cleared = $state([0, 0, 0]), injected = $state([PIGMENT_SHEET_DOSE, 0, 0]);
	let error = $state('');
	let disposed = false, version = 0, measurementVersion = 0, reading = false, readAgain = false, timer: ReturnType<typeof setTimeout> | undefined;
	const colors = ['Ultramarine', 'Vermilion', 'Saffron'];
	async function measure() {
		if (!model || disposed) return;
		if (reading) { readAgain = true; return; }
		reading = true;
		const measuredVersion = measurementVersion;
		try {
			const snapshot = await model.inspect();
			if (!disposed && measuredVersion === measurementVersion) {
				mobile = colors.map((_, c) => snapshot.details[`mobile${c}`]); attached = colors.map((_, c) => snapshot.details[`attached${c}`]);
				cleared = colors.map((_, c) => snapshot.details[`removed${c}`]); injected = colors.map((_, c) => snapshot.details[`injected${c}`]); remaining = [...model.remaining];
			}
		} catch (reason) { if (!disposed && measuredVersion === measurementVersion) error = String(reason); }
		finally { reading = false; if (readAgain && !disposed) { readAgain = false; void measure(); } }
	}
	function readAfterSettling() { clearTimeout(timer); timer = setTimeout(() => { void measure(); }, 5350); }
	async function factory(device: GPUDevice, format: GPUTextureFormat) {
		const created = await createAdhesivePigment(device, format); if (disposed) return created;
		model = created; const resize = created.resize.bind(created);
		created.resize = (width, height) => {
			resize(width, height); const revision = ++version;
			void created.ready().then(() => { if (!disposed && revision === version) { surface?.refresh(); void measure(); } })
				.catch((reason) => { if (!disposed) { error = String(reason); surface?.refresh(); } });
		};
		return created;
	}
	function pour(color: number) {
		if (!model?.pour(color)) return;
		measurementVersion++;
		remaining = [...model.remaining]; surface?.refresh(); void measure();
		if (surface?.wake()) readAfterSettling();
	}
	function clearWash() {
		clearTimeout(timer); surface?.suspend();
		if (!model?.clearWash()) return;
		measurementVersion++;
		surface?.refresh(); void measure();
	}
	function show(value: PigmentView) { view = value; model?.setView(value); surface?.refresh(); void measure(); }
	function reset() { clearTimeout(timer); measurementVersion++; surface?.reset(); remaining = [3, 3, 3]; mobile = [0, 0, 0]; attached = [0, 0, 0]; cleared = [0, 0, 0]; injected = [0, 0, 0]; }
	function fresh() { reset(); pour(0); }
	function comb() { if (surface?.wake()) readAfterSettling(); }
	onDestroy(() => { disposed = true; version++; clearTimeout(timer); });
</script>

<div class="adhesive-proof">
	<div class="plate" onpointermove={comb} role="img" aria-label="A traversable pigment sheet with adhesive INK lettering">
		<MaterialSurface bind:this={surface} bind:available bind:interactive {factory} settleMs={5000}
			label="Move without clicking to pull pigment across the whole sheet. Clear wash reveals the letters that retain color. The letters are adhesive, not walls." />
		<div class="caption" aria-hidden="true"><span>THE SHEET IS OPEN. THE LETTERS HOLD ON.</span><span>{view.toUpperCase()}</span></div>
	</div>
	{#if error}<p class="error" role="alert">Pigment sheet unavailable. {error}</p>{/if}
	<div class="primary-actions"><p>{interactive ? 'Pull the wash across a letter. No click needed.' : 'A still wash. Use the controls to reveal its adhesive letters.'}<small>Then clear the background. Brush the retained color to lift it again.</small></p><button class="reveal" disabled={!available} onclick={clearWash}>Clear wash → reveal the type</button></div>
	<div class="controls">
		<div class="doses" aria-label="Finite sheet pigment reservoirs">{#each colors as name, color}<button class="dose" class:red={color===1} class:gold={color===2} disabled={!available||remaining[color]===0} onclick={()=>pour(color)} aria-label={`Wash with ${name}, ${remaining[color]} doses remaining`}><i aria-hidden="true"></i>{name}<small>{remaining[color]}/3</small></button>{/each}</div>
		<div class="reset"><button disabled={!available} onclick={fresh}>Fresh blue wash ↗</button><button disabled={!available} onclick={reset}>Clean sheet ↺</button></div>
	</div>
	<div class="views" aria-label="Inspect sheet pigment state">{#each ['combined','mobile','attached'] as name}<button disabled={!available} aria-pressed={view===name} onclick={()=>show(name as PigmentView)}>{name==='combined'?'Whole wash':name==='mobile'?'Only mobile pigment':'Only attached pigment'}</button>{/each}</div>
	<details class="ledger"><summary>Every color has an accounted destination <span>injected = mobile + attached + cleared</span></summary>
		<div class="table-scroll"><table><thead><tr><th>Relative units</th><th>Injected</th><th>Mobile</th><th>Attached</th><th>Cleared</th></tr></thead><tbody>{#each colors as name,c}<tr><th>{name}</th><td>{injected[c].toFixed(1)}</td><td>{mobile[c].toFixed(1)}</td><td>{attached[c].toFixed(1)}</td><td>{cleared[c].toFixed(1)}</td></tr>{/each}</tbody></table></div>
		<p>Finite pigment is transported, held at glyph sites, or explicitly cleared from non-adhesive areas. Nothing is silently deleted. Readouts update after settling and on controls, not by continuous GPU readback.</p>
	</details>
</div>

<style>
	.adhesive-proof { color:#172b46; font-family:Arial,sans-serif; }
	.plate { position:relative;aspect-ratio:2;background:#e5ddca;isolation:isolate;user-select:none;-webkit-user-select:none; }
	.plate :global(.material) { min-height:0;background:transparent; }.plate :global(.status) { font-size:8px;left:20px;bottom:12px;background:#e5ddcaee;color:#526075; }
	.caption { position:absolute;inset:18px 20px auto;display:flex;justify-content:space-between;font:8px/1.4 Arial,sans-serif;letter-spacing:.1em;pointer-events:none;color:#566777; }
	.primary-actions { display:flex;align-items:center;justify-content:space-between;gap:20px;padding:23px 0;border-bottom:1px solid #172b4626; }.primary-actions p { margin:0;font-size:12px;line-height:1.6; }.primary-actions small { display:block;font-size:10px;color:#74818a;margin-top:4px; }
	button { font:10px/1.5 Arial,sans-serif;border:1px solid #172b4633;padding:11px 14px;background:transparent;color:inherit;cursor:pointer; }button:disabled { opacity:.35;cursor:default; }button:hover:not(:disabled) { border-color:currentColor; }button:focus-visible,summary:focus-visible { outline:2px solid #365bcc;outline-offset:4px; }.reveal { background:#2348ad;color:#f5eee1;border-color:#2348ad;padding:14px 19px;flex-shrink:0; }
	.controls { display:flex;justify-content:space-between;gap:15px;padding:18px 0; }.doses,.reset { display:flex;gap:7px;flex-wrap:wrap; }.dose { display:flex;align-items:center;gap:8px; }.dose i { width:9px;height:9px;border-radius:50%;background:#214bd1; }.dose.red i { background:#d14935; }.dose.gold i { background:#d7a226; }.dose small { font-size:9px;color:#75818b; }.reset button { font-size:9px; }
	.views { display:flex;gap:5px;flex-wrap:wrap;border-top:1px solid #172b4626;border-bottom:1px solid #172b4626;padding:14px 0; }.views button { border-color:transparent;padding:8px 11px; }.views button[aria-pressed=true] { background:#172b46;color:#f5eee1; }
	.ledger { margin-top:20px;font-size:10px;color:#64727e; }.ledger summary { cursor:pointer;line-height:1.8; }.ledger summary span { margin-left:12px;color:#879097;font-size:9px; }.table-scroll { overflow-x:auto; }table { border-collapse:collapse;width:100%;margin:16px 0;font-size:10px; }th,td { text-align:right;padding:9px 10px;border-bottom:1px solid #172b4618;font-variant-numeric:tabular-nums; }th:first-child { text-align:left;font-weight:400; }thead th { font-weight:400;color:#879097; }.ledger p { font-size:9px;line-height:1.7; }.error { color:#a33a29;font-size:11px; }
	@media(max-width:700px) { .primary-actions { display:block; }.reveal { margin-top:14px;width:100%; }.controls { display:block; }.doses { display:grid;grid-template-columns:1fr 1fr 1fr;gap:5px; }.dose { padding:10px 7px;gap:5px;font-size:8px; }.dose i { width:7px;height:7px; }.dose small { font-size:7px; }.reset { margin-top:12px; }.reset button { flex:1; }.caption { inset:10px 12px auto;font-size:5px; }.plate :global(.status) { font-size:6px;left:12px;bottom:6px; }.ledger summary span { display:block;margin-left:0; } }
</style>
