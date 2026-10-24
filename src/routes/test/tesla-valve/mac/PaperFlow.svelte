<script lang="ts">
	import { onMount } from 'svelte';
	import { PaperMacEngine, type MacOptions } from './engine.js';

	let {
		options,
		stepsPerFrame = 4,
		prerollSeconds = 20,
		dyePrerollSeconds = 0
	}: { options: MacOptions; stepsPerFrame?: number; prerollSeconds?: number; dyePrerollSeconds?: number } = $props();
	let canvas: HTMLCanvasElement;
	let message = $state('Developing flow…');
	let tracerFallback = $state<string | null>(null);

	onMount(() => {
		let engine: PaperMacEngine;
		try {
			engine = new PaperMacEngine(canvas, options);
			tracerFallback = engine.tracerFallback;
		} catch (error) {
			message = error instanceof Error ? error.message : String(error);
			return;
		}
		let frame = 0, idle = 0, disposed = false, visible = false;
		let developing = true, stillReady = false;
		const motion = matchMedia('(prefers-reduced-motion: reduce)');
		const fixedSteps = Math.round(prerollSeconds / engine.options.dt);
		const dyePrerollSteps = Math.round(dyePrerollSeconds / engine.options.dt);
		const speed = engine.options.targetRe * engine.options.nu / engine.geometry.hydraulicDiameter;
		const stillSteps = Math.round(.25 * engine.geometry.valveWidth / speed / engine.options.dt);
		const stillCaption = 'Still frame: motion paused by reduced-motion preference.';
		if (motion.matches) message = 'Developing a still frame…';
		const started = performance.now();
		const stats = {
			ready: false, step: 0, stepsPerFrame, dt: engine.options.dt,
			physicalSeconds: 0, prerollWallSeconds: 0, gpuFrameMs: engine.gpuFrameMs
		};
		Object.assign(canvas, { paperFlowStats: stats });
		// Context loss kills every GL object; rebuilding mid-run would break the fixed trajectory, so the
		// user restarts (the page remounts this component via {#key generation}).
		const onLost = (event: Event) => {
			event.preventDefault();
			disposed = true;
			cancelAnimationFrame(frame);
			if (idle && typeof cancelIdleCallback === 'function') cancelIdleCallback(idle);
			message = 'GPU context lost — press Restart';
		};
		canvas.addEventListener('webglcontextlost', onLost);
		const resize = new ResizeObserver(() => {
			const rect = canvas.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
			canvas.width = Math.max(1, Math.round(rect.width * dpr));
			canvas.height = Math.max(1, Math.round(rect.height * dpr));
			if (!motion.matches || stillReady) engine.render();
		});
		resize.observe(canvas);
		const onMotion = () => {
			if (motion.matches) {
				stillReady = !developing && engine.stepCount >= fixedSteps + dyePrerollSteps + stillSteps;
				message = stillReady ? stillCaption : 'Developing a still frame…';
			} else message = developing ? 'Developing flow…' : '';
		};
		motion.addEventListener('change', onMotion);
		const intersect = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; });
		intersect.observe(canvas);
		const tick = () => {
			if (disposed) return;
			if (!document.hidden && visible && (!motion.matches || !stillReady)) {
				try {
					if (motion.matches && !developing) {
						engine.advance(Math.min(30, fixedSteps + dyePrerollSteps + stillSteps - engine.stepCount));
						if (engine.stepCount >= fixedSteps + dyePrerollSteps + stillSteps) {
							engine.render(); stillReady = true; message = stillCaption;
						}
					} else if (developing) {
						// Fixed trajectory; only presentation and passive dye are omitted.
						if (engine.stepCount < fixedSteps) engine.advance(Math.min(60, fixedSteps - engine.stepCount), false);
						else engine.advance(Math.min(60, fixedSteps + dyePrerollSteps - engine.stepCount));
						if (engine.stepCount >= fixedSteps + dyePrerollSteps) {
							developing = false;
							message = motion.matches ? 'Developing a still frame…' : '';
							stats.ready = true;
							stats.prerollWallSeconds = (performance.now() - started) / 1000;
						}
					} else engine.frame(stepsPerFrame);
					stats.step = engine.stepCount;
					stats.physicalSeconds = Math.max(0, engine.stepCount - fixedSteps - dyePrerollSteps) * engine.options.dt * engine.options.nu / (.0089 * engine.geometry.cellsPerCm ** 2);
				} catch (error) {
					message = error instanceof Error ? error.message : String(error);
					disposed = true; engine.dispose();
				}
			}
			if (!disposed) {
				if (motion.matches && !stillReady && visible && !document.hidden && typeof requestIdleCallback === 'function') {
					idle = requestIdleCallback(tick, { timeout: 100 });
				} else frame = requestAnimationFrame(tick);
			}
		};
		frame = requestAnimationFrame(tick);
		return () => {
			disposed = true; cancelAnimationFrame(frame);
			if (idle && typeof cancelIdleCallback === 'function') cancelIdleCallback(idle);
			motion.removeEventListener('change', onMotion);
			canvas.removeEventListener('webglcontextlost', onLost);
			resize.disconnect(); intersect.disconnect(); engine.dispose();
		};
	});
</script>

<canvas bind:this={canvas} aria-label="Two-dimensional Tesla valve: blue and green passive dye filaments"></canvas>
{#if message}<p class:caption={message.startsWith('Still frame:')} role="status">{message}</p>{/if}
{#if tracerFallback}<p class="caption" role="status">Tracer rendering unavailable; showing Eulerian dye. {tracerFallback}</p>{/if}

<style>
	canvas { display: block; width: 100%; height: 100%; }
	p {
		position: absolute; inset: 0; display: grid; place-items: center;
		margin: 0; color: #22333a; background: #ffffffe6; font: .9rem system-ui, sans-serif;
	}
	p.caption { inset: auto 0 0 auto; display: block; padding: .2rem .4rem; font-size: .7rem; }
</style>
