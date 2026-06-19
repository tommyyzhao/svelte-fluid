<script lang="ts">
	import { GasFlare, Venturi, Karman, TeslaValve } from '$lib/index.js';
	import Maze from '../../obstruction-demos/Maze.svelte';
	import Airfoil from '../../obstruction-demos/Airfoil.svelte';
</script>

<svelte:head>
	<title>Flow & obstructions — svelte-fluid</title>
	<meta
		name="description"
		content="Solver-native flow scenes routing around obstructions — airfoil, maze, and channel geometries — alongside the flow-scene presets built on svelte-fluid's WebGL Navier-Stokes engine."
	/>
</svelte:head>

<main class="flow">
	<h1>Flow & obstructions</h1>
	<p class="intro">
		Solver-native flow scenes where the simulation routes around obstructions — an airfoil, a maze,
		a Venturi channel, and a bluff-body wake — rendered alongside the flow-scene presets. Each scene
		is driven directly by the WebGL Navier-Stokes engine, so the dye tracers and recirculation
		emerge from the solver rather than from scripted motion. Scenes activate lazily as they enter the
		viewport.
	</p>

	<div class="grid">
		<figure class="card">
			<div class="stage">
				<GasFlare seed={101} lazy aria-label="GasFlare flow scene" />
			</div>
			<figcaption>GasFlare — hot incompressible jet with scalar buoyancy</figcaption>
		</figure>

		<figure class="card">
			<div class="stage">
				<Venturi seed={102} lazy aria-label="Venturi flow scene" />
			</div>
			<figcaption>Venturi — pressure-drive with visible throat speed-up</figcaption>
		</figure>

		<figure class="card">
			<div class="stage">
				<TeslaValve seed={108} lazy aria-label="Tesla valve flow scene" />
			</div>
			<figcaption>TeslaValve — forward throughflow with bypass recirculation, not a hard stop</figcaption>
		</figure>

		<figure class="card">
			<div class="stage">
				<Maze seed={104} lazy aria-label="Maze flow scene" />
			</div>
			<figcaption>Maze — contained flood-fill with an open bottom exit</figcaption>
		</figure>

		<figure class="card">
			<div class="stage">
				<Karman seed={105} lazy aria-label="Karman vortex street flow scene" />
			</div>
			<figcaption>Karman — pressure-driven cylinder wake with fast dye tracers</figcaption>
		</figure>

		<figure class="card">
			<div class="stage">
				<Airfoil seed={106} lazy aria-label="Airfoil flow scene" />
			</div>
			<figcaption>Airfoil — dye tracers split around a narrow pressure-driven body</figcaption>
		</figure>
	</div>
</main>

<style>
	.flow {
		min-height: 100vh;
		background: #0a0a0a;
		color: #e5e5e5;
		padding: 2rem;
		box-sizing: border-box;
	}

	h1 {
		margin: 0 0 0.5rem;
		font-size: 1.75rem;
	}

	.intro {
		margin: 0 0 2rem;
		max-width: 70ch;
		color: #aaa;
		font-size: 0.95rem;
		line-height: 1.55;
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(480px, 1fr));
		gap: 1.5rem;
	}

	.card {
		margin: 0;
		background: #111;
		border: 1px solid #222;
		border-radius: 8px;
		overflow: hidden;
	}

	.stage {
		width: 100%;
		height: 320px;
	}

	figcaption {
		padding: 0.6rem 0.75rem;
		font-size: 0.8125rem;
		color: #bbb;
	}
</style>
