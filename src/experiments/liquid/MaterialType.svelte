<script lang="ts">
	import { onMount } from 'svelte';
	import { LabSession } from './LabSession.js';
	import { createMaterialType, smoothTypeProfile, type MaterialTypeExperiment } from './material-type.js';
	import { surfaceEnamelProfile } from './surface-geometry.js';
	let { finish = 'velvet', baseline = false, light = 230, bending = false, available = $bindable(false) }: {
		finish?: 'velvet' | 'enamel'; baseline?: boolean; light?: number; bending?: boolean; available?: boolean;
	} = $props();
	let host: HTMLDivElement, heading: HTMLHeadingElement, canvas: HTMLCanvasElement;
	let session: LabSession | undefined, model: MaterialTypeExperiment | undefined;
	let error = $state(''), ready = $state(false), reduced = $state(false), sleeping = $state(true), rasterPending = $state(true);
	let releaseTimer: ReturnType<typeof setTimeout> | undefined, sleepTimer: ReturnType<typeof setTimeout> | undefined;
	let visible = true, point = { x: 0.5, y: 0.5 };
	let continuous=false,forceIdle=true,inputMode='';
	$effect(() => { available = ready && !error && !rasterPending; });
	$effect(() => {
		// Read reactive inputs even before the async model exists. Optional
		// calls otherwise short-circuit those reads and never subscribe to them.
		const nextFinish=finish,nextLight=light,nextBaseline=baseline,nextBending=bending;
		const mode=`${nextFinish}:${nextBaseline}:${nextBending}`;
		if(mode!==inputMode){breakStroke();inputMode=mode;}
		model?.setFinish(nextFinish);model?.setLight(nextLight*Math.PI/180);model?.setBaseline(nextBaseline);model?.setGeometryMotion(nextBending);session?.invalidate();
	});
	function breakStroke() {
		continuous=false;forceIdle=true;
		// Ending local continuity must also stop LabSession subtracting the old
		// endpoint after a layout/mode change. Do not reset material or elasticity.
		session?.pointer(point.x,point.y,false);
	}
	function sleep(settle = false) {
		clearTimeout(releaseTimer); clearTimeout(sleepTimer);
		forceIdle=true;
		session?.pointer(point.x,point.y,false); session?.cancelNudge(); session?.cancelContact();
		if (settle) { model?.setDeformation(0,0); session?.invalidate(); }
		if (session && !session.state.paused) session.pause(); sleeping = true;
	}
	function interrupt(settle=true) { breakStroke(); sleep(settle); }
	function release() {
		clearTimeout(releaseTimer); clearTimeout(sleepTimer);
		forceIdle=true;
		session?.pointer(point.x,point.y,false); session?.cancelNudge();
		sleepTimer = setTimeout(() => sleep(true),2100);
	}
	export function reset() { interrupt(false); session?.reset(); }
	export function demo() {
		if (!available) return;
		breakStroke();
		if (reduced || baseline) {
			model?.brush([0.2,0.49],[0.82,0.53]);
			if (!baseline && bending) model?.setDeformation(0.075,-0.025,0.5,0.5);
			session?.invalidate(); return;
		}
		clearTimeout(releaseTimer); clearTimeout(sleepTimer);
		if (session?.state.paused) session.pause(); sleeping = false;
		session?.nudge(); releaseTimer = setTimeout(release,760);
	}
	onMount(() => {
		let disposed = false, building = 0, rasterFrame = 0, sourceWidth = 0, sourceHeight = 0, rasterRunning = false, rasterQueued = false, synchronizingSize = false;
		let ownedSource = '', fontRevision = 0;
		const motion = matchMedia('(prefers-reduced-motion: reduce)'); reduced = motion.matches;
		function sourceTarget() {
			const bounds=host.getBoundingClientRect(), glyph=heading.getBoundingClientRect(), style=getComputedStyle(heading);
			// Identity of the raster inputs, not a retained bitmap cache. Include CSS
			// glyph metrics as well as native pixels: equal rounded output dimensions
			// must not suppress a fractional layout or typography change.
			return JSON.stringify([bounds.width,bounds.height,canvas.width,canvas.height,
				glyph.left-bounds.left,glyph.top-bounds.top,glyph.width,glyph.height,
				style.fontStyle,style.fontWeight,style.fontSize,style.fontFamily,style.lineHeight,
				style.letterSpacing,style.textAlign,heading.textContent,fontRevision]);
		}
		function report(state: { ready: boolean; error: string }) {
			if (disposed) return; ready = state.ready;
			if (state.error) error = state.error;
			if (model && !error && !synchronizingSize && (canvas.width!==sourceWidth || canvas.height!==sourceHeight)) { rasterPending=true; queueRaster(); }
		}
		async function raster() {
			if (!session || disposed) return;
			const token = ++building; rasterPending=true;
			try {
				await document.fonts.ready; if (disposed || token!==building) return;
				const bounds=canvas.getBoundingClientRect();
				// This raster already owns the requested size. Its synchronous resize
				// notification must not request an identical second CPU profile; real
				// later DPR/font/layout notifications still queue the next generation.
				synchronizingSize=true;
				try { session.resize(bounds.width,bounds.height); } finally { synchronizingSize=false; }
				if (session.state.error) throw new Error(session.state.error);
				const target=sourceTarget();
				if(target===ownedSource){rasterPending=rasterQueued;return;}
				const profile=smoothTypeProfile(surfaceEnamelProfile(host,heading));
				const source={ ...profile,aspect:bounds.width/bounds.height };
				sourceWidth=profile.width; sourceHeight=profile.height;
				// Reserve before awaiting GPU startup/update. An initial ResizeObserver
				// delivery may arrive meanwhile, but does not own another source build.
				ownedSource=target;
				if (model) await model.updateSource(source);
				else await session.load(async (device,format) => {
					const candidate=await createMaterialType(device,format,source);
					candidate.setFinish(finish); candidate.setLight(light*Math.PI/180); candidate.setBaseline(baseline);candidate.setGeometryMotion(bending);
					if (!disposed && token===building) model=candidate;
					return candidate;
				});
				if (!disposed && token===building) { rasterPending=rasterQueued; session.invalidate(); }
			} catch (reason) { if (!disposed && token===building) { error=String(reason); interrupt(); } }
		}
		async function drainRaster() {
			if (rasterRunning || !session || disposed) return;
			rasterRunning=true;
			try { do { rasterQueued=false; await raster(); } while(rasterQueued && !disposed); }
			finally { rasterRunning=false; }
		}
		// Serialize native CPU rasters/startup factories; resize/font/DPR signals
		// coalesce, rather than entering LabSession.load while it is already busy.
		function queueRaster() {
			if(disposed || sourceTarget()===ownedSource)return;
			breakStroke();rasterQueued=true;rasterPending=true;cancelAnimationFrame(rasterFrame);rasterFrame=requestAnimationFrame(() => { void drainRaster(); });
		}
		function fontsChanged() { fontRevision++;queueRaster(); }
		function move(event: PointerEvent) {
			if (!event.isPrimary || !available || reduced || baseline || !visible || document.hidden) return;
			const bounds=canvas.getBoundingClientRect();
			const next={ x:Math.max(0,Math.min(1,(event.clientX-bounds.left)/bounds.width)),y:Math.max(0,Math.min(1,(event.clientY-bounds.top)/bounds.height)) };
			clearTimeout(releaseTimer); clearTimeout(sleepTimer);
			if (session?.state.paused) session.pause(); sleeping=false;
			// A force may relax between sparse events without ending the in-host
			// brush. Re-prime after LabSession clears any deferred endInput; do it
			// only at entry/idle resume, never per event (which loses coalesced arcs).
			const resume=continuous&&forceIdle;
			if(resume)session?.pointer(point.x,point.y,true);
			session?.pointer(next.x,next.y,true);
			if(resume)model?.primeInput(point.x,point.y);
			else if(!continuous)model?.primeInput(next.x,next.y);
			point=next;continuous=true;forceIdle=false;releaseTimer=setTimeout(release,90);
		}
		function leave() { continuous=false; release(); }
		function preferences() { reduced=motion.matches; interrupt(reduced); }
		function visibility() { if (document.hidden) interrupt(); }
		function blur() { interrupt(); }
		const resize=new ResizeObserver(queueRaster); resize.observe(host);
		const intersection=new IntersectionObserver(([entry]) => { visible=entry.isIntersecting; if(!visible)interrupt(); }); intersection.observe(host);
		host.addEventListener('pointermove',move,{passive:true}); host.addEventListener('pointerleave',leave); host.addEventListener('pointercancel',leave);
		window.addEventListener('blur',blur); document.addEventListener('visibilitychange',visibility); motion.addEventListener('change',preferences); document.fonts.addEventListener('loadingdone',fontsChanged);
		void LabSession.create(canvas,report,'premultiplied').then(created => {
			if(disposed){created.dispose();return;} session=created;session.pause();queueRaster();
		}).catch(reason => { if(!disposed)error=String(reason); });
		return () => {
			disposed=true;building++;cancelAnimationFrame(rasterFrame);clearTimeout(releaseTimer);clearTimeout(sleepTimer);
			resize.disconnect();intersection.disconnect();host.removeEventListener('pointermove',move);host.removeEventListener('pointerleave',leave);host.removeEventListener('pointercancel',leave);
			window.removeEventListener('blur',blur);document.removeEventListener('visibilitychange',visibility);motion.removeEventListener('change',preferences);document.fonts.removeEventListener('loadingdone',fontsChanged);session?.dispose();
		};
	});
