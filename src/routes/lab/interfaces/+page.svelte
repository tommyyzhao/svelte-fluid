<script lang="ts">
	const contentBench = [
		{ path: 'living-cover', number: '15', title: 'An edge that responds.', kind: 'IMAGE / BOUNDARY', description: 'A still photograph inside a wet aperture. The boundary deforms and a finite reveal front travels across the image.', color: '#d5c9b5', accent: '#564231' },
		{ path: 'capillary-type', number: '16', title: 'Color, held in type.', kind: 'PIGMENT / ATTACHMENT', description: 'A finite pulse moves through a wordmark. Inspect the mobile and attached pigment separately; the counters stay clear.', color: '#e9dfcf', accent: '#7b5438' },
		{ path: 'material-type', number: '17', title: 'A finish with feeling.', kind: 'VELVET & GLAZE', description: 'Brush velvet or polish glaze inside stationary letters. Move the light independently; bending is optional.', color: '#2c272c', accent: '#d7bfc5' },
		{ path: 'tactile', number: '18', title: 'Load. Release. Respond.', kind: 'GLASS & FOIL', description: 'Turn the glass load, press and release it; bend foil toward a committed shape. Effects first, with ordinary controls.', color: '#171e2b', accent: '#c4c8e5' },
		{ path: 'contours', number: '19', title: 'A wave follows a line.', kind: 'CONTOUR / ECHOES', description: 'Send pulses along a closed rim. They divide, travel, meet and fade; a separate loop keeps its own motion.', color: '#12201f', accent: '#b0c9bb' },
		{ path: 'colorway', number: '20', title: 'Pour a composition.', kind: 'COLOR / FINITE INPUT', description: 'Three pigments, a bounded emblem and a finite reservoir. Pour, comb and inspect what stays.', color: '#e5d8bd', accent: '#754f43' }
	];
	const bench = [
		{ path: 'ink', number: '08', title: 'Combed, not blurred.', kind: 'INK / DEFORMATION', description: 'Fold indigo and copper through cream. Each stroke transforms the original pattern instead of smearing a color buffer.', color: '#253c53', accent: '#dbaa79' },
		{ path: 'foil', number: '09', title: 'Past the tipping point.', kind: 'FOIL / INSTABILITY', description: 'A metallic arch resists, snaps, and stays on the other side. Two resting shapes, not another spring wobble.', color: '#393225', accent: '#dfbf7d' },
		{ path: 'velvet', number: '10', title: 'Against the grain.', kind: 'VELVET / DIRECTION', description: 'Brush the pile; then move the light. The memory is a direction, not a painted color.', color: '#273830', accent: '#b6cda0' },
		{ path: 'glass', number: '11', title: 'See the pressure.', kind: 'GLASS / STRESS', description: 'Compress a transparent coin between two pads. Organized color fringes reveal the applied load.', color: '#182131', accent: '#bdc3e9' },
		{ path: 'bridges', number: '12', title: 'A moment before parting.', kind: 'LIQUID / CONNECTION', description: 'Pull wet contacts apart. Watch a finite volume form a neck, separate, and recover.', color: '#252b35', accent: '#a8d3d6' },
		{ path: 'crazing', number: '14', title: 'Beautifully fractured.', kind: 'ENAMEL / HISTORY', description: 'Build a sparse crack network. New lines meet old ones; the glazed surface retains its history.', color: '#ccded8', accent: '#4d6f68' }
	];
</script>

<svelte:head><title>Material experiments — effect first</title><meta name="robots" content="noindex" /></svelte:head>

