<script lang="ts">
	import { base } from '$app/paths';
	import SplashCursor from '../../../../../registry/splash-cursor/SplashCursor.svelte';

	const SCRIPT_OPEN = '<' + 'script lang="ts">';
	const SCRIPT_CLOSE = '</' + 'script>';
	const STYLE_OPEN = '<' + 'style>';
	const STYLE_CLOSE = '</' + 'style>';

	let demo = $state(false);

	const SNIPPET = `${SCRIPT_OPEN}
  import { Fluid } from 'svelte-fluid';
${SCRIPT_CLOSE}

<div class="splash-cursor" aria-hidden="true">
  <Fluid transparent pointerTarget="window" splatOnHover bloom={false} sunrays={false}
    densityDissipation={2} velocityDissipation={2} pressure={0.1} curl={3} splatRadius={0.25} />
</div>

${STYLE_OPEN}
  .splash-cursor { position: fixed; inset: 0; z-index: 9999; pointer-events: none; }
${STYLE_CLOSE}`;

	const USAGE = `${SCRIPT_OPEN}
  import SplashCursor from '$lib/components/splash-cursor/SplashCursor.svelte';
${SCRIPT_CLOSE}

<SplashCursor />`;
</script>

<svelte:head>
	<title>Splash cursor for Svelte — svelte-fluid</title>
	<meta
		name="description"
		content="A full-viewport, transparent, pointer-following fluid splash cursor for Svelte 5 and SvelteKit on WebGL. Copy-paste snippet or shadcn-svelte install."
	/>
</svelte:head>

{#if demo}<SplashCursor />{/if}

<h1>Splash cursor for Svelte</h1>
<p class="subtitle">A full-viewport fluid trail that follows the pointer over your page. The Svelte take on the React “splash cursor” effect, running on WebGL.</p>

<p>
	<button type="button" class="demo-toggle" aria-pressed={demo} onclick={() => (demo = !demo)}>
		{demo ? 'Turn demo off' : 'Turn demo on'}
	</button>
	Then move the pointer anywhere on this page. Respects <code>prefers-reduced-motion</code> (renders nothing).
</p>

<h2 id="install">Install with shadcn-svelte</h2>

<pre><code>npx shadcn-svelte@latest add https://svelte-fluid.dev/r/splash-cursor.json</code></pre>

<p>
	This adds one small wrapper component (<code>SplashCursor.svelte</code>) to your components folder
	and installs <code>svelte-fluid</code> from npm. Render it once, for example in the root
	<code>+layout.svelte</code>:
</p>

<pre><code>{USAGE}</code></pre>

<p>
	Any <code>&lt;Fluid&gt;</code> prop passes through, so you can retune it:
	<code>&lt;SplashCursor splatRadius=&#123;0.12&#125; densityDissipation=&#123;1&#125; /&gt;</code>.
</p>

<h2 id="snippet">Copy-paste snippet</h2>

<p>No registry needed. Requires <code>npm install svelte-fluid</code> and Svelte 5.</p>

<pre><code>{SNIPPET}</code></pre>

<h2 id="notes">Notes</h2>

<ul>
	<li>
		<strong>Pointer events.</strong> The wrapper is <code>pointer-events: none</code>, so clicks, hover, text
		selection and scrolling reach your page untouched. <code>pointerTarget="window"</code> makes the
		engine listen on <code>window</code> instead of the canvas, and <code>splatOnHover</code> splats on
		plain movement without a click.
	</li>
	<li>
		<strong>z-index.</strong> <code>9999</code> draws the splash over everything, including modals. Lower it
		(for example <code>z-index: 0</code> on a page with an opaque background layer) to draw it behind
		content.
	</li>
	<li>
		<strong>Transparency.</strong> <code>transparent</code> composites the dye with premultiplied alpha over
		your page, so no background colour is needed. Dye fades through <code>densityDissipation</code>; lower
		it for longer trails.
	</li>
	<li>
		<strong>Cost.</strong> One fixed canvas at the viewport size. <code>bloom</code> and <code>sunrays</code>
		are off to keep it cheap. It renders at native DPR; pass <code>maxPixelRatio=&#123;2&#125;</code> to cap it.
	</li>
</ul>

<h2 id="fallback">Fallback behavior</h2>

<ul>
	<li>
		No WebGL, or no half-float texture support: <code>&lt;Fluid&gt;</code> renders its inert fallback, which
		is transparent here, so the page is unchanged and nothing intercepts input. Use
		<code>isWebGLAvailable()</code> if you want to branch on support yourself.
	</li>
	<li>
		<code>prefers-reduced-motion: reduce</code>: the shadcn wrapper renders nothing. In the raw snippet,
		wrap the block in your own <code>matchMedia</code> check.
	</li>
	<li>
		The effect is decorative: the wrapper is <code>aria-hidden</code> and never takes focus.
	</li>
	<li>SSR-safe: the engine starts in <code>onMount</code>; the server renders only the empty wrapper.</li>
</ul>

<p>
	See <a href="{base}/docs/components">Components</a> for <code>FluidBackground</code> (fixed fluid behind
	content with exclusion zones) and <a href="{base}/docs/configuration">Configuration</a> for every tunable.
</p>

<style>
	.demo-toggle {
		font: inherit;
		font-size: 0.85rem;
		padding: 6px 14px;
		margin-right: 10px;
		color: #e8ecf4;
		background: rgba(99, 140, 255, 0.15);
		border: 1px solid rgba(99, 140, 255, 0.35);
		border-radius: 6px;
		cursor: pointer;
	}
	.demo-toggle:hover {
		background: rgba(99, 140, 255, 0.25);
	}
	.demo-toggle:focus-visible {
		outline: 2px solid #7ba4d9;
		outline-offset: 2px;
	}
</style>