</script>

<div class="material-type" bind:this={host} data-ready={available} data-sleeping={sleeping} data-reduced={reduced} data-bending={bending} class:enamel={finish==='enamel'}>
	<h2 bind:this={heading} class:painted={available}>Soft</h2>
	<canvas bind:this={canvas} class:unavailable={!available} aria-hidden="true"></canvas>
	<p class="status" role="status">{error ? 'WebGPU unavailable — static typography remains. '+error : !ready ? 'Preparing the material…' : reduced ? 'Still specimen · reduced motion' : baseline ? 'Static baseline · move the light to compare' : sleeping ? 'Move through the word · no click needed' : finish==='velvet' ? 'The nap remembers. The letters stay legible.' : 'Polish the glaze. Turn the light to inspect the finish.'}</p>
</div>

<style>
	.material-type { position:relative; width:100%; height:clamp(380px,42vw,620px); overflow:hidden; user-select:none; -webkit-user-select:none; isolation:isolate; background:#f0e7da; }
	h2 { position:absolute; left:0; right:0; top:50%; transform:translateY(-50%); margin:0; text-align:center; font:700 clamp(150px,31vw,465px)/1.1 Georgia,'Times New Roman',serif; letter-spacing:-.075em; color:#702e43; }
	h2.painted { color:transparent; }
	.enamel h2 { color:#667e62; }.enamel h2.painted { color:transparent; }
	canvas { position:absolute; inset:0; width:100%; height:100%; pointer-events:none; } canvas.unavailable { visibility:hidden; }
	.status { position:absolute; left:24px; bottom:18px; right:24px; margin:0; font:10px/1.5 'Helvetica Neue',Arial,sans-serif; color:#977d73; pointer-events:none; }
	@media(max-width:600px) { .material-type { height:380px; } h2 { font-size:42vw; } .status { left:18px; right:18px; bottom:17px; font-size:9px; } }
</style>
