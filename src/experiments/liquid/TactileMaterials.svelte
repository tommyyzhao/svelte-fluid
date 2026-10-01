<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import MaterialSurface from './MaterialSurface.svelte';
	import { createTactileMaterial, type TactileKind, type TactileMaterial } from './tactile-materials.js';
	let { kind, selected = $bindable(false), baseline = false }: { kind: TactileKind; selected?: boolean; baseline?: boolean } = $props();
	let surface: { wake(): boolean; refresh(): void; suspend(): void } | undefined;
	let model: TactileMaterial | undefined;
	let button: HTMLButtonElement;
	let available = $state(false), reduced = $state(false), hovered = $state(false), pressed = $state(false), activations = $state(0);
	let pointerId: number | undefined, cancelClick = false;
	async function factory(device: GPUDevice, format: GPUTextureFormat) {
		const candidate = await createTactileMaterial(device, format, kind, selected);
		// Native activation can happen while shader creation is in flight.
		// Commit the latest semantic state, not the factory's captured choice.
		candidate.commit(selected, true); model = candidate; return candidate;
	}
	function draw(animate = true) { if (baseline) return; if (animate) surface?.wake(); surface?.refresh(); }
	function position(event: PointerEvent) {
		const r = button.getBoundingClientRect();
		return { x: (event.clientX - r.left) / r.width, y: (event.clientY - r.top) / r.height };
	}
	function move(event: PointerEvent) {
		if (!event.isPrimary) return;
		const p = position(event); hovered = p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1;
		if (event.pointerId === pointerId) pressed = hovered;
		if (reduced || baseline) return;
		if (event.pointerId === pointerId) model?.press(hovered);
		if (hovered) model?.move(p.x, p.y); else { model?.leave(); pressed = false; }
		draw();
	}
	function down(event: PointerEvent) {
		if (!event.isPrimary || event.button !== 0) return;
		cancelClick = false; pointerId = event.pointerId; pressed = true;
		const p = position(event); if (!baseline) { if (!reduced) model?.move(p.x, p.y); model?.press(true); }
		draw();
		try { button.setPointerCapture(event.pointerId); } catch { /* Synthetic test input has no active browser pointer. */ }
	}
	function up(event: PointerEvent) {
		if (event.pointerId !== pointerId) return;
		const p = position(event); cancelClick = p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1;
		pointerId = undefined; pressed = false;
		if (!baseline) { model?.press(false); if (cancelClick) model?.leave(); }
		if (button.hasPointerCapture(event.pointerId)) button.releasePointerCapture(event.pointerId);
		draw();
	}
	function leave() { hovered = false; if (pointerId === undefined) { pressed = false; if (!baseline) { model?.leave(); if (reduced) model?.interrupt(); draw(!reduced); } } }
	function interrupted() {
		const captured = pointerId; pointerId = undefined;
		if (captured !== undefined && button?.hasPointerCapture(captured)) button.releasePointerCapture(captured);
		pressed = false; hovered = false; cancelClick = true;
		model?.interrupt();
	}
	function cancel() { interrupted(); draw(false); }
	function activate(event: MouseEvent) {
		if (cancelClick && event.detail > 0) { cancelClick = false; return; }
		cancelClick = false; activations++;
		if (kind === 'foil') { selected = !selected; if (!baseline) model?.commit(selected, reduced); }
		else if (!baseline) model?.pulse();
		draw(!reduced);
	}
	function key(event: KeyboardEvent, held: boolean) {
		if ((event.key !== ' ' && event.key !== 'Enter') || event.repeat) return;
		pressed = held; if (!baseline) model?.press(held); draw(!reduced);
	}
	export async function inspect() { return model?.inspect(); }
	onMount(() => {
		const motion = matchMedia('(prefers-reduced-motion: reduce)'); reduced = motion.matches;
		const change = () => { reduced = motion.matches; interrupted(); };
		motion.addEventListener('change', change);
		return () => { motion.removeEventListener('change', change); };
	});
	$effect(() => {
		if (baseline) surface?.suspend();
		else untrack(() => { model?.commit(selected, true); surface?.refresh(); });
	});
</script>

