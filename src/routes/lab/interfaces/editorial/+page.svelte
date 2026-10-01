<script lang="ts">
	import SurfaceLayer from '../../../../experiments/liquid/SurfaceLayer.svelte';

	let relief = $state(true);
	let headline = $state<HTMLHeadingElement>();
	let layer = $state<{ sweep: () => void; reset: () => void }>();
	let ready = $state(false);
	let interactive = $state(false);
	let reducedMotion = $state(false);
	let error = $state('');
</script>

<svelte:head>
	<title>Matter — a material typography study</title>
	<meta name="robots" content="noindex" />
	<meta name="description" content="Native, selectable typography with a rounded material surface that yields under a press and recovers on release." />
</svelte:head>

<main>
	<header class="masthead">
		<a class="wordmark" href="/lab/interfaces" aria-label="Matter, interface studies home">matter<span>®</span></a>
		<p class="masthead-note">A journal of things<br />that move us.</p>
		<nav aria-label="Main navigation">
			<a class="current" href="#story" aria-current="page">Journal</a>
			<a href="/lab/interfaces">Studies <span aria-hidden="true">↗</span></a>
		</nav>
	</header>

	<section class="hero" aria-labelledby="headline">
		<div class="issue-line"><span>Volume 01 / The material issue</span><span>Notes on a softer web</span></div>
		<div class="hero-grid">
			<div class="type-column">
				<div class="type-stage">
					<h1 id="headline" bind:this={headline}><span data-liquid-line>Made of</span><span data-liquid-line>matter.</span></h1>
					<SurfaceLayer
						bind:this={layer}
						{relief}
						geometry={headline}
						color="#ae4d29"
						onStatus={(status) => {
							ready = status.ready;
							error = status.error;
							interactive = status.interactive;
							reducedMotion = status.reducedMotion;
						}}
					/>
				</div>
				<div class="type-caption"><span class="caption-rule"></span><span>A little weight. A little resistance. Something to feel.</span></div>
			</div>
			<div class="hero-copy">
				<span class="small-mark" aria-hidden="true">m.</span>
				<p class="eyebrow">An invitation to touch</p>
				<p class="lede">The screen is flat.<br />The experience<br />doesn’t have to be.</p>
				<p class="description">A soft, molded surface. A little give beneath your hand. Familiar words with an unfamiliar sense of presence.</p>
				<a class="read-link" href="#story">On making the digital feel physical <span aria-hidden="true">↓</span></a>
			</div>
		</div>
		<div class="material-tools">
			<div class="finish-switch" aria-label="Surface depth appearance">
				<span class="tool-label">Depth</span>
				<button class:active={relief} aria-pressed={relief} onclick={() => { relief = true; }}>Rounded</button>
				<button class:active={!relief} aria-pressed={!relief} onclick={() => { relief = false; }}>Flat</button>
			</div>
			<div class="gestures">
				<button class="brush" disabled={!interactive} onclick={() => layer?.sweep()}><span aria-hidden="true">↓</span> {reducedMotion ? 'Motion paused' : 'Press & release'}</button>
				<button class="reset" disabled={!ready} onclick={() => layer?.reset()}>Reset</button>
			</div>
		</div>
		<p class="material-note" role="status">
			{#if error}
				The material finish is unavailable here. The words, links, and page still work.
			{:else if !ready}
				Preparing the finish. The typography is already yours to read and select.
			{:else if reducedMotion}
				A still finish respects your reduced-motion preference. The words remain readable and selectable.
			{:else}
				Press a letter. Release to let it recover. You can still select the words.
			{/if}
		</p>
	</section>

	<section class="story" id="story" aria-labelledby="story-heading">
		<div class="story-heading"><span class="eyebrow">Field notes / 001</span><h2 id="story-heading">A surface with <br />something to say.</h2></div>
		<div class="story-copy"><p>We know a soft material by what it does under a touch. Its surface gives, light gathers around the indentation, and the shape returns when we let go. The invitation is simple: does this word feel as soft as it looks?</p><p>This is a molded-gel study, not a full soft-body simulation. The surface height deforms inside a fixed letter silhouette. The headline remains native text: readable, selectable, and part of the page.</p></div>
		<aside class="study-note"><span class="eyebrow">One material, two views</span><h3>Feel the depth.</h3><p>Rounded adds a raised profile. Flat removes that profile for comparison. Both use the same press-and-recover behavior.</p></aside>
	</section>
	<footer><a href="/lab/interfaces">fluid / interface studies</a><span>Surface-height experiment · fixed letter silhouette</span><span>01 — Typography</span></footer>
</main>

<style>
	:global(body) { margin: 0; background: #f2eee4; color: #3e342a; }
	:global(html) { scroll-behavior: smooth; }
	main { --ink: #3e342a; --muted: #817666; --copper: #9e492e; --line: #cfc5b4; max-width: 1380px; margin: 0 auto; padding: 0 64px; font-family: Arial, Helvetica, sans-serif; }
	a { color: inherit; }
	button { font: inherit; }
	a:focus-visible, button:focus-visible { outline: 2px solid var(--copper); outline-offset: 5px; }
	.masthead { display: flex; align-items: center; gap: 40px; min-height: 110px; border-bottom: 1px solid var(--line); }
	.wordmark { font-family: Georgia, 'Times New Roman', serif; font-size: 38px; font-weight: 700; letter-spacing: -2px; text-decoration: none; }
	.wordmark span { display: inline-block; font-family: Arial, sans-serif; vertical-align: top; font-size: 10px; padding: 7px 0 0 5px; letter-spacing: 0; }
	.masthead-note { margin: 0; font-size: 10px; line-height: 1.5; color: var(--muted); }
	nav { margin-left: auto; display: flex; gap: 30px; font-size: 12px; }
	nav a { text-decoration: none; }
	nav .current { text-decoration: underline; text-underline-offset: 7px; }
	nav a span { padding-left: 5px; }
	.issue-line { display: flex; justify-content: space-between; gap: 20px; padding: 25px 0 0; font-size: 9px; letter-spacing: .13em; text-transform: uppercase; color: var(--muted); }
	.hero-grid { display: grid; grid-template-columns: minmax(0, 1.85fr) minmax(210px, .8fr); gap: 56px; padding: 50px 0 36px; align-items: end; }
	.type-column { min-width: 0; }
	.type-stage { position: relative; isolation: isolate; margin: 0 -12px; padding: 10px 12px 16px; }
	h1 { width: fit-content; position: relative; margin: 0; color: #8d432d; font-family: Georgia, 'Times New Roman', serif; font-weight: 700; font-size: clamp(92px, 12.7vw, 176px); line-height: .94; letter-spacing: -.055em; }
	h1 span { display: block; width: fit-content; white-space: nowrap; }
	.type-caption { display: flex; align-items: center; gap: 12px; margin-top: 32px; font-family: Georgia, 'Times New Roman', serif; color: var(--muted); font-size: 13px; font-style: italic; }
	.caption-rule { width: 31px; height: 1px; flex: 0 0 auto; background: var(--copper); }
	.hero-copy { padding: 0 0 1px; max-width: 270px; }
	.small-mark { display: block; margin-bottom: 34px; color: var(--copper); font-family: Georgia, 'Times New Roman', serif; font-size: 31px; font-style: italic; letter-spacing: -3px; }
	.eyebrow { font-size: 9px; font-weight: 500; letter-spacing: .13em; text-transform: uppercase; color: var(--muted); }
	.hero-copy .eyebrow { margin: 0 0 17px; }
	.lede { font-family: Georgia, 'Times New Roman', serif; font-size: clamp(24px, 2.6vw, 34px); line-height: 1.18; letter-spacing: -.8px; margin: 0 0 20px; }
	.description { max-width: 245px; margin: 0 0 24px; color: #776b5c; font-size: 12px; line-height: 1.75; }
	.read-link { display: flex; align-items: center; gap: 16px; width: fit-content; max-width: 230px; font-size: 11px; line-height: 1.5; text-decoration: none; }
	.read-link span { font-size: 18px; }
	.read-link:hover { color: var(--copper); }
	.material-tools { border-top: 1px solid var(--line); display: flex; justify-content: space-between; align-items: center; gap: 20px; padding: 19px 0 0; }
	.finish-switch, .gestures { display: flex; align-items: center; gap: 10px; }
	.tool-label { margin-right: 13px; font-size: 9px; letter-spacing: .1em; text-transform: uppercase; color: var(--muted); }
	.finish-switch button { border: 1px solid transparent; background: transparent; padding: 8px 11px; border-radius: 30px; font-size: 11px; color: #766b5c; cursor: pointer; }
	.finish-switch button.active { color: var(--ink); border-color: #bbae99; }
	.finish-switch button:hover { color: var(--copper); }
	.gestures button { min-height: 36px; border: 0; cursor: pointer; font-size: 11px; }
	.brush { background: var(--ink); color: #f6f1e7; padding: 9px 16px; border-radius: 3px; }
	.brush span { margin-right: 8px; font-size: 15px; }
	.brush:hover { background: #7b422d; }
	.reset { background: transparent; color: var(--muted); padding: 9px 10px; }
	.gestures button:disabled { opacity: .45; cursor: default; }
	.material-note { margin: 13px 0 0; min-height: 18px; font-size: 10px; line-height: 1.6; color: var(--muted); }
	.story { display: grid; grid-template-columns: 1fr 1.25fr .8fr; gap: 60px; border-top: 1px solid var(--line); margin-top: 58px; padding: 34px 0 52px; scroll-margin-top: 24px; }
	h2 { font-family: Georgia, 'Times New Roman', serif; font-size: 29px; font-weight: 400; line-height: 1.16; letter-spacing: -.7px; margin: 16px 0 0; }
	.story-copy { padding-top: 1px; }
	.story-copy p { margin: 0 0 14px; color: #776b5c; font-size: 12px; line-height: 1.85; }
	.study-note { border-left: 1px solid var(--line); padding-left: 28px; }
	.study-note h3 { margin: 18px 0 0; font-family: Georgia, 'Times New Roman', serif; font-size: 25px; line-height: 1.2; font-weight: 400; letter-spacing: -.6px; }
	.study-note p { margin: 16px 0 0; max-width: 180px; color: var(--muted); font-size: 11px; line-height: 1.7; }
	footer { border-top: 1px solid var(--line); padding: 21px 0 26px; display: flex; justify-content: space-between; gap: 20px; color: var(--muted); font-size: 9px; }
	footer a { text-decoration: none; }
	@media (min-width: 1450px) { .hero-grid { gap: 90px; } }
	@media (max-width: 1050px) {
		main { padding: 0 38px; }
		.hero-grid { grid-template-columns: minmax(0, 1.8fr) minmax(190px, .8fr); gap: 30px; }
		h1 { font-size: clamp(90px, 12.3vw, 150px); }
		.hero-copy { max-width: 230px; }
		.small-mark { margin-bottom: 22px; }
		.lede { font-size: 26px; }
		.story { gap: 30px; }
	}
	@media (max-width: 740px) {
		main { padding: 0 25px; }
		.masthead { min-height: 84px; gap: 22px; }
		.wordmark { font-size: 33px; }
		.masthead-note { display: none; }
		nav { font-size: 11px; gap: 22px; }
		.issue-line { font-size: 8px; padding-top: 22px; }
		.issue-line span:last-child { display: none; }
		.hero-grid { grid-template-columns: 1fr; gap: 32px; padding: 32px 0 28px; }
		h1 { font-size: clamp(64px, 21vw, 145px); }
		.type-caption { margin-top: 20px; font-size: 12px; gap: 10px; }
		.hero-copy { display: grid; grid-template-columns: 1fr 1fr; column-gap: 24px; max-width: none; }
		.small-mark { display: none; }
		.hero-copy .eyebrow { grid-column: 1 / -1; margin-bottom: 14px; }
		.lede { grid-row: span 2; margin: 0; font-size: 26px; }
		.description { font-size: 11px; line-height: 1.65; margin-bottom: 15px; }
		.read-link { font-size: 10px; gap: 8px; }
		.material-tools { flex-wrap: wrap; gap: 14px; padding-top: 17px; }
		.tool-label { margin-right: 6px; }
		.finish-switch { gap: 4px; }
		.material-note { font-size: 10px; max-width: 390px; }
		.story { grid-template-columns: 1fr 1fr; margin-top: 35px; padding-top: 27px; gap: 26px; }
		.story-heading { grid-column: 1 / -1; }
		h2 { margin-top: 12px; font-size: 29px; }
		h2 br { display: none; }
		.story-copy p { font-size: 11px; }
		.study-note { padding-left: 20px; }
		.study-note h3 { font-size: 23px; }
		footer { flex-wrap: wrap; line-height: 1.5; gap: 10px 20px; }
		footer span:nth-child(2) { order: 3; width: 100%; }
	}
	@media (max-width: 420px) {
		.hero-copy { grid-template-columns: 1fr; }
		.lede { grid-row: auto; font-size: 28px; }
		.description { max-width: none; margin: 17px 0; }
	}
	@media (prefers-reduced-motion: reduce) { :global(html) { scroll-behavior: auto; } }
</style>
