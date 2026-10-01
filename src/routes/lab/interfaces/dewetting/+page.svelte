<script lang="ts">
	import Dewetting from '../../../../experiments/liquid/Dewetting.svelte';
</script>

<svelte:head><title>Dew point — a coating makes room</title><meta name="robots" content="noindex" /></svelte:head>
<main>
	<header><a href="/lab/interfaces">fluid <span>/ wetting studies</span></a><span>LESS FILM. MORE EDGE.</span></header>
	<section><div class="intro"><div><p class="eyebrow">A surface that gives something back</p><h1>Dew <em>point.</em></h1></div><p>Open a little room.<br />Watch where the coating goes.</p></div><Dewetting /></section>
	<div class="notes"><p>It does not vanish.<br /><em>It gathers.</em></p><details><summary>What this experiment actually simulates</summary><p>A single opening grows by descending an authored scalar energy: an effective line cost opposes an area reward, and a pinning term arrests the opening. The removed coating volume is integrated analytically and placed into a positive raised rim. Its irregular shape is fixed at nucleation, not driven by animated noise. Changing retraction drive records external work; unforced movement only dissipates energy.</p><p>This is a volume-accounted geometric proxy, not a thin-film PDE, calibrated material, contact-angle predictor, or model of hole merging. Each click recoats and starts one new hole. The residual thickness is an illustrative shape floor, not a claim that a thick precursor reproduces molecular wetting. <a href="https://arxiv.org/html/2609.01444v1" target="_blank" rel="noreferrer">Wu et al. (2026)</a> require corrected disjoining pressure and coupled numerical treatment; those mechanisms are not implemented here.</p><p>The comparison is a keyframed SVG radial wipe with no rim or conserved coating. WebGPU uses one native-pixel fragment pass and a 64-byte uniform, with no low-resolution film texture. The clock sleeps when the scalar state settles and holds the last state. Reduced motion presents still samples.</p></details></div>
	<footer><a href="/lab/interfaces">All material studies ↗</a><span>A reveal with somewhere for the material to go.</span></footer>
</main>
<style>
	:global(body) { margin: 0; background: #eeeee4; color: #2c493d; }
	main { max-width: 1220px; padding: 0 36px; margin: auto; font-family: 'Helvetica Neue', Arial, sans-serif; }
	a { color: inherit; text-decoration: none; } header { display: flex; justify-content: space-between; align-items: center; gap: 25px; min-height: 80px; border-bottom: 1px solid #344f4328; }
	header a { font-size: 22px; letter-spacing: -.04em; } header a span { font-size: 11px; font-weight: 400; letter-spacing: 0; color: #7b8775; } header > span, .eyebrow { font-size: 8px; letter-spacing: .14em; color: #7b8775; }
	.intro { display: flex; justify-content: space-between; align-items: end; gap: 24px; padding: 42px 0 30px; } .eyebrow { text-transform: uppercase; margin: 0 0 15px; }
	h1 { font: 400 clamp(64px, 9vw, 114px)/.95 Georgia, serif; letter-spacing: -.067em; margin: 0; } h1 em { color: #83a184; }
	.intro > p { font-size: 12px; line-height: 1.8; color: #7b8775; }
	.notes { display: grid; grid-template-columns: 1fr 1fr; gap: 60px; margin: 32px 0 40px; } .notes > p { margin: 0; font: 30px/1.2 Georgia, serif; letter-spacing: -.02em; } .notes em { color: #7d9c7c; }
	details { font-size: 11px; line-height: 1.8; color: #70816d; } summary { cursor: pointer; border-bottom: 1px solid #344f4328; padding-bottom: 12px; } details a { text-decoration: underline; }
	footer { display: flex; justify-content: space-between; gap: 25px; padding: 24px 0; border-top: 1px solid #344f4328; color: #7b8775; font-size: 9px; }
	a:focus-visible, summary:focus-visible { outline: 2px solid #568066; outline-offset: 4px; }
	@media (max-width: 600px) { main { padding: 0 18px; } header > span { display: none; } .intro { padding-top: 30px; } .intro > p { display: none; } h1 { font-size: 65px; } .notes { grid-template-columns: 1fr; gap: 24px; } footer span { max-width: 140px; text-align: right; } }
</style>
