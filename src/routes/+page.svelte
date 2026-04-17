<script lang="ts">
	import {
		AnnularFluid,
		Aurora,
		CircularFluid,
		Fluid,
		FrameFluid,
		FrozenSwirl,
		InkInWater,
		LavaLamp,
		Plasma,
		SvgPathFluid
	} from '$lib/index.js';
	import Card from './components/Card.svelte';
	import ControlPanel from './components/ControlPanel.svelte';
	import ShapePreview from './components/ShapePreview.svelte';

	// Live-bound config for the controls instance.
	let curl = $state(30);
	let splatRadius = $state(0.25);
	let splatForce = $state(6000);
	let densityDissipation = $state(1);
	let velocityDissipation = $state(0.2);
	let pressure = $state(0.8);
	let bloomIntensity = $state(0.8);
	let sunraysWeight = $state(1);
	let shading = $state(true);
	let bloom = $state(true);
	let sunrays = $state(true);
	let colorful = $state(true);
	let paused = $state(false);
	let dyeResolution = $state(1024);
	let simResolution = $state(128);
	let randomSplatRate = $state(0);
	let randomSplatSwirl = $state(0);
	let backColorR = $state(0);
	let backColorG = $state(0);
	let backColorB = $state(0);
	let transparent = $state(false);
	let containerShapeType = $state<'none' | 'circle' | 'frame' | 'roundedRect' | 'annulus'>('none');
	let containerCx = $state(0.5);
	let containerCy = $state(0.5);
	let containerRadius = $state(0.45);
	let containerHalfW = $state(0.25);
	let containerHalfH = $state(0.25);
	let containerCornerRadius = $state(0.05);
	let containerInnerCornerRadius = $state(0.05);
	let containerInnerRadius = $state(0.15);
	let containerOuterRadius = $state(0.40);
	let containerOuterHalfW = $state(0.45);
	let containerOuterHalfH = $state(0.45);
	let containerOuterCornerRadius = $state(0.0);
	let showShapePreview = $state(false);
	let canvasWidth = $state(0);
	let canvasHeight = $state(0);

	let containerShape = $derived.by(() => {
		if (containerShapeType === 'circle') return { type: 'circle' as const, cx: containerCx, cy: containerCy, radius: containerRadius };
		if (containerShapeType === 'frame') return { type: 'frame' as const, cx: containerCx, cy: containerCy, halfW: containerHalfW, halfH: containerHalfH, innerCornerRadius: containerInnerCornerRadius, outerHalfW: containerOuterHalfW, outerHalfH: containerOuterHalfH, outerCornerRadius: containerOuterCornerRadius };
		if (containerShapeType === 'roundedRect') return { type: 'roundedRect' as const, cx: containerCx, cy: containerCy, halfW: containerHalfW, halfH: containerHalfH, cornerRadius: containerCornerRadius };
		if (containerShapeType === 'annulus') return { type: 'annulus' as const, cx: containerCx, cy: containerCy, innerRadius: containerInnerRadius, outerRadius: containerOuterRadius };
		return undefined;
	});

	let backColor = $derived({ r: backColorR, g: backColorG, b: backColorB });

	type FluidRef = { handle: { randomSplats: (n: number) => void } } | undefined;
	let controlsRef = $state<FluidRef>(undefined);

	// Code snippet shown in the get-started block. Built from string
	// concatenation so the Svelte HTML parser does not see a literal
	// closing tag inside this top-level scripting context.
	const SCRIPT_OPEN = '<' + 'script lang="ts">';
	const SCRIPT_CLOSE = '<' + '/script>';
	const usageSnippet = [
		SCRIPT_OPEN,
		"  import { Fluid, LavaLamp } from 'svelte-fluid';",
		SCRIPT_CLOSE,
		'',
		'<div style="height: 100vh"><LavaLamp /></div>'
	].join('\n');
</script>

<svelte:head>
	<title>svelte-fluid — WebGL fluid simulation as a Svelte 5 component</title>
	<meta name="description" content="Drop-in WebGL fluid simulation for Svelte 5. Multi-instance, resize-stable, deterministic seeding, eight presets. MIT licensed." />
	<meta property="og:title" content="svelte-fluid" />
	<meta property="og:description" content="WebGL fluid simulation as a Svelte 5 component. Multi-instance, resize-stable, eight hand-tuned presets." />
