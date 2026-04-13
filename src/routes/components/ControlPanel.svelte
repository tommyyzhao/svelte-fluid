<script lang="ts">
	// Engine defaults — kept in sync with FluidEngine.DEFAULTS. Used by both
	// the $bindable initializers below and the "Reset to defaults" button.
	const D = {
		curl: 30,
		splatRadius: 0.25,
		splatForce: 6000,
		densityDissipation: 1,
		velocityDissipation: 0.2,
		pressure: 0.8,
		bloomIntensity: 0.8,
		sunraysWeight: 1,
		randomSplatRate: 0,
		randomSplatSwirl: 0,
		shading: true,
		bloom: true,
		sunrays: true,
		colorful: true,
		paused: false,
		dyeResolution: 1024,
		simResolution: 128,
		backColorR: 0,
		backColorG: 0,
		backColorB: 0,
		transparent: false,
		containerShapeType: 'none' as const,
		containerCx: 0.5,
		containerCy: 0.5,
		containerRadius: 0.45,
		containerHalfW: 0.25,
		containerHalfH: 0.25,
		containerCornerRadius: 0.05,
		containerInnerRadius: 0.15,
		containerOuterRadius: 0.40
	} as const;

	let {
		curl = $bindable(D.curl),
		splatRadius = $bindable(D.splatRadius),
		splatForce = $bindable(D.splatForce),
		densityDissipation = $bindable(D.densityDissipation),
		velocityDissipation = $bindable(D.velocityDissipation),
		pressure = $bindable(D.pressure),
		bloomIntensity = $bindable(D.bloomIntensity),
		sunraysWeight = $bindable(D.sunraysWeight),
		randomSplatRate = $bindable(D.randomSplatRate),
		randomSplatSwirl = $bindable(D.randomSplatSwirl),
		shading = $bindable(D.shading),
		bloom = $bindable(D.bloom),
		sunrays = $bindable(D.sunrays),
		colorful = $bindable(D.colorful),
		paused = $bindable(D.paused),
		dyeResolution = $bindable(D.dyeResolution),
		simResolution = $bindable(D.simResolution),
		backColorR = $bindable(D.backColorR),
		backColorG = $bindable(D.backColorG),
		backColorB = $bindable(D.backColorB),
		transparent = $bindable(D.transparent),
		containerShapeType = $bindable(D.containerShapeType),
		containerCx = $bindable(D.containerCx),
		containerCy = $bindable(D.containerCy),
		containerRadius = $bindable(D.containerRadius),
		containerHalfW = $bindable(D.containerHalfW),
		containerHalfH = $bindable(D.containerHalfH),
		containerCornerRadius = $bindable(D.containerCornerRadius),
		containerInnerRadius = $bindable(D.containerInnerRadius),
		containerOuterRadius = $bindable(D.containerOuterRadius),
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
		randomSplatRate?: number;
		randomSplatSwirl?: number;
		shading?: boolean;
		bloom?: boolean;
		sunrays?: boolean;
		colorful?: boolean;
		paused?: boolean;
		dyeResolution?: number;
		simResolution?: number;
		backColorR?: number;
		backColorG?: number;
		backColorB?: number;
		transparent?: boolean;
		containerShapeType?: 'none' | 'circle' | 'frame' | 'roundedRect' | 'annulus';
		containerCx?: number;
		containerCy?: number;
		containerRadius?: number;
		containerHalfW?: number;
		containerHalfH?: number;
		containerCornerRadius?: number;
		containerInnerRadius?: number;
		containerOuterRadius?: number;
		onRandomSplats?: () => void;
	} = $props();

	let copyState = $state<'idle' | 'copied' | 'error'>('idle');
	let copyTimer: ReturnType<typeof setTimeout> | undefined;

	function reset() {
		curl = D.curl;
		splatRadius = D.splatRadius;
		splatForce = D.splatForce;
		densityDissipation = D.densityDissipation;
		velocityDissipation = D.velocityDissipation;
		pressure = D.pressure;
		bloomIntensity = D.bloomIntensity;
		sunraysWeight = D.sunraysWeight;
		randomSplatRate = D.randomSplatRate;
		randomSplatSwirl = D.randomSplatSwirl;
		shading = D.shading;
		bloom = D.bloom;
		sunrays = D.sunrays;
		colorful = D.colorful;
		paused = D.paused;
		dyeResolution = D.dyeResolution;
		simResolution = D.simResolution;
		backColorR = D.backColorR;
		backColorG = D.backColorG;
		backColorB = D.backColorB;
		transparent = D.transparent;
		containerShapeType = D.containerShapeType;
		containerCx = D.containerCx;
		containerCy = D.containerCy;
		containerRadius = D.containerRadius;
		containerHalfW = D.containerHalfW;
		containerHalfH = D.containerHalfH;
		containerCornerRadius = D.containerCornerRadius;
		containerInnerRadius = D.containerInnerRadius;
		containerOuterRadius = D.containerOuterRadius;
	}

	/**
	 * Generate a `<Fluid ... />` snippet that captures only the props
	 * which differ from the engine defaults. Numeric props are formatted
	 * with the same precision shown in the slider readouts.
	 */
	function buildSnippet(): string {
		const lines: string[] = [];
		const fmt = (key: keyof typeof D, value: number | boolean) => {
			if (value === D[key]) return;
			if (typeof value === 'boolean') {
				lines.push(value ? `  ${key}` : `  ${key}={false}`);
			} else if (Number.isInteger(value)) {
				lines.push(`  ${key}={${value}}`);
			} else {
				lines.push(`  ${key}={${Number(value.toFixed(3))}}`);
			}
		};
		fmt('curl', curl);
		fmt('splatRadius', splatRadius);
		fmt('splatForce', splatForce);
		fmt('densityDissipation', densityDissipation);
		fmt('velocityDissipation', velocityDissipation);
		fmt('pressure', pressure);
		fmt('bloomIntensity', bloomIntensity);
		fmt('sunraysWeight', sunraysWeight);
		fmt('randomSplatRate', randomSplatRate);
		fmt('randomSplatSwirl', randomSplatSwirl);
		fmt('shading', shading);
		fmt('bloom', bloom);
		fmt('sunrays', sunrays);
		fmt('colorful', colorful);
		fmt('paused', paused);
		fmt('dyeResolution', dyeResolution);
		fmt('simResolution', simResolution);
		if (backColorR !== D.backColorR || backColorG !== D.backColorG || backColorB !== D.backColorB) {
			lines.push(`  backColor={{ r: ${backColorR}, g: ${backColorG}, b: ${backColorB} }}`);
		}
		fmt('transparent', transparent);
		if (lines.length === 0) return '<Fluid />';
		return ['<Fluid', ...lines, '/>'].join('\n');
	}

	async function copySnippet() {
		const snippet = buildSnippet();
		try {
			await navigator.clipboard.writeText(snippet);
			copyState = 'copied';
		} catch {
			copyState = 'error';
		}
		clearTimeout(copyTimer);
		copyTimer = setTimeout(() => (copyState = 'idle'), 1800);
	}
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
			<input type="range" min="0" max="2" step="0.05" bind:value={sunraysWeight} />
		</label>
		<label>
			<span>randomSplatRate <em>{randomSplatRate.toFixed(1)}</em></span>
			<input type="range" min="0" max="3" step="0.1" bind:value={randomSplatRate} />
		</label>
		<label>
			<span>randomSplatSwirl <em>{randomSplatSwirl}</em></span>
			<input type="range" min="-1000" max="1000" step="50" bind:value={randomSplatSwirl} />
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

	<section>
		<h4>Background</h4>
		<label>
			<span>backColor R <em>{backColorR}</em></span>
			<input type="range" min="0" max="255" step="1" bind:value={backColorR} />
		</label>
		<label>
			<span>backColor G <em>{backColorG}</em></span>
			<input type="range" min="0" max="255" step="1" bind:value={backColorG} />
		</label>
		<label>
			<span>backColor B <em>{backColorB}</em></span>
			<input type="range" min="0" max="255" step="1" bind:value={backColorB} />
		</label>
		<label class="check"><input type="checkbox" bind:checked={transparent} /> transparent</label>
	</section>

	<section>
		<h4>Container shape</h4>
		<label>
			<span>shape</span>
			<select bind:value={containerShapeType}>
				<option value="none">none</option>
				<option value="circle">circle</option>
				<option value="frame">frame</option>
				<option value="roundedRect">roundedRect</option>
				<option value="annulus">annulus</option>
			</select>
		</label>
		{#if containerShapeType !== 'none'}
			<label>
				<span>cx <em>{containerCx.toFixed(2)}</em></span>
				<input type="range" min="0" max="1" step="0.01" bind:value={containerCx} />
			</label>
			<label>
				<span>cy <em>{containerCy.toFixed(2)}</em></span>
				<input type="range" min="0" max="1" step="0.01" bind:value={containerCy} />
			</label>
		{/if}
		{#if containerShapeType === 'circle'}
			<label>
				<span>radius <em>{containerRadius.toFixed(2)}</em></span>
				<input type="range" min="0.05" max="0.5" step="0.01" bind:value={containerRadius} />
			</label>
		{/if}
		{#if containerShapeType === 'frame' || containerShapeType === 'roundedRect'}
			<label>
				<span>halfW <em>{containerHalfW.toFixed(2)}</em></span>
				<input type="range" min="0.05" max="0.45" step="0.01" bind:value={containerHalfW} />
			</label>
			<label>
				<span>halfH <em>{containerHalfH.toFixed(2)}</em></span>
				<input type="range" min="0.05" max="0.45" step="0.01" bind:value={containerHalfH} />
			</label>
		{/if}
		{#if containerShapeType === 'roundedRect'}
			<label>
				<span>cornerRadius <em>{containerCornerRadius.toFixed(2)}</em></span>
				<input type="range" min="0" max="0.15" step="0.005" bind:value={containerCornerRadius} />
			</label>
		{/if}
		{#if containerShapeType === 'annulus'}
			<label>
				<span>innerRadius <em>{containerInnerRadius.toFixed(2)}</em></span>
				<input type="range" min="0" max="0.45" step="0.01" bind:value={containerInnerRadius} />
			</label>
			<label>
				<span>outerRadius <em>{containerOuterRadius.toFixed(2)}</em></span>
				<input type="range" min="0.05" max="0.5" step="0.01" bind:value={containerOuterRadius} />
			</label>
		{/if}
	</section>

	<div class="actions">
		<button type="button" onclick={() => onRandomSplats?.()}>Random Splats</button>
		<button type="button" class="secondary" onclick={reset}>Reset</button>
		<button
			type="button"
			class="secondary"
			onclick={copySnippet}
			aria-live="polite"
		>
			{#if copyState === 'copied'}Copied!{:else if copyState === 'error'}Copy failed{:else}Copy as code{/if}
		</button>
	</div>
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
		max-height: 80vh;
		overflow-y: auto;
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
	.actions {
		display: flex;
		flex-direction: column;
		gap: 6px;
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
	button.secondary {
		background: #1a1a1c;
		border-color: #2c2c30;
		color: #bbb;
	}
	button.secondary:hover {
		background: #232326;
		color: #fff;
	}
</style>
