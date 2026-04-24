<script lang="ts">
	import FluidStick from '$lib/FluidStick.svelte';

	// Shared tuning knobs — match new FluidStick defaults
	let amplify = $state(2.0);
	let strength = $state(0.95);
	let stickyPressure = $state(0.15);
	let densityDissipation = $state(0.85);
	let splatRadius = $state(1.0);
	let splatForce = $state(6000);
	let autoAnimateSpeed = $state(2.0);
	let autoAnimateDuration = $state(5.0);
	let initialSplatCount = $state(0);
	let maskBlur = $state(4);

	// Increment key to force remount when params change
	let remountKey = $state(0);

	function remount() {
		remountKey++;
	}

	type Preset = {
		amplify: number; strength: number; stickyPressure: number;
		densityDissipation: number; splatRadius: number; splatForce: number;
		autoAnimateSpeed: number; autoAnimateDuration: number;
		initialSplatCount: number; maskBlur: number;
	};

	const presets: Record<string, Preset> = {
		'New defaults': {
			amplify: 2.0, strength: 0.95, stickyPressure: 0.15,
			densityDissipation: 0.85, splatRadius: 1.0, splatForce: 6000,
			autoAnimateSpeed: 2.0, autoAnimateDuration: 5.0,
			initialSplatCount: 0, maskBlur: 4,
		},
		'Old defaults': {
			amplify: 0.5, strength: 0.95, stickyPressure: 0.15,
			densityDissipation: 0.78, splatRadius: 0.6, splatForce: 10000,
			autoAnimateSpeed: 1.0, autoAnimateDuration: 3.5,
			initialSplatCount: 20, maskBlur: 4,
		},
		'High pressure': {
			amplify: 2.0, strength: 0.95, stickyPressure: 0.4,
			densityDissipation: 0.85, splatRadius: 1.0, splatForce: 6000,
			autoAnimateSpeed: 2.0, autoAnimateDuration: 5.0,
			initialSplatCount: 0, maskBlur: 4,
		},
		'Max amplify': {
			amplify: 4.0, strength: 0.95, stickyPressure: 0.2,
			densityDissipation: 0.85, splatRadius: 1.2, splatForce: 6000,
			autoAnimateSpeed: 2.5, autoAnimateDuration: 6.0,
			initialSplatCount: 0, maskBlur: 6,
		},
		'Gentle + long': {
			amplify: 2.0, strength: 0.95, stickyPressure: 0.15,
			densityDissipation: 0.9, splatRadius: 1.2, splatForce: 4000,
			autoAnimateSpeed: 1.5, autoAnimateDuration: 8.0,
			initialSplatCount: 0, maskBlur: 4,
		},
	};

	function applyPreset(name: string) {
		const p = presets[name];
		amplify = p.amplify;
		strength = p.strength;
		stickyPressure = p.stickyPressure;
		densityDissipation = p.densityDissipation;
		splatRadius = p.splatRadius;
		splatForce = p.splatForce;
		autoAnimateSpeed = p.autoAnimateSpeed;
		autoAnimateDuration = p.autoAnimateDuration;
		initialSplatCount = p.initialSplatCount;
		maskBlur = p.maskBlur;
		remount();
	}
</script>

