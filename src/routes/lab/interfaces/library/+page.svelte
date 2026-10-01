<script lang="ts">
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import { page } from '$app/state';
	import { MaterialFoil, type MaterialStatus } from '$lib/index.js';
	let dark = $derived(browser && page.url.searchParams.get('theme') === 'dark');
	const enhanced = $derived(!browser || page.url.searchParams.get('finish') !== 'plain');
	const rtl = $derived(browser && page.url.searchParams.get('dir') === 'rtl');
	let foil: MaterialFoil;
	let status = $state<MaterialStatus>({ state: 'loading' });
	function destination(key: string, value: string) {
		const url = new URL(browser ? page.url.href : page.url.pathname, 'http://localhost');
		url.searchParams.set(key, value);
		return `${url.pathname}${url.search}${url.hash}`;
	}
	function toggleTheme() {
		dark = !dark;
		void goto(destination('theme', dark ? 'dark' : 'light'), { noScroll: true, keepFocus: true });
	}
</script>

<svelte:head><title>Stone & light — Material studies</title><meta name="robots" content="noindex" /></svelte:head>

<div class="composition" class:dark dir={rtl ? 'rtl' : 'ltr'}>
	<a class="skip" href="#main">Skip to content</a>
	<div class="shell">
		<header>
			<a class="studio-link" href="/lab/interfaces"><span aria-hidden="true">←</span> Material studies</a>
			<button class="appearance" type="button" role="switch" aria-checked={dark} aria-label="Dark appearance" onclick={toggleTheme}>
				<span class="mode" aria-hidden="true">{dark ? 'Dark' : 'Light'}</span>
				<MaterialFoil bind:this={foil} selected={dark} enabled={enhanced} onStatus={(next) => { status = next; }} />
			</button>
		</header>

		<main id="main" tabindex="-1">
			<section class="editorial" aria-labelledby="title">
				<div class="introduction">
					<h1 id="title"><bdi>Stone</bdi><br /><bdi>& light.</bdi></h1>
					<p class="location"><bdi>Saint-Trophime, Arles.</bdi></p>
					<p class="credit">Édouard Baldus<br />ca. 1861</p>
				</div>
				<figure>
					<img src="/living-cover-arles.jpg" alt="Sunlit stone arches in the cloister of Saint-Trophime, Arles." width="3803" height="3162" />
					<figcaption><a href="https://www.metmuseum.org/art/collection/search/283136">The Met collection <span aria-hidden="true">↗</span></a><span>Public domain</span></figcaption>
				</figure>
			</section>

			{#if status.state === 'unavailable'}
				<aside class="recovery" role="status"><p>The spring is shown without motion. The appearance switch still works.</p><button type="button" onclick={() => foil?.retry()}>Retry material</button></aside>
			{/if}
		</main>

		<footer>
			<details>
				<summary>Study notes</summary>
				<div class="notes">
					<p>One material: the appearance switch. The spring snaps; the page changes immediately. The photograph and type stay still.</p>
					<nav aria-label="Material comparison"><a href={destination('finish', 'material')} aria-current={enhanced ? 'page' : undefined}>Material</a><a href={destination('finish', 'plain')} aria-current={!enhanced ? 'page' : undefined}>Plain</a></nav>
					<p>Reduced motion keeps the finish still. Without WebGPU, a vector spring carries the same state. Real-phone energy use is not yet measured.</p>
					<a href={destination('dir', rtl ? 'ltr' : 'rtl')}>{rtl ? 'Left-to-right layout' : 'Right-to-left layout'}</a>
					{#if status.state === 'unavailable'}<p>{status.reason}</p>{/if}
				</div>
			</details>
		</footer>
	</div>
</div>

<style>
	.composition { --surface-base: #f7f7f2; --text-primary: #252721; --text-muted: #676960; --focus-ring: #345994; --material-metal: #74776d; color: var(--text-primary); background: var(--surface-base); min-block-size: 100svh; font-family: Arial, Helvetica, sans-serif; color-scheme: light; }
	.composition.dark { --surface-base: #191b18; --text-primary: #edeee7; --text-muted: #a5a99b; --focus-ring: #a4bce6; --material-metal: #c8ccbd; color-scheme: dark; }
	.shell { max-inline-size: 88rem; padding-inline: clamp(1.25rem, 5vw, 5rem); margin-inline: auto; }
	a { color: inherit; text-underline-offset: .24em; }
	button { font: inherit; color: inherit; cursor: pointer; }
	:is(a, button, summary):focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 5px; }
	.skip { position: fixed; z-index: 5; inset-block-start: .5rem; inset-inline-start: .5rem; padding: .8rem; background: var(--surface-base); transform: translateY(-180%); } .skip:focus { transform: none; }
	header { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: .5rem 2rem; padding-block: 1.5rem; }
	.studio-link { display: inline-flex; align-items: center; gap: .65rem; min-block-size: 3rem; text-decoration: none; font-size: .85rem; }
	.studio-link:hover { text-decoration: underline; }
	[dir='rtl'] .studio-link > span { transform: scaleX(-1); }
	/* The spring is the affordance. The native button supplies its full hit area,
	   not a second visible object. Only keyboard focus gets an outline. */
	.appearance { display: inline-flex; align-items: center; flex-wrap: wrap; max-inline-size: 100%; gap: .2rem; min-block-size: 3rem; padding: 0; border: 0; border-radius: 0; box-shadow: none; background: transparent; appearance: none; }
	.mode { min-inline-size: 3ch; font-size: .8rem; color: var(--text-muted); }
	main:focus { outline: none; }
	.editorial { display: grid; grid-template-columns: minmax(0, .8fr) minmax(0, 1.2fr); gap: clamp(2rem, 5vw, 5rem); align-items: start; padding-block: clamp(2.5rem, 7vw, 7rem) 2rem; }
	.introduction { min-inline-size: 0; }
	h1 { font: 500 clamp(3.7rem, 7.5vw, 7rem)/.97 Arial, Helvetica, sans-serif; letter-spacing: -.065em; margin: -.075em 0 2rem; }
	.location { font-size: 1rem; line-height: 1.5; margin: 0; }
	.credit { color: var(--text-muted); font-size: .8rem; line-height: 1.6; margin-block: 1.2rem 0; }
	figure { min-inline-size: 0; margin: 0; }
	img { display: block; inline-size: 100%; block-size: auto; }
	figcaption { display: flex; flex-wrap: wrap; justify-content: space-between; gap: .4rem 1rem; margin-block-start: .8rem; color: var(--text-muted); font-size: .7rem; line-height: 1.6; }
	figcaption a { text-decoration: none; } figcaption a:hover { text-decoration: underline; }
	.recovery { display: flex; align-items: baseline; flex-wrap: wrap; gap: .2rem 1rem; color: var(--text-muted); font-size: .85rem; line-height: 1.6; margin-block: 1rem; }
	.recovery p { margin: 0; } .recovery button { min-block-size: 2.75rem; padding: 0; border: 0; background: transparent; text-decoration: underline; text-underline-offset: .24em; }
	footer { padding-block: 1rem 2rem; font-size: .8rem; color: var(--text-muted); line-height: 1.75; }
	summary { width: fit-content; min-block-size: 2.75rem; padding-block: .5rem; cursor: pointer; }
	.notes { max-inline-size: 54ch; overflow-wrap: anywhere; } .notes p { margin: .6rem 0; }
	nav { display: flex; flex-wrap: wrap; gap: 1.5rem; } nav a { display: inline-flex; align-items: center; min-block-size: 2.75rem; text-decoration: none; } nav a[aria-current] { color: var(--text-primary); text-decoration: underline; }
	@media (max-width: 48rem) { .editorial { grid-template-columns: minmax(0, 1fr); gap: 2rem; padding-block-start: 2.5rem; } h1 { font-size: clamp(3.5rem, 12vw, 5.5rem); margin-block-end: 1.5rem; } }
	@media (forced-colors: active) { .composition, .composition.dark { --surface-base: Canvas; --text-primary: CanvasText; --text-muted: CanvasText; --focus-ring: Highlight; --material-metal: ButtonText; } }
</style>
