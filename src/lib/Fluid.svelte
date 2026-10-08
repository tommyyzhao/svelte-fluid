<!--
  svelte-fluid — Fluid component
  Derivative work of WebGL-Fluid-Simulation by Pavel Dobryakov (c) 2017, MIT.

  Thin Svelte 5 wrapper around `FluidEngine`. Owns:
  - the canvas element + its parent container
  - the ResizeObserver that coalesces state-preserving engine resizes
  - the stable seed that survives across resizes
  - the imperative `handle` exposed to parents via bind:this
  - the $effect that propagates prop changes via engine.setConfig()
-->

<script lang="ts" module>
	export type { FluidProps } from './engine/types.js';
</script>

<script lang="ts">
	import type { FluidProps, FluidHandle } from './engine/types.js';
	import { onMount, untrack } from 'svelte';
	import {
		applyCssQualityPolicy,
		canvasPixelSize,
		cssQualityPolicy,
		type PolicyField
	} from './engine/resolution.js';
	import { DEFAULTS, FluidEngine } from './engine/FluidEngine.js';
	import { WebGLUnavailableError, type WebGLUnavailableReason } from './engine/gl-support.js';
	import { notifyHost } from './engine/notify-host.js';
	import { DISABLED_PERFORMANCE_STATE } from './engine/performance-governor.js';
	import { randomSeed } from './engine/rng.js';
	import { watchReducedMotion } from './engine/reduced-motion.js';

	let {
		width,
		height,
		maxPixelRatio = null,
		class: className,
		style,
		seed: seedProp,
		simResolution,
		dyeResolution,
		densityDissipation,
		initialDensityDissipation,
		initialDensityDissipationDuration,
		velocityDissipation,
		advectionScheme,
		maxTimeStep,
		substeps,
		viscosity,
		viscosityIterations,
		wallFriction,
		wallFrictionWidth,
		pressure,
		pressureIterations,
		autoPerformance,
		autoPerformanceTargetFrameMs,
		autoPerformanceMinPressureIterations,
		autoPerformanceMinSubsteps,
		curl,
		vorticityAdaptive,
		splatRadius,
		splatForce,
		shading,
		specular,
		refraction,
		colorful,
		colorUpdateSpeed,
		maxFps,
		paused,
		backColor,
		transparent,
		minContrast,
		contrastColor,
		contrastMode,
		toneMapping,
		bloom,
		bloomIterations,
		bloomResolution,
		bloomIntensity,
		bloomThreshold,
		bloomSoftKnee,
		sunrays,
		sunraysResolution,
		sunraysWeight,
		initialSplatCount,
		initialSplatCountMin,
		initialSplatCountMax,
		pointerInput = true,
		pointerTarget,
		splatOnHover,
		presetSplats,
		autoSplatRate,
		autoSplatCount,
		autoSplatColor,
		autoSplatVelocityX,
		autoSplatVelocityY,
		autoSplatCenterX,
		autoSplatCenterY,
		autoSplatEvenX,
		autoSplatSwirl,
		autoSplatBandHeight,
		autoSplatBandWidth,
		containerShape,
		obstructions,
		obstructionColor,
		flow,
		glass,
		glassThickness,
		glassRefraction,
		glassReflectivity,
		glassChromatic,
		reveal,
		revealSensitivity,
		revealCurve,
		revealCoverColor,
		revealAccentColor,
		revealFringeColor,
		distortion,
		distortionPower,
		distortionImageUrl,
		distortionFit,
		distortionScale,
		distortionBleedX,
		distortionBleedY,
		openBoundary,
		sticky,
		stickyMask,
		stickyStrength,
		stickyPressure,
		stickyAmplify,
		requireHardwareAcceleration,
		lazy = false,
		autoPause = true,
		fallback,
		poster,
		posterAlt,
		fallbackText = "This animation requires WebGL, which isn't available in your browser.",
		onReady,
		onError,
		'aria-hidden': ariaHidden,
		...rest
	}: FluidProps = $props();

	// Decorative unless the consumer names or roles the canvas themselves.
	const decorativeDefault = $derived(
		rest['aria-label'] || rest['aria-labelledby'] || rest.role ? undefined : 'true'
	);

	let canvasEl = $state<HTMLCanvasElement | undefined>(undefined);
	let container = $state<HTMLDivElement | undefined>(undefined);
	let engine: FluidEngine | undefined;
	// `lazy` and `autoPause` are captured once, like `seed`. Toggling after
	// mount has no effect — the observer wiring is decided in `onMount`.
	const stableLazy = untrack(() => lazy);
	const stableAutoPause = untrack(() => autoPause);
	// Like `seed`, captured once — re-acquiring a context mid-life isn't
	// supported, so this is construct-only (Bucket D).
	const stableRequireHW = untrack(() => requireHardwareAcceleration);
	const stableMaxPixelRatio = untrack(() => maxPixelRatio);
	let isVisible = !stableLazy;

	/**
	 * The last engine-init WebGL failure, or `null` when the engine is running.
	 * Stored raw (not pre-resolved) so {@link failureReason} can recompute the
	 * displayed state reactively when `reveal` changes at runtime. See ADR-0041.
	 */
	let lastError = $state<WebGLUnavailableError | null>(null);

	/**
	 * The reason to SHOW the accessible fallback, or `null` to stay blank.
	 * Permanent reasons always surface; a transient `context-limit` stays blank
	 * and retries — EXCEPT in reveal mode, where the canvas is transparent and a
	 * blank box would expose the content the reveal is meant to cover, so any
	 * failure masks. Derived (not set imperatively) so toggling `reveal` re-masks
	 * without waiting for a reconcile.
	 */
	const failureReason = $derived<WebGLUnavailableReason | null>(
		lastError && (lastError.reason !== 'context-limit' || reveal) ? lastError.reason : null
	);

	// Fill color for the default fallback box. Mode-aware so the fallback never
	// contradicts the live render's intent:
	//   - transparent mode → stay see-through (filling backColor would paint an
	//     opaque box where the author wanted compositing);
	//   - reveal mode → use the reveal COVER color (0–1 linear), because the
	//     canvas is transparent and a blank box would expose the very content
	//     the reveal is meant to hide;
	//   - otherwise → backColor (0–255 RGB, default black) to preserve layout.
	const fallbackFill = $derived.by(() => {
		// reveal's no-exposure guarantee outranks transparent: a reveal canvas is
		// transparent, so even with `transparent` also set the fallback must paint
		// the opaque cover color rather than leave covered content exposed.
		if (reveal) {
			const c = revealCoverColor ?? { r: 1, g: 1, b: 1 };
			return `rgb(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)})`;
		}
		if (transparent) return 'transparent';
		return backColor ? `rgb(${backColor.r}, ${backColor.g}, ${backColor.b})` : '#000';
	});

	// Context slot management for lazy mode. Browsers cap WebGL contexts
	// at ~16 per tab — calling loseContext() after dispose frees the slot
	// so other instances can use it. We save the extension ref because
	// getExtension() returns null on an already-lost context.
	let savedLoseExt: WEBGL_lose_context | undefined;
	let savedLoseGl: WebGLRenderingContext | WebGL2RenderingContext | undefined;
	let pendingRestore = false;

	/**
	 * Stable seed: generated once per mount, reused across every
	 * teardown/rebuild so resizing produces the same initial splat pattern.
	 * Intentionally NOT $state — we don't want it to be reactive.
	 * `untrack` reads `seedProp` once without subscribing.
	 */
	const stableSeed = ((untrack(() => seedProp) ?? randomSeed()) >>> 0) as number;

	/**
	 * Stable preset splats. Like `seed`, this is construct-only — the
	 * engine consumes it once during construction. Snapshot via `untrack`
	 * so the `$effect` below doesn't subscribe to a per-render array
	 * reference and so resize re-creates the same opening scene.
	 */
	const stablePresetSplats = untrack(() => presetSplats);

	// prefers-reduced-motion: hold a still frame instead of animating.
	let reduced = $state(false);

	let cssW = $state(0);
	let cssH = $state(0);

	// buildConfig: a still frame has no loop to consume pointer input (ADR 0085).
	function buildConfig() {
		return {
			simResolution,
			dyeResolution,
			densityDissipation,
			initialDensityDissipation,
			initialDensityDissipationDuration,
			velocityDissipation,
			advectionScheme,
			maxTimeStep,
			substeps,
			viscosity,
			viscosityIterations,
			wallFriction,
			wallFrictionWidth,
			pressure,
			pressureIterations,
			autoPerformance,
			autoPerformanceTargetFrameMs,
			autoPerformanceMinPressureIterations,
			autoPerformanceMinSubsteps,
			curl,
			vorticityAdaptive,
			splatRadius,
			splatForce,
			shading,
			specular,
			refraction,
			colorful,
			colorUpdateSpeed,
			maxFps,
			paused,
			backColor,
			transparent,
			minContrast,
			contrastColor,
			contrastMode,
			toneMapping,
			bloom,
			bloomIterations,
			bloomResolution,
			bloomIntensity,
			bloomThreshold,
			bloomSoftKnee,
			sunrays,
			sunraysResolution,
			sunraysWeight,
			initialSplatCount,
			initialSplatCountMin,
			initialSplatCountMax,
			autoSplatRate,
			autoSplatCount,
			autoSplatColor,
			autoSplatVelocityX,
			autoSplatVelocityY,
			autoSplatCenterX,
			autoSplatCenterY,
			autoSplatEvenX,
			autoSplatSwirl,
			autoSplatBandHeight,
			autoSplatBandWidth,
			containerShape,
			obstructions,
			obstructionColor,
			flow,
			glass,
			glassThickness,
			glassRefraction,
			glassReflectivity,
			glassChromatic,
			reveal,
			revealSensitivity,
			revealCurve,
			revealCoverColor,
			revealAccentColor,
			revealFringeColor,
			distortion,
			distortionPower,
			distortionImageUrl,
			distortionFit,
			distortionScale,
			distortionBleedX,
			distortionBleedY,
			openBoundary,
			sticky,
			stickyMask,
			stickyStrength,
			stickyPressure,
			stickyAmplify,
			pointerInput: reduced ? false : pointerInput,
			pointerTarget,
			splatOnHover,
			requireHardwareAcceleration: stableRequireHW,
			seed: stableSeed,
			presetSplats: stablePresetSplats
		};
	}

	let policyForced = new Set<PolicyField>();

	/** Resolve canvas-size policy without making CSS dimensions a Svelte effect dependency. */
	function buildCanvasConfig(
		cssWidth: number,
		cssHeight: number,
		physicalWidth: number,
		physicalHeight: number,
		cfg = buildConfig()
	) {
		const maxPx = Math.max(physicalWidth, physicalHeight);
		const policy = cssQualityPolicy(
			cssWidth,
			cssHeight,
			cfg.simResolution ?? 128,
			bloomIterations !== undefined,
			pressureIterations !== undefined
		);

		// Adaptive resolution: cap texture sizes to actual canvas pixels.
		cfg.dyeResolution = Math.min(cfg.dyeResolution ?? 1024, maxPx);
		cfg.bloomResolution = Math.min(cfg.bloomResolution ?? 256, maxPx);
		cfg.sunraysResolution = Math.min(cfg.sunraysResolution ?? 196, maxPx);

		// Small-canvas policy; undoes its injections once the canvas grows.
		policyForced = applyCssQualityPolicy(
			cfg,
			policy,
			{
				bloom: DEFAULTS.BLOOM,
				sunrays: DEFAULTS.SUNRAYS,
				bloomIterations: DEFAULTS.BLOOM_ITERATIONS,
				pressureIterations: DEFAULTS.PRESSURE_ITERATIONS
			},
			policyForced
		);
		return cfg;
	}

	function teardown() {
		// For lazy instances, grab the lose-context extension while the
		// context is still alive so we can release the slot afterward.
		// A shared-context engine (WebGL2, ADR-0093) frees its fields and host
		// reference in dispose(); never lose a context siblings still use, and
		// never create a WebGL context on a canvas that has none.
		if (stableLazy && canvasEl && engine && !engine.sharedContext && !savedLoseExt) {
			const gl =
				(canvasEl.getContext('webgl2') as WebGL2RenderingContext | null) ??
				(canvasEl.getContext('webgl') as WebGLRenderingContext | null);
			if (gl && !gl.isContextLost()) {
				savedLoseExt = gl.getExtension('WEBGL_lose_context') ?? undefined;
				savedLoseGl = savedLoseExt ? gl : undefined;
			}
		}
		engine?.dispose();
		engine = undefined;
		// Release the context slot so other lazy instances can use it.
		// preventDefault on contextlost is required — without it the browser
		// won't allow restoreContext() later (per WEBGL_lose_context spec).
		if (stableLazy && savedLoseExt && savedLoseGl && !savedLoseGl.isContextLost() && canvasEl) {
			canvasEl.addEventListener(
				'webglcontextlost',
				(e) => e.preventDefault(),
				{ once: true }
			);
			savedLoseExt.loseContext();
		} else if (savedLoseGl?.isContextLost()) {
			savedLoseExt = undefined;
			savedLoseGl = undefined;
		}
	}

	/**
	 * The shared scheduler evicted this engine because a frame threw. Surface the
	 * fallback and report once; no retry (ADR 0085). Stale evictions (the engine
	 * was already replaced) are ignored.
	 */
	function handleFrameError(source: FluidEngine, cause: unknown) {
		if (engine !== source) return;
		const error = cause instanceof Error ? cause : new Error(String(cause));
		lastError = new WebGLUnavailableError('render-failed', error.message);
		teardown();
		notifyHost(onError, 'onError', error);
	}

	function instantiate() {
		if (!canvasEl || cssW === 0 || cssH === 0 || !isVisible) return;
		if (pendingRestore) return;
		// A permanent failure won't recover by retrying — skip re-instantiation
		// (and the capability probe / doomed engine init it entails) on every
		// resize/scroll reconcile. The fallback overlay already fills the resized
		// container. Transient context-limit still retries (failureReason is null,
		// or 'context-limit' when reveal masked it).
		// `render-failed` is terminal by design: no retry loop (ADR 0085).
		if (
			failureReason === 'no-webgl' ||
			failureReason === 'no-float-textures' ||
			failureReason === 'render-failed'
		)
			return;

		// If the context was lost by a previous lazy teardown, restore it
		// before creating a new engine. restoreContext() is async — wait
		// for webglcontextrestored before proceeding.
			if (savedLoseExt) {
				pendingRestore = true;
				const ext = savedLoseExt;
				savedLoseExt = undefined;
				savedLoseGl = undefined;
			canvasEl.addEventListener(
				'webglcontextrestored',
				() => {
					pendingRestore = false;
					reconcile();
				},
				{ once: true }
			);
			ext.restoreContext();
			return;
		}

		const size = canvasPixelSize(cssW, cssH, window.devicePixelRatio || 1, stableMaxPixelRatio);
		canvasEl.width = size.width;
		canvasEl.height = size.height;

		const cfg = buildCanvasConfig(cssW, cssH, canvasEl.width, canvasEl.height);

		try {
			const created: FluidEngine = new FluidEngine({
				canvas: canvasEl,
				config: cfg,
				onFrameError: (cause) => handleFrameError(created, cause)
			});
			engine = created;
			lastError = null;
			// Reduced motion: settle the opening into a finished still, no RAF.
			if (reduced) created.settleStill();
			// `autoPause` must hold for a tab that is already hidden: the engine
			// starts its RAF loop in the constructor, so stop it again here. The
			// visibilitychange handler resumes it.
			if (stableAutoPause && typeof document !== 'undefined' && document.hidden) engine.pause();
			// The constructor schedules the first frame (unless the tab is hidden).
			notifyHost(onReady, 'onReady');
		} catch (err) {
			// Engine init can fail. Degrade gracefully — never crash the host page.
			// The transient/permanent + reveal-masking policy lives in the
			// `failureReason` derived; here we just record the typed error (or, for
			// a non-WebGL engine error like a shader-compile failure per ADR-0008,
			// stay blank and surface it rather than misdiagnose an unsupported browser).
			engine = undefined;
			if (err instanceof WebGLUnavailableError) {
				lastError = err;
			} else {
				lastError = null;
				console.error('svelte-fluid: engine initialization failed', err);
			}
			notifyHost(onError, 'onError', err instanceof Error ? err : new Error(String(err)));
		}
	}

	/**
	 * Reconcile engine existence with the current (cssW, cssH, isVisible)
	 * tuple. Called from both the ResizeObserver and the IntersectionObserver
	 * so the two observers stay in sync without racing.
	 */
	function reconcile() {
		const shouldExist = isVisible && cssW > 0 && cssH > 0;
		if (shouldExist && !engine) {
			instantiate();
		} else if (!shouldExist && engine) {
			teardown();
		}
	}

	/** Imperative API exposed to parents via `bind:this`. */
	export const handle: FluidHandle = {
		splat: (x, y, dx, dy, color) => engine?.splat(x, y, dx, dy, color),
		randomSplats: (count) => engine?.randomSplats(count),
		pause: () => engine?.pause(),
		resume: () => engine?.resume(),
		// A settled engine (ADR 0099) is idle, not paused: it wakes on input, and
		// auto-animation wrappers keyed on isPaused must keep feeding it splats.
		get isPaused() { return engine ? engine.isPaused && !engine.isSettled : true; },
		getPerformanceState: () => engine?.getPerformanceState() ?? DISABLED_PERFORMANCE_STATE
	};

	onMount(() => {
		const stopReduced = watchReducedMotion((v) => (reduced = v));
		if (!container) {
			return stopReduced;
		}
		let resizeFrame = 0;
		let rebuildingAfterResizeFailure = false;

		const applyResize = () => {
			resizeFrame = 0;
			if (!canvasEl || !engine || !isVisible || cssW <= 0 || cssH <= 0) {
				reconcile();
				return;
			}
			const size = canvasPixelSize(cssW, cssH, window.devicePixelRatio || 1, stableMaxPixelRatio);
			const physicalWidth = size.width;
			const physicalHeight = size.height;
			try {
				engine.resize(physicalWidth, physicalHeight);
				// A failed shared-context transition tears the engine down (render-failed).
				if (engine) engine.setConfig(buildCanvasConfig(cssW, cssH, canvasEl.width, canvasEl.height));
				rebuildingAfterResizeFailure = false;
			} catch (err) {
				// A resize failure can leave an uncertain GL resource set. Rebuild
				// once through the established constructor fallback, never in a loop.
				console.error('svelte-fluid: in-place resize failed; rebuilding once', err);
				if (rebuildingAfterResizeFailure) return;
				rebuildingAfterResizeFailure = true;
				teardown();
				instantiate();
			}
		};

		const scheduleResize = () => {
			if (resizeFrame) return;
			resizeFrame = requestAnimationFrame(applyResize);
		};

		const ro = new ResizeObserver((entries) => {
			for (const entry of entries) {
				const box = entry.contentBoxSize?.[0];
				const w = box ? box.inlineSize : entry.contentRect.width;
				const h = box ? box.blockSize : entry.contentRect.height;
				if (w === cssW && h === cssH) continue;
				cssW = w;
				cssH = h;
				if (w <= 0 || h <= 0) {
					if (resizeFrame) cancelAnimationFrame(resizeFrame);
					resizeFrame = 0;
					reconcile();
				} else if (engine) {
					scheduleResize();
				} else {
					reconcile();
				}
			}
		});
		ro.observe(container);

		// A CSS content-box notification need not accompany a screen/zoom DPR change.
		let mounted = true;
		let resolutionMedia: MediaQueryList | undefined;
		const onDprChange = () => {
			if (!mounted) return;
			watchDpr();
			scheduleResize();
		};
		const watchDpr = () => {
			resolutionMedia?.removeEventListener?.('change', onDprChange);
			if (typeof window.matchMedia !== 'function') return;
			resolutionMedia = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
			resolutionMedia.addEventListener?.('change', onDprChange);
		};
		// ponytail: absent resolution notifications leave DPR updates CSS-resize-driven.
		watchDpr();

		// --- Scroll visibility ---
		// `lazy` mode: full teardown/rebuild when scrolling out/into view.
		// `autoPause` mode (without lazy): pause/resume the RAF loop.
		// Both use IntersectionObserver; lazy takes precedence.
		let io: IntersectionObserver | undefined;
		let inViewport = true;
		if (stableLazy || stableAutoPause) {
			io = new IntersectionObserver(
				(entries) => {
					for (const entry of entries) {
						inViewport = entry.isIntersecting;
						if (stableLazy) {
							// Lazy mode: teardown/rebuild
							if (entry.isIntersecting === isVisible) continue;
							isVisible = entry.isIntersecting;
							reconcile();
						} else if (stableAutoPause) {
							// autoPause mode: pause/resume RAF
							if (entry.isIntersecting) {
								engine?.resume();
							} else {
								engine?.pause();
							}
						}
					}
				},
				{ rootMargin: '50px' }
			);
			io.observe(container);
		}

		// --- Page Visibility API ---
		// Pause all engines when the tab is hidden, regardless of scroll.
		let onVisibilityChange: (() => void) | undefined;
		if (stableAutoPause) {
			onVisibilityChange = () => {
				if (document.hidden) {
					engine?.pause();
				} else if (inViewport) {
					// Only resume if the canvas is still in the viewport.
					engine?.resume();
				}
			};
			document.addEventListener('visibilitychange', onVisibilityChange);
		}

		return () => {
			mounted = false;
			resolutionMedia?.removeEventListener?.('change', onDprChange);
			stopReduced();
			ro.disconnect();
			io?.disconnect();
			if (onVisibilityChange) {
				document.removeEventListener('visibilitychange', onVisibilityChange);
			}
			if (resizeFrame) cancelAnimationFrame(resizeFrame);
			resizeFrame = 0;
			pendingRestore = false;
			teardown();
		};
	});

	// Live reduced-motion toggle: still <-> animate without rebuilding the engine.
	$effect(() => {
		const r = reduced;
		untrack(() => {
			if (!engine) return;
			if (r) engine.settleStill();
			else engine.endStill();
		});
	});

	/**
	 * Hot prop updates. Buckets A/B/C are handled inside `engine.setConfig`.
	 * Bucket D fields (seed / initialSplatCount* / presetSplats /
	 * requireHardwareAcceleration / maxPixelRatio / advectionScheme) are
	 * applied only at construction time and ignored here.
	 */
	$effect(() => {
		// Touch every tracked field so the effect re-runs on any change.
		const cfg = buildConfig();
		if (engine && canvasEl) {
			engine.setConfig(
				buildCanvasConfig(untrack(() => cssW), untrack(() => cssH), canvasEl.width, canvasEl.height, cfg)
			);
		}
	});
