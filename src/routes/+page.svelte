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
		Plasma
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
	<meta name="description" content="Drop-in WebGL fluid simulation for Svelte 5. Multi-instance, resize-stable, deterministic seeding, seven presets. MIT licensed." />
	<meta property="og:title" content="svelte-fluid" />
	<meta property="og:description" content="WebGL fluid simulation as a Svelte 5 component. Multi-instance, resize-stable, seven hand-tuned presets." />
</svelte:head>

<!-- Background hero instance — fills the viewport behind everything else. -->
<div class="hero" aria-hidden="true">
	<Fluid
		dyeResolution={512}
		simResolution={64}
		bloomIterations={4}
		curl={20}
		bloomIntensity={1.2}
		initialSplatCount={18}
		pointerInput={false}
		aria-label="Decorative background fluid simulation"
	/>
</div>

<main>
	<header>
		<h1>svelte-fluid</h1>
		<p class="tagline">
			WebGL fluid simulation as a Svelte 5 component. Multi-instance,
			resize-stable, deterministic seeding.
		</p>
		<p class="hint">
			Drag inside any canvas. Try resizing the window — every instance
			tears down and reinitializes with the <em>same</em> initial splats
			thanks to the seed prop.
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
		<pre class="code-block"><code>bun add svelte-fluid</code></pre>
		<pre class="code-block"><code>{usageSnippet}</code></pre>
		<p class="caption">
			That's the entire setup — the canvas fills its parent and tracks
			parent size automatically. Seven presets ship out of the box;
			<code>&lt;Fluid /&gt;</code> exposes the full ~28-prop config surface
			for custom physics and visuals.
		</p>
	</section>

	<section class="grid">
		<Card title="Default" description="Out-of-the-box configuration with bloom + sunrays.">
			<Fluid
				seed={1234}
				initialSplatCount={12}
				lazy
				aria-label="Default fluid configuration with bloom and sunrays"
			/>
		</Card>

		<Card title="No bloom, low curl" description="bloom={false} curl={5} densityDissipation={0.4}">
			<Fluid
				seed={5678}
				bloom={false}
				curl={5}
				densityDissipation={0.4}
				initialSplatCount={10}
				lazy
				aria-label="Fluid with bloom disabled and low curl"
			/>
		</Card>

		<Card title="No shading, big splats" description="shading={false} splatRadius={0.8}">
			<Fluid
				seed={9012}
				shading={false}
				splatRadius={0.8}
				splatForce={9000}
				initialSplatCount={8}
				lazy
				aria-label="Fluid with shading disabled and large splats"
			/>
		</Card>

		<Card title="Slow mo, transparent" description="velocityDissipation={0.05} transparent">
			<Fluid
				seed={3456}
				velocityDissipation={0.05}
				densityDissipation={0.5}
				transparent
				initialSplatCount={14}
				lazy
				aria-label="Slow-motion fluid with transparent background"
			/>
		</Card>
	</section>

	<section class="presets">
		<header class="section-header">
			<h2>Presets</h2>
			<p>
				Drop-in wrapper components with hard-coded physics + hand-crafted
				opening splats. Import any of them from <code>svelte-fluid</code>
				and render in a sized container.
			</p>
		</header>
		<div class="grid">
			<Card title="Lava Lamp" description="Slow, lazy warm blobs drifting on a warm-silver background.">
				<LavaLamp seed={101} lazy aria-label="LavaLamp preset: warm blobs on silver" />
			</Card>
			<Card title="Plasma" description="Persistent full-spectrum energy field.">
				<Plasma seed={202} lazy aria-label="Plasma preset: persistent full-spectrum energy field" />
			</Card>
			<Card title="Ink in Water" description="Dark blue dye blooming on a pale background.">
				<InkInWater seed={303} lazy aria-label="Ink in Water preset: dark blue ink on cream" />
			</Card>
			<Card title="Frozen Swirl" description="A single icy whirlpool that spins itself out.">
				<FrozenSwirl seed={404} lazy aria-label="Frozen Swirl preset: single icy whirlpool" />
			</Card>
			<Card title="Aurora" description="Northern-lights ribbons drifting laterally.">
				<Aurora seed={505} lazy aria-label="Aurora preset: northern lights ribbons" />
			</Card>
			<Card title="Circular Fluid" description="Plasma physically confined inside a circular boundary — the simulation enforces the wall.">
				<CircularFluid seed={606} lazy aria-label="Circular Fluid preset: plasma confined inside a circle" />
			</Card>
			<Card title="Frame Fluid" description="Fluid swirls around a rectangular inner cutout — a living picture frame.">
				<FrameFluid seed={707} lazy aria-label="Frame Fluid preset: fluid around rectangular cutout" />
			</Card>
			<Card title="Rounded Frame" description="Frame with rounded inner cutout — innerCornerRadius on FrameFluid.">
				<FrameFluid seed={808} lazy innerCornerRadius={0.06} aria-label="Rounded Frame preset: fluid around rounded rectangular cutout" />
			</Card>
			<Card title="Annular Fluid" description="Ring-vortex fluid confined between two concentric circles.">
				<AnnularFluid seed={909} lazy aria-label="Annular Fluid preset: ring vortex between concentric circles" />
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
	.hero {
		position: fixed;
		inset: 0;
		z-index: -1;
		opacity: 0.32;
	}
	/* Subtle dark veil so foreground text reads against any hero color. */
	.hero::after {
		content: '';
		position: absolute;
		inset: 0;
		background: linear-gradient(180deg, rgba(0, 0, 0, 0.55) 0%, rgba(0, 0, 0, 0.78) 100%);
		pointer-events: none;
	}

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
	.hint {
		margin: 0 0 18px;
		color: #aaa;
		font-size: 0.88rem;
	}
	.hint em {
		color: #6cf;
		font-style: normal;
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

	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
		gap: 18px;
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
	.presets {
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
