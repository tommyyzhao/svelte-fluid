<script lang="ts">
	let {
		curl = $bindable(30),
		splatRadius = $bindable(0.25),
		splatForce = $bindable(6000),
		densityDissipation = $bindable(1),
		velocityDissipation = $bindable(0.2),
		pressure = $bindable(0.8),
		bloomIntensity = $bindable(0.8),
		sunraysWeight = $bindable(1),
		shading = $bindable(true),
		bloom = $bindable(true),
		sunrays = $bindable(true),
		colorful = $bindable(true),
		paused = $bindable(false),
		dyeResolution = $bindable(1024),
		simResolution = $bindable(128),
		onRandomSplats
	}: {
		curl?: number;
		splatRadius?: number;
		splatForce?: number;
		densityDissipation?: number;
		velocityDissipation?: number;
		pressure?: number;
		bloomIntensity?: number;
		sunraysWeight?: number;
		shading?: boolean;
		bloom?: boolean;
		sunrays?: boolean;
		colorful?: boolean;
		paused?: boolean;
		dyeResolution?: number;
		simResolution?: number;
		onRandomSplats?: () => void;
	} = $props();
</script>

<aside class="panel">
	<h3>Controls</h3>

	<section>
		<h4>Physics (hot)</h4>
		<label>
			<span>curl <em>{curl}</em></span>
			<input type="range" min="0" max="50" step="1" bind:value={curl} />
		</label>
		<label>
			<span>splatRadius <em>{splatRadius.toFixed(2)}</em></span>
			<input type="range" min="0.05" max="1" step="0.01" bind:value={splatRadius} />
		</label>
		<label>
			<span>splatForce <em>{splatForce}</em></span>
			<input type="range" min="500" max="12000" step="100" bind:value={splatForce} />
		</label>
		<label>
			<span>densityDissipation <em>{densityDissipation.toFixed(2)}</em></span>
			<input type="range" min="0" max="4" step="0.05" bind:value={densityDissipation} />
		</label>
		<label>
			<span>velocityDissipation <em>{velocityDissipation.toFixed(2)}</em></span>
			<input type="range" min="0" max="4" step="0.05" bind:value={velocityDissipation} />
		</label>
		<label>
			<span>pressure <em>{pressure.toFixed(2)}</em></span>
			<input type="range" min="0" max="1" step="0.01" bind:value={pressure} />
		</label>
		<label>
			<span>bloomIntensity <em>{bloomIntensity.toFixed(2)}</em></span>
			<input type="range" min="0" max="2" step="0.05" bind:value={bloomIntensity} />
		</label>
		<label>
			<span>sunraysWeight <em>{sunraysWeight.toFixed(2)}</em></span>
			<input type="range" min="0" max="1" step="0.05" bind:value={sunraysWeight} />
		</label>
	</section>

	<section>
		<h4>Visuals (recompile)</h4>
		<label class="check"><input type="checkbox" bind:checked={shading} /> shading</label>
		<label class="check"><input type="checkbox" bind:checked={bloom} /> bloom</label>
		<label class="check"><input type="checkbox" bind:checked={sunrays} /> sunrays</label>
		<label class="check"><input type="checkbox" bind:checked={colorful} /> colorful</label>
		<label class="check"><input type="checkbox" bind:checked={paused} /> paused</label>
	</section>

	<section>
		<h4>Resolution (FBO rebuild)</h4>
		<label>
			<span>dyeResolution <em>{dyeResolution}</em></span>
			<select bind:value={dyeResolution}>
				<option value={128}>128</option>
				<option value={256}>256</option>
				<option value={512}>512</option>
				<option value={1024}>1024</option>
			</select>
		</label>
		<label>
			<span>simResolution <em>{simResolution}</em></span>
			<select bind:value={simResolution}>
				<option value={32}>32</option>
				<option value={64}>64</option>
				<option value={128}>128</option>
				<option value={256}>256</option>
			</select>
		</label>
	</section>

	<button type="button" onclick={() => onRandomSplats?.()}>Random Splats</button>
</aside>

<style>
	.panel {
		display: flex;
		flex-direction: column;
		gap: 14px;
		padding: 18px;
		background: #141414;
		border: 1px solid #222;
		border-radius: 12px;
		font-size: 0.78rem;
	}
	h3 {
		margin: 0;
		font-size: 0.95rem;
		font-weight: 600;
	}
	h4 {
		margin: 0 0 6px;
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: #888;
		font-weight: 600;
	}
	section {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	label {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	label.check {
		flex-direction: row;
		align-items: center;
		gap: 8px;
	}
	label > span {
		display: flex;
		justify-content: space-between;
	}
	em {
		font-style: normal;
		color: #6cf;
		font-variant-numeric: tabular-nums;
	}
	input[type='range'] {
		width: 100%;
	}
	select {
		background: #0a0a0a;
		color: #eee;
		border: 1px solid #333;
		border-radius: 6px;
		padding: 4px 8px;
	}
	button {
		background: #1c2a3a;
		color: #cfe;
		border: 1px solid #2a4a6a;
		border-radius: 8px;
		padding: 8px 12px;
		cursor: pointer;
		font-size: 0.85rem;
		font-weight: 500;
		transition: background 120ms;
	}
	button:hover {
		background: #243a52;
	}
</style>
