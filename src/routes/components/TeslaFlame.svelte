<!--
  Home-page TeslaValve card: the lab's flame-salt jet (`/test/tesla-valve`
  default), not the TeslaValve preset. The inlet pulse and salt-colour cycle
  are driven from the route, so no preset config can express them yet.
-->
<script lang="ts">
	import type { FlowConfig } from '$lib/engine/types.js';
	import Fluid from '$lib/Fluid.svelte';
	import { TESLA_VALVE_CONFIG } from '$lib/presets/registry.js';
	import { startJetPulse } from '../test/tesla-valve/jet-pulse.js';
	import { getTuning } from '../test/tesla-valve/tunings.js';

	let { seed, 'aria-label': ariaLabel }: { seed?: number; 'aria-label'?: string } = $props();

	const { config: lab, pulse: labPulse } = getTuning('flame-jet');
	// Card budget (archive/evidence/tesla-flame-card-20261116, M1 Max, CfT 154): the lab
	// tuning drops the home page from 120 Hz to 30-60 Hz while in view (p95 25-50 ms).
	// Half the grid with half the texel drives keeps the jet and palette: median 8.4 ms,
	// p95 17 ms, no frame over 20 ms. ponytail: promote a pulsed source into the preset
	// before this card gets its own snippet.
	const scale = 0.5;
	const half = (v: { x: number; y: number }) => ({ x: v.x * scale, y: v.y * scale });
	const config = {
		...lab,
		simResolution: 128,
		dyeResolution: 384,
		substeps: 1,
		maxTimeStep: 1 / 120,
		pressureIterations: 60,
		viscosityIterations: 20,
		bloomResolution: 256,
		bloomIterations: 6,
		// Shed pressure iterations if a slower GPU misses 60 Hz with this card in view.
		autoPerformance: true,
		autoPerformanceMinPressureIterations: 24,
		flow: {
			...lab.flow,
			forces: lab.flow.forces!.map((f) => (f.kind === 'pressureGradient' ? { ...f, vector: half(f.vector) } : f)),
			sources: lab.flow.sources!.map((s) => ({ ...s, velocity: half(s.velocity!) }))
		}
	};
	const pulse = labPulse && { ...labPulse, base: labPulse.base * scale, peak: labPulse.peak * scale };
	const valve = TESLA_VALVE_CONFIG.containerShape as { d: string; viewBox: [number, number, number, number] };
	let fluid = $state<Fluid>();
	let flow = $state.raw<FlowConfig>(config.flow);
	let stage = $state<HTMLElement>();
	let visible = $state(false);

	// The rAF clock stops while the card is offscreen; `lazy` already tears the engine down.
	$effect(() => {
		if (!stage) return;
		const io = new IntersectionObserver(([entry]) => (visible = entry.isIntersecting));
		io.observe(stage);
		return () => io.disconnect();
	});

	$effect(() => {
		if (!fluid || !pulse || !visible) return;
		return startJetPulse(config.flow, pulse.base, pulse.peak, fluid.handle, (next) => (flow = next), pulse.palette ?? false, pulse.clockCap);
	});
</script>

<div class="frame">
	<!-- The nozzle sits on the pipe mouth only at 3:1, so letterbox inside the card. -->
	<div class="stage" bind:this={stage}>
		<svg viewBox={valve.viewBox.join(' ')} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
			<path d={valve.d} fill="#000" fill-rule="evenodd" />
		</svg>
		<Fluid
			{...config}
			{flow}
			bind:this={fluid}
			{seed}
			pointerInput={false}
			splatOnHover={false}
			transparent
			lazy
			autoPause
			aria-label={ariaLabel}
		/>
	</div>
</div>

<style>
	/* White walls on a black channel regardless of theme, as on the lab route. */
	.frame {
		height: 100%;
		display: grid;
		place-items: center;
		background: #fff;
		container-type: size;
	}
	.stage {
		position: relative;
		width: min(100cqw, 300cqh);
		aspect-ratio: 3 / 1;
	}
	svg {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
	}
</style>
