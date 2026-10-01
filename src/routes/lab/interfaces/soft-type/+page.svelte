<script lang="ts">
	import SoftType from '../../../../experiments/liquid/SoftType.svelte';
	let heading = $state<HTMLHeadingElement>();
	let surface: SoftType;
	let ready = $state(false),reducedMotion = $state(false),error = $state('');
</script>

<svelte:head>
	<title>Soft / a little room to give</title>
	<meta name="description" content="A study in typography that yields. Move your pointer across a letter and watch its outline follow, then find its way home." />
</svelte:head>

<div class="page">
	<header>
		<a class="wordmark" href="/lab/interfaces">soft<span>®</span></a>
		<p>An independent study<br />in a more tactile web.</p>
		<a class="back" href="/lab/interfaces/editorial">The material journal <span>↗</span></a>
	</header>
	<main>
		<div class="edition"><span>FORM STUDY 03</span><span>TYPE WITH A LITTLE GIVE</span></div>
		<section class="hero" aria-labelledby="soft-heading">
			<div class="type-stage" class:ready>
				<h1 id="soft-heading" bind:this={heading}><span data-liquid-line>A little</span><span data-liquid-line>room to give.</span></h1>
				<SoftType bind:this={surface} geometry={heading} color="#b95532" onStatus={(status) => {
					ready = status.ready; reducedMotion = status.reducedMotion; error = status.error;
				}} />
			</div>
			<div class="hero-footer">
				<p class="invitation">Good things don’t always<br />have to hold their shape.</p>
				<div class="interaction">
					<button class="pull" disabled={!ready || reducedMotion} onclick={() => surface?.tryPull()}>Try the motion <span aria-hidden="true">↗</span></button>
					<button class="reset" disabled={!ready} onclick={() => surface?.reset()}>Let it rest</button>
				</div>
			</div>
			<p class="gesture">{error ? 'The moving material is unavailable here; the original typography remains.' : reducedMotion ? 'Reduced motion is on. The lettering rests in its original shape.' : 'Move across the letters. No click needed.'}</p>
		</section>
		<section class="story" aria-labelledby="story-title">
			<div class="story-label"><span class="dot"></span> THE SHAPE OF AN IDEA</div>
			<h2 id="story-title">A softer kind<br /><em>of presence.</em></h2>
			<div class="story-copy"><p>A passing pointer gives these letters a gentle pull. Their edges follow your movement, then settle back when your hand comes to rest.</p><p>The headline remains readable and part of the page. Its specimen surface is free from selection highlights, so you can explore the material without holding a button.</p></div>
			<a class="journal-link" href="/lab/interfaces/editorial">Before the outline moved <span aria-hidden="true">↗</span></a>
		</section>
		<details><summary>What is moving?</summary><p>A damped displacement field bends the complete rendered lettering, including its outline. This is a bounded visual material study, not a volume-conserving soft-body simulation. The specimen heading remains semantic text; selection is disabled only on its surface. On touch screens, page scrolling stays native.</p>{#if error}<p>{error}</p>{/if}</details>
	</main>
	<footer><span>soft / material studies</span><span>A little less rigid. A little more human.</span><a href="/lab/interfaces">All studies ↗</a></footer>
</div>

<style>
	:global(body) { margin: 0; background: #f3eee5; color: #432d24; }
	:global(*) { box-sizing: border-box; }
	.page { max-width: 1600px; margin: auto; padding: 0 5.5vw; font-family: Arial, sans-serif; }
	header { display: flex; align-items: center; gap: 35px; min-height: 122px; border-bottom: 1px solid #cfc4b6; }
	a { color: inherit; text-decoration: none; }
	.wordmark { font: italic 700 57px/1 Georgia, serif; letter-spacing: -5px; }
	.wordmark span { font: 11px Arial,sans-serif; letter-spacing: 0; vertical-align: top; margin-left: 7px; }
	header p { color: #847365; font-size: 11px; line-height: 1.55; }
	.back { margin-left: auto; font-size: 12px; }
	.back span { margin-left: 22px; font-size: 22px; }
	.edition { display: flex; justify-content: space-between; color: #8d7666; font-size: 10px; letter-spacing: .14em; padding: 25px 0 0; }
	.hero { padding: 0 0 43px; }
	.type-stage { position: relative; padding: 36px 4.5% 42px; margin: 8px -4.5% 0; }
	h1 { position: relative; margin: 0; color: #b95532; font: 700 clamp(66px,11.6vw,175px)/.99 Georgia,serif; letter-spacing: -.067em; user-select: none; -webkit-user-select: none; cursor: default; }
	h1 span { display: block; width: max-content; max-width: 100%; }
	.ready h1 { color: transparent; }
	.hero-footer { display: flex; align-items: end; justify-content: space-between; gap: 24px; margin-top: 20px; }
	.invitation { font: italic 26px/1.24 Georgia,serif; margin: 0; }
	.interaction { display: flex; gap: 20px; align-items: center; }
	button { font: inherit; cursor: pointer; }
	button:disabled { opacity: .45; cursor: default; }
	.pull { border: 0; border-radius: 999px; background: #493126; color: #fff5e9; padding: 17px 24px; font-size: 12px; min-width: 162px; display: flex; justify-content: space-between; gap: 24px; }
	.pull span { font-size: 19px; }
	.reset { background: none; border: 0; font-size: 11px; color: #8d7666; padding: 12px 0; }
	.gesture { color: #8b7969; font-size: 11px; margin: 24px 0 0; text-align: right; }
	.story { border-top: 1px solid #cfc4b6; padding: 37px 0 42px; display: grid; grid-template-columns: 1fr 1.2fr 1.4fr; gap: 28px; }
	.story-label { grid-column: 1/-1; display: flex; gap: 9px; align-items: center; font-size: 9px; letter-spacing: .1em; color: #8b7969; }
	.dot { width: 6px; height: 6px; border-radius: 50%; background: #b95532; }
	h2 { margin: 0; font: 33px/1.05 Georgia,serif; letter-spacing: -.03em; }
	h2 em { color: #a0583b; font-weight: 400; }
	.story-copy { max-width: 360px; color: #7b6858; font-size: 12px; line-height: 1.8; }
	.story-copy p { margin: 0 0 13px; }
	.journal-link { border-left: 1px solid #cfc4b6; padding: 0 0 0 32px; font: 24px/1.2 Georgia,serif; display: flex; gap: 28px; }
	details { border-top: 1px solid #cfc4b6; padding: 20px 0; color: #8a7969; font-size: 11px; }
	details p { max-width: 720px; line-height: 1.7; }
	summary { cursor: pointer; }
	footer { border-top: 1px solid #cfc4b6; padding: 25px 0 34px; display: flex; justify-content: space-between; font-size: 10px; color: #8b7969; }
	:global(button:focus-visible),a:focus-visible,summary:focus-visible { outline: 2px solid #a64f30; outline-offset: 5px; }
	@media(max-width: 700px) {
		.page { padding: 0 6vw; } header { min-height: 90px; gap: 22px; } header p { display: none; }
		.wordmark { font-size: 47px; } .back { font-size: 10px; } .edition { font-size: 8px; gap: 20px; }
		h1 { font-size: clamp(51px,11vw,77px); } .type-stage { padding-top: 39px; padding-bottom: 34px; }
		.hero-footer { align-items: start; } .invitation { font-size: 21px; } .interaction { flex-direction: column; gap: 4px; }
		.pull { min-width: 146px; padding: 14px 16px; gap: 14px; white-space: nowrap; } .gesture { text-align: left; font-size: 10px; }
		.story { grid-template-columns: 1fr 1.3fr; gap: 23px; } h2 { font-size: 27px; }
		.journal-link { grid-column: 1/-1; border-left: 0; border-top: 1px solid #cfc4b6; padding: 20px 0 0; font-size: 22px; justify-content: space-between; }
		footer { gap: 20px; flex-wrap: wrap; } footer span:nth-child(2) { display: none; }
	}
</style>
