<script lang="ts">
	import { onMount } from 'svelte';
	import { LabSession } from './LabSession.js';
	import { createImprint, type ImprintExperiment } from './imprint.js';
	import { IMPRINT_CAPACITY, ORIGINAL_SIGNET, type ImprintMask, type ImprintTool } from './imprint-tools.js';

	let { onChange = () => {}, tool = ORIGINAL_SIGNET, available = $bindable(false), count = $bindable(0) }: {
		onChange?: (marked: boolean) => void; tool?: Readonly<ImprintTool>; available?: boolean; count?: number;
	} = $props();
	let canvas: HTMLCanvasElement, host: HTMLButtonElement;
	let session: LabSession | undefined, material: ImprintExperiment | undefined;
	let ready = $state(false), error = $state(''), marked = $state(false), reduced = $state(false), building = $state(true);
	let sourceSize = $state(0), visible = true;
	let sleepTimer: number | undefined;
	$effect(() => { available = ready && !error && !building; });
	$effect(() => { const next = tool; material?.setTool(next); });

	function reportMarks() {
		count = material?.count ?? 0; marked = material?.marked ?? false;
		try { onChange(marked); } catch { /* An application callback cannot discard the material action. */ }
	}
	function rest(draw = true) {
		clearTimeout(sleepTimer); material?.finish(); reportMarks();
		if (session && !session.state.paused) session.pause();
		if (draw && visible && !document.hidden) session?.invalidate();
	}
	function wake() {
		clearTimeout(sleepTimer);
		if (!session?.state.ready) return;
		if (reduced || !visible || document.hidden) { rest(); return; }
		if (session.state.paused) session.pause();
		session.invalidate(); sleepTimer = window.setTimeout(() => rest(), 1800);
	}
	export function smooth() {
		if (!available) return;
		material?.smooth(reduced); reportMarks(); wake();
	}
	export function stamp() { apply(0.5, 0.5); }
	export function original() {
		if (!available || !material) return;
		material.reset(); material.setTool(ORIGINAL_SIGNET); material.stamp(0.5, 0.5, reduced); material.setTool(tool); reportMarks(); wake();
	}
	export function example() {
		if (!available || !material || material.count > IMPRINT_CAPACITY - 3) return;
		material.setTool({ shape: 'rosette', size: 0.35, rotation: 15, depth: 0.9, bevel: 0.012 }); material.stamp(0.42, 0.44, reduced);
		material.setTool({ shape: 'comb', size: 0.33, rotation: 335, depth: 0.6, bevel: 0.006 }); material.stamp(0.59, 0.58, reduced);
		material.setTool({ shape: 'ring', size: 0.53, rotation: 0, depth: 0.8, bevel: 0.009 }); material.stamp(0.5, 0.5, reduced);
		material.setTool(tool); reportMarks(); wake();
	}
	function apply(x: number, y: number) {
		if (!available || !material || !material.stamp(x, y, reduced)) return;
		reportMarks(); wake();
	}
	function click(event: MouseEvent) {
		const rect = host.getBoundingClientRect();
		apply(event.detail ? (event.clientX - rect.left) / rect.width : 0.5, event.detail ? (event.clientY - rect.top) / rect.height : 0.5);
	}
	function rasterSignet(size: number): ImprintMask {
		const mask = document.createElement('canvas'); mask.width = mask.height = size;
		const ctx = mask.getContext('2d')!; ctx.scale(size / 192, size / 192);
		ctx.strokeStyle = '#fff'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(96, 96, 80, 0, Math.PI * 2); ctx.stroke();
		ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(96, 96, 70, 0, Math.PI * 2); ctx.stroke();
		ctx.fillStyle = '#fff'; ctx.font = 'italic bold 98px Georgia'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('m', 93, 94);
		for (let i = 0; i < 12; i++) { const angle = i * Math.PI / 6; ctx.beginPath(); ctx.arc(96 + 75 * Math.cos(angle), 96 + 75 * Math.sin(angle), 1.5, 0, Math.PI * 2); ctx.fill(); }
		const pixels = ctx.getImageData(0, 0, size, size).data, data = new Uint8Array(size * size);
		for (let i = 0; i < data.length; i++) data[i] = pixels[i * 4 + 3];
		return { width: size, height: size, data };
	}
	onMount(() => {
		let disposed = false, generation = 0, refreshFrame = 0;
		const motion = matchMedia('(prefers-reduced-motion: reduce)'); reduced = motion.matches;
		const neededSource = () => Math.max(1, Math.ceil(Math.max(canvas.width, canvas.height) * 0.6));
		async function refreshSource() {
			if (disposed || !material || !session || error) return;
			const size = neededSource(); if (size === sourceSize) return;
			const id = ++generation; building = true;
			try {
				await material.updateMask(rasterSignet(size));
				if (disposed || id !== generation) return;
				sourceSize = size; building = false; session.invalidate();
			} catch (reason) { if (!disposed && id === generation) { error = String(reason); building = false; rest(false); } }
		}
		function queueSource() {
			if (disposed || !material || error || neededSource() === sourceSize) return;
			cancelAnimationFrame(refreshFrame); refreshFrame = requestAnimationFrame(() => { void refreshSource(); });
		}
		function resize() {
			const { width, height } = canvas.getBoundingClientRect(); session?.resize(width, height); queueSource();
		}
		const observer = new ResizeObserver(resize); observer.observe(host);
		const intersection = new IntersectionObserver(([entry]) => {
			visible = entry.isIntersecting;
			if (!visible) rest(false); else { queueSource(); session?.invalidate(); }
		}); intersection.observe(host);
		function preference() { reduced = motion.matches; rest(); }
		function visibility() { if (document.hidden) rest(false); else { queueSource(); session?.invalidate(); } }
		motion.addEventListener('change', preference); document.addEventListener('visibilitychange', visibility);
		void LabSession.create(canvas, (state) => {
			if (disposed) return;
			ready = state.ready; if (state.error) error = state.error;
			// LabSession publishes DPR-only changes too; no second media-query watcher.
			if (state.ready) queueSource();
		}, 'premultiplied').then(async (created) => {
			if (disposed) { created.dispose(); return; }
			session = created; resize(); await document.fonts.ready;
			if (disposed) return;
			await session.load(async (device, format) => {
				const size = neededSource(), candidate = await createImprint(device, format, rasterSignet(size));
				if (!disposed) { material = candidate; sourceSize = size; candidate.setTool(tool); }
				return candidate;
			});
			if (!disposed) { building = false; rest(); queueSource(); }
		}).catch((reason) => { if (!disposed) { error = String(reason); building = false; } });
		return () => {
			disposed = true; generation++; clearTimeout(sleepTimer); cancelAnimationFrame(refreshFrame); observer.disconnect(); intersection.disconnect();
			motion.removeEventListener('change', preference); document.removeEventListener('visibilitychange', visibility); session?.dispose();
		};
	});
