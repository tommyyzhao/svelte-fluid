<script lang="ts" module>
	// Engine defaults — kept in sync with FluidEngine.DEFAULTS.
	export const D: {
		curl: number; splatRadius: number; splatForce: number;
		densityDissipation: number; initialDensityDissipation: number;
		initialDensityDissipationDuration: number; velocityDissipation: number;
		pressure: number; bloomIntensity: number; sunraysWeight: number;
		randomSplatRate: number; randomSplatCount: number; randomSplatDx: number;
		randomSplatDy: number; randomSplatSpawnY: number; randomSplatEvenSpacing: boolean;
		randomSplatSwirl: number; randomSplatSpread: number; splatOnHover: boolean;
		shading: boolean; bloom: boolean; sunrays: boolean; colorful: boolean;
		paused: boolean; dyeResolution: number; simResolution: number;
		backColorR: number; backColorG: number; backColorB: number;
		transparent: boolean;
		containerShapeType: 'none' | 'circle' | 'frame' | 'roundedRect' | 'annulus';
		containerCx: number; containerCy: number; containerRadius: number;
		containerHalfW: number; containerHalfH: number; containerCornerRadius: number;
		containerInnerCornerRadius: number; containerInnerRadius: number;
		containerOuterRadius: number; containerOuterHalfW: number;
		containerOuterHalfH: number; containerOuterCornerRadius: number;
		glass: boolean; glassThickness: number; glassRefraction: number;
		glassReflectivity: number; glassChromatic: number;
		reveal: boolean; revealSensitivity: number; revealCurve: number;
		revealFadeBack: boolean; revealAutoReveal: boolean; revealAutoRevealSpeed: number;
		playgroundMode: 'fluid' | 'reveal';
		revealContent: 'text' | 'mosaic';
		revealCoverColor: string;
		revealAccentColor: string;
	} = {
		curl: 30,
		splatRadius: 0.25,
		splatForce: 6000,
		densityDissipation: 1,
		initialDensityDissipation: 1,
		initialDensityDissipationDuration: 0,
		velocityDissipation: 0.2,
		pressure: 0.8,
		bloomIntensity: 0.8,
		sunraysWeight: 1,
		randomSplatRate: 0,
		randomSplatCount: 1,
		randomSplatDx: 0,
		randomSplatDy: 0,
		randomSplatSpawnY: 0.5,
		randomSplatEvenSpacing: false,
		randomSplatSwirl: 0,
		randomSplatSpread: 0.1,
		splatOnHover: false,
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
		containerShapeType: 'none',
		containerCx: 0.5,
		containerCy: 0.5,
		containerRadius: 0.45,
		containerHalfW: 0.25,
		containerHalfH: 0.25,
		containerCornerRadius: 0.05,
		containerInnerCornerRadius: 0.05,
		containerInnerRadius: 0.15,
		containerOuterRadius: 0.40,
		containerOuterHalfW: 0.45,
		containerOuterHalfH: 0.45,
		containerOuterCornerRadius: 0,
		glass: false,
		glassThickness: 0.04,
		glassRefraction: 0.4,
		glassReflectivity: 0.12,
		glassChromatic: 0.15,
		reveal: false,
		revealSensitivity: 0.1,
		revealCurve: 0.25,
		revealFadeBack: true,
		revealAutoReveal: false,
		revealAutoRevealSpeed: 1.0,
		playgroundMode: 'fluid',
		revealContent: 'text',
		revealCoverColor: '#ffffff',
		revealAccentColor: '#0d2952'
	};
</script>