</svelte:head>

<main>
	<header>
		<h1>svelte-fluid</h1>
		<p class="tagline">
			WebGL fluid simulation as a Svelte 5 component. Multi-instance,
			resize-stable, deterministic seeding.
		</p>
		<nav class="header-links" aria-label="Project links">
			<a href="https://github.com/tommyyzhao/svelte-fluid" rel="noreferrer" target="_blank">
				GitHub
			</a>
			<span aria-hidden="true">·</span>
			<a
				href="https://github.com/tommyyzhao/svelte-fluid#readme"
				rel="noreferrer"
				target="_blank">README</a
			>
			<span aria-hidden="true">·</span>
			<a
				href="https://github.com/tommyyzhao/svelte-fluid/tree/main/docs"
				rel="noreferrer"
				target="_blank">Docs</a
			>
			<span aria-hidden="true">·</span>
			<a
				href="https://github.com/tommyyzhao/svelte-fluid/blob/main/docs/contributing.md"
				rel="noreferrer"
				target="_blank">Contribute</a
			>
		</nav>
	</header>

	<section class="get-started" aria-labelledby="get-started-heading">
		<h2 id="get-started-heading">Get started</h2>
		<pre class="code-block"><code>npm install svelte-fluid</code></pre>
		<pre class="code-block"><code>{usageSnippet}</code></pre>
		<p class="caption">
			The canvas fills its parent automatically. Eight presets ship out of the box;
			<code>&lt;Fluid /&gt;</code> exposes 40+ props for custom physics and visuals.
		</p>
	</section>

	<section class="presets">
		<header class="section-header">
			<h2>Presets</h2>
			<p>
				Ready-made components you can drop in with zero configuration.
				Each one pins its own physics, visuals, and opening splats.
			</p>
		</header>
		<div class="grid-2col">
			<Card title="Lava Lamp" description="Warm blobs drifting lazily on a silver background.">
				<LavaLamp seed={101} lazy aria-label="LavaLamp preset" />
			</Card>
			<Card title="Plasma" description="Persistent full-spectrum energy field.">
				<Plasma seed={202} lazy aria-label="Plasma preset" />
			</Card>
			<Card title="Ink in Water" description="Blue dye blooming on a pale background.">
				<InkInWater seed={303} lazy aria-label="Ink in Water preset" />
			</Card>
			<Card title="Frozen Swirl" description="A single icy whirlpool that spins itself out.">
				<FrozenSwirl seed={404} lazy aria-label="Frozen Swirl preset" />
			</Card>
			<Card title="Aurora" description="Northern-lights ribbons drifting laterally.">
				<Aurora seed={505} lazy aria-label="Aurora preset" />
			</Card>
		</div>
	</section>

	<section class="examples">
		<header class="section-header">
			<h2>Configuration</h2>
			<p>
				Every prop on <code>&lt;Fluid /&gt;</code> is optional.
				A few combinations to show the range.
			</p>
		</header>
		<div class="grid-2col">
			<Card title="Default" description="Out-of-the-box look with bloom, sunrays, and shading.">
				<Fluid
					seed={1234}
					initialSplatCount={12}
					splatOnHover
					lazy
					aria-label="Default fluid configuration"
				/>
			</Card>

			<Card title="Flat + soft" description="Bloom off, low curl, faster dye fade.">
				<Fluid
					seed={5678}
					bloom={false}
					curl={5}
					densityDissipation={0.4}
					initialSplatCount={10}
					splatOnHover
					lazy
					aria-label="Flat fluid with low curl"
				/>
			</Card>

			<Card title="Bold splats" description="Shading off, oversized splats, high force.">
				<Fluid
					seed={9012}
					shading={false}
					splatRadius={0.8}
					splatForce={9000}
					initialSplatCount={8}
					splatOnHover
					lazy
					aria-label="Fluid with large bold splats"
				/>
			</Card>

			<Card title="Slow + transparent" description="Low velocity dissipation on a transparent canvas.">
				<Fluid
					seed={3456}
					velocityDissipation={0.05}
					densityDissipation={0.5}
					transparent
					initialSplatCount={14}
					splatOnHover
					lazy
					aria-label="Slow-motion transparent fluid"
				/>
			</Card>
		</div>

		<header class="section-header subsection-header">
			<h3>Container shapes</h3>
			<p>
				Masks confine the simulation to a region.
				Four analytical shapes plus arbitrary SVG paths are built in.
			</p>
		</header>
		<div class="grid-2col">
			<Card title="Circle" description="Plasma confined inside a circular boundary.">
				<CircularFluid seed={606} lazy aria-label="Circular fluid shape demo" />
			</Card>
			<Card title="Frame" description="Fluid around a rectangular inner cutout.">
				<FrameFluid seed={707} lazy aria-label="Frame fluid shape demo" />
			</Card>
			<Card title="Annulus" description="Ring-vortex fluid between two concentric circles.">
				<AnnularFluid seed={909} lazy aria-label="Annular fluid shape demo" />
			</Card>
			<Card title="Rounded frame" description="Same frame with rounded inner corners via innerCornerRadius.">
				<FrameFluid seed={808} lazy innerCornerRadius={0.06} aria-label="Rounded frame shape demo" />
			</Card>
			<Card title="SVG path" description="Fluid confined to an arbitrary SVG star shape via mask texture.">
				<SvgPathFluid seed={1010} lazy aria-label="SVG path fluid shape demo" />
			</Card>
		</div>
	</section>

	<section class="playground-section">
		<header class="section-header">
			<h2>Playground</h2>
			<p>
				Tweak any parameter live — changes apply instantly via
				<code>setConfig()</code> without remounting the engine.
			</p>
		</header>
	<div class="playground">
		<div class="playground-canvas" bind:clientWidth={canvasWidth} bind:clientHeight={canvasHeight}>
			<Fluid
				bind:this={controlsRef}
				seed={42}
				lazy
				aria-label="Interactive playground fluid simulation, controlled by the panel below"
				{curl}
				{splatRadius}
				{splatForce}
				{densityDissipation}
				{velocityDissipation}
				{pressure}
				{bloomIntensity}
				{sunraysWeight}
				{shading}
				{bloom}
				{sunrays}
				{colorful}
				{paused}
				{dyeResolution}
				{simResolution}
				{randomSplatRate}
				{randomSplatSwirl}
				{transparent}
				backColor={backColor}
				containerShape={containerShape}
				initialSplatCount={15}
			/>
			{#if showShapePreview && containerShape}
				<ShapePreview shape={containerShape} width={canvasWidth} height={canvasHeight} />
			{/if}
		</div>
		<ControlPanel
			bind:curl
			bind:splatRadius
			bind:splatForce
			bind:densityDissipation
			bind:velocityDissipation
			bind:pressure
			bind:bloomIntensity
			bind:sunraysWeight
			bind:shading
			bind:bloom
			bind:sunrays
			bind:colorful
			bind:paused
			bind:dyeResolution
			bind:simResolution
			bind:randomSplatRate
			bind:randomSplatSwirl
			bind:backColorR
			bind:backColorG
			bind:backColorB
			bind:transparent
			bind:containerShapeType
			bind:containerCx
			bind:containerCy
			bind:containerRadius
			bind:containerHalfW
			bind:containerHalfH
			bind:containerCornerRadius
			bind:containerInnerCornerRadius
			bind:containerInnerRadius
			bind:containerOuterRadius
			bind:containerOuterHalfW
			bind:containerOuterHalfH
			bind:containerOuterCornerRadius
			bind:showShapePreview
			onRandomSplats={() => controlsRef?.handle.randomSplats(10)}
		/>
	</div>
	</section>

	<footer>
		<div class="footer-links">
			<a href="https://github.com/tommyyzhao/svelte-fluid" rel="noreferrer" target="_blank">
				GitHub
			</a>
			<span aria-hidden="true">·</span>
			<a
				href="https://github.com/tommyyzhao/svelte-fluid/issues"
				rel="noreferrer"
				target="_blank">Issues</a
			>
			<span aria-hidden="true">·</span>
			<a
				href="https://github.com/tommyyzhao/svelte-fluid/blob/main/LICENSE"
				rel="noreferrer"
				target="_blank">MIT License</a
			>
		</div>
		<p class="credit">
			Derivative work of <a
				href="https://github.com/PavelDoGreat/WebGL-Fluid-Simulation"
				rel="noreferrer"
				target="_blank">PavelDoGreat/WebGL-Fluid-Simulation</a
			> by Pavel Dobryakov (c) 2017. Shader sources reused unchanged.
		</p>
	</footer>
</main>

<style>
	main {
		position: relative;
		max-width: 1100px;
		margin: 0 auto;
		padding: 64px 24px;
		display: flex;
		flex-direction: column;
		gap: 48px;
	}

	header {
		text-align: center;
	}
	h1 {
		margin: 0 0 8px;
		font-size: 2.6rem;
		letter-spacing: -0.02em;
		color: #fff;
	}
	.tagline {
		margin: 0 0 12px;
		color: #ddd;
		font-size: 1.05rem;
	}
	.header-links {
		display: flex;
		gap: 10px;
		justify-content: center;
		flex-wrap: wrap;
		font-size: 0.88rem;
	}
	.header-links a {
		color: #cce6ff;
		text-decoration: none;
		border-bottom: 1px dotted rgba(204, 230, 255, 0.4);
	}
	.header-links a:hover {
		color: #fff;
		border-bottom-color: #fff;
	}
	.header-links span {
		color: #555;
	}

	.get-started {
		background: rgba(20, 20, 22, 0.85);
		border: 1px solid #2a2a2e;
		border-radius: 12px;
		padding: 22px 26px;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.get-started h2 {
		margin: 0 0 4px;
		font-size: 1.05rem;
		color: #fff;
		letter-spacing: -0.01em;
	}
	.code-block {
		background: #0d0d10;
		border: 1px solid #1f1f24;
		border-radius: 8px;
		padding: 12px 14px;
		margin: 0;
		overflow-x: auto;
		font-size: 0.82rem;
		line-height: 1.55;
		color: #d6e8ff;
		font-family: 'JetBrains Mono', 'SF Mono', Consolas, monospace;
	}
	.get-started .caption {
		margin: 0;
		color: #999;
		font-size: 0.83rem;
		line-height: 1.5;
	}
	.get-started code {
		background: #1a1a1e;
		padding: 1px 6px;
		border-radius: 4px;
		font-size: 0.78rem;
	}

	.grid-2col {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 18px;
	}

	@media (max-width: 600px) {
		.grid-2col {
			grid-template-columns: 1fr;
		}
	}

	.section-header {
		text-align: left;
		margin-bottom: 4px;
	}
	.section-header h2 {
		margin: 0 0 6px;
		font-size: 1.2rem;
		letter-spacing: -0.01em;
	}
	.section-header p {
		margin: 0;
		color: #888;
		font-size: 0.85rem;
	}
	.section-header code {
		background: #1a1a1a;
		padding: 1px 6px;
		border-radius: 4px;
		font-size: 0.78rem;
	}
	.subsection-header {
		margin-top: 18px;
	}
	.subsection-header h3 {
		margin: 0 0 6px;
		font-size: 1.05rem;
		letter-spacing: -0.01em;
	}
	.presets,
	.examples {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}

	.playground-section {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.playground {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 280px;
		gap: 18px;
	}
	.playground-canvas {
		position: relative;
		min-height: 480px;
		background: #000;
		border: 1px solid #222;
		border-radius: 12px;
		overflow: hidden;
	}

	@media (max-width: 800px) {
		.playground {
			grid-template-columns: 1fr;
		}
		.playground-canvas {
			min-height: 320px;
		}
	}

	footer {
		text-align: center;
		color: #888;
		font-size: 0.85rem;
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding-top: 24px;
		border-top: 1px solid #1c1c1f;
	}
	.footer-links {
		display: flex;
		gap: 10px;
		justify-content: center;
		flex-wrap: wrap;
	}
	.footer-links a {
		color: #cce6ff;
		text-decoration: none;
	}
	.footer-links a:hover {
		color: #fff;
		text-decoration: underline;
	}
	.footer-links span {
		color: #444;
	}
	.credit {
		margin: 0;
		color: #666;
		font-size: 0.78rem;
	}
	.credit a {
		color: #888;
	}
</style>
