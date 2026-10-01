<script lang="ts">
	const groups = [
		{ title: 'Images that answer the hand.', subtitle: 'Local distortion, responsive boundaries and concentrated light.', studies: [
			{ path: 'image-wake', name: 'Local image wake', action: 'Sweep across one arch, then stop.', expect: 'The nearby image carries a wake; distant architecture stays still.', bead: '8u3', color: '#d5c5af' },
			{ path: 'annular-flow', name: 'Around a fixed mark', action: 'Brush around the bronze rim; compare held left/right and the unchanged source.', expect: 'The photograph bends around a protected center. A bounded circular map—not a general obstacle-flow solver.', bead: 'dg4.16', color: '#c6b49c' },
			{ path: 'caustics', name: 'Light, concentrated', action: 'Move the lens and compare flat water.', expect: 'Refraction concentrates light on a fixed receiver—not a procedural glow.', bead: '9p9', color: '#a5c9c0' },
			{ path: 'caustic-cover', name: 'A photograph receives light', action: 'Shift the light, then compare Original and the CSS highlight.', expect: 'Architecture stays registered. A computed light field relights the printed photograph—not a recovered 3D scene.', bead: '13b', color: '#cbbb99' },
			{ path: 'meniscus', name: 'Before the touch', action: 'Move near the aperture’s rim without touching it.', expect: 'A field-attracted edge reaches toward you while the photograph stays fixed.', bead: 'ihd', color: '#adc4ba' }
		] },
		{ title: 'Matter that changes.', subtitle: 'Phase, attachment and material coupling.', studies: [
			{ path: 'frost', name: 'Cold bloom', action: 'Seed a cold front, then warm an opening.', expect: 'Actual phase and temperature evolve. Faceted growth is not a claimed dendrite simulation.', bead: 'xfm', color: '#c2d9df' },
			{ path: 'frost-type', name: 'Letters start a front', action: 'Warm the halo slowly, reseed the letters, and compare SVG expansion.', expect: 'Native letters seed phase change. The glassy front has thermal memory; convincing natural frost remains unproven.', bead: 'fpb', color: '#b0cbd0' },
			{ path: 'dendritic-growth', name: 'Branches from heat', action: 'Watch the finite growth, rotate it, and reveal the heat. Or show the grown still specimen.', expect: 'Actual thermal competition creates branches. A clean phase silhouette—not painted snow or an ice-shading claim.', bead: 'dg4.15', color: '#b4c3a4' },
			{ path: 'dewetting', name: 'A film makes room', action: 'Open a hole and watch the raised rim.', expect: 'The removed coating is accounted for in the rim; compare a simple wipe.', bead: '6nq', color: '#c7a99b' },
			{ path: 'wick-and-swell', name: 'Wick and swell', action: 'Add a finite drop, let it wick, then probe the wet region.', expect: 'Absorption changes relief and compliance, not just color.', bead: '0mw', color: '#d4cbae' },
			{ path: 'adhesive-type', name: 'A word on a wet sheet', action: 'Carry pigment across and around the lettering.', expect: 'The sheet remains traversable; letters retain pigment while the background clears.', bead: '7gg', color: '#d8c9b1' }
		] },
		{ title: 'Shape can remember.', subtitle: 'Deposition, impressions, creases and changing contacts.', studies: [
			{ path: 'imprint', name: 'An impression that stays', action: 'Press into the wax. Move away, then catch the mark in the light.', expect: 'Depth remembers the contact until the wax is smoothed again.', bead: 'bmu', color: '#c79d97' },
			{ path: 'threads', name: 'Coil / cross / remain', action: 'Feed a deposited thread; compare an authored braid.', expect: 'Continuous lit geometry, bounded deposition history and explicit model limits.', bead: 'ii7 · 6po', color: '#b6b9c5' },
			{ path: 'peel', name: 'A peel with a crease', action: 'Lift, remember a fold, lay down, and lift again.', expect: 'The same controls produce a different geometric bend after a remembered crease.', bead: '8bg', color: '#d2c8b3' },
			{ path: 'foam', name: 'An exchange of neighbors', action: 'Change the frame’s strain and watch the central film.', expect: 'One contact disappears and another is created; this is a real topology-state change.', bead: 'j12', color: '#b8c7d0' }
		] }
	];
</script>

