<script lang="ts">
	import FrostPhase from '../../../../experiments/liquid/FrostPhase.svelte';
</script>

<svelte:head><title>Cold bloom — a phase change</title><meta name="robots" content="noindex" /></svelte:head>

<main>
	<header><a href="/lab/interfaces">fluid <span>/ material studies</span></a><span>FROM ONE STATE TO ANOTHER</span></header>
	<section aria-labelledby="title"><div class="intro"><div><p class="eyebrow">A little cold changes everything.</p><h1 id="title">Cold<br /><em>bloom.</em></h1></div><p>Ice makes a shape.<br />Warmth opens a window.</p></div><FrostPhase /></section>
	<div class="notes">
		<p>Not a painted frost.<br /><em>A moving boundary.</em></p>
		<details>
			<summary>Two fields. One honest change.</summary>
			<p>A solid/liquid phase field grows from an explicit nucleus. A temperature field spreads heat; freezing releases latent heat and melting consumes it. A positive sixfold kinetic mobility makes faceted growth. Moving your pointer supplies warmth, never directly erases the ice.</p>
			<p>Cold empty glass stays empty until you plant a crystal. Planting explicitly adds a little cold crystalline material, without resetting the rest of the glass. The Cold and Warm controls change the surrounding bath; the glass itself takes time to heat or cool.</p>
			<p>This fixed-substrate experiment produces faceted fronts, not intricate dendritic branches. It has no moving particles, Marangoni flow or branch-texture overlay. A bounded warm melting rate opens windows inside fully solid ice. These are illustrative kinetic choices, not an unmodified paper solver or calibrated equilibrium ice thermodynamics.</p>
			<p>The 192×192 model is independent of your display. Its actual phase contour is reconstructed at native pixels, including Retina. Explicit substeps bound the numerical update; we do not clamp unstable phase values back into range. Controls also provide finite still snapshots under reduced motion.</p>
			<a href="https://s2025.conference-schedule.org/presentation/?id=papers_577&sess=sess136">Recent research motivation · Liu et al., SIGGRAPH 2025 ↗</a>
		</details>
	</div>
	<footer><a href="/lab/interfaces">All material studies ↗</a><span>A phase front. Not a full ice simulator.</span></footer>
</main>

<style>
	:global(body){margin:0;background:#0b1b24;color:#c8d8d8;}main{max-width:970px;padding:0 36px;margin:auto;font-family:'Helvetica Neue',Arial,sans-serif;}a{color:inherit;text-decoration:none;}
	header{display:flex;justify-content:space-between;align-items:center;gap:25px;padding:29px 0;border-bottom:1px solid #94b1b329;font-size:20px;letter-spacing:-.5px;}header a span{font-size:11px;color:#6d929b;letter-spacing:0;}header>span{font-size:7px;letter-spacing:.15em;color:#5d8691;}
	.intro{display:flex;justify-content:space-between;align-items:flex-end;padding:33px 0 32px;gap:25px;}.eyebrow{font-size:9px;color:#6f949d;text-transform:uppercase;letter-spacing:.12em;margin:0 0 18px;}h1{font:400 clamp(68px,8vw,108px)/.84 Georgia,serif;letter-spacing:-.07em;margin:0;}h1 em{color:#729ca3;}.intro>p{font-size:11px;line-height:1.85;color:#71949c;}
	.notes{display:grid;grid-template-columns:1fr 1.2fr;gap:45px;padding:30px 0 39px;}.notes>p{margin:0;font:25px/1.2 Georgia,serif;letter-spacing:-.6px;}.notes em{color:#73979e;}details{font-size:10px;line-height:1.85;color:#799aa3;}summary{cursor:pointer;border-bottom:1px solid #94b1b329;padding-bottom:9px;}details a{color:#b2ccca;}
	footer{display:flex;justify-content:space-between;gap:20px;padding:23px 0 28px;border-top:1px solid #94b1b329;font-size:9px;color:#73929c;}a:focus-visible,summary:focus-visible{outline:2px solid #d4e49c;outline-offset:5px;}
	@media(max-width:600px){main{padding:0 19px;}header>span,.intro>p{display:none;}header a span{font-size:9px;}.intro{padding:27px 0;}.notes{grid-template-columns:1fr;gap:22px;}.notes>p{font-size:23px;}footer span{max-width:140px;text-align:right;}}
</style>