<main>
	<header><a href="/lab/liquids">fluid / material studies</a><span>AN INDEPENDENT WEBGPU EXPLORATION</span></header>
	<p class="eyebrow">Effect first. Integration later.</p>
	<h1>What could a<br /><em>material become?</em></h1>
	<p class="intro">Brush a photograph’s boundary. Change a word’s finish. Send echoes around a contour.<br />Native display pixels. First the feeling; then a place for it.</p>
	<a class="batch-link" href="/lab/interfaces/library"><span>LIBRARY INTEGRATION · REVISED</span><strong>Stone & light ↗</strong><p>A borderless spring changes the appearance. Still type, still photograph; one material interaction. Plain comparison is in Study notes.</p></a>
	<a class="batch-link" href="/lab/interfaces/batch"><span>PHYSICS-LED VISUAL EXPLORATION</span><strong>Explore material behavior ↗</strong><p>Local image wakes, concentrated light, pigment that clings, changing contacts and shapes that remember. Effects worth exploring before choosing their place in a design.</p></a>
	<section class="bench" aria-labelledby="content-title">
		<div class="bench-heading"><h2 id="content-title">Content in motion.</h2><p>New effect-first studies · native pixels · explicit models</p></div>
		<div class="bench-grid">
			{#each contentBench as study}
				<a class="bench-card" href="/lab/interfaces/{study.path}" style:--paper={study.color} style:--ink={study.accent}>
					<div class="bench-preview"><span>{study.number} / {study.kind}</span><strong>{study.title}</strong></div>
					<p>{study.description}<span aria-hidden="true">↗</span></p>
				</a>
			{/each}
		</div>
	</section>
	<section class="bench" aria-labelledby="bench-title">
		<div class="bench-heading"><h2 id="bench-title">The mechanism archive.</h2><p>Earlier proofs · useful references, not approved UI components</p></div>
		<div class="bench-grid">
			{#each bench as study}
				<a class="bench-card" href="/lab/interfaces/{study.path}" style:--paper={study.color} style:--ink={study.accent}>
					<div class="bench-preview"><span>{study.number} / {study.kind}</span><strong>{study.title}</strong></div>
					<p>{study.description}<span aria-hidden="true">↗</span></p>
				</a>
			{/each}
		</div>
	</section>
	<div class="new-studies">
		<a class="new-study filament" href="/lab/interfaces/filaments"><div class="new-preview"><span class="number">07 / FORM & TENSION</span><span class="strand-title" aria-hidden="true">Still<br /><em>connected.</em></span></div><div class="caption"><h2>A line with presence <span>↗</span></h2><p>One round, lit strand. Brush past it to bend the shape; overlapping portions have real depth. It stays connected as it recovers.</p><p>New exploration · native-DPR geometry and edge coverage, with a small independent simulation.</p></div></a>
		<a class="new-study interference" href="/lab/interfaces/membrane"><div class="new-preview"><span class="number">04 / INTERFERENCE</span><span class="film-title" aria-hidden="true">Light,<br /><em>unsettled.</em></span></div><div class="caption"><h2>A membrane of light <span>↗</span></h2><p>Move across the whole surface. Waves change its shape, reflections, and interference colors.</p></div></a>
		<a class="new-study mercury" href="/lab/interfaces/mercury"><div class="new-preview"><span class="number">05 / TOPOLOGY</span><span class="metal-title" aria-hidden="true">MELT</span></div><div class="caption"><h2>Metal that comes apart <span>↗</span></h2><p>Sweep through the lettering. Pull out strands and droplets, then watch the letters re-form.</p></div></a>
		<a class="new-study afterheat" href="/lab/interfaces/heat-tint"><div class="new-preview"><span class="number">06 / LASTING COLOR</span><span class="heat-title" aria-hidden="true">Afterheat.</span></div><div class="caption"><h2>A surface with a memory <span>↗</span></h2><p>Write with heat, not paint. Movement leaves an interference-colored oxide trace. The heat fades; the mark stays.</p><p>Working study · retained for later. No click required.</p></div></a>
	</div>
	<p class="eyebrow revisions">Revised & retained</p>
	<div class="studies">
		<a class="study soft" href="/lab/interfaces/soft-type">
			<div class="specimen"><span class="number">01 / SHAPE</span><span class="soft-word" aria-hidden="true">a little<br /><i>give.</i></span></div>
			<div class="caption"><h2>Type with a little give <span>↗</span></h2><p>Now responds to pointer movement. No click, no selection highlights. The actual outline yields.</p></div>
		</a>
		<a class="study selection" href="/lab/interfaces/selection">
			<div class="specimen"><span class="number">02 / TRANSITION</span><div class="shelf" aria-hidden="true"><span>Reading</span><span>Saved</span><b>Finished</b><i class="droplet"></i><i class="pool"></i></div><span class="shelf-title" aria-hidden="true">A change of mind.</span></div>
			<div class="caption"><h2>A choice, in motion <span>↗</span></h2><p>A working study, retained. Click Reading → Finished to see separation and rejoining.</p></div>
		</a>
		<a class="study imprint" href="/lab/interfaces/imprint">
			<div class="specimen"><span class="number">03 / MEMORY</span><span class="seal" aria-hidden="true"><i>m</i></span></div>
			<div class="caption"><h2>Leave an impression <span>↗</span></h2><p>A promising direction, retained. Press a signet into wax; the mark stays until you warm it smooth.</p></div>
		</a>
	</div>
	<div class="reference"><div><p class="eyebrow">The starting point</p><h2>Still made of matter.</h2><p>The original wet-enamel typography remains the reference for depth and touch.</p></div><a href="/lab/interfaces/editorial">Revisit the enamel study ↗</a></div>
	<footer><p>Private R&D, not new public components. These are illustrative material models—not calibrated liquid or soft-body physics. The directory previews are static; each study runs its own experiment.</p></footer>
</main>

<style>
	:global(body) { margin: 0; background: #f3eee4; color: #40332a; }
	main { max-width: 1240px; margin: auto; padding: 0 40px; font-family: Arial, sans-serif; }
	a { color: inherit; text-decoration: none; }
	header { display: flex; justify-content: space-between; gap: 25px; align-items: center; padding: 29px 0; border-bottom: 1px solid #d2c8ba; }
	header > a { font: italic 22px Georgia, serif; }
	header > span, .eyebrow { font-size: 9px; letter-spacing: .15em; color: #8c7666; }
	main > .eyebrow { margin-top: 61px; text-transform: uppercase; }
	h1 { font: 400 clamp(42px, 6vw, 78px)/1.02 Georgia, serif; letter-spacing: -.045em; margin: 24px 0; }
	h1 em { font-weight: 400; color: #aa6042; }
	.intro { font-size: 13px; color: #8c7666; line-height: 1.8; }
	.batch-link { display: block; margin: 30px 0; padding: 24px; border: 1px solid #9dab91; background: #e0e5d6; color: #445742; }
	.batch-link > span { font-size: 9px; letter-spacing: .12em; }
	.batch-link > strong { display: block; margin-top: 13px; font: 400 28px/1.15 Georgia, serif; }
	.batch-link > p { max-width: 840px; margin: 12px 0 0; font-size: 12px; line-height: 1.8; }
	.bench { margin: 36px 0 45px; }
	.bench-heading { display: flex; justify-content: space-between; align-items: baseline; gap: 15px; margin-bottom: 18px; }
	.bench-heading p { color: #8c7666; font-size: 10px; }
	.bench-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 18px; }
	.bench-card { border: 1px solid #d5c9b8; }
	.bench-card:hover { border-color: #aa6042; }
	.bench-preview { min-height: 170px; padding: 23px; color: var(--ink); background: var(--paper); }
	.bench-preview > span { font-size: 8px; letter-spacing: .1em; }
	.bench-preview strong { display: block; font: italic 34px/1.04 Georgia, serif; letter-spacing: -.035em; margin-top: 30px; max-width: 240px; }
	.bench-card > p { position: relative; font-size: 11px; line-height: 1.75; color: #8c7666; padding: 18px 35px 18px 20px; margin: 0; }
	.bench-card > p span { position: absolute; right: 16px; top: 18px; }
	@media (max-width: 1000px) { .bench-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
	@media (max-width: 600px) { .bench-grid { grid-template-columns: 1fr; } .bench-heading { display: block; } .bench-preview { min-height: 140px; } }
	.new-studies { display: grid; grid-template-columns: 1fr 1fr; gap: 22px; margin-top: 38px; }
	.new-study { border: 1px solid #d5c9b8; }
	.new-study:hover { border-color: #aa6042; }
	.filament { grid-column: 1 / -1; display: grid; grid-template-columns: 1fr 1fr; }
	.filament .new-preview { height: 210px; color: #d2b69e; background: #15191d; }
	.filament .caption { border-top: 0; border-left: 1px solid #d5c9b8; display: flex; flex-direction: column; justify-content: center; }
	.strand-title { display: block; margin-top: 32px; font: 400 54px/.93 Georgia, serif; letter-spacing: -.045em; }
	.strand-title em { color: #a8b9cb; margin-left: 30px; }
	.afterheat { grid-column: 1 / -1; display: grid; grid-template-columns: 1fr 1fr; }
	.afterheat .new-preview { height: 210px; color: #f0e9d8; background: radial-gradient(ellipse at 66% 62%, #abb3bb 12%, #6b798f 17%, #68528b 22%, #a28274 28%, #999fa4 40%, #5f6973 70%); }
	.afterheat .caption { border-top: 0; border-left: 1px solid #d5c9b8; display: flex; flex-direction: column; justify-content: center; }
	.heat-title { display: block; font: 400 clamp(42px, 5vw, 66px)/1 Arial, sans-serif; letter-spacing: -.07em; margin-top: 65px; }
	.new-preview { padding: 25px; height: 290px; overflow: hidden; }
	.interference .new-preview { color: #f2e7ff; background: radial-gradient(ellipse at 18% 90%, #78bd9c, transparent 38%), radial-gradient(ellipse at 65% 42%, #dba6d2, transparent 43%), linear-gradient(155deg, #202d3b 15%, #618e8e 30%, #443753 48%, #ad718f 60%, #292d41 90%); }
	.film-title { display: block; font: 400 65px/.97 Georgia, serif; letter-spacing: -.045em; margin-top: 44px; text-shadow: 0 1px 8px #1b12326b; }
	.film-title em { margin-left: 40px; }
	.mercury .new-preview { background: #030607; color: #99e6f1; }
	.metal-title { display: block; font: 900 clamp(70px, 8.8vw, 110px)/1 Arial, sans-serif; letter-spacing: -.075em; text-align: center; margin-top: 58px; color: #d4e3e9; background: linear-gradient(#d8f0f6 10%, #fff 28%, #1a2733 44%, #edfaff 50%, #2c4c62 65%, #abcada 87%); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; }
	main > .revisions { margin: 42px 0 0; }
	.revisions + .studies { margin-top: 18px; }
	.studies { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 22px; margin-top: 44px; }
	.study { border: 1px solid #d5c9b8; display: flex; flex-direction: column; }
	.study:hover { border-color: #aa6042; }
	.specimen { height: 260px; padding: 24px; position: relative; overflow: hidden; }
	.number { font: 9px Arial, sans-serif; letter-spacing: .13em; }
	.soft .specimen { background: #e8d8c0; }
	.soft-word { display: block; font: bold clamp(50px, 5vw, 70px)/.88 Georgia, serif; letter-spacing: -.07em; color: #b06848; margin-top: 36px; text-shadow: 1px 1px #d99a77, 2px 3px #7d49362b; }
	.soft-word i { display: inline-block; margin-left: 40px; transform: rotate(-8deg); }
	.selection .specimen { background: #1b2821; color: #c9d0b6; }
	.shelf { position: relative; display: flex; justify-content: space-around; margin-top: 63px; padding-bottom: 29px; border-bottom: 1px solid #c9d0b630; font-size: 10px; }
	.shelf b { color: #f0f0d9; font-weight: 500; }
	.shelf i { position: absolute; bottom: 7px; border-radius: 50%; background: radial-gradient(ellipse at 30% 30%, #e8f499, #9aac41 50%, #66702c); box-shadow: inset 0 1px #e8f499; height: 9px; }
	.droplet { width: 35px; left: 43%; }
	.pool { width: 65px; left: 70%; }
	.shelf-title { display: block; font: italic 23px Georgia, serif; margin-top: 24px; }
	.imprint .specimen { background: #e4d9ce; }
	.seal { display: grid; place-items: center; width: 150px; height: 145px; background: radial-gradient(ellipse at 30% 22%, #c78681, #993d4c 70%); border-radius: 46% 48% 50% 46%; margin: 27px auto 0; box-shadow: 3px 5px 5px #5d313627; }
	.seal i { display: grid; place-items: center; width: 87px; height: 87px; border: 2px solid #86333d; outline: 1px solid #d18b82; border-radius: 50%; color: #87373f; font: italic bold 59px Georgia, serif; text-shadow: 1px 1px #d99a91; }
	.caption { border-top: 1px solid #d5c9b8; padding: 22px; flex: 1; }
	h2 { font: 400 24px/1.15 Georgia, serif; letter-spacing: -.025em; margin: 0; }
	.caption h2 { display: flex; justify-content: space-between; gap: 14px; font-size: 22px; }
	.caption h2 span { font-size: 19px; }
	.caption p { color: #8c7666; font-size: 11px; line-height: 1.8; margin: 15px 0 0; }
	.reference { margin: 42px 0; padding: 28px 0; border-top: 1px solid #d2c8ba; border-bottom: 1px solid #d2c8ba; display: flex; justify-content: space-between; align-items: center; gap: 30px; }
	.reference .eyebrow { text-transform: uppercase; margin-top: 0; }
	.reference p:last-child { font-size: 12px; color: #8c7666; margin-bottom: 0; }
	.reference a { font-size: 12px; flex-shrink: 0; }
	footer { display: flex; align-items: start; justify-content: space-between; gap: 30px; color: #8c7666; font-size: 10px; line-height: 1.8; margin-bottom: 25px; }
	footer p { max-width: 710px; margin: 0; }
	a:focus-visible { outline: 2px solid #aa6042; outline-offset: 5px; }
	@media(max-width: 760px) { main { padding: 0 22px; } header > span { display: none; } main > .eyebrow { margin-top: 38px; } .studies, .new-studies { grid-template-columns: 1fr; } .afterheat, .filament { display: block; } .afterheat .caption, .filament .caption { border-left: 0; border-top: 1px solid #d5c9b8; } .new-preview { height: 250px; } .film-title { font-size: 53px; } .metal-title { font-size: 90px; } .specimen { height: 235px; } .soft-word { font-size: 70px; } .shelf { max-width: 340px; margin: 53px auto 0; } .shelf-title { text-align: center; } .reference, footer { display: block; } .reference a { display: inline-block; margin-top: 22px; } }
</style>