<div class="tactile" data-kind={kind} data-selected={selected} data-activations={activations} class:baseline class:hovered class:pressed>
	<div class="render" class:concealed={baseline}>
		<MaterialSurface bind:this={surface} bind:available {factory} decorative oninterrupt={interrupted}
			settleMs={kind === 'foil' ? 350 : 900} label={kind === 'glass' ? 'Rotating finite-arc pressure glass' : 'Explicitly actuated foil'} />
	</div>
	{#if baseline}<div class="cheap" aria-hidden="true">{#if kind === 'glass'}<span class="cheap-glass"></span>{:else}<span class="cheap-foil" class:inverted={selected}></span>{/if}</div>{/if}
	<button bind:this={button} class="hit" type="button" aria-label={kind === 'glass' ? 'Press the glass' : 'Flip the foil'}
		aria-pressed={kind === 'foil' ? selected : undefined} onclick={activate} onpointermove={move} onpointerdown={down} onpointerup={up}
		onpointerleave={leave} onpointercancel={cancel} onlostpointercapture={(event) => { if (event.pointerId === pointerId) cancel(); }}
		onkeydown={(event) => key(event, true)} onkeyup={(event) => key(event, false)} onblur={cancel}>
		<span class="action">{kind === 'glass' ? 'Press to reveal the load' : selected ? 'Inverted · click to return' : 'Raised · click to invert'}<span aria-hidden="true">{kind === 'glass' ? '◎' : '↕'}</span></span>
	</button>
	<div class="caption" aria-live="polite">{kind === 'foil' ? `Committed: ${selected ? 'inverted' : 'raised'}` : `${activations} pressure ${activations === 1 ? 'pulse' : 'pulses'}`}<span>{baseline ? 'CSS baseline' : reduced ? 'Still samples · reduced motion' : available ? 'Native WebGPU · no click threshold' : 'Graphics preparing or unavailable · native action still works'}</span></div>
</div>

<style>
	.tactile { position: relative; height: 100%; min-height: 260px; overflow: hidden; background: #132429; isolation: isolate; user-select: none; -webkit-user-select: none; }
	.tactile[data-kind='foil'] { background: #241519; }
	.render, .cheap { position: absolute; inset: 0; } .render.concealed { visibility: hidden; }
	.hit { position: absolute; inset: 0; width: 100%; height: 100%; padding: 0; border: 0; background: transparent; color: #e8e6dc; cursor: pointer; font: inherit; touch-action: pan-y; }
	.hit:focus-visible { outline: 3px solid #efe6a5; outline-offset: -7px; }
	.action { position: absolute; top: 24px; left: 25px; right: 25px; display: flex; justify-content: space-between; font-size: 10px; letter-spacing: .055em; color: #e9e7dcd4; text-align: left; }
	.action > span { font-size: 22px; }
	.caption { position: absolute; pointer-events: none; bottom: 23px; left: 25px; right: 25px; color: #d1d9cc; font-size: 10px; line-height: 1.6; }
	.caption > span { display: block; color: #b4baae; font-size: 8px; }
	.tactile :global(.status) { display: none; } .tactile :global(.status.error) { display: block; bottom: 70px; }
	.cheap { display: grid; place-items: center; perspective: 600px; }
	.cheap-glass { width: min(64%, 380px); aspect-ratio: 1; border-radius: 50%; border: 1px solid #aacdc45c; background: radial-gradient(circle at 30% 25%, #bcd7c52e, #76998807 55%); box-shadow: inset 0 0 25px #bcd7c523; transition: transform .16s, box-shadow .16s; }
	.hovered .cheap-glass { box-shadow: inset 0 0 35px #bcd7c546; } .pressed .cheap-glass { transform: scale(.96); }
	.cheap-foil { display: block; width: 67%; height: 20%; border-radius: 50% 50% 8% 8% / 60% 60% 20% 20%; background: linear-gradient(115deg, #504b55, #e5e8ef 40%, #777c90 57%, #eeccb1); transform: rotateX(22deg); transition: transform .14s ease-out, border-radius .14s ease-out; }
	.cheap-foil.inverted { transform: rotateX(-22deg); border-radius: 8% 8% 50% 50% / 20% 20% 60% 60%; }
	@media(prefers-reduced-motion: reduce) { .cheap-glass, .cheap-foil { transition: none; } }
</style>
