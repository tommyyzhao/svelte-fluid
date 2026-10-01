<script lang="ts">
	import { base } from '$app/paths';
	import '../lab.css';

	const decisions = [
		['Substrate', 'Native WebGPU; vGPU and its route-local solver are removed'],
		['Runtime', 'One stable FluidEngine owns async startup and deterministic device-loss recovery'],
		['Sharing', 'GPUDevice, shader modules, and immutable pipelines are shared; mutable fields are not'],
		['Masks', 'Packed solver stencil at simulation resolution plus visual/sticky coverage at maskResolution'],
		['Updates', 'Off-side resource candidates, memory preflight, and per-instance WebGPU error scopes'],
		['Fallback', 'Capability UI or poster; there is no hidden WebGL backend']
	] as const;

	const deliberateChanges = [
		'Bloom is one separable low-resolution blur instead of a multilevel pyramid.',
		'Sunrays use a direct radial dye integration instead of a separate mask/blur chain.',
		'Glass preserves the composed field and gates highlights by fluid luminance; it avoids a scene copy target.',
		'pressureIterations: 0 means no projection and clears warm-start pressure.',
		'WebGPU capability failure is explicit; unsupported browsers do not receive a second renderer.'
	];
</script>

<svelte:head>
	<title>WebGPU replacement record — svelte-fluid</title>
	<meta name="description" content="The implemented WebGPU replacement architecture and evidence for svelte-fluid." />
</svelte:head>

<main class="webgpu-page replacement-page">
	<header>
		<span class="eyebrow">Implemented architecture · deletion is a feature</span>
		<h1>The migration seam is gone</h1>
		<p class="lede">
			<code>&lt;Fluid&gt;</code> now has one renderer. The production graph uses direct WebGPU because exact lifetime control, validation, and a zero-runtime-dependency package were worth more than retaining an abstraction built for exploration.
		</p>
	</header>

	<section>
		<h2>Settled decisions</h2>
		<div class="record-grid">
			{#each decisions as decision}
				<article><strong>{decision[0]}</strong><span>{decision[1]}</span></article>
			{/each}
		</div>
	</section>

	<section>
		<h2>Evidence policy</h2>
		<p>Historical local ratios are not release claims: the solver graph, mask path, and presentation path changed after those measurements. The reproducible probe reports GPU-complete timing and field sanity from the current production engine on the machine viewing it.</p>
		<a class="canary-link" href="{base}/examples/webgpu/performance">Run the current performance probe →</a>
	</section>

	<section>
		<h2>Intentional visual changes</h2>
		<ul>{#each deliberateChanges as change}<li>{change}</li>{/each}</ul>
	</section>

	<section>
		<h2>Remaining release gates</h2>
		<ul>
			<li>Cross-browser hardware runs on current Chrome, Safari, and Firefox WebGPU implementations.</li>
			<li>Golden statistical envelopes for reveal, distortion, flow palettes, bloom, sunrays, and empty glass.</li>
			<li>Final desktop/mobile visual inspection and recorded workload results on named adapters.</li>
		</ul>
		<a class="canary-link" href="{base}/examples/webgpu/canary">Inspect the demanding canary →</a>
	</section>
</main>

<style>
	.replacement-page section { margin-top: 2rem; }
	.record-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: .7rem; }
	.record-grid article { display: grid; gap: .35rem; padding: .9rem; border: 1px solid rgba(255,255,255,.1); border-radius: .6rem; background: rgba(255,255,255,.025); }
	.record-grid span, section > p, li { color: #aeb8cf; line-height: 1.55; }
	ul { padding-left: 1.2rem; }
	li + li { margin-top: .45rem; }
	.canary-link { display: inline-block; margin-top: .5rem; color: #92b9ff; text-decoration: none; }
</style>
