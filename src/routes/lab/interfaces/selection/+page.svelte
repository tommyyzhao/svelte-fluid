<script lang="ts">
	import LiquidSelection from '../../../../experiments/liquid/LiquidSelection.svelte';
	let selected = $state(0);
	const shelves = [
		{ title: 'Stay a little longer.', description: 'The books you are in the middle of. No hurry to be anywhere else.',
			books: [{ title: 'The Living Mountain', author: 'Nan Shepherd', category: 'Landscape / observation', color: '#b4c29c', mark: '∿', note: 'A landscape, closely felt.' },
				{ title: 'A Field Guide to Getting Lost', author: 'Rebecca Solnit', category: 'Essays / possibility', color: '#c4af93', mark: '↗', note: 'Room for the unexpected.' }] },
		{ title: 'Something for later.', description: 'A few discoveries kept close. Pick one up when the moment feels right.',
			books: [{ title: 'The Poetics of Space', author: 'Gaston Bachelard', category: 'Architecture / imagination', color: '#b9aaa0', mark: '⌑', note: 'The places we carry within.' },
				{ title: 'Braiding Sweetgrass', author: 'Robin Wall Kimmerer', category: 'Nature / reciprocity', color: '#91aca0', mark: '⌇', note: 'Learning to pay attention.' }] },
		{ title: 'Still with you.', description: 'The last page is not always the end. A small shelf of lasting impressions.',
			books: [{ title: 'Ways of Seeing', author: 'John Berger', category: 'Art / perception', color: '#b8bb90', mark: '◉', note: 'Look once more.' },
				{ title: 'In Praise of Shadows', author: 'Jun’ichirō Tanizaki', category: 'Design / atmosphere', color: '#acaaa0', mark: '◐', note: 'Beauty at the edge of light.' }] }
	];
	const shelf = $derived(shelves[selected]);
</script>

<svelte:head>
	<title>Still — a reading room / liquid selection study</title>
	<meta name="robots" content="noindex" />
	<meta name="description" content="A native segmented shelf control with a small WebGPU material indicator. The reading shelf changes immediately; the material is feedback only." />
</svelte:head>

