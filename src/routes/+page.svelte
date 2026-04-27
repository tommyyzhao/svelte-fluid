<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import {
		AnnularFluid,
		Aurora,
		CircularFluid,
		Fluid,
		FluidBackground,
		FluidDistortion,
		FluidReveal,
		FluidStick,
		FluidText,
		FrameFluid,
		FrozenSwirl,
		InkInWater,
		LavaLamp,
		Plasma,
		SvgPathFluid,
		ToroidalTempest
	} from '$lib/index.js';
	import type { ContainerShape, FluidHandle } from '$lib/engine/types.js';
	import Card from './components/Card.svelte';
	import ControlPanel, { D } from './components/ControlPanel.svelte';
	import ShapePreview from './components/ShapePreview.svelte';
	import CopyPageButton from './components/CopyPageButton.svelte';

	// ---- Playground state ----
	let playgroundMode = $state<'fluid' | 'reveal' | 'sticky' | 'distortion'>('fluid');
	let curl = $state(D.curl);
	let splatRadius = $state(D.splatRadius);
	let splatForce = $state(D.splatForce);
	let densityDissipation = $state(D.densityDissipation);
	let velocityDissipation = $state(D.velocityDissipation);
	let pressure = $state(D.pressure);
	let pressureIterations = $state(20);
	let bloomIntensity = $state(D.bloomIntensity);
	let sunraysWeight = $state(D.sunraysWeight);
	let shading = $state(D.shading);
	let bloom = $state(D.bloom);
	let sunrays = $state(D.sunrays);
	let colorful = $state(D.colorful);
	let paused = $state(D.paused);
	let dyeResolution = $state(D.dyeResolution);
	let simResolution = $state(D.simResolution);
	let randomSplatRate = $state(D.randomSplatRate);
	let randomSplatSwirl = $state(D.randomSplatSwirl);
	let backColorR = $state(D.backColorR);
	let backColorG = $state(D.backColorG);
	let backColorB = $state(D.backColorB);
	let transparent = $state(D.transparent);
	let containerShapeType = $state<'none' | 'circle' | 'frame' | 'roundedRect' | 'annulus'>(D.containerShapeType);
	let containerCx = $state(D.containerCx);
	let containerCy = $state(D.containerCy);
	let containerRadius = $state(D.containerRadius);
	let containerHalfW = $state(D.containerHalfW);
	let containerHalfH = $state(D.containerHalfH);
	let containerCornerRadius = $state(D.containerCornerRadius);
	let containerInnerCornerRadius = $state(D.containerInnerCornerRadius);
	let containerInnerRadius = $state(D.containerInnerRadius);
	let containerOuterRadius = $state(D.containerOuterRadius);
	let containerOuterHalfW = $state(D.containerOuterHalfW);
	let containerOuterHalfH = $state(D.containerOuterHalfH);
	let containerOuterCornerRadius = $state(D.containerOuterCornerRadius);
	let showShapePreview = $state(false);
	let glass = $state(D.glass);
	let glassThickness = $state(D.glassThickness);
	let glassRefraction = $state(D.glassRefraction);
	let glassReflectivity = $state(D.glassReflectivity);
	let glassChromatic = $state(D.glassChromatic);
	let reveal = $state(D.reveal);
	let revealSensitivity = $state(D.revealSensitivity);
	let revealCurve = $state(D.revealCurve);
	let revealFadeBack = $state(D.revealFadeBack);
	let revealAutoReveal = $state(D.revealAutoReveal);
	let revealAutoRevealSpeed = $state(D.revealAutoRevealSpeed);
	let revealContent = $state<'text' | 'mosaic'>('text');
	let revealCoverColor = $state(D.revealCoverColor);
	let revealFringeColor = $state(D.revealFringeColor);
	let revealAccentColor = $state(D.revealAccentColor);
	let splatOnHover = $state(D.splatOnHover);
	let randomSplatCount = $state(D.randomSplatCount);
	let randomSplatSpread = $state(D.randomSplatSpread);
	let randomSplatSpawnY = $state(D.randomSplatSpawnY);
	let randomSplatDx = $state(D.randomSplatDx);
	let randomSplatDy = $state(D.randomSplatDy);
	let randomSplatEvenSpacing = $state(D.randomSplatEvenSpacing);
	let initialDensityDissipation = $state(D.initialDensityDissipation);
	let initialDensityDissipationDuration = $state(D.initialDensityDissipationDuration);
	let canvasWidth = $state(0);
	let canvasHeight = $state(0);
	let loadedPreset = $state('');

	// ---- Sticky state ----
	let stickyText = $state('FLUID');
	let stickyFont = $state('900 120px sans-serif');
	let stickyD = $state('');
	let stickyMaskBlur = $state(4);
	let stickyMaskPadding = $state(0.9);
	let stickyStrength = $state(0.95);
	let stickyAmplify = $state(2.0);
	let stickyPressure = $state(0.15);
	let stickyAutoAnimateSpeed = $state(2.0);
	let stickyAutoAnimateDuration = $state(5.0);
	let stickyRemountKey = $state(0);

	// ---- Distortion state ----
	let distortionSrc = $state('/bosch-garden.jpg');
	let distortionStrength = $state(0.4);
	let distortionIntensity = $state(24);
	let distortionAutoDistort = $state(false);
	let distortionAutoDistortSpeed = $state(1.0);
	let distortionInitialSplats = $state(20);
	let distortionRemountKey = $state(0);

	// svgPath shapes loaded via Customize — cleared when the user picks a shape manually.
	let customContainerShape = $state<ContainerShape | null>(null);

	let containerShape = $derived.by(() => {
		if (customContainerShape) return customContainerShape;
		if (containerShapeType === 'circle') return { type: 'circle' as const, cx: containerCx, cy: containerCy, radius: containerRadius };
		if (containerShapeType === 'frame') return { type: 'frame' as const, cx: containerCx, cy: containerCy, halfW: containerHalfW, halfH: containerHalfH, innerCornerRadius: containerInnerCornerRadius, outerHalfW: containerOuterHalfW, outerHalfH: containerOuterHalfH, outerCornerRadius: containerOuterCornerRadius };
		if (containerShapeType === 'roundedRect') return { type: 'roundedRect' as const, cx: containerCx, cy: containerCy, halfW: containerHalfW, halfH: containerHalfH, cornerRadius: containerCornerRadius };
		if (containerShapeType === 'annulus') return { type: 'annulus' as const, cx: containerCx, cy: containerCy, innerRadius: containerInnerRadius, outerRadius: containerOuterRadius };
		return null;
	});

	let backColor = $derived({ r: backColorR, g: backColorG, b: backColorB });

	function hexToRgb01(hex: string) {
		const n = parseInt(hex.slice(1), 16);
		return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
	}
	let revealCoverRgb = $derived(hexToRgb01(revealCoverColor));
	let revealFringeRgb = $derived(hexToRgb01(revealFringeColor));
	let revealAccentRgb = $derived(hexToRgb01(revealAccentColor));

	// Glass requires a container shape. Remember the pre-glass shape
	// so we can restore it when glass is unchecked.
	let shapeBeforeGlass: typeof containerShapeType | null = null;
	$effect(() => {
		if (glass && containerShapeType === 'none') {
			shapeBeforeGlass = 'none';
			containerShapeType = 'roundedRect';
		} else if (!glass && shapeBeforeGlass !== null) {
			containerShapeType = shapeBeforeGlass;
			shapeBeforeGlass = null;
		}
	});

	// Clear svgPath override when the user picks a shape from the dropdown.
	$effect(() => {
		containerShapeType; // track
		if (customContainerShape) customContainerShape = null;
	});

	// Snapshot fluid physics when switching away from fluid mode, restore on switch back.
	let fluidSnapshot: {
		curl: number; velocityDissipation: number; splatRadius: number;
		bloom: boolean; sunrays: boolean; shading: boolean;
		densityDissipation: number; splatOnHover: boolean; pressure: number;
		randomSplatRate: number; randomSplatCount: number;
		randomSplatSwirl: number; randomSplatSpread: number; colorful: boolean;
	} | null = null;
	let prevMode: string = 'fluid';
	$effect(() => {
		const mode = playgroundMode;
		untrack(() => {
			if (mode === prevMode) return;
			const oldMode = prevMode;
			prevMode = mode;
			// Snapshot when leaving fluid mode
			if (oldMode === 'fluid') {
				fluidSnapshot = {
					curl, velocityDissipation, splatRadius, bloom, sunrays, shading,
					densityDissipation, splatOnHover, pressure,
					randomSplatRate, randomSplatCount, randomSplatSwirl, randomSplatSpread, colorful
				};
			}
			// Apply mode-specific defaults
			if (mode === 'reveal') {
				curl = 0; velocityDissipation = 0.98; splatRadius = 0.2;
				bloom = false; sunrays = false; shading = false;
				splatOnHover = false; densityDissipation = D.densityDissipation;
				pressure = 1.0; colorful = true;
				randomSplatRate = 0; randomSplatCount = 1;
				randomSplatSwirl = 0; randomSplatSpread = 0.1;
			} else if (mode === 'sticky') {
				densityDissipation = 0.98; splatRadius = 1.0; curl = 20;
				bloom = false; sunrays = false; shading = true; splatOnHover = true;
				velocityDissipation = 0.2; pressure = D.pressure; colorful = true;
				randomSplatRate = 0.4; randomSplatCount = 3;
				randomSplatSwirl = 500; randomSplatSpread = 2.0;
				stickyRemountKey++;
			} else if (mode === 'distortion') {
				curl = 0; velocityDissipation = 0.97; splatRadius = 1.0;
				bloom = false; sunrays = false; shading = false;
				pressure = 0; densityDissipation = 0.98;
				splatOnHover = false; colorful = false;
				randomSplatRate = 0; randomSplatCount = 1;
				randomSplatSwirl = 0; randomSplatSpread = 0.1;
				distortionRemountKey++;
			} else if (mode === 'fluid' && fluidSnapshot) {
				({
					curl, velocityDissipation, splatRadius, bloom, sunrays, shading,
					densityDissipation, splatOnHover, pressure,
					randomSplatRate, randomSplatCount, randomSplatSwirl, randomSplatSpread, colorful
				} = fluidSnapshot);
				fluidSnapshot = null;
			}
		});
	});

	let controlsRef = $state<{ handle: FluidHandle } | undefined>(undefined);

	// ---- "Customize" / loadConfig ----
	type PlaygroundConfig = Record<string, unknown>;

	function resetAllDefaults() {
		playgroundMode = D.playgroundMode;
		curl = D.curl; splatRadius = D.splatRadius; splatForce = D.splatForce;
		densityDissipation = D.densityDissipation; velocityDissipation = D.velocityDissipation;
		pressure = D.pressure; pressureIterations = 20; bloomIntensity = D.bloomIntensity; sunraysWeight = D.sunraysWeight;
		shading = D.shading; bloom = D.bloom; sunrays = D.sunrays; colorful = D.colorful;
		paused = D.paused; randomSplatRate = D.randomSplatRate; randomSplatCount = D.randomSplatCount;
		randomSplatSwirl = D.randomSplatSwirl; randomSplatSpread = D.randomSplatSpread;
		randomSplatSpawnY = D.randomSplatSpawnY; randomSplatDx = D.randomSplatDx;
		randomSplatDy = D.randomSplatDy; randomSplatEvenSpacing = D.randomSplatEvenSpacing;
		splatOnHover = D.splatOnHover; initialDensityDissipation = D.initialDensityDissipation;
		initialDensityDissipationDuration = D.initialDensityDissipationDuration;
		transparent = D.transparent; glass = D.glass; glassThickness = D.glassThickness;
		glassRefraction = D.glassRefraction; glassReflectivity = D.glassReflectivity;
		glassChromatic = D.glassChromatic; dyeResolution = D.dyeResolution;
		simResolution = D.simResolution; backColorR = D.backColorR; backColorG = D.backColorG;
		backColorB = D.backColorB; containerShapeType = D.containerShapeType;
		containerCx = D.containerCx; containerCy = D.containerCy; containerRadius = D.containerRadius;
		containerHalfW = D.containerHalfW; containerHalfH = D.containerHalfH;
		containerCornerRadius = D.containerCornerRadius;
		containerInnerCornerRadius = D.containerInnerCornerRadius;
		containerInnerRadius = D.containerInnerRadius; containerOuterRadius = D.containerOuterRadius;
		containerOuterHalfW = D.containerOuterHalfW; containerOuterHalfH = D.containerOuterHalfH;
		containerOuterCornerRadius = D.containerOuterCornerRadius;
		revealSensitivity = D.revealSensitivity; revealCurve = D.revealCurve;
		revealFadeBack = D.revealFadeBack; revealAutoReveal = D.revealAutoReveal;
		revealAutoRevealSpeed = D.revealAutoRevealSpeed;
		revealCoverColor = D.revealCoverColor;
		revealFringeColor = D.revealFringeColor;
		revealAccentColor = D.revealAccentColor;
		stickyText = D.stickyText; stickyFont = D.stickyFont; stickyD = D.stickyD;
		stickyMaskBlur = D.stickyMaskBlur; stickyMaskPadding = D.stickyMaskPadding;
		stickyStrength = D.stickyStrength; stickyAmplify = D.stickyAmplify;
		stickyPressure = D.stickyPressure; stickyAutoAnimateSpeed = D.stickyAutoAnimateSpeed;
		stickyAutoAnimateDuration = D.stickyAutoAnimateDuration;
		distortionSrc = D.distortionSrc; distortionStrength = D.distortionStrength;
		distortionIntensity = D.distortionIntensity; distortionAutoDistort = D.distortionAutoDistort;
		distortionAutoDistortSpeed = D.distortionAutoDistortSpeed;
		distortionInitialSplats = D.distortionInitialSplats;
		customContainerShape = null;
		showShapePreview = false; loadedPreset = '';
		fluidSnapshot = null;
		prevMode = D.playgroundMode;
	}

	function loadConfig(config: PlaygroundConfig, name: string) {
		// Reset everything to defaults first, then apply overrides.
		resetAllDefaults();
		loadedPreset = name;
		const targetMode = (config.playgroundMode as 'fluid' | 'reveal' | 'sticky' | 'distortion') ?? 'fluid';
		playgroundMode = targetMode;
		prevMode = targetMode; // prevent snapshot $effect from firing
		if (targetMode === 'reveal') {
			fluidSnapshot = null;
			curl = 0; velocityDissipation = 0.98; splatRadius = 0.2;
			bloom = false; sunrays = false; shading = false;
			splatOnHover = false; densityDissipation = D.densityDissipation;
			pressure = 1.0; colorful = true;
			randomSplatRate = 0; randomSplatCount = 1;
			randomSplatSwirl = 0; randomSplatSpread = 0.1;
		} else if (targetMode === 'sticky') {
			fluidSnapshot = null;
			densityDissipation = 0.98; splatRadius = 1.0; curl = 20;
			bloom = false; sunrays = false; shading = true; splatOnHover = true;
			velocityDissipation = 0.2; pressure = D.pressure; colorful = true;
			randomSplatRate = 0.4; randomSplatCount = 3;
			randomSplatSwirl = 500; randomSplatSpread = 2.0;
			stickyRemountKey++;
		} else if (targetMode === 'distortion') {
			fluidSnapshot = null;
			curl = 0; velocityDissipation = 0.97; splatRadius = 1.0;
			bloom = false; sunrays = false; shading = false;
			pressure = 0; densityDissipation = 0.98;
			splatOnHover = false; colorful = false;
			randomSplatRate = 0; randomSplatCount = 1;
			randomSplatSwirl = 0; randomSplatSpread = 0.1;
			distortionRemountKey++;
		}
		if (config.curl !== undefined) curl = config.curl as number;
		if (config.splatRadius !== undefined) splatRadius = config.splatRadius as number;
		if (config.splatForce !== undefined) splatForce = config.splatForce as number;
		if (config.densityDissipation !== undefined) densityDissipation = config.densityDissipation as number;
		if (config.velocityDissipation !== undefined) velocityDissipation = config.velocityDissipation as number;
		if (config.pressure !== undefined) pressure = config.pressure as number;
		if (config.pressureIterations !== undefined) pressureIterations = config.pressureIterations as number;
		if (config.bloomIntensity !== undefined) bloomIntensity = config.bloomIntensity as number;
		if (config.sunraysWeight !== undefined) sunraysWeight = config.sunraysWeight as number;
		if (config.shading !== undefined) shading = config.shading as boolean;
		if (config.bloom !== undefined) bloom = config.bloom as boolean;
		if (config.sunrays !== undefined) sunrays = config.sunrays as boolean;
		if (config.colorful !== undefined) colorful = config.colorful as boolean;
		if (config.randomSplatRate !== undefined) randomSplatRate = config.randomSplatRate as number;
		if (config.randomSplatCount !== undefined) randomSplatCount = config.randomSplatCount as number;
		if (config.randomSplatSwirl !== undefined) randomSplatSwirl = config.randomSplatSwirl as number;
		if (config.randomSplatSpread !== undefined) randomSplatSpread = config.randomSplatSpread as number;
		if (config.randomSplatSpawnY !== undefined) randomSplatSpawnY = config.randomSplatSpawnY as number;
		if (config.randomSplatDx !== undefined) randomSplatDx = config.randomSplatDx as number;
		if (config.randomSplatDy !== undefined) randomSplatDy = config.randomSplatDy as number;
		if (config.randomSplatEvenSpacing !== undefined) randomSplatEvenSpacing = config.randomSplatEvenSpacing as boolean;
		if (config.splatOnHover !== undefined) splatOnHover = config.splatOnHover as boolean;
		if (config.initialDensityDissipation !== undefined) initialDensityDissipation = config.initialDensityDissipation as number;
		if (config.initialDensityDissipationDuration !== undefined) initialDensityDissipationDuration = config.initialDensityDissipationDuration as number;
		if (config.transparent !== undefined) transparent = config.transparent as boolean;
		if (config.glass !== undefined) glass = config.glass as boolean;
		if (config.glassThickness !== undefined) glassThickness = config.glassThickness as number;
		if (config.glassRefraction !== undefined) glassRefraction = config.glassRefraction as number;
		if (config.glassReflectivity !== undefined) glassReflectivity = config.glassReflectivity as number;
		if (config.glassChromatic !== undefined) glassChromatic = config.glassChromatic as number;
		if (config.dyeResolution !== undefined) dyeResolution = config.dyeResolution as number;
		if (config.simResolution !== undefined) simResolution = config.simResolution as number;
		const bc = config.backColor as { r: number; g: number; b: number } | undefined;
		if (bc) { backColorR = bc.r; backColorG = bc.g; backColorB = bc.b; }
		const cs = config.containerShape as ContainerShape | undefined;
		if (cs && cs.type === 'svgPath') {
			customContainerShape = cs;
		} else if (cs) {
			containerShapeType = cs.type;
			if ('cx' in cs) containerCx = cs.cx ?? D.containerCx;
			if ('cy' in cs) containerCy = cs.cy ?? D.containerCy;
			if (cs.type === 'circle' && 'radius' in cs) containerRadius = cs.radius;
			if ((cs.type === 'frame' || cs.type === 'roundedRect') && 'halfW' in cs) containerHalfW = cs.halfW;
			if ((cs.type === 'frame' || cs.type === 'roundedRect') && 'halfH' in cs) containerHalfH = cs.halfH;
			if (cs.type === 'roundedRect' && 'cornerRadius' in cs) containerCornerRadius = cs.cornerRadius ?? D.containerCornerRadius;
			if (cs.type === 'frame') {
				containerInnerCornerRadius = cs.innerCornerRadius ?? D.containerInnerCornerRadius;
				containerOuterHalfW = cs.outerHalfW ?? D.containerOuterHalfW;
				containerOuterHalfH = cs.outerHalfH ?? D.containerOuterHalfH;
				containerOuterCornerRadius = cs.outerCornerRadius ?? D.containerOuterCornerRadius;
			}
			if (cs.type === 'annulus') {
				containerInnerRadius = cs.innerRadius;
				containerOuterRadius = cs.outerRadius;
			}
		}
		if (config.revealSensitivity !== undefined) revealSensitivity = config.revealSensitivity as number;
		if (config.revealCurve !== undefined) revealCurve = config.revealCurve as number;
		if (config.revealFadeBack !== undefined) revealFadeBack = config.revealFadeBack as boolean;
		if (config.revealAutoReveal !== undefined) revealAutoReveal = config.revealAutoReveal as boolean;
		if (config.revealAutoRevealSpeed !== undefined) revealAutoRevealSpeed = config.revealAutoRevealSpeed as number;
		if (config.revealCoverColor !== undefined) revealCoverColor = config.revealCoverColor as string;
		if (config.revealFringeColor !== undefined) revealFringeColor = config.revealFringeColor as string;
		if (config.revealAccentColor !== undefined) revealAccentColor = config.revealAccentColor as string;
		if (config.stickyText !== undefined) stickyText = config.stickyText as string;
		if (config.stickyFont !== undefined) stickyFont = config.stickyFont as string;
		if (config.stickyD !== undefined) stickyD = config.stickyD as string;
		if (config.stickyMaskBlur !== undefined) stickyMaskBlur = config.stickyMaskBlur as number;
		if (config.stickyMaskPadding !== undefined) stickyMaskPadding = config.stickyMaskPadding as number;
		if (config.stickyStrength !== undefined) stickyStrength = config.stickyStrength as number;
		if (config.stickyAmplify !== undefined) stickyAmplify = config.stickyAmplify as number;
		if (config.stickyPressure !== undefined) stickyPressure = config.stickyPressure as number;
		if (config.stickyAutoAnimateSpeed !== undefined) stickyAutoAnimateSpeed = config.stickyAutoAnimateSpeed as number;
		if (config.stickyAutoAnimateDuration !== undefined) stickyAutoAnimateDuration = config.stickyAutoAnimateDuration as number;
		if (config.distortionSrc !== undefined) distortionSrc = config.distortionSrc as string;
		if (config.distortionStrength !== undefined) distortionStrength = config.distortionStrength as number;
		if (config.distortionIntensity !== undefined) distortionIntensity = config.distortionIntensity as number;
		if (config.distortionAutoDistort !== undefined) distortionAutoDistort = config.distortionAutoDistort as boolean;
		if (config.distortionAutoDistortSpeed !== undefined) distortionAutoDistortSpeed = config.distortionAutoDistortSpeed as number;
		if (config.distortionInitialSplats !== undefined) distortionInitialSplats = config.distortionInitialSplats as number;
		document.getElementById('playground')?.scrollIntoView({ behavior: 'smooth' });
	}

	// ---- URL hash state ----
	// Compact keys keep URLs short. Only non-default values are serialized.
	function serializeState(): string {
		const s: Record<string, unknown> = {};
		const a = (k: string, v: unknown, d: unknown) => { if (v !== d) s[k] = v; };
		a('m', playgroundMode, 'fluid');
		a('cu', curl, D.curl); a('sr', splatRadius, D.splatRadius);
		a('sf', splatForce, D.splatForce); a('dd', densityDissipation, D.densityDissipation);
		a('vd', velocityDissipation, D.velocityDissipation); a('pr', pressure, D.pressure);
		a('bi', bloomIntensity, D.bloomIntensity); a('sw', sunraysWeight, D.sunraysWeight);
		a('sh', shading, D.shading); a('bl', bloom, D.bloom);
		a('sn', sunrays, D.sunrays); a('cf', colorful, D.colorful);
		a('gl', glass, D.glass); a('tr', transparent, D.transparent);
		a('cs', containerShapeType, D.containerShapeType);
		a('br', backColorR, D.backColorR); a('bg', backColorG, D.backColorG);
		a('bb', backColorB, D.backColorB);
		a('rr', randomSplatRate, D.randomSplatRate); a('rn', randomSplatCount, D.randomSplatCount);
		a('rw', randomSplatSwirl, D.randomSplatSwirl); a('rp', randomSplatSpread, D.randomSplatSpread);
		a('ry', randomSplatSpawnY, D.randomSplatSpawnY);
		a('rx', randomSplatDx, D.randomSplatDx); a('rd2', randomSplatDy, D.randomSplatDy);
		a('re', randomSplatEvenSpacing, D.randomSplatEvenSpacing);
		a('oh', splatOnHover, D.splatOnHover);
		a('id', initialDensityDissipation, D.initialDensityDissipation);
		a('it', initialDensityDissipationDuration, D.initialDensityDissipationDuration);
		a('gt', glassThickness, D.glassThickness); a('gf', glassRefraction, D.glassRefraction);
		a('gy', glassReflectivity, D.glassReflectivity); a('gc', glassChromatic, D.glassChromatic);
		a('rs', revealSensitivity, D.revealSensitivity); a('rc', revealCurve, D.revealCurve);
		a('fb', revealFadeBack, D.revealFadeBack); a('ar', revealAutoReveal, D.revealAutoReveal);
		a('as', revealAutoRevealSpeed, D.revealAutoRevealSpeed);
		a('rv', revealContent, D.revealContent);
		a('cc', revealCoverColor, D.revealCoverColor);
		a('fc', revealFringeColor, D.revealFringeColor);
		a('ac', revealAccentColor, D.revealAccentColor);
		// Sticky fields
		a('st', stickyText, D.stickyText);
		a('sfn', stickyFont, D.stickyFont);
		a('sd', stickyD, D.stickyD);
		a('smb', stickyMaskBlur, D.stickyMaskBlur);
		a('smp', stickyMaskPadding, D.stickyMaskPadding);
		a('ss', stickyStrength, D.stickyStrength);
		a('sa', stickyAmplify, D.stickyAmplify);
		a('sp', stickyPressure, D.stickyPressure);
		a('sas', stickyAutoAnimateSpeed, D.stickyAutoAnimateSpeed);
		a('sad', stickyAutoAnimateDuration, D.stickyAutoAnimateDuration);
		// Distortion fields
		a('ds', distortionSrc, D.distortionSrc);
		a('dstr', distortionStrength, D.distortionStrength);
		a('di', distortionIntensity, D.distortionIntensity);
		a('dad', distortionAutoDistort, D.distortionAutoDistort);
		a('das', distortionAutoDistortSpeed, D.distortionAutoDistortSpeed);
		a('dis', distortionInitialSplats, D.distortionInitialSplats);
		// Container shape sub-params (only if shape is active)
		if (containerShapeType === 'circle') {
			a('cx', containerCx, D.containerCx); a('cy', containerCy, D.containerCy);
			a('rd', containerRadius, D.containerRadius);
		} else if (containerShapeType === 'annulus') {
			a('cx', containerCx, D.containerCx); a('cy', containerCy, D.containerCy);
			a('ir', containerInnerRadius, D.containerInnerRadius);
			a('or', containerOuterRadius, D.containerOuterRadius);
		} else if (containerShapeType === 'roundedRect') {
			a('cx', containerCx, D.containerCx); a('cy', containerCy, D.containerCy);
			a('hw', containerHalfW, D.containerHalfW); a('hh', containerHalfH, D.containerHalfH);
			a('cr', containerCornerRadius, D.containerCornerRadius);
		} else if (containerShapeType === 'frame') {
			a('cx', containerCx, D.containerCx); a('cy', containerCy, D.containerCy);
			a('hw', containerHalfW, D.containerHalfW); a('hh', containerHalfH, D.containerHalfH);
			a('ic', containerInnerCornerRadius, D.containerInnerCornerRadius);
			a('ow', containerOuterHalfW, D.containerOuterHalfW);
			a('oh2', containerOuterHalfH, D.containerOuterHalfH);
			a('oc', containerOuterCornerRadius, D.containerOuterCornerRadius);
		}
		if (Object.keys(s).length === 0) return '';
		return btoa(JSON.stringify(s));
	}

	function deserializeState(hash: string, showBanner = true) {
		try {
			const s = JSON.parse(atob(hash)) as Record<string, unknown>;
			const g = (k: string) => s[k];
			if (s.m) playgroundMode = s.m as 'fluid' | 'reveal' | 'sticky' | 'distortion';
			if (g('cu') !== undefined) curl = g('cu') as number;
			if (g('sr') !== undefined) splatRadius = g('sr') as number;
			if (g('sf') !== undefined) splatForce = g('sf') as number;
			if (g('dd') !== undefined) densityDissipation = g('dd') as number;
			if (g('vd') !== undefined) velocityDissipation = g('vd') as number;
			if (g('pr') !== undefined) pressure = g('pr') as number;
			if (g('bi') !== undefined) bloomIntensity = g('bi') as number;
			if (g('sw') !== undefined) sunraysWeight = g('sw') as number;
			if (g('sh') !== undefined) shading = g('sh') as boolean;
			if (g('bl') !== undefined) bloom = g('bl') as boolean;
			if (g('sn') !== undefined) sunrays = g('sn') as boolean;
			if (g('cf') !== undefined) colorful = g('cf') as boolean;
			if (g('gl') !== undefined) glass = g('gl') as boolean;
			if (g('tr') !== undefined) transparent = g('tr') as boolean;
			if (g('cs') !== undefined) containerShapeType = g('cs') as typeof containerShapeType;
			if (g('br') !== undefined) backColorR = g('br') as number;
			if (g('bg') !== undefined) backColorG = g('bg') as number;
			if (g('bb') !== undefined) backColorB = g('bb') as number;
			if (g('rr') !== undefined) randomSplatRate = g('rr') as number;
			if (g('rn') !== undefined) randomSplatCount = g('rn') as number;
			if (g('rw') !== undefined) randomSplatSwirl = g('rw') as number;
			if (g('rp') !== undefined) randomSplatSpread = g('rp') as number;
			if (g('ry') !== undefined) randomSplatSpawnY = g('ry') as number;
			if (g('rx') !== undefined) randomSplatDx = g('rx') as number;
			if (g('rd2') !== undefined) randomSplatDy = g('rd2') as number;
			if (g('re') !== undefined) randomSplatEvenSpacing = g('re') as boolean;
			if (g('oh') !== undefined) splatOnHover = g('oh') as boolean;
			if (g('id') !== undefined) initialDensityDissipation = g('id') as number;
			if (g('it') !== undefined) initialDensityDissipationDuration = g('it') as number;
			if (g('gt') !== undefined) glassThickness = g('gt') as number;
			if (g('gf') !== undefined) glassRefraction = g('gf') as number;
			if (g('gy') !== undefined) glassReflectivity = g('gy') as number;
			if (g('gc') !== undefined) glassChromatic = g('gc') as number;
			if (g('rs') !== undefined) revealSensitivity = g('rs') as number;
			if (g('rc') !== undefined) revealCurve = g('rc') as number;
			if (g('fb') !== undefined) revealFadeBack = g('fb') as boolean;
			if (g('ar') !== undefined) revealAutoReveal = g('ar') as boolean;
			if (g('as') !== undefined) revealAutoRevealSpeed = g('as') as number;
			if (g('rv') !== undefined) revealContent = g('rv') as 'text' | 'mosaic';
			if (g('cc') !== undefined) revealCoverColor = g('cc') as string;
			if (g('fc') !== undefined) revealFringeColor = g('fc') as string;
			if (g('ac') !== undefined) revealAccentColor = g('ac') as string;
			// Sticky fields
			if (g('st') !== undefined) stickyText = g('st') as string;
			if (g('sfn') !== undefined) stickyFont = g('sfn') as string;
			if (g('sd') !== undefined) stickyD = g('sd') as string;
			if (g('smb') !== undefined) stickyMaskBlur = g('smb') as number;
			if (g('smp') !== undefined) stickyMaskPadding = g('smp') as number;
			if (g('ss') !== undefined) stickyStrength = g('ss') as number;
			if (g('sa') !== undefined) stickyAmplify = g('sa') as number;
			if (g('sp') !== undefined) stickyPressure = g('sp') as number;
			if (g('sas') !== undefined) stickyAutoAnimateSpeed = g('sas') as number;
			if (g('sad') !== undefined) stickyAutoAnimateDuration = g('sad') as number;
			// Distortion fields
			if (g('ds') !== undefined) distortionSrc = g('ds') as string;
			if (g('dstr') !== undefined) distortionStrength = g('dstr') as number;
			if (g('di') !== undefined) distortionIntensity = g('di') as number;
			if (g('dad') !== undefined) distortionAutoDistort = g('dad') as boolean;
			if (g('das') !== undefined) distortionAutoDistortSpeed = g('das') as number;
			if (g('dis') !== undefined) distortionInitialSplats = g('dis') as number;
			if (g('cx') !== undefined) containerCx = g('cx') as number;
			if (g('cy') !== undefined) containerCy = g('cy') as number;
			if (g('rd') !== undefined) containerRadius = g('rd') as number;
			if (g('ir') !== undefined) containerInnerRadius = g('ir') as number;
			if (g('or') !== undefined) containerOuterRadius = g('or') as number;
			if (g('hw') !== undefined) containerHalfW = g('hw') as number;
			if (g('hh') !== undefined) containerHalfH = g('hh') as number;
			if (g('cr') !== undefined) containerCornerRadius = g('cr') as number;
			if (g('ic') !== undefined) containerInnerCornerRadius = g('ic') as number;
			if (g('ow') !== undefined) containerOuterHalfW = g('ow') as number;
			if (g('oh2') !== undefined) containerOuterHalfH = g('oh2') as number;
			if (g('oc') !== undefined) containerOuterCornerRadius = g('oc') as number;
			if (showBanner) {
				loadedPreset = 'Shared config';
				document.getElementById('playground')?.scrollIntoView({ behavior: 'smooth' });
			}
		} catch { /* ignore malformed hashes */ }
	}

	// Push state to URL on changes (debounced).
	let hashTimer: ReturnType<typeof setTimeout> | undefined;
	$effect(() => {
		void [playgroundMode, curl, splatRadius, splatForce, densityDissipation,
			velocityDissipation, pressure, bloomIntensity, sunraysWeight, shading,
			bloom, sunrays, colorful, glass, transparent, containerShapeType,
			backColorR, backColorG, backColorB, randomSplatRate, randomSplatCount,
			randomSplatSwirl, randomSplatSpread, randomSplatSpawnY, randomSplatDx,
			randomSplatDy, randomSplatEvenSpacing, splatOnHover, glassThickness,
			glassRefraction, glassReflectivity, glassChromatic, containerCx, containerCy,
			containerRadius, containerInnerRadius, containerOuterRadius,
			revealSensitivity, revealCurve, revealFadeBack, revealAutoReveal,
			revealAutoRevealSpeed, revealContent, revealCoverColor, revealFringeColor, revealAccentColor,
			stickyText, stickyFont, stickyD, stickyMaskBlur, stickyMaskPadding,
			stickyStrength, stickyAmplify, stickyPressure, stickyAutoAnimateSpeed,
			stickyAutoAnimateDuration, distortionSrc, distortionStrength,
			distortionIntensity, distortionAutoDistort, distortionAutoDistortSpeed,
			distortionInitialSplats];
		clearTimeout(hashTimer);
		hashTimer = setTimeout(() => {
			const s = serializeState();
			const newHash = s ? `#pg=${s}` : '';
			if (window.location.hash !== newHash) {
				history.replaceState(null, '', newHash || window.location.pathname);
			}
		}, 300);
	});

	function shareUrl() {
		const s = serializeState();
		const url = `${window.location.origin}${window.location.pathname}${s ? '#pg=' + s : ''}`;
		navigator.clipboard.writeText(url);
	}

	onMount(() => {
		const hash = window.location.hash;
		if (hash.startsWith('#pg=')) {
			deserializeState(hash.slice(4), false);
		}
	});

	// ---- Preset configs for "Customize" buttons ----
	const PRESET_CONFIGS: Record<string, PlaygroundConfig> = {
		LavaLamp: {
			containerShape: { type: 'roundedRect', cx: 0.5, cy: 0.5, halfW: 0.38, halfH: 0.45, cornerRadius: 0.15 },
			glass: true, glassRefraction: 0.3, glassReflectivity: 0.08, glassChromatic: 0.1,
			curl: 5, densityDissipation: 0, initialDensityDissipation: 0.25,
			initialDensityDissipationDuration: 1.0, velocityDissipation: 0, splatRadius: 0.75,
			splatForce: 2200, shading: true, colorful: false, bloom: false, sunrays: false,
			backColor: { r: 222, g: 218, b: 215 }
		},
		Plasma: {
			curl: 40, densityDissipation: 0.12, initialDensityDissipation: 0.6,
			initialDensityDissipationDuration: 2.0, velocityDissipation: 0.08, splatRadius: 0.35,
			splatForce: 5000, shading: true, colorful: true, bloom: true, bloomIntensity: 1.5,
			sunrays: true, sunraysWeight: 0.5, randomSplatRate: 0.4, randomSplatCount: 4,
			randomSplatSpawnY: 0.5, backColor: { r: 4, g: 2, b: 12 }
		},
		'Ink in Water': {
			curl: 8, densityDissipation: 0.3, velocityDissipation: 0.15, pressure: 0.85,
			splatRadius: 0.12, splatForce: 800, shading: true, colorful: false,
			bloom: true, bloomIntensity: 0.6, sunrays: false, randomSplatRate: 0.2,
			backColor: { r: 6, g: 8, b: 20 }
		},
		'Frozen Swirl': {
			containerShape: { type: 'circle', cx: 0.5, cy: 0.5, radius: 0.45 },
			curl: 50, densityDissipation: 0, velocityDissipation: 1.0, pressure: 0.95,
			splatRadius: 0.5, splatForce: 8000, shading: true, colorful: false,
			bloom: true, bloomIntensity: 1.0, sunrays: false,
			backColor: { r: 4, g: 8, b: 24 }
		},
		Aurora: {
			curl: 40, densityDissipation: 0, velocityDissipation: 0.3, pressure: 0.85,
			splatRadius: 0.4, splatForce: 6000, shading: true, colorful: false,
			bloom: true, bloomIntensity: 1.5, sunrays: true, sunraysWeight: 1.4,
			backColor: { r: 2, g: 4, b: 18 }
		},
		'Toroidal Tempest': {
			containerShape: { type: 'annulus', cx: 0.5, cy: 0.5, innerRadius: 0.15, outerRadius: 0.42 },
			curl: 50, densityDissipation: 0.25, initialDensityDissipation: 0.6,
			initialDensityDissipationDuration: 2.0, velocityDissipation: 0.02,
			splatRadius: 0.4, splatForce: 6000, shading: true, colorful: true,
			bloom: true, bloomIntensity: 1.8, sunrays: true, sunraysWeight: 0.6,
			backColor: { r: 2, g: 2, b: 10 }
		},
		'Crystal orb': {
			containerShape: { type: 'circle', cx: 0.5, cy: 0.5, radius: 0.45 },
			glass: true, glassRefraction: 0.7, glassReflectivity: 0.15,
			glassChromatic: 0.5, glassThickness: 0.08,
			curl: 35, densityDissipation: 0.15, velocityDissipation: 0.06,
			splatRadius: 0.38, splatForce: 5000, shading: true, bloom: true, sunrays: false,
			randomSplatRate: 1.2, randomSplatSpread: 0.8, randomSplatSwirl: 500,
			backColor: { r: 4, g: 2, b: 12 }
		},
		'Flat + soft': {
			bloom: false, curl: 5, densityDissipation: 0.4
		},
		'Bold splats': {
			shading: false, splatRadius: 0.8, splatForce: 9000
		},
		'Slow + transparent': {
			velocityDissipation: 0.05, densityDissipation: 0.5, transparent: true
		},
		'Soft lens': {
			containerShape: { type: 'circle', cx: 0.5, cy: 0.5, radius: 0.45 },
			glass: true, glassRefraction: 0.25, glassReflectivity: 0.06, glassChromatic: 0.1,
			curl: 30, densityDissipation: 0.4, velocityDissipation: 0.12,
			splatRadius: 0.25, splatForce: 5000, shading: true, bloom: true, sunrays: true,
			randomSplatRate: 2.5, randomSplatCount: 2,
			backColor: { r: 0, g: 0, b: 0 }
		},
		Default: {},
		Circle: { containerShape: { type: 'circle', cx: 0.5, cy: 0.5, radius: 0.45 }, splatOnHover: true },
		Frame: { containerShape: { type: 'frame', cx: 0.5, cy: 0.5, halfW: 0.2, halfH: 0.2 }, splatOnHover: true },
		Ring: { containerShape: { type: 'annulus', cx: 0.5, cy: 0.5, innerRadius: 0.15, outerRadius: 0.4 }, splatOnHover: true },
		'Rounded frame': { containerShape: { type: 'frame', cx: 0.5, cy: 0.5, halfW: 0.2, halfH: 0.2, innerCornerRadius: 0.06, outerHalfW: 0.48, outerHalfH: 0.48, outerCornerRadius: 0.06 }, splatOnHover: true },
		'Portal ring': {
			containerShape: { type: 'annulus', cx: 0.5, cy: 0.5, innerRadius: 0.15, outerRadius: 0.42 },
			glass: true, glassThickness: 0.05, glassRefraction: 0.6, glassReflectivity: 0.15, glassChromatic: 0.7,
			backColor: { r: 2, g: 4, b: 14 }, curl: 40, densityDissipation: 0.3, velocityDissipation: 0.1,
			splatRadius: 0.3, splatForce: 5000, shading: true, bloom: true, sunrays: false,
			randomSplatRate: 1.5, randomSplatSpread: 0.6, randomSplatSwirl: 400
		},
		'Glass frame': {
			containerShape: { type: 'frame', cx: 0.5, cy: 0.5, halfW: 0.22, halfH: 0.22, innerCornerRadius: 0.06, outerHalfW: 0.48, outerHalfH: 0.48, outerCornerRadius: 0.04 },
			glass: true, glassThickness: 0.06, glassRefraction: 0.5, glassReflectivity: 0.18, glassChromatic: 0.4,
			backColor: { r: 6, g: 3, b: 16 }, curl: 25, densityDissipation: 0.25, velocityDissipation: 0.1,
			splatRadius: 0.35, splatForce: 5000, shading: true, bloom: true, bloomIntensity: 1.0, sunrays: false,
			randomSplatRate: 3.0, randomSplatCount: 2, randomSplatSpread: 1.5, randomSplatSwirl: 350
		},
		'SVG path': {
			containerShape: { type: 'svgPath', d: 'M55 2 L30 42 L48 42 L25 70 L50 98 L75 58 L57 58 L80 30 Z' },
			curl: 30, densityDissipation: 0.2, velocityDissipation: 0.1,
			splatRadius: 0.3, splatForce: 5000, shading: true, bloom: true, sunrays: false,
			randomSplatRate: 0.5, randomSplatCount: 2, randomSplatSpread: 2.0, randomSplatSwirl: 400,
			backColor: { r: 4, g: 2, b: 12 }, splatOnHover: true
		},
		'Text glyph': {
			containerShape: { type: 'svgPath', text: '&', font: 'bold 200px Georgia, serif', fillRule: 'evenodd' },
			splatOnHover: true
		},
		// Sticky presets
		'Sticky text': {
			playgroundMode: 'sticky',
			stickyText: 'FLUID',
			stickyFont: '900 120px sans-serif',
			stickyD: '',
		},
		'Lightning bolt': {
			playgroundMode: 'sticky',
			stickyText: '',
			stickyD: 'M55 5 L25 45 L45 45 L20 95 L75 50 L55 50 L80 5 Z',
		},
		'Sticky + circle': {
			playgroundMode: 'sticky',
			stickyText: 'HI',
			stickyFont: 'bold 72px sans-serif',
			stickyMaskPadding: 0.5,
			containerShape: { type: 'circle', cx: 0.5, cy: 0.5, radius: 0.45 },
		},
		'Strong pressure': {
			playgroundMode: 'sticky',
			stickyText: '',
			stickyD: 'M50 5 L5 95 L95 95 Z',
			stickyPressure: 0.5,
		},
		// Distortion presets
		'Image distortion': {
			playgroundMode: 'distortion',
		},
		'Auto-distort': {
			playgroundMode: 'distortion',
			distortionAutoDistort: true,
			distortionAutoDistortSpeed: 1.0,
			distortionStrength: 0.3,
			distortionIntensity: 20,
		},
		'Strong warp': {
			playgroundMode: 'distortion',
			distortionStrength: 0.8,
			distortionIntensity: 50,
			velocityDissipation: 0.95,
		},
		'Contained distortion': {
			playgroundMode: 'distortion',
			containerShape: { type: 'circle', cx: 0.5, cy: 0.5, radius: 0.45 },
		},
		'Scratch to reveal': { playgroundMode: 'reveal', velocityDissipation: 0.95, pressureIterations: 10 },
		'Permanent reveal': { playgroundMode: 'reveal', revealFadeBack: false, revealCoverColor: '#292930', revealFringeColor: '#b8944d', revealAccentColor: '#c8a864', velocityDissipation: 0.95, pressureIterations: 10 },
		'Auto-reveal': { playgroundMode: 'reveal', revealAutoReveal: true, revealAutoRevealSpeed: 0.8, revealFadeBack: false, velocityDissipation: 0.95, revealSensitivity: 0.15, revealCoverColor: '#0d1421', revealFringeColor: '#26598c', revealAccentColor: '#00c8ff' },
		'Turbulent reveal': { playgroundMode: 'reveal', pressure: 0.4, revealCurve: 0.5, revealSensitivity: 0.2, splatRadius: 0.35, revealCoverColor: '#f0e0e6', revealFringeColor: '#a6809a', revealAccentColor: '#4a0e4f', curl: 20, velocityDissipation: 0.96 },
		'Circle reveal': { playgroundMode: 'reveal', containerShape: { type: 'circle', cx: 0.5, cy: 0.5, radius: 0.45 }, revealCoverColor: '#0a1f1f', revealFringeColor: '#266661', revealAccentColor: '#00e6c8' },
		'Bounded reveal': { playgroundMode: 'reveal', containerShape: { type: 'roundedRect', cx: 0.5, cy: 0.5, halfW: 0.38, halfH: 0.42, cornerRadius: 0.08 }, revealCoverColor: '#2a0f1e', revealFringeColor: '#8c4038', revealAccentColor: '#ff7a5c', curl: 10 }
	};

	const SCRIPT_OPEN = '<' + 'script lang="ts">';
	const SCRIPT_CLOSE = '<' + '/script>';
	const usageSnippet = [
		SCRIPT_OPEN,
		"  import { Fluid, LavaLamp } from 'svelte-fluid';",
		SCRIPT_CLOSE,
		'',
		'<div style="height: 100vh"><LavaLamp /></div>'
	].join('\n');

	let showBgCode = $state(false);
	const bgSnippet = `<FluidBackground\n  exclude=".card, .get-started, .playground-canvas, .panel"\n  excludeRadius={12}\n  splatOnHover\n  colorful\n  shading\n  bloom\n  bloomIterations={4}\n  bloomIntensity={0.5}\n  sunrays={false}\n  densityDissipation={0.4}\n  velocityDissipation={0.3}\n  curl={50}\n  splatRadius={0.05}\n  splatForce={3000}\n>\n  <!-- page content -->\n</FluidBackground>`;

	let showTitleCode = $state(false);
	const titleSnippet = `<FluidText\n  text="SVELTE"\n  height={100}\n  seed={42}\n  splatOnHover\n  densityDissipation={0.01}\n  velocityDissipation={0.01}\n  curl={20}\n  splatRadius={0.6}\n  splatForce={8000}\n  shading\n  colorful\n  bloom={false}\n  sunrays={false}\n  initialSplatCount={20}\n  randomSplatRate={6}\n  randomSplatCount={4}\n  randomSplatSpread={2}\n  randomSplatSwirl={300}\n/>`;

	const pageMarkdown = [
		'# svelte-fluid — WebGL fluid simulation as a Svelte 5 component',
		'',
		'WebGL fluid simulation as a Svelte 5 component. Multi-instance, resize-stable, deterministic seeding.',
		'',
		'## Get started',
		'',
		'```',
		'npm install svelte-fluid',
		'```',
		'',
		'```svelte',
		SCRIPT_OPEN,
		'  import { Fluid, LavaLamp } from \'svelte-fluid\';',
		SCRIPT_CLOSE,
		'',
		'<div style="height: 100vh"><LavaLamp /></div>',
		'```',
		'',
		'The canvas fills its parent automatically. Six visual presets and four shape presets ship out of the box; `<Fluid />` exposes 40+ props for custom physics and visuals.',
		'',
		'## Presets',
		'',
		'Ready-made components you can drop in with zero configuration. Each one pins its own physics, visuals, and opening splats.',
		'',
		'### LavaLamp',
		'Warm blobs in a glass vessel with rim refraction.',
		'```svelte',
		'<LavaLamp />',
		'```',
		'',
		'### Plasma',
		'Rapid color jets with strong curl and vivid bloom lighting up a dark canvas.',
		'```svelte',
		'<Plasma />',
		'```',
		'',
		'### InkInWater',
		'Deep blue ink diffusing through dark water with a soft glow.',
		'```svelte',
		'<InkInWater />',
		'```',
		'',
		'### FrozenSwirl',
		'Cyan dye flash-frozen in a circular vessel. Strong swirl, instant slowdown.',
		'```svelte',
		'<FrozenSwirl />',
		'```',
		'',
		'### Aurora',
		'Northern-lights ribbons drifting laterally.',
		'```svelte',
		'<Aurora />',
		'```',
		'',
		'### ToroidalTempest',
		'Full-spectrum storm circulating in a high-velocity ring.',
		'```svelte',
		'<ToroidalTempest />',
		'```',
		'',
		'## Configuration',
		'',
		'Every prop on `<Fluid />` is optional. A few combinations to show the range.',
		'',
		'### Default',
		'Out-of-the-box look with bloom, sunrays, and shading.',
		'```svelte',
		'<Fluid />',
		'```',
		'',
		'### Flat + soft',
		'Bloom off, low curl, faster dye fade.',
		'```svelte',
		'<Fluid bloom={false} curl={5} densityDissipation={0.4} />',
		'```',
		'',
		'### Bold splats',
		'Shading off, oversized splats, high force.',
		'```svelte',
		'<Fluid shading={false} splatRadius={0.8} splatForce={9000} />',
		'```',
		'',
		'### Slow + transparent',
		'Low velocity dissipation on a transparent canvas.',
		'```svelte',
		'<Fluid velocityDissipation={0.05} densityDissipation={0.5} transparent />',
		'```',
		'',
		'## Container shapes',
		'',
		'Masks confine the fluid to a region. Choose from five built-in shapes or use custom SVG paths.',
		'',
		'### Circle',
		'```svelte',
		'<Fluid containerShape={{ type: \'circle\', cx: 0.5, cy: 0.5, radius: 0.45 }} />',
		'```',
		'',
		'### Frame',
		'```svelte',
		'<Fluid containerShape={{ type: \'frame\', cx: 0.5, cy: 0.5, halfW: 0.2, halfH: 0.2 }} />',
		'```',
		'',
		'### Ring (annulus)',
		'```svelte',
		'<Fluid containerShape={{ type: \'annulus\', cx: 0.5, cy: 0.5, innerRadius: 0.15, outerRadius: 0.4 }} />',
		'```',
		'',
		'### Rounded frame',
		'```svelte',
		'<Fluid containerShape={{',
		'  type: \'frame\', cx: 0.5, cy: 0.5, halfW: 0.2, halfH: 0.2,',
		'  innerCornerRadius: 0.06, outerHalfW: 0.48, outerHalfH: 0.48, outerCornerRadius: 0.06',
		'}} />',
		'```',
		'',
		'### SVG path',
		'```svelte',
		'<Fluid containerShape={{ type: \'svgPath\', d: \'M55 2 L30 42 L48 42 L25 70 ...\' }} />',
		'```',
		'',
		'### Text glyph',
		'```svelte',
		'<Fluid containerShape={{',
		'  type: \'svgPath\', text: \'&\', font: \'bold 200px Georgia, serif\', fillRule: \'evenodd\'',
		'}} />',
		'```',
		'',
		'## Container effects',
		'',
		'The `glass` prop adds a lens effect. Circles get a dome with optical refraction; other shapes get edge refraction at the boundary.',
		'',
		'### Crystal orb',
		'```svelte',
		'<Fluid glass glassRefraction={0.7} glassChromatic={0.5}',
		'  containerShape={{ type: \'circle\', cx: 0.5, cy: 0.5, radius: 0.45 }} />',
		'```',
		'',
		'### Soft lens',
		'```svelte',
		'<Fluid glass glassRefraction={0.25} glassChromatic={0.1}',
		'  containerShape={{ type: \'circle\', cx: 0.5, cy: 0.5, radius: 0.45 }} />',
		'```',
		'',
		'### Portal ring',
		'```svelte',
		'<Fluid glass glassThickness={0.05} glassRefraction={0.6} glassChromatic={0.7}',
		'  containerShape={{ type: \'annulus\', cx: 0.5, cy: 0.5, innerRadius: 0.15, outerRadius: 0.42 }} />',
		'```',
		'',
		'### Glass frame',
		'```svelte',
		'<Fluid glass glassThickness={0.06} glassRefraction={0.5} glassChromatic={0.4}',
		'  containerShape={{ type: \'frame\', cx: 0.5, cy: 0.5, halfW: 0.22, halfH: 0.22, innerCornerRadius: 0.06 }} />',
		'```',
		'',
		'## Reveal',
		'',
		'`<FluidReveal>` uses the simulation as an opacity mask. Cursor movement reveals content behind the fluid cover.',
		'',
		'### Scratch to reveal',
		'```svelte',
		'<FluidReveal velocityDissipation={0.95} pressureIterations={10}>',
		'  <div>Your content here</div>',
		'</FluidReveal>',
		'```',
		'',
		'### Permanent reveal',
		'```svelte',
		'<FluidReveal fadeBack={false} velocityDissipation={0.95} pressureIterations={10}',
		'  coverColor={{ r: 0.16, g: 0.16, b: 0.18 }}',
		'  fringeColor={{ r: 0.72, g: 0.58, b: 0.3 }}',
		'  accentColor={{ r: 0.78, g: 0.66, b: 0.39 }}>',
		'  <div>Your content here</div>',
		'</FluidReveal>',
		'```',
		'',
		'### Auto-reveal',
		'```svelte',
		'<FluidReveal autoReveal autoRevealSpeed={0.8} fadeBack={false}',
		'  velocityDissipation={0.95} sensitivity={0.15}',
		'  coverColor={{ r: 0.05, g: 0.08, b: 0.13 }}',
		'  fringeColor={{ r: 0.15, g: 0.35, b: 0.55 }}',
		'  accentColor={{ r: 0, g: 0.78, b: 1 }}>',
		'  <div>Your content here</div>',
		'</FluidReveal>',
		'```',
		'',
		'## Distortion',
		'',
		'`<FluidDistortion>` warps an image using the fluid velocity field. Move your cursor to create liquid ripples.',
		'',
		'### Image distortion',
		'```svelte',
		'<FluidDistortion src="/my-image.jpg" strength={0.4} intensity={24} />',
		'```',
		'',
		'### Auto-distort',
		'```svelte',
		'<FluidDistortion src="/my-image.jpg" autoDistort autoDistortSpeed={1.0} strength={0.3} intensity={20} />',
		'```',
		'',
		'## Sticky',
		'',
		'`<FluidStick>` makes dye cling to text or SVG paths. Physics-level modulation: reduced dissipation, artificial pressure, and amplified splats.',
		'',
		'### Sticky text',
		'```svelte',
		'<FluidStick text="FLUID" font="900 120px sans-serif" />',
		'```',
		'',
		'### Lightning bolt (SVG path)',
		'```svelte',
		'<FluidStick d="M55 5 L25 45 L45 45 L20 95 L75 50 L55 50 L80 5 Z" />',
		'```',
		'',
		'## Background mode',
		'',
		'`<FluidBackground>` provides a full-viewport fluid simulation with DOM element exclusion zones. The fluid physically cannot enter excluded elements.',
		'',
		'```svelte',
		'<FluidBackground exclude=".card" splatOnHover colorful shading bloom>',
		'  <!-- page content -->',
		'</FluidBackground>',
		'```',
		'',
		'## FluidText',
		'',
		'`<FluidText>` renders text as a fluid-filled SVG path container.',
		'',
		'```svelte',
		'<FluidText text="SVELTE" height={100} seed={42} splatOnHover shading colorful />',
		'```',
		'',
		'## Components',
		'',
		'| Component | Description |',
		'| --- | --- |',
		'| `<Fluid>` | Core fluid simulation canvas. 40+ props for physics and visuals. |',
		'| `<FluidBackground>` | Full-viewport fluid with DOM exclusion zones. |',
		'| `<FluidReveal>` | Fluid as an opacity mask — cursor movement reveals content below. |',
		'| `<FluidDistortion>` | Warps an image using the fluid velocity field. |',
		'| `<FluidStick>` | Makes dye cling to text or SVG paths. |',
		'| `<FluidText>` | Text rendered as a fluid-filled SVG path container. |',
		'| `<LavaLamp>` | Preset: warm blobs in a glass vessel. |',
		'| `<Plasma>` | Preset: rapid color jets with strong curl and vivid bloom. |',
		'| `<InkInWater>` | Preset: deep blue ink diffusing through dark water. |',
		'| `<FrozenSwirl>` | Preset: cyan dye flash-frozen in a circular vessel. |',
		'| `<Aurora>` | Preset: northern-lights ribbons drifting laterally. |',
		'| `<ToroidalTempest>` | Preset: full-spectrum storm in a high-velocity ring. |',
		'| `<CircularFluid>` | Shape preset: fluid inside a circle. |',
		'| `<FrameFluid>` | Shape preset: fluid inside a rectangular frame. |',
		'| `<AnnularFluid>` | Shape preset: fluid in a ring (annulus). |',
		'| `<SvgPathFluid>` | Shape preset: fluid shaped by an SVG path. |',
		'',
		'## Links',
		'',
		'- [GitHub](https://github.com/tommyyzhao/svelte-fluid)',
		'- [README](https://github.com/tommyyzhao/svelte-fluid#readme)',
		'- [Docs](/docs)',
		'- [Contributing](https://github.com/tommyyzhao/svelte-fluid/blob/main/CONTRIBUTING.md)',
		'- [MIT License](https://github.com/tommyyzhao/svelte-fluid/blob/main/LICENSE)',
	].join('\n');