<div class="page">
	<h1>FluidStick Tuning</h1>

	<div class="presets">
		{#each Object.keys(presets) as name}
			<button class="preset-btn" onclick={() => applyPreset(name)}>{name}</button>
		{/each}
	</div>

	<div class="controls">
		<div class="control-group">
			<h3>Sticky Physics</h3>
			<label>amplify: {amplify.toFixed(2)} <input type="range" min="0" max="5" step="0.1" bind:value={amplify} /></label>
			<label>strength: {strength.toFixed(2)} <input type="range" min="0" max="1" step="0.05" bind:value={strength} /></label>
			<label>stickyPressure: {stickyPressure.toFixed(2)} <input type="range" min="0" max="1" step="0.05" bind:value={stickyPressure} /></label>
			<label>densityDissipation: {densityDissipation.toFixed(2)} <input type="range" min="0.3" max="1" step="0.02" bind:value={densityDissipation} /></label>
		</div>
		<div class="control-group">
			<h3>Splat & Animation</h3>
			<label>splatRadius: {splatRadius.toFixed(2)} <input type="range" min="0.1" max="3" step="0.1" bind:value={splatRadius} /></label>
			<label>splatForce: {splatForce} <input type="range" min="1000" max="20000" step="500" bind:value={splatForce} /></label>
			<label>autoAnimateSpeed: {autoAnimateSpeed.toFixed(1)} <input type="range" min="0.5" max="5" step="0.1" bind:value={autoAnimateSpeed} /></label>
			<label>autoAnimateDuration: {autoAnimateDuration.toFixed(1)}s <input type="range" min="1" max="15" step="0.5" bind:value={autoAnimateDuration} /></label>
			<label>initialSplatCount: {initialSplatCount} <input type="range" min="0" max="60" step="1" bind:value={initialSplatCount} /></label>
			<label>maskBlur: {maskBlur} <input type="range" min="0" max="12" step="1" bind:value={maskBlur} /></label>
		</div>
		<button onclick={remount}>Remount (apply all)</button>
	</div>

	<div class="grid">
		{#key remountKey}
			<div class="card">
				<h2>Sticky text — "FLUID"</h2>
				<div class="canvas-wrap">
					<FluidStick
						text="FLUID"
						font="900 120px 'Helvetica Neue', Arial, sans-serif"
						{amplify}
						{strength}
						stickyPressureAmount={stickyPressure}
						{densityDissipation}
						{splatRadius}
						{splatForce}
						{autoAnimateSpeed}
						{autoAnimateDuration}
						{initialSplatCount}
						{maskBlur}
					autoPause={false}
				/>
				</div>
			</div>
			<div class="card">
				<h2>Sticky + circle — "HI"</h2>
				<div class="canvas-wrap">
					<FluidStick
						text="HI"
						font="bold 72px 'Helvetica Neue', Arial, sans-serif"
						maskPadding={0.5}
						containerShape={{ type: 'circle', cx: 0.5, cy: 0.5, radius: 0.45 }}
						{amplify}
						{strength}
						stickyPressureAmount={stickyPressure}
						{densityDissipation}
						{splatRadius}
						{splatForce}
						{autoAnimateSpeed}
						{autoAnimateDuration}
						{initialSplatCount}
						{maskBlur}
					autoPause={false}
				/>
				</div>
			</div>
			<div class="card">
				<h2>Lightning bolt (reference)</h2>
				<div class="canvas-wrap">
					<FluidStick
						d="M55 5 L25 45 L45 45 L20 95 L75 50 L55 50 L80 5 Z"
						{amplify}
						{strength}
						stickyPressureAmount={stickyPressure}
						{densityDissipation}
						{splatRadius}
						{splatForce}
						{autoAnimateSpeed}
						{autoAnimateDuration}
						{initialSplatCount}
						{maskBlur}
					autoPause={false}
				/>
				</div>
			</div>
			<div class="card">
				<h2>Strong pressure (reference)</h2>
				<div class="canvas-wrap">
					<FluidStick
						d="M50 5 L5 95 L95 95 Z"
						stickyPressureAmount={0.5}
						strength={1.0}
						{amplify}
						{densityDissipation}
						{splatRadius}
						{splatForce}
						{autoAnimateSpeed}
						{autoAnimateDuration}
						{initialSplatCount}
						{maskBlur}
					autoPause={false}
				/>
				</div>
			</div>
		{/key}
	</div>
</div>

<style>
	.page {
		padding: 1rem;
		background: #111;
		color: #eee;
		min-height: 100vh;
	}
	h1 { margin: 0 0 1rem; font-size: 1.5rem; }
	.controls {
		display: flex;
		gap: 2rem;
		margin-bottom: 1.5rem;
		flex-wrap: wrap;
		align-items: flex-end;
	}
	.control-group {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}
	.control-group h3 { margin: 0 0 0.3rem; font-size: 0.9rem; color: #aaa; }
	label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.8rem;
		font-family: monospace;
	}
	input[type="range"] { width: 140px; }
	button {
		padding: 0.5rem 1rem;
		background: #333;
		color: #eee;
		border: 1px solid #555;
		border-radius: 4px;
		cursor: pointer;
		align-self: flex-end;
	}
	button:hover { background: #444; }
	.presets {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 1rem;
		flex-wrap: wrap;
	}
	.preset-btn {
		padding: 0.4rem 0.8rem;
		background: #2a4a6a;
		color: #eee;
		border: 1px solid #4a7aaa;
		border-radius: 4px;
		cursor: pointer;
		font-size: 0.75rem;
	}
	.preset-btn:hover { background: #3a5a7a; }
	.grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 1rem;
	}
	.card {
		background: #1a1a1a;
		border: 1px solid #333;
		border-radius: 8px;
		overflow: hidden;
	}
	.card h2 {
		margin: 0;
		padding: 0.5rem 0.75rem;
		font-size: 0.9rem;
		color: #ccc;
		border-bottom: 1px solid #333;
	}
	.canvas-wrap {
		width: 100%;
		aspect-ratio: 16/10;
	}
</style>
