<script lang="ts">
	import { onMount } from 'svelte';
	import { LabSession } from './LabSession.js';
	import { createSoftType, type SoftTypeExperiment } from './soft-type.js';
	import { surfaceEnamelProfile, surfaceGeometry } from './surface-geometry.js';

	let { geometry, color = '#bd5c3b', onStatus = () => {} }: {
		geometry?: HTMLElement; color?: string;
		onStatus?: (status: { ready: boolean; reducedMotion: boolean; error: string }) => void;
	} = $props();
	let canvas: HTMLCanvasElement;
	let session: LabSession | undefined, engine: SoftTypeExperiment | undefined;
	let rebuild: (() => void) | undefined;
	let beginDemo: (() => void) | undefined, restNow: (() => void) | undefined;
	let available = $state(false);
	let reduced = false, visible = true;
	let demoPoint = { x: 0.4,y: 0.4 };

	export function tryPull() { beginDemo?.(); }
	export function reset() { restNow?.(); }
	$effect(() => { void geometry; void color; rebuild?.(); });

	onMount(() => {
		const host = canvas.parentElement!;
		const motion = matchMedia('(prefers-reduced-motion: reduce)');
		let disposed = false, generation = 0, resizeFrame = 0, started = false;
		let lastSize = '', pointerId: number | undefined;
		let builtSize = '', refreshError = '', fullRebuildQueued = false;
		let awake = false, restTimer: ReturnType<typeof setTimeout> | undefined;
		let point = { x: 0.5,y: 0.5 };
		let rasterPixelRatio = 0;
		reduced = motion.matches;
		function report(ready: boolean,error = '') {
			if (disposed) return;
			// The shared session publishes DPR-only resizes; the cached glyph
			// source must follow them as well as the final canvas dimensions.
			if (ready && engine && !refreshError && rasterPixelRatio !== window.devicePixelRatio) queueBuild(true);
			available = ready && !error && !refreshError;
			onStatus({ ready: available,reducedMotion: reduced,error: refreshError || error });
		}
		function clearRestTimer() { clearTimeout(restTimer); restTimer = undefined; }
		function rest() {
			clearRestTimer(); awake = false; pointerId = undefined;
			session?.pointer(point.x,point.y,false); session?.cancelContact();
			// Recovery has become visually negligible. Finish once at exact rest,
			// then LabSession's existing pause path submits no more GPU frames.
			session?.reset();
			if (session?.state.ready && !session.state.paused) session.pause();
		}
		function settleAfter(milliseconds: number) {
			clearRestTimer(); restTimer = setTimeout(rest,milliseconds);
		}
		function wake() {
			if (!available || reduced || !visible || document.hidden) return false;
			clearRestTimer(); awake = true;
			if (session?.state.paused) session.pause();
			return true;
		}
		restNow = rest;
		beginDemo = () => {
			if (!wake()) { if (reduced) rest(); return; }
			engine?.tryPull(demoPoint.x,demoPoint.y);
			session?.invalidate(); settleAfter(3450);
		};
		function release(event?: Event) {
			if (event instanceof PointerEvent && pointerId !== undefined && event.pointerId !== pointerId) return;
			pointerId = undefined;
			session?.pointer(point.x,point.y,false);
			session?.cancelContact();
			if (awake) settleAfter(1800);
		}
		function updateMotion() {
			reduced = motion.matches;
			if (refreshError) { report(false,refreshError); return; }
			if (!session?.state.ready) return;
			if (reduced || !visible || document.hidden || !awake) rest();
			report(session.state.ready,session.state.error);
		}
		async function build(profileOnly = false) {
			if (!session || disposed) return;
			const id = ++generation;
			try {
				await document.fonts.ready;
				if (disposed || id !== generation) return;
				rasterPixelRatio = window.devicePixelRatio;
				const bounds = host.getBoundingClientRect();
				const size = `${bounds.width}x${bounds.height}`;
				// Reserve the measured layout before awaiting GPU startup. A late
				// first observer delivery must not reset and replace this specimen.
				lastSize = size;
				session.resize(bounds.width,bounds.height);
				if (profileOnly && engine && builtSize === size) {
					if (session.state.error) throw new Error(session.state.error);
					await engine.updateEnamelProfile(surfaceEnamelProfile(host,geometry));
					if (disposed || id !== generation) return;
					session.invalidate(); report(session.state.ready,session.state.error);
					return;
				}
				refreshError = ''; rest(); report(false);
				const options = surfaceGeometry(host,geometry,color);
				if (options.initial) {
					let best = -Infinity;
					const width = options.width!,height = options.height!;
					options.initial.forEach((value,index) => {
						const x = (index%width+0.5)/width,y = (Math.floor(index/width)+0.5)/height;
						const score = value-Math.hypot((x-0.36)*2,y-0.4);
						if (score > best) { best = score; demoPoint = { x,y }; }
					});
				}
				await session.load(async (device,format) => {
					const candidate = await createSoftType(device,format,options);
					if (id === generation && !disposed) engine = candidate;
					return candidate;
				});
				if (disposed || id !== generation) return;
				builtSize = size;
				updateMotion();
			} catch (error) {
				if (disposed || id !== generation) return;
				refreshError = String(error);
				if (session.state.ready && !session.state.paused) session.pause();
				report(false,String(error));
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
		const intersection = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; updateMotion(); });
		intersection.observe(host);
		function down(event: PointerEvent) {
			if (event.pointerType !== 'touch' || !event.isPrimary || reduced || !visible || !available) return;
			pointerId = event.pointerId;
			move(event);
		}
		function move(event: PointerEvent) {
			if (!event.isPrimary || reduced || !visible || !available) return;
			if (event.pointerType === 'touch' && event.pointerId !== pointerId) return;
			if (!wake()) return;
			const bounds = host.getBoundingClientRect();
			point = { x: (event.clientX-bounds.left)/bounds.width,y: (event.clientY-bounds.top)/bounds.height };
			session?.pointer(point.x,point.y,true);
			session?.setContact(event.pointerType === 'touch' ? event.pressure : 0);
			settleAfter(1800);
		}
		// Hover needs no button; touch remains a passive observer of native scrolling.
		host.addEventListener('pointerdown',down,{ passive: true });
		host.addEventListener('pointermove',move,{ passive: true });
		host.addEventListener('pointerleave',release);
		window.addEventListener('pointerup',release);
		window.addEventListener('pointercancel',release);
		window.addEventListener('blur',rest);
		document.addEventListener('visibilitychange',updateMotion);
		motion.addEventListener('change',updateMotion);
		document.fonts.addEventListener('loadingdone',rebuild);
		void LabSession.create(canvas,(state) => report(state.ready,state.error),'premultiplied').then(async (created) => {
			if (disposed) { created.dispose(); return; }
			session = created; started = true; await build();
		}).catch((error) => report(false,String(error)));
		return () => {
			disposed = true; generation++; cancelAnimationFrame(resizeFrame); clearRestTimer();
			resize.disconnect(); intersection.disconnect();
			host.removeEventListener('pointerdown',down); host.removeEventListener('pointermove',move);
			host.removeEventListener('pointerleave',release);
			window.removeEventListener('pointerup',release); window.removeEventListener('pointercancel',release); window.removeEventListener('blur',rest);
			document.removeEventListener('visibilitychange',updateMotion);
			motion.removeEventListener('change',updateMotion);
			if (rebuild) document.fonts.removeEventListener('loadingdone',rebuild);
			rebuild = beginDemo = restNow = undefined; session?.dispose();
		};
	});
</script>

<canvas bind:this={canvas} aria-hidden="true" class:unavailable={!available}></canvas>

<style>
	canvas { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
	canvas.unavailable { visibility: hidden; }
</style>
