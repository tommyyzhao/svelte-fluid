<script lang="ts">
	import PigmentSurface from '../../../../experiments/liquid/PigmentSurface.svelte';
</script>

<svelte:head><title>Printed in — bounded pigment typography</title><meta name="robots" content="noindex" /></svelte:head>
<main>
	<header><a href="/lab/interfaces">fluid / experiments</a><span>PIGMENT STUDY 01</span></header>
	<section aria-labelledby="title"><p class="eyebrow">A word with somewhere for the color to go.</p><h1 id="title">Printed <em>in.</em></h1><p class="intro">Color moves through the lettering, gathers at its edges,<br />and leaves an impression that belongs to the shape.</p>
		<PigmentSurface geometry="type" />
	</section>
	<aside><p>Not a cloud behind a word.<br /><em>The word is the vessel.</em></p><details><summary>What actually moves?</summary><p>A fixed 192 × 96 field transports three finite pigments through open neighbors. Mobile pigment slowly attaches to finite sites; a passing stroke can lift it back into motion. Away from your hand, attached pigment stays put. Both remain inside the letterforms.</p><p>This is illustrative conservative pigment transport and adhesion, not a solved capillary free surface or calibrated chemistry. Pointer motion supplies the drag; there is no unrelated ambient swirl. The sheen is optical illustration. Source coverage and presentation use the full native pixel density, including 3×; the physics grid does not change on resize.</p><p>Try one pulse, pull it along a letter, then reverse your stroke. The two inspection views separate mobile and attached color. Every pour is finite. Adding pigments darkens their optical mixture instead of adding light until it turns white.</p></details></aside>
	<footer><a href="/lab/interfaces/colorway">Try the colorway loop ↗</a><a href="/lab/interfaces">All experiments ↗</a></footer>
</main>

<style>
	:global(body) { margin: 0; background: #f4efe5; color: #172b46; }main { max-width: 1320px; margin: auto; padding: 0 38px; font-family: Arial, sans-serif; }a { color: inherit; text-decoration: none; }header, footer { display: flex; justify-content: space-between; gap: 20px; padding: 27px 0; font-size: 11px; }header { border-bottom: 1px solid #172b4626; }header span { font-size: 8px; letter-spacing: .14em; color: #7b8590; }.eyebrow { margin: 43px 0 12px; font-size: 9px; letter-spacing: .08em; color: #71808a; }h1 { font: 400 clamp(64px, 8vw, 115px)/.95 Georgia, serif; letter-spacing: -.065em; margin: 0; }h1 em { color: #365bcc; font-weight: 400; }.intro { font-size: 12px; line-height: 1.7; color: #78828c; margin: 23px 0 34px; }aside { display: grid; grid-template-columns: 1fr 1fr; gap: 60px; padding: 34px 0; }aside>p { font: 27px/1.3 Georgia, serif; margin: 0; letter-spacing: -.6px; }aside em { color: #80909c; }details { font-size: 11px; line-height: 1.8; color: #6f7c89; }summary { cursor: pointer; font-size: 10px; padding-bottom: 10px; border-bottom: 1px solid #172b4626; }footer { border-top: 1px solid #172b4626; color: #73808b; font-size: 9px; }a:focus-visible, summary:focus-visible { outline: 2px solid #365bcc; outline-offset: 4px; }@media(max-width: 650px) { main { padding: 0 17px; }.eyebrow { margin-top: 30px; }aside { grid-template-columns: 1fr; gap: 25px; }.intro { font-size: 11px; } }
</style>