<main>
	<header><a class="wordmark" href="/lab/interfaces">still<span> / a reading room</span></a><a class="study-link" href="/lab/interfaces">Interface studies <span aria-hidden="true">↗</span></a></header>
	<section class="intro"><p class="eyebrow">A space for your attention</p><h1>Where the mind<br /><em>comes to rest.</em></h1><p>A little less noise. A little more room for the things that stay.</p></section>
	<section class="library" aria-labelledby="shelf-title">
		<div class="shelf-control"><span class="eyebrow">Your shelf / 06 books</span><LiquidSelection bind:selected /></div>
		<div class="shelf-heading" aria-live="polite" aria-atomic="true"><div><p class="eyebrow">{['Reading now', 'Saved for later', 'Read & remembered'][selected]} / 02</p><h2 id="shelf-title">{shelf.title}</h2></div><p>{shelf.description}</p></div>
		<div class="books">
			{#each shelf.books as book}
				<article><div class="cover" style:--paper={book.color}><span>{book.author}</span><strong>{book.title}</strong><span class="cover-mark" aria-hidden="true">{book.mark}</span><span class="edition">A place on your shelf</span></div><div class="book-copy"><p class="eyebrow">{book.category}</p><h3>{book.title}</h3><p class="author">{book.author}</p><p class="book-note">{book.note}</p></div></article>
			{/each}
		</div>
	</section>
	<footer><p><span class="eyebrow">Material note</span> Seven damped blobs make the selection feel liquid. This is cosmetic feedback, not a fluid simulation. Native controls and shelf content never wait for it.</p><a href="/lab/interfaces">fluid / interface studies</a></footer>
</main>

<style>
	:global(body) { margin: 0; background: #17231d; color: #e7e8da; }
	main { max-width: 1120px; padding: 0 48px; margin: 0 auto; font-family: Arial, Helvetica, sans-serif; }
	a { color: inherit; text-decoration: none; }
	a:focus-visible { outline: 2px solid #d7e7ad; outline-offset: 5px; }
	header { min-height: 98px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #364039; gap: 20px; }
	.wordmark { font: italic 36px Georgia, serif; letter-spacing: -1.7px; }
	.wordmark span { display: inline-block; margin-left: 16px; font: 10px Arial, sans-serif; letter-spacing: .02em; color: #97a396; }
	.study-link { font-size: 10px; color: #bbc4b7; }
	.study-link span { margin-left: 14px; }
	.intro { padding: 42px 0 30px; }
	.eyebrow { font-size: 9px; text-transform: uppercase; letter-spacing: .13em; font-weight: normal; color: #a0ac9e; }
	h1 { margin: 19px 0; font: 400 clamp(43px,5.2vw,65px)/1.07 Georgia, serif; letter-spacing: -.045em; }
	h1 em { color: #c2ceac; font-weight: 400; }
	.intro > p:last-child { font-size: 12px; line-height: 1.8; color: #a7b1a4; }
	.shelf-control { max-width: 720px; }
	.shelf-control > span { display: block; margin: 0 0 15px; }
	.shelf-heading { display: flex; justify-content: space-between; gap: 30px; align-items: end; margin: 35px 0 26px; }
	.shelf-heading .eyebrow { margin: 0 0 12px; }
	h2 { margin: 0; font: 400 31px/1.15 Georgia, serif; letter-spacing: -.7px; }
	.shelf-heading > p { max-width: 240px; font-size: 11px; line-height: 1.75; color: #a7b1a4; margin: 0; }
	.books { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; }
	article { display: grid; grid-template-columns: 132px 1fr; gap: 23px; padding: 26px 0; border-top: 1px solid #3b473e; }
	.cover { min-height: 190px; display: flex; flex-direction: column; padding: 15px 12px 10px 17px; color: #354536; background: var(--paper); box-shadow: inset 5px 0 0 #00000012, 4px 6px 10px #00000012; }
	.cover > span:first-child { font-size: 7px; }
	.cover strong { margin-top: 13px; font: 400 18px/1.08 Georgia, serif; letter-spacing: -.5px; }
	.cover-mark { display: block; text-align: center; font: 48px/1 Georgia, serif; margin: auto 0; padding: 14px 0; }
	.edition { font-size: 6px; letter-spacing: .03em; text-transform: uppercase; }
	.book-copy { padding: 12px 0; }
	.book-copy .eyebrow { font-size: 8px; line-height: 1.6; margin: 0 0 13px; }
	h3 { font: 400 23px/1.18 Georgia, serif; letter-spacing: -.4px; margin: 0 0 9px; }
	.author { font-size: 10px; color: #a7b1a4; }
	.book-note { border-top: 1px solid #364039; padding-top: 14px; margin-top: 25px; font: italic 12px/1.5 Georgia, serif; color: #bcc5b2; }
	footer { display: flex; justify-content: space-between; align-items: end; border-top: 1px solid #364039; gap: 32px; margin-top: 33px; padding: 23px 0 35px; }
	footer p { max-width: 580px; font-size: 10px; line-height: 1.8; color: #94a091; margin: 0; }
	footer .eyebrow { display: block; margin-bottom: 8px; }
	footer a { flex: 0 0 auto; font-size: 10px; color: #aab6a3; }
	@media(max-width: 800px) { main { padding: 0 28px; } .books { gap: 20px; } article { grid-template-columns: 105px 1fr; gap: 17px; } .cover { min-height: 170px; } h3 { font-size: 20px; } }
	@media(max-width: 600px) { main { padding: 0 23px; } header { min-height: 79px; } .wordmark span { display: none; } .intro { padding: 43px 0 35px; } h1 { font-size: clamp(39px,10vw,57px); } .intro > p:last-child { max-width: 280px; } .shelf-heading { display: block; margin-top: 37px; } .shelf-heading > p { margin-top: 15px; max-width: 300px; } .books { grid-template-columns: 1fr; gap: 0; } article { grid-template-columns: 120px 1fr; gap: 24px; } .cover { min-height: 180px; } h3 { font-size: 23px; } footer { display: block; margin-top: 15px; } footer a { display: inline-block; margin-top: 21px; } }
	@media(max-width: 350px) { article { grid-template-columns: 103px 1fr; gap: 17px; } h3 { font-size: 21px; } }
</style>