</script>

<svelte:head>
	<title>svelte-fluid — WebGL fluid simulation as a Svelte 5 component</title>
	<meta name="description" content="Drop-in WebGL fluid simulation for Svelte 5. Multi-instance, resize-stable, deterministic seeding, ten presets. MIT licensed." />
	<meta property="og:title" content="svelte-fluid" />
	<meta property="og:description" content="WebGL fluid simulation as a Svelte 5 component. Multi-instance, resize-stable, ten ready-made presets." />
</svelte:head>

<FluidBackground
	exclude=".card, .get-started, .playground-canvas, .panel"
	excludeRadius={12}
	splatOnHover
	colorful
	shading
	bloom
	bloomIterations={4}
	bloomIntensity={0.5}
	sunrays={false}
	densityDissipation={0.4}
	velocityDissipation={0.3}
	curl={50}
	splatRadius={0.05}
	splatForce={3000}
>
<main>
	<div class="bg-code-wrapper">
		<CopyPageButton content={pageMarkdown} />
		<button
			class="bg-code-toggle"
			class:active={showBgCode}
			onclick={() => (showBgCode = !showBgCode)}
			aria-label={showBgCode ? 'Hide background code' : 'View background code'}
			title="FluidBackground code"
		>{showBgCode ? 'Hide code' : 'View code'}</button>
		{#if showBgCode}
			<div class="bg-code-panel">
				<pre><code>{bgSnippet}</code></pre>
				<button class="bg-copy-btn" onclick={() => navigator.clipboard.writeText(bgSnippet)}>Copy</button>
			</div>
		{/if}
	</div>
	<header>
		<div class="hero-title" role="heading" aria-level="1" aria-label="svelte-fluid">
			<FluidText
				text="SVELTE"
				height={100}
				seed={42}
				splatOnHover
				densityDissipation={0.01}
				velocityDissipation={0.01}
				curl={20}
				splatRadius={0.6}
				splatForce={8000}
				shading
				colorful
				bloom={false}
				sunrays={false}
				initialSplatCount={20}
				randomSplatRate={6}
				randomSplatCount={4}
				randomSplatSpread={2}
				randomSplatSwirl={300}
			/>
			<FluidText
				text="FLUID"
				height={100}
				seed={99}
				splatOnHover
				densityDissipation={0.01}
				velocityDissipation={0.01}
				curl={20}
				splatRadius={0.6}
				splatForce={8000}
				shading
				colorful
				bloom={false}
				sunrays={false}
				initialSplatCount={20}
				randomSplatRate={6}
				randomSplatCount={4}
				randomSplatSpread={2}
				randomSplatSwirl={300}
			/>
		</div>
		<div class="hero-code-row">
			<button
				class="hero-code-toggle"
				class:active={showTitleCode}
				onclick={() => (showTitleCode = !showTitleCode)}
				aria-label={showTitleCode ? 'Hide FluidText code' : 'View FluidText code'}
			>{showTitleCode ? 'Hide code' : 'View code'}</button>
		</div>
		{#if showTitleCode}
			<div class="hero-code-panel">
				<pre><code>{titleSnippet}</code></pre>
				<button class="hero-copy-btn" onclick={() => navigator.clipboard.writeText(titleSnippet)}>Copy</button>
			</div>
		{/if}
		<p class="tagline">
			WebGL fluid simulation as a Svelte 5 component. Multi-instance,
			resize-stable, deterministic seeding.
		</p>
		<nav class="header-links" aria-label="Project links">
			<a href="https://github.com/tommyyzhao/svelte-fluid" rel="noreferrer" target="_blank">
				GitHub
			</a>
			<span aria-hidden="true">·</span>
			<a href="/docs">Docs</a>
			<span aria-hidden="true">·</span>
			<a
				href="https://github.com/tommyyzhao/svelte-fluid#readme"
				rel="noreferrer"
				target="_blank">README</a
			>
			<span aria-hidden="true">·</span>
			<a
				href="https://github.com/tommyyzhao/svelte-fluid/blob/main/CONTRIBUTING.md"
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
			The canvas fills its parent automatically. Six visual presets and four shape presets ship out of the box;
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
			<Card title="Lava Lamp" description="Warm blobs in a glass vessel with rim refraction." onCustomize={() => loadConfig(PRESET_CONFIGS['LavaLamp'], 'LavaLamp')} snippet={`<LavaLamp />\n\n<!-- Equivalent <Fluid> configuration: -->\n<Fluid\n  containerShape={{ type: 'roundedRect',\n    cx: 0.5, cy: 0.5, halfW: 0.38,\n    halfH: 0.45, cornerRadius: 0.15 }}\n  glass\n  glassRefraction={0.3}\n  glassReflectivity={0.08}\n  glassChromatic={0.1}\n  curl={5}\n  densityDissipation={0}\n  initialDensityDissipation={0.25}\n  initialDensityDissipationDuration={1.0}\n  velocityDissipation={0}\n  splatRadius={0.75}\n  splatForce={2200}\n  shading\n  colorful={false}\n  bloom={false}\n  sunrays={false}\n  initialSplatCount={0}\n  backColor={{ r: 222, g: 218, b: 215 }}\n  presetSplats={[\n    { x: 0.18, y: 0.06, dx: 8, dy: 180,\n      color: { r: 1.7, g: 0.12, b: 0.08 } },\n    { x: 0.32, y: 0.1, dx: -5, dy: 160,\n      color: { r: 1.8, g: 0.45, b: 0.08 } },\n    /* ... 6 more warm blobs ... */\n  ]}\n/>`}>
				<LavaLamp seed={101} lazy aria-label="LavaLamp preset" />
			</Card>
			<Card title="Plasma" description="Rapid color jets with strong curl and vivid bloom lighting up a dark canvas." onCustomize={() => loadConfig(PRESET_CONFIGS['Plasma'], 'Plasma')} snippet={`<Plasma />\n\n<!-- Equivalent <Fluid> configuration: -->\n<Fluid\n  curl={40}\n  densityDissipation={0.12}\n  velocityDissipation={0.08}\n  splatRadius={0.35}\n  splatForce={5000}\n  shading\n  colorful\n  bloom\n  bloomIntensity={1.5}\n  sunrays\n  sunraysWeight={0.5}\n  randomSplatRate={0.4}\n  randomSplatCount={4}\n  randomSplatSpawnY={0.5}\n  backColor={{ r: 4, g: 2, b: 12 }}\n  presetSplats={[...]}\n/>`}>
				<Plasma seed={202} lazy aria-label="Plasma preset" />
			</Card>
			<Card title="Ink in Water" description="Deep blue ink diffusing through dark water with a soft glow." onCustomize={() => loadConfig(PRESET_CONFIGS['Ink in Water'], 'Ink in Water')} snippet={`<InkInWater />\n\n<!-- Equivalent <Fluid> configuration: -->\n<Fluid\n  curl={8}\n  densityDissipation={0.3}\n  velocityDissipation={0.15}\n  pressure={0.85}\n  splatRadius={0.12}\n  splatForce={800}\n  shading\n  colorful={false}\n  bloom\n  bloomIntensity={0.6}\n  sunrays={false}\n  randomSplatRate={0.2}\n  backColor={{ r: 6, g: 8, b: 20 }}\n  presetSplats={[...]}\n/>`}>
				<InkInWater seed={303} lazy aria-label="Ink in Water preset" />
			</Card>
			<Card title="Frozen Swirl" description="Cyan dye flash-frozen in a circular vessel. Strong swirl, instant slowdown." onCustomize={() => loadConfig(PRESET_CONFIGS['Frozen Swirl'], 'Frozen Swirl')} snippet={`<FrozenSwirl />\n\n<!-- Equivalent <Fluid> configuration: -->\n<Fluid\n  containerShape={{ type: 'circle',\n    cx: 0.5, cy: 0.5, radius: 0.45 }}\n  curl={50}\n  densityDissipation={0}\n  velocityDissipation={1.0}\n  pressure={0.95}\n  splatRadius={0.5}\n  splatForce={8000}\n  shading\n  colorful={false}\n  bloom\n  bloomIntensity={1.0}\n  sunrays={false}\n  backColor={{ r: 4, g: 8, b: 24 }}\n  presetSplats={[...]}\n/>`}>
				<FrozenSwirl seed={404} lazy aria-label="Frozen Swirl preset" />
			</Card>
			<Card title="Aurora" description="Northern-lights ribbons drifting laterally." onCustomize={() => loadConfig(PRESET_CONFIGS['Aurora'], 'Aurora')} snippet={`<Aurora />\n\n<!-- Equivalent <Fluid> configuration: -->\n<Fluid\n  curl={40}\n  densityDissipation={0}\n  velocityDissipation={0.3}\n  splatRadius={0.4}\n  splatForce={6000}\n  shading\n  colorful={false}\n  bloom\n  bloomIntensity={1.5}\n  sunrays\n  sunraysWeight={1.4}\n  backColor={{ r: 2, g: 4, b: 18 }}\n  presetSplats={[...]}\n/>`}>
				<Aurora seed={505} lazy aria-label="Aurora preset" />
			</Card>
			<Card title="Toroidal Tempest" description="Full-spectrum storm circulating in a high-velocity ring." onCustomize={() => loadConfig(PRESET_CONFIGS['Toroidal Tempest'], 'Toroidal Tempest')} snippet={`<ToroidalTempest />\n\n<!-- Equivalent <Fluid> configuration: -->\n<Fluid\n  containerShape={{ type: 'annulus',\n    cx: 0.5, cy: 0.5,\n    innerRadius: 0.15, outerRadius: 0.42 }}\n  curl={50}\n  densityDissipation={0.25}\n  velocityDissipation={0.02}\n  splatRadius={0.4}\n  splatForce={6000}\n  shading\n  colorful\n  bloom\n  bloomIntensity={1.8}\n  sunrays\n  sunraysWeight={0.6}\n  backColor={{ r: 2, g: 2, b: 10 }}\n  presetSplats={[...]}\n/>`}>
				<ToroidalTempest seed={660} lazy aria-label="Toroidal Tempest preset" />
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
			<Card title="Default" description="Out-of-the-box look with bloom, sunrays, and shading." onCustomize={() => loadConfig(PRESET_CONFIGS['Default'], 'Default')} snippet={'<Fluid />'}>
				<Fluid
					seed={1234}
					initialSplatCount={12}
					splatOnHover
					lazy
					aria-label="Default fluid configuration"
				/>
			</Card>

			<Card title="Flat + soft" description="Bloom off, low curl, faster dye fade." onCustomize={() => loadConfig(PRESET_CONFIGS['Flat + soft'], 'Flat + soft')} snippet={`<Fluid\n  bloom={false}\n  curl={5}\n  densityDissipation={0.4}\n/>`}>
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

			<Card title="Bold splats" description="Shading off, oversized splats, high force." onCustomize={() => loadConfig(PRESET_CONFIGS['Bold splats'], 'Bold splats')} snippet={`<Fluid\n  shading={false}\n  splatRadius={0.8}\n  splatForce={9000}\n/>`}>
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

			<Card title="Slow + transparent" description="Low velocity dissipation on a transparent canvas." onCustomize={() => loadConfig(PRESET_CONFIGS['Slow + transparent'], 'Slow + transparent')} snippet={`<Fluid\n  velocityDissipation={0.05}\n  densityDissipation={0.5}\n  transparent\n/>`}>
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
				Masks confine the fluid to a region.
				Choose from five built-in shapes or use custom SVG paths.
			</p>
		</header>
		<div class="grid-2col">
			<Card title="Circle" description="Fluid swirling inside a circular boundary." onCustomize={() => loadConfig(PRESET_CONFIGS['Circle'], 'Circle')} snippet={`<Fluid\n  containerShape={{\n    type: 'circle',\n    cx: 0.5, cy: 0.5, radius: 0.45\n  }}\n/>`}>
				<CircularFluid seed={606} lazy splatOnHover aria-label="Circular fluid shape demo" />
			</Card>
			<Card title="Frame" description="Sharp-edged rectangular frame with no rounding." onCustomize={() => loadConfig(PRESET_CONFIGS['Frame'], 'Frame')} snippet={`<Fluid\n  containerShape={{\n    type: 'frame',\n    cx: 0.5, cy: 0.5,\n    halfW: 0.2, halfH: 0.2\n  }}\n/>`}>
				<FrameFluid seed={707} lazy splatOnHover aria-label="Frame fluid shape demo" />
			</Card>
			<Card title="Ring" description="Fluid flowing in a ring between two circles." onCustomize={() => loadConfig(PRESET_CONFIGS['Ring'], 'Ring')} snippet={`<Fluid\n  containerShape={{\n    type: 'annulus',\n    cx: 0.5, cy: 0.5,\n    innerRadius: 0.15, outerRadius: 0.4\n  }}\n/>`}>
				<AnnularFluid seed={909} lazy splatOnHover aria-label="Annular fluid shape demo" />
			</Card>
			<Card title="Rounded frame" description="Soft-edged frame with rounded inner and outer corners." onCustomize={() => loadConfig(PRESET_CONFIGS['Rounded frame'], 'Rounded frame')} snippet={`<Fluid\n  containerShape={{\n    type: 'frame',\n    cx: 0.5, cy: 0.5,\n    halfW: 0.2, halfH: 0.2,\n    innerCornerRadius: 0.06,\n    outerHalfW: 0.48, outerHalfH: 0.48,\n    outerCornerRadius: 0.06\n  }}\n/>`}>
				<FrameFluid seed={818} lazy splatOnHover innerCornerRadius={0.06} outerCornerRadius={0.06} aria-label="Rounded frame shape demo" />
			</Card>
			<Card title="SVG path" description="Fluid shaped by an arbitrary SVG path — a lightning bolt." onCustomize={() => loadConfig(PRESET_CONFIGS['SVG path'], 'SVG path')} snippet={`<Fluid\n  containerShape={{\n    type: 'svgPath',\n    d: 'M55 2 L30 42 L48 42 L25 70 ...'\n  }}\n/>`}>
				<Fluid
					seed={808}
					lazy
					splatOnHover
					containerShape={{ type: 'svgPath', d: 'M55 2 L30 42 L48 42 L25 70 L50 98 L75 58 L57 58 L80 30 Z' }}
					curl={30}
					densityDissipation={0.2}
					velocityDissipation={0.1}
					splatRadius={0.3}
					splatForce={5000}
					shading
					bloom
					sunrays={false}
					initialSplatCount={10}
					randomSplatRate={0.5}
					randomSplatCount={2}
					randomSplatSpread={2.0}
					randomSplatSwirl={400}
					backColor={{ r: 4, g: 2, b: 12 }}
					aria-label="SVG path fluid shape demo"
				/>
			</Card>
			<Card title="Text glyph" description="Fluid shaped by a bold ampersand. Any text string can become a container." onCustomize={() => loadConfig(PRESET_CONFIGS['Text glyph'], 'Text glyph')} snippet={`<Fluid\n  containerShape={{\n    type: 'svgPath',\n    text: '&',\n    font: 'bold 200px Georgia, serif',\n    fillRule: 'evenodd'\n  }}\n/>`}>
				<SvgPathFluid seed={1010} lazy splatOnHover aria-label="Text glyph fluid shape demo" />
			</Card>
		</div>
	</section>

	<section>
		<header class="section-header">
			<h2>Container effects</h2>
			<p>
				The <code>glass</code> prop adds a lens effect.
				Circles get a dome with optical refraction;
				other shapes get edge refraction at the boundary.
			</p>
		</header>
		<div class="grid-2col">
			<Card title="Crystal orb" description="Glass sphere with rainbow color fringing. The fluid magnifies at center and bends at the rim." onCustomize={() => loadConfig(PRESET_CONFIGS['Crystal orb'], 'Crystal orb')} snippet={`<Fluid\n  glass\n  glassRefraction={0.7}\n  glassChromatic={0.5}\n  containerShape={{\n    type: 'circle',\n    cx: 0.5, cy: 0.5, radius: 0.45\n  }}\n/>`}>
				<Fluid
					seed={1111}
					lazy
					glass
					glassRefraction={0.7}
					glassReflectivity={0.15}
					glassChromatic={0.5}
					glassThickness={0.08}
					containerShape={{ type: 'circle', cx: 0.5, cy: 0.5, radius: 0.45 }}
					backColor={{ r: 4, g: 2, b: 12 }}
					curl={35}
					densityDissipation={0.15}
					velocityDissipation={0.06}
					splatRadius={0.38}
					splatForce={5000}
					shading
					bloom
					sunrays={false}
					initialSplatCount={12}
					randomSplatRate={1.2}
					randomSplatSpawnY={0.5}
					randomSplatSpread={0.8}
					randomSplatSwirl={500}
					aria-label="Crystal orb effect demo"
				/>
			</Card>
			<Card title="Soft lens" description="Subtle glass lens with soft edge reflections. Glass you feel more than see." onCustomize={() => loadConfig(PRESET_CONFIGS['Soft lens'], 'Soft lens')} snippet={`<Fluid\n  glass\n  glassRefraction={0.25}\n  glassChromatic={0.1}\n  containerShape={{\n    type: 'circle',\n    cx: 0.5, cy: 0.5, radius: 0.45\n  }}\n/>`}>
				<Fluid
					seed={1212}
					lazy
					glass
					glassRefraction={0.25}
					glassReflectivity={0.06}
					glassChromatic={0.1}
					containerShape={{ type: 'circle', cx: 0.5, cy: 0.5, radius: 0.45 }}
					backColor={{ r: 0, g: 0, b: 0 }}
					curl={30}
					densityDissipation={0.4}
					velocityDissipation={0.12}
					splatRadius={0.25}
					splatForce={5000}
					shading
					bloom
					sunrays
					initialSplatCount={15}
					randomSplatRate={2.5}
					randomSplatCount={2}
					randomSplatSpawnY={0.5}
					randomSplatSpread={0.8}
					randomSplatSwirl={400}
					aria-label="Soft lens effect demo"
				/>
			</Card>
			<Card title="Portal ring" description="Rainbow light bending on a ring shape. Colorful fringes at both edges." onCustomize={() => loadConfig(PRESET_CONFIGS['Portal ring'], 'Portal ring')} snippet={`<Fluid\n  glass\n  glassThickness={0.05}\n  glassRefraction={0.6}\n  glassChromatic={0.7}\n  containerShape={{\n    type: 'annulus',\n    cx: 0.5, cy: 0.5,\n    innerRadius: 0.15, outerRadius: 0.42\n  }}\n/>`}>
				<Fluid
					seed={1313}
					lazy
					glass
					glassThickness={0.05}
					glassRefraction={0.6}
					glassReflectivity={0.15}
					glassChromatic={0.7}
					containerShape={{ type: 'annulus', cx: 0.5, cy: 0.5, innerRadius: 0.15, outerRadius: 0.42 }}
					backColor={{ r: 2, g: 4, b: 14 }}
					curl={40}
					densityDissipation={0.3}
					velocityDissipation={0.1}
					splatRadius={0.3}
					splatForce={5000}
					shading
					bloom
					sunrays={false}
					initialSplatCount={10}
					randomSplatRate={1.5}
					randomSplatSpawnY={0.5}
					randomSplatSpread={0.6}
					randomSplatSwirl={400}
					aria-label="Portal ring glass effect demo"
				/>
			</Card>
			<Card title="Glass frame" description="Light bending along a rounded picture frame. Rainbow fringes at the walls." onCustomize={() => loadConfig(PRESET_CONFIGS['Glass frame'], 'Glass frame')} snippet={`<Fluid\n  glass\n  glassThickness={0.06}\n  glassRefraction={0.5}\n  glassChromatic={0.4}\n  containerShape={{\n    type: 'frame',\n    cx: 0.5, cy: 0.5,\n    halfW: 0.22, halfH: 0.22,\n    innerCornerRadius: 0.06\n  }}\n/>`}>
				<Fluid
					seed={1414}
					lazy
					glass
					glassThickness={0.06}
					glassRefraction={0.5}
					glassReflectivity={0.18}
					glassChromatic={0.4}
					containerShape={{ type: 'frame', cx: 0.5, cy: 0.5, halfW: 0.22, halfH: 0.22, innerCornerRadius: 0.06, outerHalfW: 0.48, outerHalfH: 0.48, outerCornerRadius: 0.04 }}
					backColor={{ r: 6, g: 3, b: 16 }}
					curl={25}
					densityDissipation={0.25}
					velocityDissipation={0.1}
					splatRadius={0.35}
					splatForce={5000}
					shading
					bloom
					bloomIntensity={1.0}
					sunrays={false}
					initialSplatCount={10}
					randomSplatRate={3.0}
					randomSplatCount={2}
					randomSplatSpawnY={0.5}
					randomSplatSpread={1.5}
					randomSplatSwirl={350}
					aria-label="Glass frame effect demo"
				/>
			</Card>
		</div>
	</section>

	<section>
		<header class="section-header">
			<h2>Reveal</h2>
			<p>
				<code>&lt;FluidReveal&gt;</code> uses the simulation as an opacity mask.
				Cursor movement reveals content behind the fluid cover.
			</p>
		</header>
		<div class="grid-2col">
			<Card title="Scratch to reveal" description="Move your cursor to uncover the gradient. Tight, viscous trails with iridescent fringes that fade back over time." onCustomize={() => loadConfig(PRESET_CONFIGS['Scratch to reveal'], 'Scratch to reveal')} snippet={`<FluidReveal\n  velocityDissipation={0.95}\n  pressureIterations={10}\n>\n  <div style="width: 100%; height: 100%;\n    background: linear-gradient(\n      135deg, #667eea 0%, #764ba2 100%);\n    display: flex; align-items: center;\n    justify-content: center;\n    border-radius: 12px;">\n    <span>Revealed!</span>\n  </div>\n</FluidReveal>`}>
				<FluidReveal lazy velocityDissipation={0.95} pressureIterations={10}>
					<div class="reveal-content reveal-gradient">
						<span class="reveal-label">Revealed!</span>
					</div>
				</FluidReveal>
			</Card>
			<Card title="Permanent reveal" description="Dark cover with gold fringes — a luxury scratch-card effect. Once revealed, content stays." onCustomize={() => loadConfig(PRESET_CONFIGS['Permanent reveal'], 'Permanent reveal')} snippet={`<FluidReveal\n  fadeBack={false}\n  velocityDissipation={0.95}\n  pressureIterations={10}\n  coverColor={{ r: 0.16, g: 0.16, b: 0.18 }}\n  fringeColor={{ r: 0.72, g: 0.58, b: 0.3 }}\n  accentColor={{ r: 0.78, g: 0.66, b: 0.39 }}\n>\n  <div>Your content here</div>\n</FluidReveal>`}>
				<FluidReveal
					lazy
					fadeBack={false}
					velocityDissipation={0.95}
					pressureIterations={10}
					coverColor={{ r: 0.16, g: 0.16, b: 0.18 }}
					fringeColor={{ r: 0.72, g: 0.58, b: 0.3 }}
					accentColor={{ r: 0.78, g: 0.66, b: 0.39 }}
				>
					<div class="reveal-content reveal-mosaic">
						{#each Array(9) as _, i}
							<div class="mosaic-tile" style:background="hsl({i * 40}, 65%, 55%)"></div>
						{/each}
					</div>
				</FluidReveal>
			</Card>
			<Card title="Auto-reveal" description="A cursor traces a path automatically. Teal fringes on a deep navy cover — touch to take over." onCustomize={() => loadConfig(PRESET_CONFIGS['Auto-reveal'], 'Auto-reveal')} snippet={`<FluidReveal\n  autoReveal\n  autoRevealSpeed={0.8}\n  fadeBack={false}\n  velocityDissipation={0.95}\n  sensitivity={0.15}\n  coverColor={{ r: 0.05, g: 0.08, b: 0.13 }}\n  fringeColor={{ r: 0.15, g: 0.35, b: 0.55 }}\n  accentColor={{ r: 0, g: 0.78, b: 1 }}\n>\n  <div>Your content here</div>\n</FluidReveal>`}>
				<FluidReveal
					lazy
					autoReveal
					autoRevealSpeed={0.8}
					fadeBack={false}
					velocityDissipation={0.95}
					sensitivity={0.15}
					coverColor={{ r: 0.05, g: 0.08, b: 0.13 }}
					fringeColor={{ r: 0.15, g: 0.35, b: 0.55 }}
					accentColor={{ r: 0, g: 0.78, b: 1 }}
				>
					<div class="reveal-content reveal-stars">
						<span class="reveal-label">Auto Reveal</span>
						{#each Array(12) as _, i}
							<div
								class="star"
								style:background="hsl({i * 30}, 70%, 60%)"
								style:left="{10 + (i % 4) * 25}%"
								style:top="{15 + Math.floor(i / 4) * 30}%"
							></div>
						{/each}
					</div>
				</FluidReveal>
			</Card>
			<Card title="Turbulent reveal" description="Blush cover with purple fringes. High curl and low pressure create swirling, chaotic reveals." onCustomize={() => loadConfig(PRESET_CONFIGS['Turbulent reveal'], 'Turbulent reveal')} snippet={`<FluidReveal\n  pressure={0.4}\n  curve={0.5}\n  sensitivity={0.2}\n  splatRadius={0.35}\n  velocityDissipation={0.96}\n  coverColor={{ r: 0.94, g: 0.88, b: 0.9 }}\n  fringeColor={{ r: 0.65, g: 0.5, b: 0.6 }}\n  accentColor={{ r: 0.29, g: 0.055, b: 0.31 }}\n  curl={20}\n>\n  <div>Your content here</div>\n</FluidReveal>`}>
				<FluidReveal
					lazy
					pressure={0.4}
					curve={0.5}
					sensitivity={0.2}
					splatRadius={0.35}
					velocityDissipation={0.96}
					coverColor={{ r: 0.94, g: 0.88, b: 0.9 }}
					fringeColor={{ r: 0.65, g: 0.5, b: 0.6 }}
					accentColor={{ r: 0.29, g: 0.055, b: 0.31 }}
					curl={20}
				>
					<div class="reveal-content reveal-gradient-2">
						<span class="reveal-label">Turbulent Reveal</span>
					</div>
				</FluidReveal>
			</Card>
			<Card title="Circle reveal" description="Reveal clipped to a circle — fluid flows freely past the boundary (openBoundary). A peephole scratch-card." onCustomize={() => loadConfig(PRESET_CONFIGS['Circle reveal'], 'Circle reveal')} snippet={`<FluidReveal\n  containerShape={{\n    type: 'circle',\n    cx: 0.5, cy: 0.5, radius: 0.45\n  }}\n  coverColor={{ r: 0.04, g: 0.12, b: 0.12 }}\n  fringeColor={{ r: 0.15, g: 0.4, b: 0.38 }}\n  accentColor={{ r: 0, g: 0.9, b: 0.78 }}\n>\n  <div>Your content here</div>\n</FluidReveal>`}>
				<FluidReveal
					lazy
					containerShape={{ type: 'circle', cx: 0.5, cy: 0.5, radius: 0.45 }}
					coverColor={{ r: 0.04, g: 0.12, b: 0.12 }}
					fringeColor={{ r: 0.15, g: 0.4, b: 0.38 }}
					accentColor={{ r: 0, g: 0.9, b: 0.78 }}
				>
					<div class="reveal-content reveal-mosaic reveal-mosaic-teal">
						{#each Array(9) as _, i}
							<div class="mosaic-tile" style:background="hsl({160 + i * 15}, 55%, {35 + i * 5}%)"></div>
						{/each}
					</div>
				</FluidReveal>
			</Card>
			<Card title="Bounded reveal" description="Rounded-rect boundary with openBoundary off — fluid bounces off the walls, creating turbulence at the edges." onCustomize={() => loadConfig(PRESET_CONFIGS['Bounded reveal'], 'Bounded reveal')} snippet={`<FluidReveal\n  openBoundary={false}\n  curl={10}\n  containerShape={{\n    type: 'roundedRect',\n    cx: 0.5, cy: 0.5,\n    halfW: 0.38, halfH: 0.42,\n    cornerRadius: 0.08\n  }}\n  coverColor={{ r: 0.16, g: 0.06, b: 0.12 }}\n  fringeColor={{ r: 0.55, g: 0.25, b: 0.22 }}\n  accentColor={{ r: 1, g: 0.48, b: 0.36 }}\n>\n  <div>Your content here</div>\n</FluidReveal>`}>
				<FluidReveal
					lazy
					openBoundary={false}
					curl={10}
					containerShape={{ type: 'roundedRect', cx: 0.5, cy: 0.5, halfW: 0.38, halfH: 0.42, cornerRadius: 0.08 }}
					coverColor={{ r: 0.16, g: 0.06, b: 0.12 }}
					fringeColor={{ r: 0.55, g: 0.25, b: 0.22 }}
					accentColor={{ r: 1, g: 0.48, b: 0.36 }}
				>
					<div class="reveal-content reveal-mosaic reveal-mosaic-warm">
						{#each Array(9) as _, i}
							<div class="mosaic-tile" style:background="hsl({0 + i * 12}, 60%, {30 + i * 6}%)"></div>
						{/each}
					</div>
				</FluidReveal>
			</Card>
		</div>
	</section>

	<section id="distortion">
		<header class="section-header">
			<h2>Distortion</h2>
			<p>
				<code>&lt;FluidDistortion&gt;</code> warps an image using the fluid velocity field.
				Move your cursor to create liquid ripples.
			</p>
		</header>
		<div class="grid-2col">
			<Card title="Image distortion" description="Cursor movement warps the image like liquid glass. The velocity field bends UV coordinates." onCustomize={() => loadConfig(PRESET_CONFIGS['Image distortion'], 'Image distortion')} snippet={`<FluidDistortion\n  src="/bosch-garden.jpg"\n  strength={0.4}\n  intensity={24}\n/>`}>
				<FluidDistortion
					lazy
					src="/bosch-garden.jpg"
					strength={0.4}
					intensity={24}
				/>
			</Card>
			<Card title="Auto-distort" description="An automated cursor creates a continuous ripple effect. Touch or click to take over." onCustomize={() => loadConfig(PRESET_CONFIGS['Auto-distort'], 'Auto-distort')} snippet={`<FluidDistortion\n  src="/bosch-garden.jpg"\n  autoDistort\n  autoDistortSpeed={1.0}\n  strength={0.3}\n  intensity={20}\n/>`}>
				<FluidDistortion
					lazy
					src="/bosch-garden.jpg"
					autoDistort
					autoDistortSpeed={1.0}
					strength={0.3}
					intensity={20}
				/>
			</Card>
			<Card title="Strong warp" description="High distortion power and intensity for dramatic liquid warping." onCustomize={() => loadConfig(PRESET_CONFIGS['Strong warp'], 'Strong warp')} snippet={`<FluidDistortion\n  src="/bosch-garden.jpg"\n  strength={0.8}\n  intensity={50}\n  velocityDissipation={0.95}\n/>`}>
				<FluidDistortion
					lazy
					src="/bosch-garden.jpg"
					strength={0.8}
					intensity={50}
					velocityDissipation={0.95}
				/>
			</Card>
			<Card title="Contained with shape" description="Distortion confined to a circular container shape." onCustomize={() => loadConfig(PRESET_CONFIGS['Contained distortion'], 'Contained distortion')} snippet={`<FluidDistortion\n  src="/bosch-garden.jpg"\n  strength={0.4}\n  intensity={24}\n  containerShape={{\n    type: 'circle',\n    cx: 0.5, cy: 0.5,\n    radius: 0.45\n  }}\n/>`}>
				<FluidDistortion
					lazy
					src="/bosch-garden.jpg"
					strength={0.4}
					intensity={24}
					containerShape={{ type: 'circle', cx: 0.5, cy: 0.5, radius: 0.45 }}
				/>
			</Card>
		</div>
	</section>

	<section id="sticky">
		<header class="section-header">
			<h2>Sticky</h2>
			<p>
				<code>&lt;FluidStick&gt;</code> makes dye cling to text or SVG paths.
				Physics-level modulation: reduced dissipation, artificial pressure, and amplified splats.
			</p>
		</header>
		<div class="grid-2col">
			<Card title="Sticky text" description="Dye accumulates on the word and resists fading. Fluid flows around the letterforms." onCustomize={() => loadConfig(PRESET_CONFIGS['Sticky text'], 'Sticky text')} snippet={`<FluidStick\n  text="FLUID"\n  font="900 120px sans-serif"\n/>`}>
				<FluidStick
					lazy
					text="FLUID"
					font="900 120px 'Helvetica Neue', Arial, sans-serif"
				/>
			</Card>
			<Card title="Lightning bolt" description="SVG path acts as a dye attractor. The shape glows with accumulated color." onCustomize={() => loadConfig(PRESET_CONFIGS['Lightning bolt'], 'Lightning bolt')} snippet={`<FluidStick\n  d="M55 5 L25 45 L45 45 L20 95\n     L75 50 L55 50 L80 5 Z"\n/>`}>
				<FluidStick
					lazy
					d="M55 5 L25 45 L45 45 L20 95 L75 50 L55 50 L80 5 Z"
				/>
			</Card>
			<Card title="Sticky + circle" description="Sticky text inside a circular container. The fluid is confined to the circle while dye clings to the letters." onCustomize={() => loadConfig(PRESET_CONFIGS['Sticky + circle'], 'Sticky + circle')} snippet={`<FluidStick\n  text="HI"\n  font="bold 72px sans-serif"\n  maskPadding={0.5}\n  containerShape={{\n    type: 'circle',\n    cx: 0.5, cy: 0.5,\n    radius: 0.45\n  }}\n/>`}>
				<FluidStick
					lazy
					text="HI"
					font="bold 72px 'Helvetica Neue', Arial, sans-serif"
					maskPadding={0.5}
					containerShape={{ type: 'circle', cx: 0.5, cy: 0.5, radius: 0.45 }}
				/>
			</Card>
			<Card title="Strong pressure" description="High stickyPressure makes fluid visibly deflect around the shape, creating turbulent vortices." onCustomize={() => loadConfig(PRESET_CONFIGS['Strong pressure'], 'Strong pressure')} snippet={`<FluidStick\n  d="M50 5 L5 95 L95 95 Z"\n  stickyPressureAmount={0.5}\n/>`}>
				<FluidStick
					lazy
					d="M50 5 L5 95 L95 95 Z"
					stickyPressureAmount={0.5}
				/>
			</Card>
		</div>
	</section>

	<section id="playground" class="playground-section">
		<header class="section-header">
			<h2>Playground</h2>
			<p>
				Tweak any parameter live. Switch between <code>&lt;Fluid&gt;</code>,
				<code>&lt;FluidReveal&gt;</code>, <code>&lt;FluidStick&gt;</code>, and
				<code>&lt;FluidDistortion&gt;</code> modes.
			</p>
		</header>
	<div class="playground">
		<div class="playground-canvas" bind:clientWidth={canvasWidth} bind:clientHeight={canvasHeight}>
			{#if playgroundMode === 'reveal'}
				{#key revealAutoReveal}
				<FluidReveal
					sensitivity={revealSensitivity}
					curve={revealCurve}
					fadeBack={revealFadeBack}
					autoReveal={revealAutoReveal}
					autoRevealSpeed={revealAutoRevealSpeed}
					coverColor={revealCoverRgb}
					fringeColor={revealFringeRgb}
					accentColor={revealAccentRgb}
					{splatRadius}
					{splatForce}
					{curl}
					{densityDissipation}
					{velocityDissipation}
					{pressure}
					{pressureIterations}
					{bloomIntensity}
					{sunraysWeight}
					{bloom}
					{sunrays}
					{shading}
					{colorful}
					{paused}
					{splatOnHover}
					{dyeResolution}
					{simResolution}
					{randomSplatRate}
					{randomSplatCount}
					{randomSplatSwirl}
					{randomSplatSpread}
					{randomSplatSpawnY}
					{randomSplatDx}
					{randomSplatDy}
					{randomSplatEvenSpacing}
					{transparent}
					backColor={{ r: backColorR, g: backColorG, b: backColorB }}
					containerShape={containerShapeType !== 'none' ? containerShape : undefined}
					{glass}
					{glassThickness}
					{glassRefraction}
					{glassReflectivity}
					{glassChromatic}
				>
					{#if revealContent === 'mosaic'}
						<div class="playground-reveal-content playground-reveal-mosaic">
							{#each Array(9) as _, i}
								<div class="playground-mosaic-tile" style:background="hsl({i * 40}, 65%, 55%)"></div>
							{/each}
						</div>
					{:else}
						<div class="playground-reveal-content reveal-gradient">
							<span class="playground-reveal-label">Hello World</span>
						</div>
					{/if}
				</FluidReveal>
				{/key}
			{:else if playgroundMode === 'sticky'}
				{#key stickyRemountKey}
				<FluidStick
					text={stickyText || undefined}
					font={stickyFont}
					d={stickyD || undefined}
					maskBlur={stickyMaskBlur}
					maskPadding={stickyMaskPadding}
					strength={stickyStrength}
					amplify={stickyAmplify}
					stickyPressureAmount={stickyPressure}
					autoAnimateSpeed={stickyAutoAnimateSpeed}
					autoAnimateDuration={stickyAutoAnimateDuration}
					seed={42}
					lazy
					{curl}
					{splatRadius}
					{splatForce}
					{densityDissipation}
					{velocityDissipation}
					{pressure}
					{bloomIntensity}
					{sunraysWeight}
					{bloom}
					{sunrays}
					{shading}
					{colorful}
					{paused}
					{splatOnHover}
					{dyeResolution}
					{simResolution}
					{randomSplatRate}
					{randomSplatCount}
					{randomSplatSwirl}
					{randomSplatSpread}
					{randomSplatSpawnY}
					{randomSplatDx}
					{randomSplatDy}
					{randomSplatEvenSpacing}
					containerShape={containerShapeType !== 'none' ? containerShape : undefined}
					{glass}
					{glassThickness}
					{glassRefraction}
					{glassReflectivity}
					{glassChromatic}
					{transparent}
					backColor={{ r: backColorR, g: backColorG, b: backColorB }}
				/>
				{/key}
			{:else if playgroundMode === 'distortion'}
				{#key distortionRemountKey}
				<FluidDistortion
					src={distortionSrc}
					strength={distortionStrength}
					intensity={distortionIntensity}
					autoDistort={distortionAutoDistort}
					autoDistortSpeed={distortionAutoDistortSpeed}
					initialSplats={distortionInitialSplats}
					seed={42}
					lazy
					{curl}
					{splatRadius}
					{splatForce}
					{densityDissipation}
					{velocityDissipation}
					{pressure}
					{bloomIntensity}
					{sunraysWeight}
					{bloom}
					{sunrays}
					{shading}
					{colorful}
					{paused}
					{splatOnHover}
					{dyeResolution}
					{simResolution}
					{randomSplatRate}
					{randomSplatCount}
					{randomSplatSwirl}
					{randomSplatSpread}
					{randomSplatSpawnY}
					{randomSplatDx}
					{randomSplatDy}
					{randomSplatEvenSpacing}
					{transparent}
					backColor={{ r: backColorR, g: backColorG, b: backColorB }}
					containerShape={containerShapeType !== 'none' ? containerShape : undefined}
					{glass}
					{glassThickness}
					{glassRefraction}
					{glassReflectivity}
					{glassChromatic}
				/>
				{/key}
			{:else}
				<Fluid
					bind:this={controlsRef}
					seed={42}
					lazy
					aria-label="Interactive playground fluid simulation"
					{curl}
					{splatRadius}
					{splatForce}
					{densityDissipation}
					{velocityDissipation}
					{pressure}
					{pressureIterations}
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
					{randomSplatCount}
					{randomSplatSwirl}
					{randomSplatSpread}
					{randomSplatSpawnY}
					{randomSplatDx}
					{randomSplatDy}
					{randomSplatEvenSpacing}
					{splatOnHover}
					{initialDensityDissipation}
					{initialDensityDissipationDuration}
					{transparent}
					{glass}
					{glassThickness}
					{glassRefraction}
					{glassReflectivity}
					{glassChromatic}
					backColor={backColor}
					containerShape={containerShape}
					initialSplatCount={15}
				/>
				{#if showShapePreview && containerShape}
					<ShapePreview shape={containerShape} width={canvasWidth} height={canvasHeight} />
				{/if}
			{/if}
		</div>
		<ControlPanel
			bind:playgroundMode
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
			bind:randomSplatCount
			bind:randomSplatSwirl
			bind:randomSplatSpread
			bind:randomSplatSpawnY
			bind:randomSplatDx
			bind:randomSplatDy
			bind:randomSplatEvenSpacing
			bind:splatOnHover
			bind:initialDensityDissipation
			bind:initialDensityDissipationDuration
			bind:revealSensitivity
			bind:revealCurve
			bind:revealFadeBack
			bind:revealAutoReveal
			bind:revealAutoRevealSpeed
			bind:revealContent
			bind:revealCoverColor
			bind:revealFringeColor
			bind:revealAccentColor
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
			bind:glass
			bind:glassThickness
			bind:glassRefraction
			bind:glassReflectivity
			bind:glassChromatic
			bind:showShapePreview
			bind:loadedPreset
			bind:stickyText
			bind:stickyFont
			bind:stickyD
			bind:stickyMaskBlur
			bind:stickyMaskPadding
			bind:stickyStrength
			bind:stickyAmplify
			bind:stickyPressure
			bind:stickyAutoAnimateSpeed
			bind:stickyAutoAnimateDuration
			bind:distortionSrc
			bind:distortionStrength
			bind:distortionIntensity
			bind:distortionAutoDistort
			bind:distortionAutoDistortSpeed
			bind:distortionInitialSplats
			onRemountSticky={() => stickyRemountKey++}
			onRemountDistortion={() => distortionRemountKey++}
			onRandomSplats={() => controlsRef?.handle.randomSplats(10)}
			onShare={shareUrl}
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
</FluidBackground>

<style>
	main {
		position: relative;
		max-width: 1100px;
		margin: 0 auto;
		padding: 64px 24px;
		display: flex;
		flex-direction: column;
		gap: 48px;
		pointer-events: none;
	}

	.bg-code-wrapper {
		position: fixed;
		top: 14px;
		right: 14px;
		z-index: 100;
		pointer-events: auto;
		display: flex;
		gap: 6px;
		align-items: flex-start;
	}
	.bg-code-toggle {
		padding: 4px 10px;
		font-size: 0.75rem;
		background: rgba(28, 42, 58, 0.9);
		border: 1px solid #2a4a6a;
		border-radius: 6px;
		color: #8bc;
		cursor: pointer;
		transition: all 120ms;
	}
	.bg-code-toggle:hover,
	.bg-code-toggle.active {
		background: rgba(36, 58, 82, 0.95);
		color: #cfe;
	}
	.bg-code-panel {
		position: absolute;
		top: calc(100% + 6px);
		right: 0;
		width: 340px;
		max-height: 360px;
		overflow: auto;
		background: #0d0d0d;
		border: 1px solid #222;
		border-radius: 8px;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
	}
	.bg-code-panel pre {
		margin: 0;
		padding: 10px 12px;
		font-size: 0.72rem;
		line-height: 1.5;
		color: #b0c4de;
	}
	.bg-copy-btn {
		position: absolute;
		top: 6px;
		right: 6px;
		padding: 2px 8px;
		font-size: 0.65rem;
		background: #222;
		border: 1px solid #333;
		border-radius: 3px;
		color: #888;
		cursor: pointer;
	}
	.bg-copy-btn:hover {
		color: #fff;
		border-color: #555;
	}

	header {
		text-align: center;
	}
	.hero-title {
		display: flex;
		justify-content: center;
		gap: 0;
		margin: 0 0 8px;
		pointer-events: auto;
	}
	.hero-code-row {
		display: flex;
		justify-content: center;
		margin: 4px 0 8px;
		pointer-events: auto;
	}
	.hero-code-toggle {
		padding: 2px 10px;
		font-size: 0.7rem;
		background: rgba(28, 42, 58, 0.7);
		border: 1px solid rgba(42, 74, 106, 0.5);
		border-radius: 4px;
		color: rgba(136, 187, 204, 0.7);
		cursor: pointer;
		transition: all 120ms;
	}
	.hero-code-toggle:hover,
	.hero-code-toggle.active {
		background: rgba(36, 58, 82, 0.9);
		color: #cfe;
		border-color: #2a4a6a;
	}
	.hero-code-panel {
		position: relative;
		max-width: 420px;
		margin: 0 auto 12px;
		pointer-events: auto;
	}
	.hero-code-panel pre {
		margin: 0;
		padding: 10px 12px;
		background: rgba(13, 13, 13, 0.9);
		border: 1px solid #222;
		border-radius: 6px;
		overflow-x: auto;
		font-size: 0.72rem;
		line-height: 1.5;
		color: #b0c4de;
	}
	.hero-copy-btn {
		position: absolute;
		top: 6px;
		right: 6px;
		padding: 2px 8px;
		font-size: 0.65rem;
		background: #222;
		border: 1px solid #333;
		border-radius: 3px;
		color: #888;
		cursor: pointer;
	}
	.hero-copy-btn:hover {
		color: #fff;
		border-color: #555;
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
		pointer-events: auto;
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
		pointer-events: auto;
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
		pointer-events: auto;
	}

	@media (max-width: 600px) {
		.grid-2col {
			grid-template-columns: 1fr;
		}
		main {
			padding: 40px 16px;
			gap: 32px;
		}
		.tagline {
			font-size: 0.9rem;
		}
		.get-started {
			padding: 16px 18px;
		}
		.bg-code-panel {
			width: calc(100vw - 28px);
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
		pointer-events: auto;
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
	@media (max-width: 480px) {
		.playground-canvas {
			min-height: 260px;
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

	/* ---- Playground reveal content ---- */
	.playground-reveal-content {
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 12px;
	}
	.playground-reveal-label {
		font-size: 1.6rem;
		font-weight: 700;
		color: #fff;
		text-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
	}
	.playground-reveal-mosaic {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 8px;
		padding: 12px;
		background: #1a1a2e;
	}
	.playground-mosaic-tile {
		aspect-ratio: 1;
		border-radius: 6px;
	}

	/* ---- Reveal section ---- */
	.reveal-content {
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		position: relative;
	}
	.reveal-label {
		font-size: 1.4rem;
		font-weight: 700;
		color: #fff;
		text-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
		z-index: 1;
	}
	.reveal-gradient {
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		border-radius: 12px;
	}
	.reveal-gradient-2 {
		background: linear-gradient(135deg, #f093fb 0%, #f5576c 50%, #4facfe 100%);
		border-radius: 12px;
	}
	.reveal-mosaic {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 6px;
		padding: 10px;
		background: #1a1a2e;
		border-radius: 12px;
	}
	.mosaic-tile {
		aspect-ratio: 1;
		border-radius: 6px;
	}
	.reveal-stars {
		background: linear-gradient(135deg, #0f0c29, #302b63, #24243e);
		border-radius: 12px;
	}
	.reveal-mosaic-teal {
		background: #0a2e2e;
	}
	.reveal-mosaic-warm {
		background: #2a0f1a;
	}
	.star {
		position: absolute;
		width: 16px;
		height: 16px;
		border-radius: 50%;
	}
</style>
