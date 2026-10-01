<script lang="ts">
	import { onMount } from 'svelte';
	import { advanceMeniscus, createMeniscusState, meniscusArea, meniscusTarget } from './magnetic-meniscus-model.js';
	import { meniscusNativeSize, svgMeniscusGeometry, type SvgMeniscusGeometry } from './svg-meniscus-geometry.js';

	const instance = $props.id(), boundary = createMeniscusState();
	let host: HTMLDivElement;
	let geometry = $state<SvgMeniscusGeometry>(), baseline = $state(false), strength = $state(1);
	let available = $state(false), reduced = $state(false), sleeping = $state(true), error = $state('');
	let width = 1, height = 1, inView = false, focused = true, mounted = false, frame = 0, previous = 0, accumulator = 0;
	let requested = { x: .5, y: .5, active: false }, pointerOwned = false;
	const counts = { steps: 0, renders: 0, frames: 0 };
	const canAnimate = () => mounted && available && !baseline && !reduced && inView && focused && !document.hidden;
	const settled = () => boundary.modes.every((value, i) => Math.abs(value - boundary.target[i]) < 1e-6);

	export function inspect() {
		return { ...counts, width, height, modes: Array.from(boundary.modes), target: Array.from(boundary.target), requested: { ...requested }, pointerOwned,
			sleeping, reduced, baseline, available, segments: geometry?.segments ?? 0, errorBound: geometry?.errorBound ?? 0, area: meniscusArea(boundary.modes) };
	}
	function target() {
		const minimum = Math.min(width, height);
		if (requested.active) boundary.target.set(meniscusTarget((requested.x - .5) * width / minimum, (requested.y - .5) * height / minimum, strength)); else boundary.target.fill(0);
	}
	function draw() {
		if (!mounted || baseline) return;
		try { geometry = svgMeniscusGeometry(boundary.modes, width, height); counts.renders++; available = true; error = ''; }
		catch (cause) { available = false; error = cause instanceof Error ? cause.message : 'Native SVG geometry is unavailable.'; stop(); }
	}
	function stop() { if (frame) cancelAnimationFrame(frame); frame = 0; previous = 0; accumulator = 0; sleeping = true; }
	function tick(now: number) {
		frame = 0;
		if (!canAnimate()) { stop(); return; }
		counts.frames++;
		accumulator += Math.min(4 / 120, previous ? (now - previous) / 1000 : 1 / 60); previous = now;
		while (accumulator + 1e-10 >= 1 / 120) { advanceMeniscus(boundary, 1 / 120); counts.steps++; accumulator -= 1 / 120; }
		if (settled()) boundary.modes.set(boundary.target);
		draw();
		if (settled() || !available) stop(); else frame = requestAnimationFrame(tick);
	}
	function update() {
		if (baseline) return;
		if (!canAnimate()) { stop(); boundary.modes.set(boundary.target); draw(); return; }
		if (settled()) { stop(); boundary.modes.set(boundary.target); draw(); return; }
		if (!frame) { sleeping = false; frame = requestAnimationFrame(tick); }
	}
	function setMagnet(x: number, y: number, active: boolean, fromPointer = false) {
		pointerOwned = fromPointer; requested = { x, y, active }; target(); update();
	}
	function interrupt() {
		stop();
		// Match WebGPU ownership: native presets survive interruption; transient
		// hover is released, not restored to a previously selected preset.
		if (!pointerOwned) return;
		pointerOwned = false; requested = { x: .5, y: .5, active: false }; target(); boundary.modes.set(boundary.target); draw();
	}
	function changeStrength(event: Event) { strength = Number((event.currentTarget as HTMLInputElement).value); target(); update(); }
	function changeBaseline(event: Event) {
		baseline = (event.currentTarget as HTMLInputElement).checked; interrupt();
		if (!baseline) { target(); boundary.modes.set(boundary.target); draw(); }
	}

	onMount(() => {
		mounted = true;
		const motion = window.matchMedia('(prefers-reduced-motion: reduce)'); reduced = motion.matches;
		let density: MediaQueryList;
		const resize = () => {
			const rect = host.getBoundingClientRect(); if (rect.width <= 0 || rect.height <= 0) return;
			try {
				const next = meniscusNativeSize(rect.width, rect.height, window.devicePixelRatio);
				if (next[0] === width && next[1] === height && geometry) return;
				[width, height] = next; target(); draw();
			} catch (cause) { available = false; error = cause instanceof Error ? cause.message : 'Native SVG size is unavailable.'; stop(); }
		};
		const changeDensity = () => { density?.removeEventListener('change', changeDensity); density = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`); density.addEventListener('change', changeDensity); resize(); };
		const changeMotion = () => { reduced = motion.matches; interrupt(); };
		const visibility = () => { if (document.hidden) interrupt(); };
		const blur = () => { focused = false; interrupt(); };
		const focus = () => { focused = true; };
		const move = (event: PointerEvent) => {
			if (!event.isPrimary || !canAnimate()) return;
			const rect = host.getBoundingClientRect(); if (rect.width <= 0 || rect.height <= 0) return;
			setMagnet((event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height, true, true);
		};
		const leave = () => { if (pointerOwned) setMagnet(.5, .5, false); };
		const observer = new ResizeObserver(resize); observer.observe(host);
		const intersection = new IntersectionObserver((entries) => { inView = entries[0]?.isIntersecting ?? false; if (!inView) interrupt(); }); intersection.observe(host);
		motion.addEventListener('change', changeMotion); document.addEventListener('visibilitychange', visibility);
		window.addEventListener('blur', blur); window.addEventListener('focus', focus); window.addEventListener('resize', resize);
		host.addEventListener('pointermove', move, { passive: true }); host.addEventListener('pointerleave', leave); host.addEventListener('pointercancel', leave);
		changeDensity();
		return () => {
			mounted = false; stop(); observer.disconnect(); intersection.disconnect(); density.removeEventListener('change', changeDensity);
			motion.removeEventListener('change', changeMotion); document.removeEventListener('visibilitychange', visibility);
			window.removeEventListener('blur', blur); window.removeEventListener('focus', focus); window.removeEventListener('resize', resize);
			host.removeEventListener('pointermove', move); host.removeEventListener('pointerleave', leave); host.removeEventListener('pointercancel', leave);
		};
	});
</script>

<section aria-label="SVG field-attracted meniscus" data-renderer="svg" data-ready={available} data-sleeping={sleeping} data-reduced={reduced}>
	<div class="controls">
		<button onclick={() => setMagnet(.82, .5, true)} disabled={baseline || !available}>Magnet at right</button>
		<button onclick={() => setMagnet(.32, .2, true)} disabled={baseline || !available}>Magnet above left</button>
		<button onclick={() => setMagnet(.5, .5, false)} disabled={baseline || !available}>Remove field</button>
		<label>Attraction <input type="range" min="0" max="1.5" step="0.05" value={strength} oninput={changeStrength} /> {strength.toFixed(2)}</label>
		<label><input type="checkbox" checked={baseline} onchange={changeBaseline} /> Plain circular aperture</label>
	</div>
	<div class="aperture" bind:this={host} class:plain={baseline || !available} style:--photo-clip={`url("#${instance}-clip")`}>
		<img src="/living-cover-arles.jpg" alt="Arles cloister, Edouard Baldus, public-domain photograph" draggable="false" />
		{#if !baseline && available && geometry}
			<svg aria-hidden="true" viewBox={`0 0 ${geometry.width} ${geometry.height}`} preserveAspectRatio="none">
				<defs>
					<clipPath id={`${instance}-clip`} clipPathUnits="objectBoundingBox"><path d={geometry.clip} /></clipPath>
					<linearGradient id={`${instance}-metal`} x1="0" y1="0" x2="1" y2="1" gradientUnits="objectBoundingBox">
						<stop offset="0" stop-color="#111d20" /><stop offset=".22" stop-color="#8eaead" /><stop offset=".33" stop-color="#243336" /><stop offset=".57" stop-color="#090d0e" /><stop offset=".76" stop-color="#607f80" /><stop offset="1" stop-color="#121b1c" />
					</linearGradient>
				</defs>
				<path class="radial-rim" d={geometry.ring} fill={`url(#${instance}-metal)`} fill-rule="evenodd" />
			</svg>
		{/if}
		{#if baseline}<span class="baseline-label">Still circle · no animated SVG geometry</span>{/if}
		{#if error}<span role="status" class="baseline-label">{error} A static circle is shown.</span>{/if}
	</div>
	<p class="caption">Move near the rim without touching it. The edge reaches toward the field; the photograph never warps. Remove the field to recover the circle.</p>
	<p class="comparison"><a href="/lab/interfaces/meniscus">Compare the WebGPU version →</a> Same boundary and controls; simpler gradient lighting.</p>
	<details><summary>What is actually different?</summary><p>The same twelve radial modes, attraction, exact area normalization and non-oscillatory relaxation drive both versions. The photo clips at the same inner radius; the rim is the same radial annulus, not a constant-width stroke. SVG approximates the analytic curves with an error bound below 0.2 actual display pixel. The source remains the original 3803 × 3162 photograph.</p><p>This version makes no WebGPU API calls. It generates and updates a path while moving; the browser still rasterizes and composites it, potentially on the GPU. A fixed gradient does not reproduce the WebGPU shader’s surface-normal lighting. Neither version is assumed faster without matched browser measurements. Reduced motion uses still button-selected configurations; idle, hidden and offscreen states do not run an animation loop.</p><p class="geometry-note">Current contour: {geometry?.segments ?? 0} segments · maximum geometric error {(geometry?.errorBound ?? 0).toFixed(3)} native px.</p></details>
</section>

<style>
	section { font-family: Arial, sans-serif; }
	.controls { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-bottom: 20px; font-size: 12px; }
	button { color: #c7d6d0; background: #243336; border: 1px solid #526966; border-radius: 4px; padding: 10px 13px; font: inherit; cursor: pointer; }
	button:disabled { opacity: .45; cursor: default; } label { display: flex; align-items: center; gap: 8px; } input { accent-color: #a7c1b1; }
	.aperture { position: relative; width: 100%; aspect-ratio: 1.5; background: #141c1d; overflow: hidden; user-select: none; -webkit-user-select: none; }
	.aperture img { position: absolute; width: 100%; height: 100%; object-fit: cover; clip-path: var(--photo-clip); }
	.aperture.plain img { clip-path: ellipse(18.8% 28.2% at 50% 50%); }
	svg { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
	.baseline-label { position: absolute; bottom: 20px; left: 20px; background: #101b20; padding: 8px; font-size: 11px; }
	.caption, .comparison, details { color: #a9bbb4; font-size: 12px; line-height: 1.8; } .comparison a { color: #c7d6d0; } details { max-width: 760px; margin-top: 24px; } summary { cursor: pointer; }
	button:focus-visible, input:focus-visible, summary:focus-visible { outline: 2px solid #bed2b2; outline-offset: 4px; }
	@media(max-width: 600px) { .aperture { aspect-ratio: 1; } .aperture.plain img { clip-path: circle(28.2% at 50% 50%); } }
</style>