</script>

<button class="pad" bind:this={host} onclick={click} disabled={!available || count >= IMPRINT_CAPACITY} aria-label="Press the selected tool into the wax" title="Press on the wax; the tool can extend beyond its edge" data-native-source={sourceSize} data-impressions={count}>
	<span class="fallback" class:live={ready && !error} aria-hidden="true">{marked ? 'm' : ''}</span>
	<canvas bind:this={canvas} class:unavailable={!ready || Boolean(error)} aria-hidden="true"></canvas>
</button>
<p class="surface-state" role="status">{error ? 'Static seal — WebGPU unavailable. ' + error : building ? 'Preparing the native signet…' : count >= IMPRINT_CAPACITY ? '32 impressions retained. Warm & smooth to make room; nothing is evicted.' : !marked && count > 0 ? 'Warming the wax. Its retained history clears when smoothing settles.' : reduced ? 'Still impressions · reduced motion' : marked ? 'The mark stays. Change tools for the next impression, or warm the wax.' : 'Press on the wax, not its surroundings. The tool can straddle the edge.'}</p>

<style>
	.pad { display: block; position: relative; width: 100%; aspect-ratio: 1; background: none; border: 0; padding: 0; cursor: pointer; isolation: isolate; user-select: none; -webkit-user-select: none; }
	.pad:disabled { cursor: default; }
	.pad:focus-visible { outline: 2px solid #823b48; outline-offset: -18px; border-radius: 50%; }
	canvas { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; filter: drop-shadow(4px 10px 7px #311c232c); }
	canvas.unavailable { visibility: hidden; }
	.fallback { position: absolute; inset: 11.5%; border-radius: 47% 50% 46% 48%; background: #823b48; box-shadow: inset 2px 3px 9px #c87c77, 4px 8px 14px #311c2330; display: grid; place-items: center; color: #4b2430; font: italic bold clamp(60px, 12vw, 160px) Georgia, serif; }
	.fallback.live { visibility: hidden; }
	.surface-state { text-align: center; color: #746761; font: 11px/1.7 Arial, sans-serif; margin: 0 10px; min-height: 38px; }
</style>