</script>

<div
	bind:this={container}
	class={`svelte-fluid-container ${className ?? ''}`.trim()}
	style:width={width != null ? `${width}px` : undefined}
	style:height={height != null ? `${height}px` : undefined}
	{style}
>
	<canvas
		bind:this={canvasEl}
		style:background={transparent || reveal ? 'transparent' : undefined}
		{...rest}
		aria-hidden={failureReason ? 'true' : (ariaHidden ?? decorativeDefault)}
	></canvas>
	{#if failureReason}
		<div
			class="svelte-fluid-fallback"
			class:inert={!fallback}
			style:background={fallback ? undefined : fallbackFill}
		>
			{#if fallback}
				{@render fallback({ reason: failureReason })}
			{:else}
				{#if poster}
					<img class="svelte-fluid-poster" src={poster} alt={posterAlt ?? ''} />
				{/if}
				{#if fallbackText}
					<!-- Discoverable (not announced) failure text. Rendered alongside a
					     decorative poster too, since the dead canvas is aria-hidden. -->
					<span class="svelte-fluid-fallback-text">{fallbackText}</span>
				{/if}
			{/if}
		</div>
	{/if}
</div>

<style>
	.svelte-fluid-container {
		width: 100%;
		height: 100%;
		position: relative;
		overflow: hidden;
	}
	.svelte-fluid-container canvas {
		display: block;
		width: 100%;
		height: 100%;
		background: #000;
		/* touch-action is set by the engine only while the canvas owns drags (ADR 0083). */
	}
	/* Accessible WebGL fallback overlay (ADR-0041). Covers the blank canvas
	   when WebGL is permanently unavailable. */
	.svelte-fluid-fallback {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	/* Default (non-snippet) fallbacks are inert — don't intercept pointer events
	   meant for content behind a full-bleed instance (e.g. FluidBackground). A
	   consumer-supplied `fallback` snippet keeps pointer events so it can be
	   interactive. */
	.svelte-fluid-fallback.inert {
		pointer-events: none;
	}
	.svelte-fluid-poster {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}
	/* Visually hidden, still announced to assistive tech. */
	.svelte-fluid-fallback-text {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		clip-path: inset(50%);
		white-space: nowrap;
		border: 0;
	}
</style>
