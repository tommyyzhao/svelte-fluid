<script lang="ts">
	import { untrack } from 'svelte';
	import MaterialSurface from './MaterialSurface.svelte';
	import { createFoamNetwork, FoamNetworkState, foamReport, foamReportSegments, foamLabels,
		type FoamNetwork, type FoamReport } from './foam-network.js';
	const fallback = new FoamNetworkState();
	let strain = $state(-1), available = $state(false), geometry = $state<FoamReport>(foamReport(fallback));
	let surface = $state<{ wake(): boolean; refresh(): void }>();
	let model: FoamNetwork | undefined;
	let segments = $derived(foamReportSegments(geometry)), labels = $derived(foamLabels(geometry));
	async function factory(device: GPUDevice, format: GPUTextureFormat) {
		const candidate = await createFoamNetwork(device, format, { strain, report: (value) => { geometry = value; } });
		candidate.adoptRest({ strain, branch: geometry.branch, events: geometry.events }); model = candidate; return candidate;
	}
	function change(value: number) {
		if (!Number.isFinite(value)) return;
		const next = Math.max(-1, Math.min(1, value)); if (next === strain) return;
		strain = next; fallback.branch = geometry.branch; fallback.events = geometry.events; fallback.setStrain(strain, true);
		if (!available) geometry = foamReport(fallback);
		const animate = Boolean(surface?.wake()); model?.setStrain(strain, !animate); surface?.refresh();
	}
	function interrupted() { model?.finish(); }
	$effect(() => {
		if (!available) {
			const target = strain;
			untrack(() => { fallback.branch = geometry.branch; fallback.events = geometry.events; fallback.setStrain(target, true); geometry = foamReport(fallback); });
		}
	});
</script>

<div class="foam" data-contact={geometry.contact} data-events={geometry.events}>
	<div class="toolbar"><div class="choices" role="group" aria-label="Boundary geometry"><button type="button" aria-pressed={strain === -1} onclick={() => change(-1)}>Wide frame</button><button type="button" aria-pressed={strain === 0} onclick={() => change(0)}>Square frame</button><button type="button" aria-pressed={strain === 1} onclick={() => change(1)}>Tall frame</button></div><label>Boundary strain <input aria-label="Boundary strain" type="range" min="-1" max="1" step="0.01" value={strain} oninput={(event) => change(event.currentTarget.valueAsNumber)} /><output>{strain.toFixed(2)}</output></label></div>
	<div class="stage">
		<div class="graphics"><MaterialSurface {factory} bind:this={surface} bind:available decorative oninterrupt={interrupted} settleMs={1400} label="A four-cell neighbour exchange" /></div>
		<svg viewBox="-0.82 -0.82 1.64 1.64" aria-hidden="true">
			{#if !available}
				<rect x={-geometry.a} y={-geometry.b} width={2 * geometry.a} height={2 * geometry.b} fill="#25313b" stroke="#838b96" stroke-width=".012" />
				{#each segments as [from, to]}<line x1={from[0]} y1={from[1]} x2={to[0]} y2={to[1]} stroke="#cbd1da" stroke-width=".008" />{/each}
			{/if}
			{#each labels as [x, y], index}<text {x} {y} dominant-baseline="middle" text-anchor="middle">{['A', 'B', 'C', 'D'][index]}</text>{/each}
		</svg>
	</div>
	<div class="readout" aria-live="polite"><div><span>Visible internal contact</span><strong>{geometry.contact === 'fourfold' ? 'Fourfold junction' : geometry.contact === 'BD' ? 'B ↔ D' : 'A ↔ C'}</strong></div><div><span>Neighbour exchanges</span><strong>{geometry.events}</strong></div><p>{!available ? 'Static graph — graphics preparing or unavailable. Native controls still work.' : geometry.contact === 'fourfold' ? 'The old edge has collapsed. This critical fourfold junction is not a stable three-film junction.' : geometry.moving ? 'The boundaries move first. Connectivity changes only when the old internal film collapses.' : 'At rest: three films meet at 120°. No animation is running.'}</p></div>
</div>

<style>
	.foam { color: #e6e2e8; background: #101521; border: 1px solid #ffffff16; }
	.toolbar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 22px; padding: 22px 26px; border-bottom: 1px solid #ffffff14; }
	.choices { display: flex; gap: 7px; } button { border: 1px solid #a995bc38; background: transparent; color: #b5b0be; padding: 8px 11px; border-radius: 3px; font: inherit; font-size: 10px; cursor: pointer; } button[aria-pressed='true'] { border-color: #c2a6c1; color: #eddaeb; background: #bfa8c013; }
	label { display: flex; align-items: center; gap: 12px; font-size: 10px; color: #929aab; } input { accent-color: #b6a7c7; width: 150px; } output { width: 34px; color: #d6c6df; font-variant-numeric: tabular-nums; }
	.stage { position: relative; height: clamp(360px, 47vw, 600px); isolation: isolate; }
	.graphics { position: absolute; inset: 0; pointer-events: none; } .graphics :global(.material) { background: transparent; min-height: 0; } .graphics :global(.status) { display: none; } .graphics :global(.status.error) { display: block; }
	svg { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; } text { fill: #e8e1ed; font-size: .059px; font-family: Georgia, serif; paint-order: stroke; stroke: #10121f; stroke-width: .006; }
	.readout { display: grid; grid-template-columns: auto auto minmax(0, 1fr); align-items: center; gap: 30px; padding: 23px 26px; border-top: 1px solid #ffffff14; } .readout span { display: block; font-size: 8px; text-transform: uppercase; letter-spacing: .08em; color: #747f95; } .readout strong { display: block; margin-top: 8px; font: 400 24px Georgia, serif; color: #d6bcda; } .readout p { max-width: 430px; margin: 0 0 0 auto; font-size: 10px; line-height: 1.8; color: #939aac; }
	:is(button, input):focus-visible { outline: 2px solid #e9c9e7; outline-offset: 4px; }
	@media(max-width: 600px) { .toolbar { padding: 17px; gap: 16px; } label { width: 100%; } input { flex: 1; min-width: 0; } .choices { width: 100%; } .choices button { flex: 1; } .readout { grid-template-columns: 1fr 1fr; gap: 22px; padding: 20px 17px; } .readout p { grid-column: 1 / -1; margin: 0; } .readout strong { font-size: 22px; } .readout span { font-size: 7px; } }
</style>
