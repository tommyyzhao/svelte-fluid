<script lang="ts">
	import {
		Aurora,
		Fluid,
		FrozenSwirl,
		Galaxy,
		InkInWater,
		LavaLamp,
		Plasma
	} from '$lib/index.js';
	import Card from './components/Card.svelte';
	import ControlPanel from './components/ControlPanel.svelte';

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

	type FluidRef = { handle: { randomSplats: (n: number) => void } } | undefined;
	let controlsRef = $state<FluidRef>(undefined);
</script>

<svelte:head>
	<title>svelte-fluid demo</title>
</svelte:head>

<!-- Background hero instance — fills the viewport behind everything else. -->
<div class="hero">
	<Fluid curl={20} bloomIntensity={1.2} initialSplatCount={18} />
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
	</header>

	<section class="grid">
		<Card title="Default" description="Out-of-the-box configuration with bloom + sunrays.">
			<Fluid seed={1234} initialSplatCount={12} />
		</Card>

		<Card title="No bloom, low curl" description="bloom={false} curl={5} densityDissipation={0.4}">
			<Fluid seed={5678} bloom={false} curl={5} densityDissipation={0.4} initialSplatCount={10} />
		</Card>

		<Card title="No shading, big splats" description="shading={false} splatRadius={0.8}">
			<Fluid
				seed={9012}
				shading={false}
				splatRadius={0.8}
				splatForce={9000}
				initialSplatCount={8}
			/>
		</Card>

		<Card title="Slow mo, transparent" description="velocityDissipation={0.05} transparent">
			<Fluid
				seed={3456}
				velocityDissipation={0.05}
				densityDissipation={0.5}
				transparent
				initialSplatCount={14}
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
				<LavaLamp seed={101} />
			</Card>
			<Card title="Plasma" description="Persistent full-spectrum energy field.">
				<Plasma seed={202} />
			</Card>
			<Card title="Ink in Water" description="Dark blue dye blooming on a pale background.">
				<InkInWater seed={303} />
			</Card>
			<Card title="Frozen Swirl" description="A single icy whirlpool that spins itself out.">
				<FrozenSwirl seed={404} />
			</Card>
			<Card title="Aurora" description="Northern-lights ribbons drifting laterally.">
				<Aurora seed={505} />
			</Card>
			<Card title="Galaxy" description="Spiral arms with bloom-lit core.">
				<Galaxy seed={606} />
			</Card>
		</div>
	</section>

	<section class="playground">
		<div class="playground-canvas">
			<Fluid
				bind:this={controlsRef}
				seed={42}
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
				initialSplatCount={15}
			/>
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
			onRandomSplats={() => controlsRef?.handle.randomSplats(10)}
		/>
	</section>

	<footer>
		<p>
			Port of <a
				href="https://github.com/PavelDoGreat/WebGL-Fluid-Simulation"
				rel="noreferrer"
				target="_blank">PavelDoGreat/WebGL-Fluid-Simulation</a
			>. MIT licensed.
		</p>
	</footer>
</main>

<style>
	.hero {
		position: fixed;
		inset: 0;
		z-index: -1;
		opacity: 0.4;
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
		font-size: 2.4rem;
		letter-spacing: -0.02em;
	}
	.tagline {
		margin: 0 0 12px;
		color: #aaa;
		font-size: 1rem;
	}
	.hint {
		margin: 0;
		color: #666;
		font-size: 0.85rem;
	}
	.hint em {
		color: #6cf;
		font-style: normal;
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
	}

	footer {
		text-align: center;
		color: #555;
		font-size: 0.8rem;
	}
	footer a {
		color: #888;
	}
</style>