<script lang="ts">
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
		randomSplatCount = $bindable(D.randomSplatCount),
		randomSplatDx = $bindable(D.randomSplatDx),
		randomSplatDy = $bindable(D.randomSplatDy),
		randomSplatSpawnY = $bindable(D.randomSplatSpawnY),
		randomSplatEvenSpacing = $bindable(D.randomSplatEvenSpacing),
		randomSplatSwirl = $bindable(D.randomSplatSwirl),
		randomSplatSpread = $bindable(D.randomSplatSpread),
		initialDensityDissipation = $bindable(D.initialDensityDissipation),
		initialDensityDissipationDuration = $bindable(D.initialDensityDissipationDuration),
		splatOnHover = $bindable(D.splatOnHover),
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
		containerInnerCornerRadius = $bindable(D.containerInnerCornerRadius),
		containerInnerRadius = $bindable(D.containerInnerRadius),
		containerOuterRadius = $bindable(D.containerOuterRadius),
		containerOuterHalfW = $bindable(D.containerOuterHalfW),
		containerOuterHalfH = $bindable(D.containerOuterHalfH),
		containerOuterCornerRadius = $bindable(D.containerOuterCornerRadius),
		glass = $bindable(D.glass),
		glassThickness = $bindable(D.glassThickness),
		glassRefraction = $bindable(D.glassRefraction),
		glassReflectivity = $bindable(D.glassReflectivity),
		glassChromatic = $bindable(D.glassChromatic),
		reveal = $bindable(D.reveal),
		revealSensitivity = $bindable(D.revealSensitivity),
		revealCurve = $bindable(D.revealCurve),
		revealFadeBack = $bindable(D.revealFadeBack),
		revealAutoReveal = $bindable(D.revealAutoReveal),
		revealAutoRevealSpeed = $bindable(D.revealAutoRevealSpeed),
		playgroundMode = $bindable(D.playgroundMode),
		revealContent = $bindable(D.revealContent),
		revealCoverColor = $bindable(D.revealCoverColor),
		revealAccentColor = $bindable(D.revealAccentColor),
		showShapePreview = $bindable(false),
		loadedPreset = '',
		onRandomSplats,
		onShare
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
		randomSplatCount?: number;
		randomSplatDx?: number;
		randomSplatDy?: number;
		randomSplatSpawnY?: number;
		randomSplatEvenSpacing?: boolean;
		randomSplatSwirl?: number;
		randomSplatSpread?: number;
		initialDensityDissipation?: number;
		initialDensityDissipationDuration?: number;
		splatOnHover?: boolean;
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
		containerInnerCornerRadius?: number;
		containerInnerRadius?: number;
		containerOuterRadius?: number;
		containerOuterHalfW?: number;
		containerOuterHalfH?: number;
		containerOuterCornerRadius?: number;
		glass?: boolean;
		glassThickness?: number;
		glassRefraction?: number;
		glassReflectivity?: number;
		glassChromatic?: number;
		reveal?: boolean;
		revealSensitivity?: number;
		revealCurve?: number;
		revealFadeBack?: boolean;
		revealAutoReveal?: boolean;
		revealAutoRevealSpeed?: number;
		playgroundMode?: 'fluid' | 'reveal';
		revealContent?: 'text' | 'mosaic';
		revealCoverColor?: string;
		revealAccentColor?: string;
		showShapePreview?: boolean;
		loadedPreset?: string;
		onRandomSplats?: () => void;
		onShare?: () => void;
	} = $props();

	// ---- Accordion state ----
	type Section = 'physics' | 'splats' | 'visuals' | 'resolution' | 'background' | 'shape' | 'glass' | 'reveal';
	let openSections = $state<Set<Section>>(new Set(['physics']));

	function toggleSection(s: Section) {
		const next = new Set(openSections);
		if (next.has(s)) next.delete(s);
		else next.add(s);
		openSections = next;
	}

	// ---- Change counting per section ----
	function countChanges(checks: [unknown, unknown][]): number {
		return checks.filter(([a, b]) => a !== b).length;
	}

	let physicsChanges = $derived(countChanges([
		[curl, D.curl], [splatRadius, D.splatRadius], [splatForce, D.splatForce],
		[densityDissipation, D.densityDissipation], [velocityDissipation, D.velocityDissipation],
		[pressure, D.pressure], [splatOnHover, D.splatOnHover],
		[initialDensityDissipation, D.initialDensityDissipation],
		[initialDensityDissipationDuration, D.initialDensityDissipationDuration]
	]));
	let splatChanges = $derived(countChanges([
		[randomSplatRate, D.randomSplatRate], [randomSplatCount, D.randomSplatCount],
		[randomSplatSwirl, D.randomSplatSwirl], [randomSplatSpread, D.randomSplatSpread],
		[randomSplatSpawnY, D.randomSplatSpawnY], [randomSplatDx, D.randomSplatDx],
		[randomSplatDy, D.randomSplatDy], [randomSplatEvenSpacing, D.randomSplatEvenSpacing]
	]));
	let visualChanges = $derived(countChanges([
		[shading, D.shading], [bloom, D.bloom], [sunrays, D.sunrays],
		[colorful, D.colorful], [bloomIntensity, D.bloomIntensity],
		[sunraysWeight, D.sunraysWeight]
	]));
	let resolutionChanges = $derived(countChanges([
		[dyeResolution, D.dyeResolution], [simResolution, D.simResolution]
	]));
	let backgroundChanges = $derived(countChanges([
		[backColorR, D.backColorR], [backColorG, D.backColorG],
		[backColorB, D.backColorB], [transparent, D.transparent]
	]));
	let shapeChanges = $derived(countChanges([
		[containerShapeType, D.containerShapeType],
		...(containerShapeType !== 'none' ? [
			[containerCx, D.containerCx] as [unknown, unknown],
			[containerCy, D.containerCy] as [unknown, unknown]
		] : []),
		...(containerShapeType === 'circle' ? [[containerRadius, D.containerRadius] as [unknown, unknown]] : []),
		...(containerShapeType === 'annulus' ? [
			[containerInnerRadius, D.containerInnerRadius] as [unknown, unknown],
			[containerOuterRadius, D.containerOuterRadius] as [unknown, unknown]
		] : [])
	]));
	let glassChanges = $derived(countChanges([
		[glass, D.glass], [glassThickness, D.glassThickness],
		[glassRefraction, D.glassRefraction], [glassReflectivity, D.glassReflectivity],
		[glassChromatic, D.glassChromatic]
	]));
	let revealChanges = $derived(countChanges([
		[revealSensitivity, D.revealSensitivity], [revealCurve, D.revealCurve],
		[revealFadeBack, D.revealFadeBack], [revealAutoReveal, D.revealAutoReveal],
		[revealAutoRevealSpeed, D.revealAutoRevealSpeed]
	]));

	let showCode = $state(false);
	let copyState = $state<'idle' | 'copied' | 'error'>('idle');
	let copyTimer: ReturnType<typeof setTimeout> | undefined;
	let shareState = $state<'idle' | 'copied'>('idle');
	let shareTimer: ReturnType<typeof setTimeout> | undefined;

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
		randomSplatCount = D.randomSplatCount;
		randomSplatDx = D.randomSplatDx;
		randomSplatDy = D.randomSplatDy;
		randomSplatSpawnY = D.randomSplatSpawnY;
		randomSplatEvenSpacing = D.randomSplatEvenSpacing;
		randomSplatSwirl = D.randomSplatSwirl;
		randomSplatSpread = D.randomSplatSpread;
		initialDensityDissipation = D.initialDensityDissipation;
		initialDensityDissipationDuration = D.initialDensityDissipationDuration;
		splatOnHover = D.splatOnHover;
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
		containerInnerCornerRadius = D.containerInnerCornerRadius;
		containerInnerRadius = D.containerInnerRadius;
		containerOuterRadius = D.containerOuterRadius;
		containerOuterHalfW = D.containerOuterHalfW;
		containerOuterHalfH = D.containerOuterHalfH;
		containerOuterCornerRadius = D.containerOuterCornerRadius;
		glass = D.glass;
		glassThickness = D.glassThickness;
		glassRefraction = D.glassRefraction;
		glassReflectivity = D.glassReflectivity;
		glassChromatic = D.glassChromatic;
		reveal = D.reveal;
		revealSensitivity = D.revealSensitivity;
		revealCurve = D.revealCurve;
		revealFadeBack = D.revealFadeBack;
		revealAutoReveal = D.revealAutoReveal;
		revealAutoRevealSpeed = D.revealAutoRevealSpeed;
		revealContent = D.revealContent;
		revealCoverColor = D.revealCoverColor;
		revealAccentColor = D.revealAccentColor;
		playgroundMode = D.playgroundMode;
		showShapePreview = false;
	}

	function buildSnippet(): string {
		if (playgroundMode === 'reveal') return buildRevealSnippet();
		return buildFluidSnippet();
	}

	function buildFluidSnippet(): string {
		const lines: string[] = [];
		const fmt = (key: string, value: number | boolean, def: number | boolean) => {
			if (value === def) return;
			if (typeof value === 'boolean') {
				lines.push(value ? `  ${key}` : `  ${key}={false}`);
			} else if (Number.isInteger(value)) {
				lines.push(`  ${key}={${value}}`);
			} else {
				lines.push(`  ${key}={${Number((value as number).toFixed(3))}}`);
			}
		};
		fmt('curl', curl, D.curl);
		fmt('splatRadius', splatRadius, D.splatRadius);
		fmt('splatForce', splatForce, D.splatForce);
		fmt('densityDissipation', densityDissipation, D.densityDissipation);
		fmt('velocityDissipation', velocityDissipation, D.velocityDissipation);
		fmt('pressure', pressure, D.pressure);
		fmt('bloomIntensity', bloomIntensity, D.bloomIntensity);
		fmt('sunraysWeight', sunraysWeight, D.sunraysWeight);
		fmt('randomSplatRate', randomSplatRate, D.randomSplatRate);
		fmt('randomSplatCount', randomSplatCount, D.randomSplatCount);
		fmt('randomSplatDx', randomSplatDx, D.randomSplatDx);
		fmt('randomSplatDy', randomSplatDy, D.randomSplatDy);
		fmt('randomSplatSpawnY', randomSplatSpawnY, D.randomSplatSpawnY);
		fmt('randomSplatEvenSpacing', randomSplatEvenSpacing, D.randomSplatEvenSpacing);
		fmt('randomSplatSwirl', randomSplatSwirl, D.randomSplatSwirl);
		fmt('randomSplatSpread', randomSplatSpread, D.randomSplatSpread);
		fmt('initialDensityDissipation', initialDensityDissipation, D.initialDensityDissipation);
		fmt('initialDensityDissipationDuration', initialDensityDissipationDuration, D.initialDensityDissipationDuration);
		fmt('splatOnHover', splatOnHover, D.splatOnHover);
		fmt('shading', shading, D.shading);
		fmt('bloom', bloom, D.bloom);
		fmt('sunrays', sunrays, D.sunrays);
		fmt('colorful', colorful, D.colorful);
		fmt('paused', paused, D.paused);
		fmt('dyeResolution', dyeResolution, D.dyeResolution);
		fmt('simResolution', simResolution, D.simResolution);
		if (backColorR !== D.backColorR || backColorG !== D.backColorG || backColorB !== D.backColorB) {
			lines.push(`  backColor={{ r: ${backColorR}, g: ${backColorG}, b: ${backColorB} }}`);
		}
		fmt('transparent', transparent, D.transparent);
		fmt('glass', glass, D.glass);
		fmt('glassThickness', glassThickness, D.glassThickness);
		fmt('glassRefraction', glassRefraction, D.glassRefraction);
		fmt('glassReflectivity', glassReflectivity, D.glassReflectivity);
		fmt('glassChromatic', glassChromatic, D.glassChromatic);
		if (containerShapeType !== 'none') {
			const n = (v: number) => Number(v.toFixed(3));
			if (containerShapeType === 'circle') {
				lines.push(`  containerShape={{ type: 'circle', cx: ${n(containerCx)}, cy: ${n(containerCy)}, radius: ${n(containerRadius)} }}`);
			} else if (containerShapeType === 'frame') {
				const parts = [`type: 'frame', cx: ${n(containerCx)}, cy: ${n(containerCy)}, halfW: ${n(containerHalfW)}, halfH: ${n(containerHalfH)}`];
				if (containerInnerCornerRadius !== 0) parts.push(`innerCornerRadius: ${n(containerInnerCornerRadius)}`);
				if (containerOuterHalfW !== 0.5) parts.push(`outerHalfW: ${n(containerOuterHalfW)}`);
				if (containerOuterHalfH !== 0.5) parts.push(`outerHalfH: ${n(containerOuterHalfH)}`);
				if (containerOuterCornerRadius !== 0) parts.push(`outerCornerRadius: ${n(containerOuterCornerRadius)}`);
				lines.push(`  containerShape={{ ${parts.join(', ')} }}`);
			} else if (containerShapeType === 'roundedRect') {
				lines.push(`  containerShape={{ type: 'roundedRect', cx: ${n(containerCx)}, cy: ${n(containerCy)}, halfW: ${n(containerHalfW)}, halfH: ${n(containerHalfH)}, cornerRadius: ${n(containerCornerRadius)} }}`);
			} else if (containerShapeType === 'annulus') {
				lines.push(`  containerShape={{ type: 'annulus', cx: ${n(containerCx)}, cy: ${n(containerCy)}, innerRadius: ${n(containerInnerRadius)}, outerRadius: ${n(containerOuterRadius)} }}`);
			}
		}
		if (lines.length === 0) return '<Fluid />';
		return ['<Fluid', ...lines, '/>'].join('\n');
	}

	function buildRevealSnippet(): string {
		const lines: string[] = [];
		const fmt = (key: string, value: number | boolean, def: number | boolean) => {
			if (value === def) return;
			if (typeof value === 'boolean') {
				lines.push(value ? `  ${key}` : `  ${key}={false}`);
			} else if (Number.isInteger(value)) {
				lines.push(`  ${key}={${value}}`);
			} else {
				lines.push(`  ${key}={${Number((value as number).toFixed(3))}}`);
			}
		};
		fmt('sensitivity', revealSensitivity, D.revealSensitivity);
		fmt('curve', revealCurve, D.revealCurve);
		fmt('fadeBack', revealFadeBack, D.revealFadeBack);
		fmt('autoReveal', revealAutoReveal, D.revealAutoReveal);
		fmt('autoRevealSpeed', revealAutoRevealSpeed, D.revealAutoRevealSpeed);
		// Compare against FluidReveal defaults, not Fluid defaults.
		fmt('splatRadius', splatRadius, D.splatRadius);
		fmt('curl', curl, D.curl);
		fmt('velocityDissipation', velocityDissipation, D.velocityDissipation);
		const content = '  <div>Your content here</div>';
		if (lines.length === 0) return `<FluidReveal>\n${content}\n</FluidReveal>`;
		return ['<FluidReveal', ...lines, '>', content, '</FluidReveal>'].join('\n');
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
	<!-- Mode toggle -->
	<div class="mode-toggle">
		<button
			class:active={playgroundMode === 'fluid'}
			onclick={() => (playgroundMode = 'fluid')}
		>Fluid</button>
		<button
			class:active={playgroundMode === 'reveal'}
			onclick={() => (playgroundMode = 'reveal')}
		>Reveal</button>
	</div>

	{#if loadedPreset}
		<div class="loaded-preset">
			Loaded: <strong>{loadedPreset}</strong>
			<button class="preset-clear" onclick={reset}>Clear</button>
		</div>
	{/if}

	{#if playgroundMode === 'fluid'}
		<!-- Quick controls — always visible -->
		<section class="quick-controls">
			<label>
				<span>curl <em>{curl}</em></span>
				<input type="range" min="0" max="50" step="1" bind:value={curl} />
			</label>
			<label>
				<span>splatRadius <em>{splatRadius.toFixed(2)}</em></span>
				<input type="range" min="0.05" max="1" step="0.01" bind:value={splatRadius} />
			</label>
			<label>
				<span>densityDissipation <em>{densityDissipation.toFixed(2)}</em></span>
				<input type="range" min="0" max="4" step="0.05" bind:value={densityDissipation} />
			</label>
			<div class="quick-row">
				<label class="check"><input type="checkbox" bind:checked={bloom} /> bloom</label>
				<label class="check"><input type="checkbox" bind:checked={glass} /> glass</label>
			</div>
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
		</section>

		<!-- Accordion sections -->
		<button class="accordion-header" onclick={() => toggleSection('physics')}>
			<span>Physics</span>
			{#if physicsChanges > 0}<span class="badge">{physicsChanges}</span>{/if}
			<span class="chevron" class:open={openSections.has('physics')}></span>
		</button>
		{#if openSections.has('physics')}
			<section class="accordion-body">
				<label>
					<span>splatForce <em>{splatForce}</em></span>
					<input type="range" min="500" max="12000" step="100" bind:value={splatForce} />
				</label>
				<label>
					<span>velocityDissipation <em>{velocityDissipation.toFixed(2)}</em></span>
					<input type="range" min="0" max="4" step="0.05" bind:value={velocityDissipation} />
				</label>
				<label>
					<span>pressure <em>{pressure.toFixed(2)}</em></span>
					<input type="range" min="0" max="1" step="0.01" bind:value={pressure} />
				</label>
				<label class="check"><input type="checkbox" bind:checked={splatOnHover} /> splatOnHover</label>
				<label>
					<span>initialDensityDissipation <em>{initialDensityDissipation.toFixed(2)}</em></span>
					<input type="range" min="0" max="2" step="0.05" bind:value={initialDensityDissipation} />
				</label>
				<label>
					<span>initialDensityDissipationDuration <em>{initialDensityDissipationDuration.toFixed(1)}</em></span>
					<input type="range" min="0" max="5" step="0.1" bind:value={initialDensityDissipationDuration} />
				</label>
			</section>
		{/if}

		<button class="accordion-header" onclick={() => toggleSection('splats')}>
			<span>Random Splats</span>
			{#if splatChanges > 0}<span class="badge">{splatChanges}</span>{/if}
			<span class="chevron" class:open={openSections.has('splats')}></span>
		</button>
		{#if openSections.has('splats')}
			<section class="accordion-body">
				<label>
					<span>randomSplatRate <em>{randomSplatRate.toFixed(1)}</em></span>
					<input type="range" min="0" max="5" step="0.1" bind:value={randomSplatRate} />
				</label>
				<label>
					<span>randomSplatCount <em>{randomSplatCount}</em></span>
					<input type="range" min="1" max="10" step="1" bind:value={randomSplatCount} />
				</label>
				<label>
					<span>randomSplatSwirl <em>{randomSplatSwirl}</em></span>
					<input type="range" min="-1000" max="1000" step="50" bind:value={randomSplatSwirl} />
				</label>
				<label>
					<span>randomSplatSpread <em>{randomSplatSpread.toFixed(2)}</em></span>
					<input type="range" min="0" max="3" step="0.05" bind:value={randomSplatSpread} />
				</label>
				<label>
					<span>randomSplatSpawnY <em>{randomSplatSpawnY.toFixed(2)}</em></span>
					<input type="range" min="0" max="1" step="0.05" bind:value={randomSplatSpawnY} />
				</label>
				<label>
					<span>randomSplatDx <em>{randomSplatDx}</em></span>
					<input type="range" min="-1000" max="1000" step="50" bind:value={randomSplatDx} />
				</label>
				<label>
					<span>randomSplatDy <em>{randomSplatDy}</em></span>
					<input type="range" min="-1000" max="1000" step="50" bind:value={randomSplatDy} />
				</label>
				<label class="check"><input type="checkbox" bind:checked={randomSplatEvenSpacing} /> Even spacing</label>
			</section>
		{/if}

		<button class="accordion-header" onclick={() => toggleSection('visuals')}>
			<span>Visuals</span>
			{#if visualChanges > 0}<span class="badge">{visualChanges}</span>{/if}
			<span class="chevron" class:open={openSections.has('visuals')}></span>
		</button>
		{#if openSections.has('visuals')}
			<section class="accordion-body">
				<label class="check"><input type="checkbox" bind:checked={shading} /> shading</label>
				<label class="check"><input type="checkbox" bind:checked={sunrays} /> sunrays</label>
				<label class="check"><input type="checkbox" bind:checked={colorful} /> colorful</label>
				<label class="check"><input type="checkbox" bind:checked={paused} /> paused</label>
				<label>
					<span>bloomIntensity <em>{bloomIntensity.toFixed(2)}</em></span>
					<input type="range" min="0" max="2" step="0.05" bind:value={bloomIntensity} />
				</label>
				<label>
					<span>sunraysWeight <em>{sunraysWeight.toFixed(2)}</em></span>
					<input type="range" min="0" max="2" step="0.05" bind:value={sunraysWeight} />
				</label>
			</section>
		{/if}

		<button class="accordion-header" onclick={() => toggleSection('resolution')}>
			<span>Resolution</span>
			{#if resolutionChanges > 0}<span class="badge">{resolutionChanges}</span>{/if}
			<span class="chevron" class:open={openSections.has('resolution')}></span>
		</button>
		{#if openSections.has('resolution')}
			<section class="accordion-body">
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
		{/if}

		<button class="accordion-header" onclick={() => toggleSection('background')}>
			<span>Background</span>
			{#if backgroundChanges > 0}<span class="badge">{backgroundChanges}</span>{/if}
			<span class="chevron" class:open={openSections.has('background')}></span>
		</button>
		{#if openSections.has('background')}
			<section class="accordion-body">
				<label>
					<span>R <em>{backColorR}</em></span>
					<input type="range" min="0" max="255" step="1" bind:value={backColorR} />
				</label>
				<label>
					<span>G <em>{backColorG}</em></span>
					<input type="range" min="0" max="255" step="1" bind:value={backColorG} />
				</label>
				<label>
					<span>B <em>{backColorB}</em></span>
					<input type="range" min="0" max="255" step="1" bind:value={backColorB} />
				</label>
				<label class="check"><input type="checkbox" bind:checked={transparent} /> transparent</label>
			</section>
		{/if}

		<button class="accordion-header" onclick={() => toggleSection('shape')}>
			<span>Container Shape</span>
			{#if shapeChanges > 0}<span class="badge">{shapeChanges}</span>{/if}
			<span class="chevron" class:open={openSections.has('shape')}></span>
		</button>
		{#if openSections.has('shape')}
			<section class="accordion-body">
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
				{#if containerShapeType === 'frame'}
					<label>
						<span>innerCornerRadius <em>{containerInnerCornerRadius.toFixed(3)}</em></span>
						<input type="range" min="0" max="0.15" step="0.005" bind:value={containerInnerCornerRadius} />
					</label>
					<label>
						<span>outerHalfW <em>{containerOuterHalfW.toFixed(2)}</em></span>
						<input type="range" min="0.1" max="0.5" step="0.01" bind:value={containerOuterHalfW} />
					</label>
					<label>
						<span>outerHalfH <em>{containerOuterHalfH.toFixed(2)}</em></span>
						<input type="range" min="0.1" max="0.5" step="0.01" bind:value={containerOuterHalfH} />
					</label>
					<label>
						<span>outerCornerRadius <em>{containerOuterCornerRadius.toFixed(3)}</em></span>
						<input type="range" min="0" max="0.2" step="0.005" bind:value={containerOuterCornerRadius} />
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
				{#if containerShapeType !== 'none'}
					<label class="check"><input type="checkbox" bind:checked={showShapePreview} /> Show shape outline</label>
				{/if}
			</section>
		{/if}

		<button class="accordion-header" onclick={() => toggleSection('glass')}>
			<span>Glass</span>
			{#if glassChanges > 0}<span class="badge">{glassChanges}</span>{/if}
			<span class="chevron" class:open={openSections.has('glass')}></span>
		</button>
		{#if openSections.has('glass')}
			<section class="accordion-body">
				{#if !glass}
					<button class="hint-btn" type="button" onclick={() => { glass = true; }}>Enable glass</button>
				{:else}
					<label>
						<span>glassThickness <em>{glassThickness.toFixed(3)}</em></span>
						<input type="range" min="0" max="0.15" step="0.005" bind:value={glassThickness} />
					</label>
					<label>
						<span>glassRefraction <em>{glassRefraction.toFixed(2)}</em></span>
						<input type="range" min="0" max="1" step="0.05" bind:value={glassRefraction} />
					</label>
					<label>
						<span>glassReflectivity <em>{glassReflectivity.toFixed(2)}</em></span>
						<input type="range" min="0" max="1" step="0.05" bind:value={glassReflectivity} />
					</label>
					<label>
						<span>glassChromatic <em>{glassChromatic.toFixed(2)}</em></span>
						<input type="range" min="0" max="1" step="0.05" bind:value={glassChromatic} />
					</label>
				{/if}
			</section>
		{/if}
	{:else}
		<!-- Reveal mode controls -->
		<section>
			<h4>Underlying Content</h4>
			<select bind:value={revealContent}>
				<option value="text">Gradient + Text</option>
				<option value="mosaic">Tile Mosaic</option>
			</select>
		</section>
		<section>
			<h4>Reveal</h4>
			<label>
				<span>Cover color</span>
				<input type="color" bind:value={revealCoverColor} />
			</label>
			<label>
				<span>Accent color</span>
				<input type="color" bind:value={revealAccentColor} />
			</label>
			<label>
				<span>sensitivity <em>{revealSensitivity.toFixed(2)}</em></span>
				<input type="range" min="0.01" max="1" step="0.01" bind:value={revealSensitivity} />
			</label>
			<label>
				<span>curve <em>{revealCurve.toFixed(2)}</em></span>
				<input type="range" min="0.01" max="2" step="0.01" bind:value={revealCurve} />
			</label>
			<label>
				<span>splatRadius <em>{splatRadius.toFixed(2)}</em></span>
				<input type="range" min="0.05" max="1" step="0.01" bind:value={splatRadius} />
			</label>
			<label class="check"><input type="checkbox" bind:checked={revealFadeBack} /> fadeBack</label>
			<label class="check"><input type="checkbox" bind:checked={revealAutoReveal} /> autoReveal</label>
			{#if revealAutoReveal}
				<label>
					<span>autoRevealSpeed <em>{revealAutoRevealSpeed.toFixed(1)}</em></span>
					<input type="range" min="0.1" max="3" step="0.1" bind:value={revealAutoRevealSpeed} />
				</label>
			{/if}
		</section>
		<section>
			<h4>Physics</h4>
			<label>
				<span>curl <em>{curl}</em></span>
				<input type="range" min="0" max="50" step="1" bind:value={curl} />
			</label>
			<label>
				<span>velocityDissipation <em>{velocityDissipation.toFixed(3)}</em></span>
				<input type="range" min="0" max="1" step="0.005" bind:value={velocityDissipation} />
			</label>
		</section>
	{/if}

	<div class="actions">
		{#if playgroundMode === 'fluid'}
			<button type="button" onclick={() => onRandomSplats?.()}>Random Splats</button>
		{/if}
		<button type="button" class="secondary" onclick={reset}>Reset</button>
		<div class="action-row">
			<button
				type="button"
				class="code-toggle"
				class:active={showCode}
				onclick={() => (showCode = !showCode)}
				aria-label="Toggle code preview">&lt;/&gt;</button>
			<button type="button" class="secondary" onclick={() => { onShare?.(); shareState = 'copied'; clearTimeout(shareTimer); shareTimer = setTimeout(() => (shareState = 'idle'), 1800); }} aria-live="polite">
				{#if shareState === 'copied'}Copied!{:else}Share{/if}
			</button>
		</div>
	</div>
	{#if showCode}
		<div class="code-preview">
			<pre><code>{buildSnippet()}</code></pre>
			<button
				class="copy-btn"
				onclick={copySnippet}
				aria-live="polite"
			>
				{#if copyState === 'copied'}Copied!{:else if copyState === 'error'}Failed{:else}Copy{/if}
			</button>
		</div>
	{/if}
</aside>

<style>
	.panel {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 14px;
		background: #141414;
		border: 1px solid #222;
		border-radius: 12px;
		font-size: 0.78rem;
		max-height: 80vh;
		overflow-y: auto;
	}

	/* Mode toggle */
	.mode-toggle {
		display: flex;
		background: #0d0d10;
		border: 1px solid #1f1f24;
		border-radius: 8px;
		padding: 2px;
		gap: 2px;
	}
	.mode-toggle button {
		flex: 1;
		padding: 6px 12px;
		border: none;
		border-radius: 6px;
		background: transparent;
		color: #666;
		cursor: pointer;
		font-size: 0.82rem;
		font-weight: 600;
		transition: all 120ms;
	}
	.mode-toggle button.active {
		background: #1c2a3a;
		color: #cfe;
	}

	.loaded-preset {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px 10px;
		background: #1a1a2e;
		border: 1px solid #2a2a4e;
		border-radius: 6px;
		font-size: 0.72rem;
		color: #8888cc;
	}
	.loaded-preset strong {
		color: #aab;
	}
	.preset-clear {
		margin-left: auto;
		padding: 1px 6px !important;
		font-size: 0.65rem !important;
		border-radius: 4px !important;
	}

	/* Quick controls */
	.quick-controls {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding-bottom: 8px;
		border-bottom: 1px solid #1f1f24;
	}
	.quick-row {
		display: flex;
		gap: 14px;
	}

	/* Accordion */
	.accordion-header {
		display: flex;
		align-items: center;
		gap: 6px;
		width: 100%;
		padding: 7px 4px;
		background: none;
		border: none;
		border-bottom: 1px solid #1a1a1e;
		color: #888;
		cursor: pointer;
		font-size: 0.7rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		text-align: left;
		transition: color 120ms;
	}
	.accordion-header:hover {
		color: #ccc;
	}
	.badge {
		background: #2a3a5a;
		color: #6cf;
		padding: 0 5px;
		border-radius: 8px;
		font-size: 0.6rem;
		font-weight: 700;
		line-height: 1.5;
	}
	.chevron {
		margin-left: auto;
		width: 0;
		height: 0;
		border-left: 4px solid transparent;
		border-right: 4px solid transparent;
		border-top: 5px solid currentColor;
		transition: transform 150ms;
	}
	.chevron.open {
		transform: rotate(180deg);
	}
	.accordion-body {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 6px 0 10px;
	}
	.hint-btn {
		padding: 6px 10px !important;
		font-size: 0.72rem !important;
		font-style: italic;
		color: #888 !important;
		background: #1a1a2e !important;
		border-color: #2a2a4e !important;
	}
	.hint-btn:hover {
		color: #cfe !important;
	}

	h4 {
		margin: 6px 0 4px;
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
	input[type='color'] {
		width: 100%;
		height: 28px;
		border: 1px solid #333;
		border-radius: 6px;
		background: #0a0a0a;
		cursor: pointer;
		padding: 2px;
	}
	.actions {
		display: flex;
		flex-direction: column;
		gap: 6px;
		margin-top: 4px;
		padding-top: 8px;
		border-top: 1px solid #1f1f24;
	}
	.action-row {
		display: flex;
		gap: 6px;
	}
	.action-row button {
		flex: 1;
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
	.code-toggle {
		padding: 8px 12px;
		font-family: monospace;
		font-size: 0.82rem;
		background: transparent;
		border: 1px solid #333;
		border-radius: 8px;
		color: #666;
		cursor: pointer;
		transition: all 120ms;
	}
	.code-toggle:hover,
	.code-toggle.active {
		color: #cce6ff;
		border-color: #555;
	}
	.code-preview {
		position: relative;
		margin-top: 2px;
	}
	.code-preview pre {
		margin: 0;
		padding: 10px 12px;
		background: #0d0d0d;
		border: 1px solid #222;
		border-radius: 6px;
		overflow-x: auto;
		font-size: 0.72rem;
		line-height: 1.5;
		color: #b0c4de;
	}
	.copy-btn {
		position: absolute;
		top: 6px;
		right: 6px;
		padding: 2px 8px !important;
		font-size: 0.65rem !important;
		background: #222 !important;
		border: 1px solid #333 !important;
		border-radius: 3px !important;
		color: #888 !important;
		cursor: pointer;
	}
	.copy-btn:hover {
		color: #fff !important;
		border-color: #555 !important;
	}
</style>
