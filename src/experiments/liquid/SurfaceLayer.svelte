<script lang="ts">
	import { onMount } from 'svelte';
	import { LabSession } from './LabSession.js';
	import { createFilm, type FilmExperiment } from './film.js';
	import { surfaceEnamelProfile, surfaceGeometry } from './surface-geometry.js';

	interface Status { ready: boolean; error: string; memoryBytes: number;
		reducedMotion: boolean; interactive: boolean }
	let { geometry, color = '#a45b37', relief = true,
		onStatus = () => {} }: { geometry?: HTMLElement; color?: string;
		relief?: boolean; onStatus?: (status: Status) => void } = $props();
	let canvas: HTMLCanvasElement;
	let session: LabSession | undefined;
	let film: FilmExperiment | undefined;
	let rebuild: (() => void) | undefined;
	let available = $state(false);
	let reduced = false;
	let visible = true;
	let lastPoint = { x: 0.5, y: 0.5 };
	let demoPoint = { x: 0.4, y: 0.3 };

	export function sweep() { if (available && !reduced && visible) session?.nudge(demoPoint); }
	export function reset() { session?.reset(); }

	$effect(() => { const rounded = relief; film?.setRelief(rounded); session?.invalidate(); });
	$effect(() => { void color; void geometry; rebuild?.(); });

	onMount(() => {
		let disposed = false;
		let buildId = 0;
		let resizeFrame = 0;
		let lastSize = '';
		let builtSize = '', refreshError = '', fullRebuildQueued = false;
		let contactPointer: number | undefined;
		const host = canvas.parentElement!;
		const motion = matchMedia('(prefers-reduced-motion: reduce)');
		reduced = motion.matches;
		let started = false;
		let rasterPixelRatio = 0;
		function report(status: Pick<Status, 'ready' | 'error' | 'memoryBytes'>) {
			if (disposed) return;
			// LabSession already observes DPR changes and publishes its resize.
			// Refresh optical coverage only: a monitor change is not new material.
			if (status.ready && film && !refreshError && rasterPixelRatio !== window.devicePixelRatio) queueBuild(true);
			available = status.ready && !status.error && !refreshError;
			onStatus({ ...status, ready: available, error: refreshError || status.error,
				reducedMotion: reduced, interactive: available && visible && !reduced });
		}
		function updateMotion() {
			reduced = motion.matches;
			if (refreshError) { report({ ready: false, error: refreshError, memoryBytes: 0 }); return; }
			if (!session?.state.ready) return;
			const shouldPause = reduced || !visible;
			if (shouldPause) leave();
			if (shouldPause !== session.state.paused) session.pause();
			else report(session.state);
		}
		async function build(profileOnly = false) {
			if (!session || disposed) return;
			const id = ++buildId;
			try {
				await document.fonts.ready;
				if (disposed || id !== buildId) return;
				rasterPixelRatio = window.devicePixelRatio;
				// This borderless stage is also the glyph raster's CSS domain.
				const bounds = host.getBoundingClientRect();
				const size = `${bounds.width}x${bounds.height}`;
				// The initial observer delivery may follow async GPU startup. This
				// measured layout is already owned; equal delivery is not a new film.
				lastSize = size;
				session.resize(bounds.width, bounds.height);
				if (profileOnly && film && builtSize === size) {
					if (session.state.error) throw new Error(session.state.error);
					await film.updateEnamelProfile(surfaceEnamelProfile(host, geometry));
					if (disposed || id !== buildId) return;
					session.invalidate(); report(session.state);
					return;
				}
				available = false; refreshError = ''; leave();
				const options = surfaceGeometry(host, geometry, color);
				// Put the keyboard demonstration on actual material, not a letter's
				// counter or the whitespace between lines.
				if (options.initial) {
					let best = -Infinity;
					const width = options.width!, height = options.height!;
					options.initial.forEach((h, i) => {
						const x = (i % width + 0.5) / width, y = (Math.floor(i / width) + 0.5) / height;
						const score = h - Math.hypot((x - 0.43) * 2, y - 0.3);
						if (score > best) { best = score; demoPoint = { x, y }; }
					});
				}
				await session.load(async (device, format) => {
					const candidate = await createFilm(device, format, options);
					candidate.setRelief(relief);
					if (id === buildId && !disposed) film = candidate;
					return candidate;
				});
				if (disposed || id !== buildId) return;
				builtSize = size;
				updateMotion();
			} catch (error) {
				if (disposed || id !== buildId) return;
				refreshError = String(error);
				if (session.state.ready && !session.state.paused) session.pause();
				report({ ready: false, error: String(error), memoryBytes: 0 });
			}
		}
		function queueBuild(profileOnly = false) {
			fullRebuildQueued ||= !profileOnly;
			cancelAnimationFrame(resizeFrame);
			resizeFrame = requestAnimationFrame(() => {
				const only = !fullRebuildQueued; fullRebuildQueued = false;
				void build(only);
			});
		}
		rebuild = () => queueBuild();
		const resize = new ResizeObserver(() => {
			const bounds = host.getBoundingClientRect();
			const size = `${bounds.width}x${bounds.height}`;
			if (size !== lastSize) { lastSize = size; if (started) rebuild?.(); }
		});
		resize.observe(host);
		const intersection = new IntersectionObserver(([entry]) => {
			visible = entry.isIntersecting;
			updateMotion();
		});
		intersection.observe(host);
		function move(event: PointerEvent) {
			if (!event.isPrimary || !available || reduced || !visible) return;
			if (contactPointer !== undefined && event.pointerId !== contactPointer) return;
			if (event.buttons === 1) contactPointer = event.pointerId;
			// Observe native interaction; do not capture pointers or prevent scrolling/selection.
			const rect = host.getBoundingClientRect();
			lastPoint = { x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
				y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) };
			session?.pointer(lastPoint.x, lastPoint.y, true);
			session?.setContact(event.buttons === 1 ? (event.pointerType === 'pen' ? event.pressure : 1) : 0);
		}
		function leave(event?: Event) {
			if (event instanceof PointerEvent && (!event.isPrimary ||
				(contactPointer !== undefined && event.pointerId !== contactPointer))) return;
			contactPointer = undefined;
			session?.pointer(lastPoint.x, lastPoint.y, false);
			if (event?.type === 'pointerup' || event?.type === 'pointerleave') session?.setContact(0);
			else session?.cancelContact();
		}
		host.addEventListener('pointermove', move, { passive: true });
		host.addEventListener('pointerdown', move, { passive: true });
		host.addEventListener('pointerleave', leave);
		window.addEventListener('pointerup', leave);
		window.addEventListener('pointercancel', leave);
		window.addEventListener('blur', leave);
		motion.addEventListener('change', updateMotion);
		document.fonts.addEventListener('loadingdone', rebuild);
		void LabSession.create(canvas, (state) => report(state), 'premultiplied').then(async (created) => {
			if (disposed) { created.dispose(); return; }
			session = created;
			started = true;
			await build();
		}).catch((error) => report({ ready: false, error: String(error), memoryBytes: 0 }));
		return () => {
			disposed = true; buildId++;
			cancelAnimationFrame(resizeFrame);
			resize.disconnect(); intersection.disconnect();
			host.removeEventListener('pointermove', move);
			host.removeEventListener('pointerdown', move);
			host.removeEventListener('pointerleave', leave);
			window.removeEventListener('pointerup', leave);
			window.removeEventListener('pointercancel', leave);
			window.removeEventListener('blur', leave);
			motion.removeEventListener('change', updateMotion);
			if (rebuild) document.fonts.removeEventListener('loadingdone', rebuild);
			rebuild = undefined;
			session?.dispose();
		};
	});
</script>

<canvas bind:this={canvas} aria-hidden="true" class:unavailable={!available}></canvas>

<style>
	canvas { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
	canvas.unavailable { visibility: hidden; }
</style>
