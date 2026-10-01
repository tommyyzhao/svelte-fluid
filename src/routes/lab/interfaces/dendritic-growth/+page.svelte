<script lang="ts">import DendriticGrowth from '../../../../experiments/liquid/DendriticGrowth.svelte';</script>
<svelte:head><title>Branches from heat — a melt-growth study</title><meta name="robots" content="noindex" /></svelte:head>
<main>
	<header><a href="/lab/interfaces">fluid <span>/ material studies</span></a><span>SHAPE, FROM AN EXCHANGE</span></header>
	<section aria-labelledby="title"><div class="intro"><div><p class="eyebrow">Let the heat find its way.</p><h1 id="title">A little<br /><em>branching.</em></h1></div><p>No branch texture.<br />Just a front that grows.</p></div><DendriticGrowth /></section>
	<div class="notes"><p>The edges get ahead.<br /><em>The gaps stay behind.</em></p><details><summary>What is actually growing?</summary>
		<p>A planted solid nucleus grows into an initially supercooled liquid. Freezing releases latent heat. There is no local cold bath removing that heat everywhere: it must diffuse away. Sixfold surface-energy anisotropy and this thermal competition produce the branches.</p>
		<p>This is illustrative two-dimensional melt growth, not vapor-grown snow, calibrated ice, or a full fluid solver. Restart and Show grown specimen deliberately reset the whole cold sample; the latter computes one finite6.5-second result without animated motion. Clear followed by Advance cannot create a nucleus from nothing. Removing anisotropy is a numerical comparison, not another style overlay.</p>
		<p>The 192×192 phase/heat model has an approximately four-cell diffuse interface. Its actual phase=.5 contour is reconstructed at native display resolution, including Retina. Rendering does not invent smaller branches. The growth interval ends before the main front reaches the square boundary; further requested snapshots may explore that boundary.</p>
		<p>The surface energy has positive stiffness. A positive nine-point approximation of its expanded Hessian operator and a bounded explicit timestep preserve phase bounds without clamping. This stencil is not an exact discrete energy gradient, and we do not claim unconditional free-energy stability. Conservative heat diffusion and the actual phase increment maintain a separate sealed enthalpy ledger.</p>
		<p>Based on <a href="https://doi.org/10.1016/0167-2789(93)90120-P">Kobayashi’s melt-growth law</a> and the <a href="https://pages.nist.gov/fipy/en/stable/generated/examples.phase.anisotropy.html">NIST anisotropic phase-field example</a>. The small-grid and explicit-stencil choices are this experiment’s approximations.</p>
	</details></div>
	<footer><a href="/lab/interfaces">All material studies ↗</a><span>A physical mechanism. Not a painted snowflake.</span></footer>
</main>
<style>
	:global(body){margin:0;background:#1d251c;color:#dce0d1;}main{max-width:970px;padding:0 36px;margin:auto;font-family:'Helvetica Neue',Arial,sans-serif;}a{color:inherit;text-decoration:none;}
	header{display:flex;justify-content:space-between;align-items:center;gap:25px;padding:29px 0;border-bottom:1px solid #67745a50;font-size:20px;letter-spacing:-.5px;}header a span{font-size:11px;color:#95a184;letter-spacing:0;}header>span{font-size:7px;letter-spacing:.15em;color:#88977b;}
	.intro{display:flex;justify-content:space-between;align-items:flex-end;padding:33px 0 32px;gap:25px;}.eyebrow{font-size:9px;color:#9da78d;text-transform:uppercase;letter-spacing:.12em;margin:0 0 18px;}h1{font:400 clamp(66px,8vw,108px)/.84 Georgia,serif;letter-spacing:-.07em;margin:0;}h1 em{color:#acb797;}.intro>p{font-size:11px;line-height:1.85;color:#a3ae93;}
	.notes{display:grid;grid-template-columns:1fr 1.2fr;gap:45px;padding:30px 0 39px;}.notes>p{margin:0;font:25px/1.2 Georgia,serif;letter-spacing:-.6px;}.notes em{color:#a0ae8d;}details{font-size:10px;line-height:1.85;color:#aab69b;}summary{cursor:pointer;border-bottom:1px solid #67745a50;padding-bottom:9px;}details a{text-decoration:underline;color:#d1dabf;}
	footer{display:flex;justify-content:space-between;gap:20px;padding:23px 0 28px;border-top:1px solid #67745a50;font-size:9px;color:#aab698;}a:focus-visible,summary:focus-visible{outline:2px solid #e1e9b9;outline-offset:5px;}
	@media(max-width:600px){main{padding:0 19px;}header>span,.intro>p{display:none;}header a span{font-size:9px;}.intro{padding:27px 0;}.notes{grid-template-columns:1fr;gap:22px;}.notes>p{font-size:23px;}footer span{max-width:140px;text-align:right;}}
</style>
