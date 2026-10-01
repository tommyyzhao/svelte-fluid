<script lang="ts">
	import { onMount } from 'svelte';
	import { LabSession } from './LabSession.js';
	import { createLiquidSelection, type SelectionExperiment } from './liquid-selection.js';

	let { selected = $bindable(0), labels = ['Reading', 'Saved', 'Finished'] }:
		{ selected?: number; labels?: [string, string, string] } = $props();
	let canvas: HTMLCanvasElement;
	let host: HTMLDivElement;
	let session: LabSession | undefined;
	let material: SelectionExperiment | undefined;
	let ready = $state(false);
	let reduced = $state(false);
	let error = $state('');
	let failureStage = $state('');
	let startupStage = 'Requesting a WebGPU adapter, device, and canvas';
	let visible = true;
	let settleTimer: ReturnType<typeof setTimeout> | undefined;

	function stop() {
		clearTimeout(settleTimer);
		if (error) return;
		material?.setSelection(selected, true);
		if (session?.state.ready && !session.state.paused) session.pause();
		session?.invalidate();
	}
	function move() {
		if (error || !material || !session?.state.ready) return;
		clearTimeout(settleTimer);
		material.setSelection(selected, reduced || !visible || document.hidden);
		session.invalidate();
		if (reduced || !visible || document.hidden) { stop(); return; }
		if (session.state.paused) session.pause();
		// No perpetual decorative simulation. The final snap removes any residual
		// on a slow device without allowing visual state to disagree with the DOM.
		settleTimer = setTimeout(stop, 4000);
	}
	$effect(() => { void selected; move(); });

	function key(event: KeyboardEvent) {
		const direction = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1
			: event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
		if (!direction && event.key !== 'Home' && event.key !== 'End') return;
		event.preventDefault();
		selected = event.key === 'Home' ? 0 : event.key === 'End' ? 2 : (selected + direction + 3) % 3;
		host.querySelectorAll<HTMLButtonElement>('button')[selected]?.focus();
	}

	onMount(() => {
		let disposed = false;
		function fail(reason: unknown) {
			if (disposed || error) return;
			error = reason instanceof Error ? `${reason.name}: ${reason.message}` : String(reason);
			failureStage = startupStage;
			ready = false;
			clearTimeout(settleTimer);
		}
		const media = matchMedia('(prefers-reduced-motion: reduce)');
		reduced = media.matches;
		function motion() { reduced = media.matches; stop(); }
		function visibility() { if (document.hidden) stop(); }
		function resize() {
			const { width, height } = canvas.getBoundingClientRect();
			session?.resize(width, height);
		}
		const observer = new ResizeObserver(resize); observer.observe(host);
		const intersection = new IntersectionObserver(([entry]) => {
			visible = entry.isIntersecting;
			if (!visible) stop();
		});
		intersection.observe(host);
		media.addEventListener('change', motion);
		document.addEventListener('visibilitychange', visibility);
		void LabSession.create(canvas, (status) => {
			if (disposed || error) return;
			if (status.error) { fail(status.error); return; }
			ready = status.ready;
			if (status.ready) startupStage = 'Rendering or updating the liquid selection';
		}, 'premultiplied')
			.then(async (created) => {
				if (disposed) { created.dispose(); return; }
				session = created;
				resize();
				startupStage = 'Creating selection buffers and shader pipelines';
				await created.load(async (device, format) => {
					material = await createLiquidSelection(device, format, selected);
					return material;
				});
				if (!disposed && !error) stop();
			}).catch(fail);
		return () => {
			disposed = true;
			clearTimeout(settleTimer);
			observer.disconnect(); intersection.disconnect();
			media.removeEventListener('change', motion);
			document.removeEventListener('visibilitychange', visibility);
			session?.dispose();
		};
	});
</script>

<div class="selection" class:material={ready && !error && !reduced} bind:this={host}>
	<canvas bind:this={canvas} aria-hidden="true"></canvas>
	<div class="choices" role="radiogroup" aria-label="Filter your reading shelf">
		{#each labels as label, index}
			<button role="radio" aria-checked={selected === index} tabindex={selected === index ? 0 : -1}
				class:selected={selected === index} onclick={() => { selected = index; }} onkeydown={key}>{label}</button>
		{/each}
	</div>
</div>
<p class="hint">{error ? 'WebGPU material unavailable — a static indicator is shown. Shelf controls still work.' : reduced
	? 'Motion is off for your reduced-motion preference. The shelf control remains active.'
	: !ready ? 'Preparing the material. You can already change shelves.'
	: 'Click a different shelf. Try Reading → Finished to see the material divide and rejoin. Arrow keys work too.'}</p>
{#if error}
	<details class="gpu-error">
		<summary>Why the material could not start</summary>
		<p><strong>Stage:</strong> {failureStage}</p>
		<pre>{error}</pre>
		<p>This is the browser’s actual error, not a diagnosis. The static indicator and shelf controls remain usable.</p>
	</details>
{/if}

<style>
	.selection { position: relative; width: 100%; height: 136px; border: 1px solid #465443; border-radius: 19px; background: #101c16; isolation: isolate; }
	canvas { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; visibility: hidden; }
	.material canvas { visibility: visible; }
	.choices { position: relative; display: grid; grid-template-columns: repeat(3, 1fr); height: 100%; }
	button { position: relative; appearance: none; background: transparent; border: 0; border-radius: 17px; color: #a3aea5; font: 13px/1.4 Arial, sans-serif; letter-spacing: .025em; padding: 17px 4px 96px; cursor: pointer; }
	button.selected { color: #f3f2e5; font-weight: 600; text-decoration: underline; text-underline-offset: 5px; text-decoration-color: #a9bf78; }
	button::after { position: absolute; content: ''; height: 47px; left: 17%; right: 17%; bottom: 24px; border-radius: 50%; background: #bccf89; opacity: 0; }
	button.selected::after { opacity: 1; }
	.material button::after { opacity: 0; }
	button:focus-visible { outline: 2px solid #d7e7ad; outline-offset: 4px; }
	button:hover { color: #f3f2e5; }
	.hint { margin: 13px 2px 0; font: 11px/1.65 Arial, sans-serif; color: #aab8a8; min-height: 18px; max-width: 580px; }
	.gpu-error { margin-top: 13px; max-width: 720px; color: #d5dcbb; font: 12px/1.65 Arial, sans-serif; }
	.gpu-error summary { cursor: pointer; text-underline-offset: 4px; text-decoration: underline; }
	.gpu-error p { margin: 12px 0; }
	.gpu-error pre { white-space: pre-wrap; overflow-wrap: anywhere; font: 11px/1.65 ui-monospace, monospace; padding: 14px; border: 1px solid #465443; border-radius: 8px; background: #101c16; }
	@media(max-width: 420px) { button { font-size: 12px; } }
</style>
