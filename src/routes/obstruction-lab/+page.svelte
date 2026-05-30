<!--
  TEMPORARY visual-QA gallery for the obstruction presets + demos.
  Renders all 7 current scenes immediately (no lazy) for side-by-side inspection.
  Delete after verification.
-->
<script lang="ts">
	import { GasFlare, Venturi, RiverDelta, TeslaValve } from '$lib/index.js';
	import Maze from '../obstruction-demos/Maze.svelte';
	import Karman from '../obstruction-demos/Karman.svelte';
	import Airfoil from '../obstruction-demos/Airfoil.svelte';
</script>

<svelte:head>
	<title>Obstruction Lab</title>
</svelte:head>

<main class="lab">
	<h1>Obstruction Lab</h1>
	<p class="note">Temporary visual-QA gallery. All seven current scenes render eagerly.</p>

	<div class="grid">
		<figure class="card">
			<div class="stage">
				<GasFlare seed={101} aria-label="GasFlare demo" />
			</div>
			<figcaption>GasFlare — hot incompressible jet with scalar buoyancy</figcaption>
		</figure>

			<figure class="card">
				<div class="stage">
					<Venturi seed={102} aria-label="Venturi demo" />
				</div>
				<div class="diagnostics" aria-label="Venturi diagnostics">
					<span><strong>Drive</strong> pressureGradient x=42</span>
					<span><strong>Contraction</strong> 5.3:1 throat target</span>
					<span><strong>Solver</strong> 2 x 1/120s, viscosity 0.018, wall friction 0.18</span>
				</div>
				<figcaption>Venturi — pressure-drive with visible throat speed-up</figcaption>
			</figure>

		<figure class="card">
			<div class="stage">
				<RiverDelta seed={103} aria-label="RiverDelta demo" />
			</div>
			<figcaption>RiverDelta — faithful branching (continuity)</figcaption>
		</figure>

		<figure class="card">
			<div class="stage">
				<TeslaValve seed={108} aria-label="TeslaValve demo" />
			</div>
			<figcaption>TeslaValve — reference conduit with bypass buckets and slots</figcaption>
		</figure>

		<figure class="card">
			<div class="stage">
				<Maze seed={104} aria-label="Maze demo" />
			</div>
			<figcaption>Maze — faithful flood-fill (single channel)</figcaption>
		</figure>

		<figure class="card">
			<div class="stage">
				<Karman seed={105} aria-label="Karman demo" />
			</div>
			<figcaption>Karman — steady flow source past a cylinder, no random auto splats</figcaption>
		</figure>

		<figure class="card">
			<div class="stage">
				<Airfoil seed={106} aria-label="Airfoil demo" />
			</div>
			<figcaption>Airfoil — narrow body with a persistent speed-field inlet</figcaption>
		</figure>
	</div>
</main>

<style>
	.lab {
		min-height: 100vh;
		background: #0a0a0a;
		color: #e5e5e5;
		padding: 2rem;
		box-sizing: border-box;
	}

	h1 {
		margin: 0 0 0.25rem;
		font-size: 1.5rem;
	}

	.note {
		margin: 0 0 2rem;
		color: #888;
		font-size: 0.875rem;
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

		.diagnostics {
			display: grid;
			grid-template-columns: repeat(3, minmax(0, 1fr));
			gap: 1px;
			border-top: 1px solid #222;
			background: #222;
			font-size: 0.72rem;
			color: #c8d1d6;
		}

		.diagnostics span {
			background: #0e1517;
			padding: 0.55rem 0.65rem;
			line-height: 1.35;
		}

		.diagnostics strong {
			display: block;
			color: #6ee7f2;
			font-weight: 650;
		}

		@media (max-width: 720px) {
			.diagnostics {
				grid-template-columns: 1fr;
			}
		}
	</style>