<svelte:head><title>Material behavior — creative WebGPU studies</title><meta name="robots" content="noindex" /></svelte:head>
<main>
	<header><a href="/lab/interfaces">← Material studio</a><span>PHYSICS-LED VISUAL EXPLORATION</span></header>
	<p class="eyebrow">Matter is the interaction.</p>
	<h1>Touch. Change.<br /><em>Remember.</em></h1>
	<p class="intro">Color clings. A surface buckles. Light gathers. A fracture stays.<br />Experiments in expressive material behavior—not editing tools with effects attached.</p>
	<aside><strong>The behavior must earn the effect.</strong><p>Look for a visible consequence of force, transport, geometry or light. Does it feel worth exploring even without a product mockup? These are research candidates, not claims of finished design or calibrated physics. The previews are static; open a study to run it.</p></aside>
	<nav aria-label="Review groups">{#each groups as group, i}<a href="#group-{i}">{group.title}</a>{/each}</nav>
	{#each groups as group, i}
		<section id="group-{i}" aria-labelledby="heading-{i}">
			<div class="section-heading"><h2 id="heading-{i}">{group.title}</h2><p>{group.subtitle}</p></div>
			<div class="grid">{#each group.studies as study}
				<a class="card" href="/lab/interfaces/{study.path}" style:--swatch={study.color}>
					<div class="card-heading"><h3>{study.name}</h3></div>
					<div class="copy"><p class="gesture">{study.action}</p><p>{study.expect}</p></div>
				</a>
			{/each}</div>
		</section>
	{/each}
	<section class="retained" aria-labelledby="retained-heading"><h2 id="retained-heading">Keep these references nearby.</h2><p>The previous feedback revision remains available: <a href="/lab/interfaces/material-type">stationary velvet / polished glaze</a>, <a href="/lab/interfaces/living-cover">wet aperture / repaired reveal</a>, <a href="/lab/interfaces/colorway">stronger pigment</a>, <a href="/lab/interfaces/tactile">clicky foil</a>, and <a href="/lab/interfaces/contours">restrained contour echoes</a>.</p><p>Positively reviewed studies are retained: <a href="/lab/interfaces/filaments">lit filaments</a>, <a href="/lab/interfaces/heat-tint">Afterheat</a>, and <a href="/lab/interfaces/selection">liquid selection</a>. The rejected letterpress was not resurrected.</p></section>
	<footer><p>Actual display density—including 3×—for presentation. Independent model density where appropriate. Ordinary WebGPU validation, native controls and explicit fallbacks. Reduced models are labelled as such; no claim of calibrated physics, universal motion safety, or measured phone battery/thermal performance.</p><a href="/lab/interfaces">Back to all studies ↗</a></footer>
</main>

<style>
	:global(body) { margin: 0; color: #2d3934; background: #f0f0e8; }
	main { max-width: 1240px; margin: auto; padding: 0 36px 35px; font-family: Arial, sans-serif; }
	a { color: inherit; }
	header { display: flex; justify-content: space-between; gap: 20px; padding: 28px 0; border-bottom: 1px solid #c7cfc1; font-size: 12px; }
	header a { text-decoration: none; } header span { font-size: 10px; letter-spacing: .12em; }
	.eyebrow { margin-top: 48px; color: #53654e; font-size: 10px; letter-spacing: .14em; text-transform: uppercase; }
	h1 { margin: 20px 0; font: 400 clamp(52px, 8vw, 94px)/.95 Georgia, serif; letter-spacing: -.045em; }
	h1 em { color: #607d66; }
	.intro { color: #53654e; font-size: 13px; line-height: 1.8; margin-bottom: 30px; }
	aside { padding: 20px 23px; background: #e3e8db; border-left: 3px solid #829b77; font-size: 13px; line-height: 1.8; }
	aside strong { font-weight: 500; } aside p { margin: 8px 0 0; max-width: 940px; color: #4c6047; font-size: 12px; }
	nav { display: flex; flex-wrap: wrap; gap: 12px 25px; margin-top: 26px; font-size: 12px; color: #53654e; }
	section { margin-top: 50px; scroll-margin-top: 20px; }
	.section-heading { display: flex; justify-content: space-between; align-items: baseline; gap: 20px; margin-bottom: 20px; }
	h2 { font: 400 29px/1.1 Georgia, serif; letter-spacing: -.025em; margin: 0; } .section-heading p { font-size: 12px; color: #53654e; }
	.grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 20px; }
	.card { border: 1px solid #c4cdbd; text-decoration: none; display: flex; flex-direction: column; }
	.card-heading { min-height: 136px; padding: 23px; background: var(--swatch); }
	h3 { font: italic 33px/1.04 Georgia, serif; margin: 0; letter-spacing: -.025em; }
	.copy { padding: 20px 23px; flex: 1; }
	.copy p { font-size: 12px; line-height: 1.8; margin: 10px 0 0; color: #53654e; } .copy .gesture { font-size: 12px; color: #455b48; margin-top: 0; }
	.card:hover { border-color: #657f63; }
	.retained { border-block: 1px solid #c7cfc1; padding: 28px 0; } .retained p { font-size: 12px; color: #53654e; line-height: 1.9; }
	footer { margin-top: 30px; display: flex; justify-content: space-between; align-items: start; gap: 30px; color: #53654e; font-size: 12px; line-height: 1.8; }
	footer p { max-width: 890px; margin: 0; } footer > a { white-space: nowrap; }
	a:focus-visible { outline: 2px solid #5e7955; outline-offset: 5px; }
	@media(max-width: 960px) { .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .section-heading { display: block; } }
	@media(max-width: 600px) { main { padding-inline: 19px; } header span { display: none; } .grid { grid-template-columns: 1fr; } footer { display: block; } footer > a { display: inline-block; margin-top: 20px; } h2 { font-size: 26px; } }
</style>
