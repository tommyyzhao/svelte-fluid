<script lang="ts">
	import { base } from '$app/paths';
	import { FoilSwitch, LiquidButton, LiquidCaustics, LiquidDropZone, LiquidSegmented, InkPaper } from '$lib/index.js';

	let segmented = $state('week');
	let foilOn = $state(false);
	let dropped = $state('none yet');

	const SCRIPT_OPEN = '<' + 'script lang="ts">';
	const SCRIPT_CLOSE = '</' + 'script>';
	const INK_EXAMPLE = `${SCRIPT_OPEN}
  import { InkPaper } from 'svelte-fluid';
${SCRIPT_CLOSE}

<InkPaper paper="#f4ecdc" pigments={['#2549a8', '#e7b112']} brush={{ size: 28 }} style="height: 260px; padding: 1.5rem">
  <h3 data-ink-resist>Field notes</h3>
  <button data-ink-resist data-ink-wick="0">Keep dry</button>
</InkPaper>`;
	const BTN_EXAMPLE = `${SCRIPT_OPEN}
  import { LiquidButton } from 'svelte-fluid';
${SCRIPT_CLOSE}

<LiquidButton tone="auto" onclick={save}>Save changes</LiquidButton>`;
	const SEG_EXAMPLE = `${SCRIPT_OPEN}
  import { LiquidSegmented } from 'svelte-fluid';
  let range = $state('week');
${SCRIPT_CLOSE}

<LiquidSegmented
  name="range"
  legend="Time range"
  options={[
    { value: 'day', label: 'Day' },
    { value: 'week', label: 'Week' },
    { value: 'month', label: 'Month' }
  ]}
  bind:value={range}
/>`;
	const DROP_EXAMPLE = `${SCRIPT_OPEN}
  import { LiquidDropZone } from 'svelte-fluid';
${SCRIPT_CLOSE}

<LiquidDropZone
  accept="image/*"
  multiple
  label="Choose images or drop them here"
  onfiles={(files) => upload(files)}
  announce={(files) => files.length + ' images ready'}
/>`;
	const CAU_EXAMPLE = `${SCRIPT_OPEN}
  import { LiquidCaustics } from 'svelte-fluid';
${SCRIPT_CLOSE}

<LiquidCaustics tone="dark" intensity={0.75} style="padding: 1.5rem; background: #14181f; color: #e8ecf4">
  <h3>Tide tables</h3>
  <p>Move the pointer or tab into the block.</p>
</LiquidCaustics>`;
	const FOIL_EXAMPLE = `${SCRIPT_OPEN}
  import { FoilSwitch } from 'svelte-fluid';
  let notifications = $state(false);
${SCRIPT_CLOSE}

<FoilSwitch bind:checked={notifications} onchange={(on) => save(on)}>Notifications</FoilSwitch>`;
	const BACKGROUND_COMPOSITION_EXAMPLE = `${SCRIPT_OPEN}
  import { FluidBackground } from 'svelte-fluid';
${SCRIPT_CLOSE}

<FluidBackground class="fluid-screen" exclude=".site-nav, .panel" splatOnHover>
  <nav class="site-nav">...</nav>
  <main class="hero-copy">...</main>
  <section class="panel">...</section>
</FluidBackground>

<style>
  :global(.fluid-screen) {
    min-height: 100vh;
    isolation: isolate;
  }

  .site-nav,
  .panel {
    position: relative;
    z-index: 2;
    pointer-events: auto;
  }

  .hero-copy {
    position: relative;
    z-index: 1;
  }
</style>`;
</script>

<svelte:head>
	<title>Components — svelte-fluid</title>
	<meta name="description" content="All twelve svelte-fluid components — the six fluid components plus InkPaper, LiquidButton, LiquidSegmented, LiquidDropZone, LiquidCaustics and FoilSwitch." />
</svelte:head>

<h1>Components</h1>
<p class="subtitle">Twelve components. Six wrap the fluid engine; six are interface primitives on a shared WebGL2 context.</p>

<ul class="component-index">
	<li>Fluid: <a href="#fluid">Fluid</a>, <a href="#fluidbackground">FluidBackground</a>, <a href="#fluidreveal">FluidReveal</a>, <a href="#fluiddistortion">FluidDistortion</a>, <a href="#fluidstick">FluidStick</a>, <a href="#fluidtext">FluidText</a></li>
	<li>Interface primitives: <a href="#inkpaper">InkPaper</a>, <a href="#liquidbutton">LiquidButton</a>, <a href="#liquidsegmented">LiquidSegmented</a>, <a href="#liquiddropzone">LiquidDropZone</a>, <a href="#liquidcaustics">LiquidCaustics</a>, <a href="#foilswitch">FoilSwitch</a></li>
</ul>

<!-- ============================================================ -->
<h2 id="fluid">&lt;Fluid&gt;</h2>

<p>The core component. Renders a WebGL fluid simulation on a canvas that fills its parent container.</p>

<pre><code>{SCRIPT_OPEN}
  import {'{'} Fluid {'}'} from 'svelte-fluid';
  import type {'{'} FluidHandle {'}'} from 'svelte-fluid';

  let fluidRef = $state&lt;{'{'} handle: FluidHandle {'}'} | undefined&gt;();
{SCRIPT_CLOSE}

&lt;button onclick={'{'}() =&gt; fluidRef?.handle.randomSplats(8){'}'}&gt;Splat&lt;/button&gt;

&lt;div style="height: 400px"&gt;
  &lt;Fluid bind:this={'{'}fluidRef{'}'} curl={'{'}30{'}'} bloom shading colorful /&gt;
&lt;/div&gt;</code></pre>

<p>Accepts all <a href="{base}/docs/configuration">FluidConfig</a> props plus:</p>

<table>
	<thead><tr><th>Prop</th><th>Type</th><th>Default</th><th>Description</th></tr></thead>
	<tbody>
		<tr><td><code>width</code></td><td><code>number</code></td><td>—</td><td>Fixed width in CSS px. Omit to fill parent.</td></tr>
		<tr><td><code>height</code></td><td><code>number</code></td><td>—</td><td>Fixed height in CSS px. Omit to fill parent.</td></tr>
		<tr><td><code>maxPixelRatio</code></td><td><code>number | null</code></td><td><code>null</code></td><td>Cap physical pixels per CSS pixel. The default, <code>null</code>, uses native device DPR; pass e.g. <code>2</code> to cap on DPR 3+ displays. CSS quality tiers are unchanged.</td></tr>
		<tr><td><code>class</code></td><td><code>string</code></td><td>—</td><td>Class on wrapper div.</td></tr>
		<tr><td><code>style</code></td><td><code>string</code></td><td>—</td><td>Inline style on wrapper div.</td></tr>
		<tr><td><code>lazy</code></td><td><code>boolean</code></td><td><code>false</code></td><td>Defer engine until the element enters the viewport. Frees the WebGL context slot. Recommended when you have 6+ instances on one page.</td></tr>
		<tr><td><code>autoPause</code></td><td><code>boolean</code></td><td><code>true</code></td><td>Pause the RAF loop when not visible or tab is hidden.</td></tr>
		<tr><td><code>fallback</code></td><td><code>Snippet&lt;[{'{'} reason {'}'}]&gt;</code></td><td>—</td><td>Custom UI rendered when WebGL is permanently unavailable. Receives the typed failure <code>reason</code>. Takes precedence over <code>poster</code>.</td></tr>
		<tr><td><code>poster</code></td><td><code>string</code></td><td>—</td><td>Static image (object-fit: cover) shown when WebGL is unavailable and no <code>fallback</code> is given. A graceful still of the animation.</td></tr>
		<tr><td><code>posterAlt</code></td><td><code>string</code></td><td><code>''</code></td><td>Alt text for the <code>poster</code> image. Defaults to empty (decorative) — set it when the poster conveys meaning.</td></tr>
		<tr><td><code>fallbackText</code></td><td><code>string</code></td><td><em>see below</em></td><td>Visually-hidden message for the default fallback, discoverable by assistive tech (rendered alongside a <code>poster</code> too). Set <code>''</code> to suppress for purely decorative instances.</td></tr>
					<tr><td><code>onReady</code></td><td><code>() =&gt; void</code></td><td>—</td><td>Called after the engine is constructed and its first frame is scheduled; fires again when a <code>lazy</code> instance rebuilds. Throwing callbacks are caught and logged.</td></tr>
					<tr><td><code>onError</code></td><td><code>(error: Error) =&gt; void</code></td><td>—</td><td>Called when engine construction fails — a <code>WebGLUnavailableError</code> (check <code>.reason</code>) or another init error. Throwing callbacks are caught and logged.</td></tr>
	</tbody>
</table>

<div class="callout">
	<strong>WebGL fallback (ADR-0041):</strong> when WebGL is <em>permanently</em> unavailable — no WebGL, or no half-float texture support — <code>&lt;Fluid&gt;</code> keeps the page intact. It renders, in order of preference, your <code>fallback</code> snippet, then a <code>poster</code> image, else it fills the box with <code>backColor</code> and exposes a visually-hidden <code>fallbackText</code> message (default: <em>"This animation requires WebGL, which isn't available in your browser."</em>). Short-lived failures, such as hitting the browser's live-context cap on a dense <code>lazy</code> page, stay blank and retry on the next scroll. The fill matches the mode: <code>transparent</code> stays see-through, and <code>reveal</code> uses the cover color and masks on <em>any</em> failure so hidden content is never exposed. For <code>distortion</code>, pass <code>poster=&#123;yourImageUrl&#125;</code> so the still image stands in for the warp. Set <a href="{base}/docs/configuration"><code>requireHardwareAcceleration</code></a> to also treat a software-only renderer as unavailable. The helper <code>isWebGLAvailable()</code> is exported if you want to gate rendering yourself. A frame that throws at runtime (ADR-0085) is also terminal: the engine is evicted, <code>onError</code> is called once, and the same fallback appears with reason <code>'render-failed'</code>. It is never retried.
</div>

<div class="callout">
	<strong>Reduced motion (ADR-0085):</strong> under <code>prefers-reduced-motion: reduce</code> every component settles the opening scene for a fixed 60 steps at 1/60 s, renders one finished frame, and stays still with no animation loop and no pointer response. <code>FluidReveal</code> drops its cover so content shows in full; auto-animation (<code>autoReveal</code>, <code>autoDistort</code>, <code>autoAnimate</code>) is skipped. The preference is followed live in both directions.
</div>

<p>Exposes a <a href="{base}/docs/api"><code>FluidHandle</code></a> via <code>bind:this</code> for programmatic control (splats, pause, resume, performance state).</p>

<!-- ============================================================ -->
<h2 id="fluidbackground">&lt;FluidBackground&gt;</h2>

<p>Full-viewport fluid behind page content. Use this as a page or screen wrapper; the canvas stays fixed to the viewport and your content is stacked above it.</p>

<pre><code>{SCRIPT_OPEN}
  import {'{'} FluidBackground {'}'} from 'svelte-fluid';
{SCRIPT_CLOSE}

&lt;FluidBackground exclude=".card, .sidebar" splatOnHover colorful shading bloom&gt;
  &lt;!-- your page content --&gt;
&lt;/FluidBackground&gt;</code></pre>

<p>DOM elements matching the <code>exclude</code> selector become physical "holes" — the fluid pools around them. The component observes scroll, resize, and DOM mutations to keep exclusion zones accurate.</p>

<div class="callout">
	<strong>Composition:</strong> Slot content defaults to <code>pointer-events: none</code> so window-level pointer input keeps feeding the fluid. Add <code>pointer-events: auto</code> back to interactive descendants, and keep nav/cards inside the slot when they should also be included in <code>exclude</code>.
</div>

<pre><code>{BACKGROUND_COMPOSITION_EXAMPLE}</code></pre>

<table>
	<thead><tr><th>Prop</th><th>Type</th><th>Default</th><th>Description</th></tr></thead>
	<tbody>
		<tr><td><code>exclude</code></td><td><code>string</code></td><td>—</td><td>CSS selector for elements to exclude. Example: <code>".card, .nav"</code></td></tr>
		<tr><td><code>excludeRadius</code></td><td><code>number</code></td><td><code>16</code></td><td>Border radius of exclusion zones in CSS px.</td></tr>
		<tr><td><code>excludePad</code></td><td><code>number</code></td><td><code>4</code></td><td>Padding around exclusion zones in CSS px.</td></tr>
		<tr><td><code>class</code></td><td><code>string</code></td><td>—</td><td>Class on wrapper div.</td></tr>
		<tr><td><code>style</code></td><td><code>string</code></td><td>—</td><td>Inline style on wrapper div.</td></tr>
		<tr><td><code>minContrast</code></td><td><code>number</code></td><td><code>0</code> (off)</td><td>WCAG ratio the fluid must keep against <code>contrastColor</code>. Use <code>4.5</code> for body text.</td></tr>
		<tr><td><code>contrastColor</code></td><td><code>RGB</code></td><td>content's computed text colour</td><td>Text colour (0–255) to guarantee contrast against. Set it when text colours vary or change at runtime.</td></tr>
	</tbody>
</table>

<div class="callout">
	<strong>Contrast:</strong> Off by default so the 0.8.0 look is unchanged. With <code>minContrast={'{'}4.5{'}'}</code> every fluid pixel is lightened or darkened (hue kept) until it meets AA against the text colour; pixels that already pass are untouched. Glass presets are excluded because reflections composite after this pass. The text colour is read once on mount; pass <code>contrastColor</code> for theme switches or per-section colours (ADR-0086).
</div>

<p>Defaults to <code>pointerTarget='window'</code> and <code>splatOnHover=true</code>. All <a href="{base}/docs/configuration">FluidConfig</a> props are accepted.</p>

<!-- ============================================================ -->
<h2 id="fluidreveal">&lt;FluidReveal&gt;</h2>

<p>The fluid acts as a reveal mask — cursor movement uncovers content behind a solid cover. Great for scratch-to-reveal effects and interactive hero sections.</p>

<pre><code>{SCRIPT_OPEN}
  import {'{'} FluidReveal {'}'} from 'svelte-fluid';
{SCRIPT_CLOSE}

&lt;FluidReveal
  sensitivity={'{'}0.24{'}'}
  coverColor={'{'}{'{'} r: 0.15, g: 0.15, b: 0.18 {'}'}{'}'}
  fringeColor={'{'}{'{'} r: 0.6, g: 0.7, b: 0.85 {'}'}{'}'}
  accentColor={'{'}{'{'} r: 0.2, g: 0.35, b: 0.7 {'}'}{'}'}
&gt;
  &lt;div&gt;Your hidden content here&lt;/div&gt;
&lt;/FluidReveal&gt;</code></pre>

<table>
	<thead><tr><th>Prop</th><th>Type</th><th>Default</th><th>Description</th></tr></thead>
	<tbody>
		<tr><td><code>sensitivity</code></td><td><code>number</code></td><td><code>0.1</code></td><td>How easily areas reveal. Higher = less dye needed.</td></tr>
		<tr><td><code>curve</code></td><td><code>number</code></td><td><code>0.5</code></td><td>Power exponent for reveal alpha. Higher = crisper edge.</td></tr>
		<tr><td><code>coverColor</code></td><td><code>RGB</code></td><td><code>{'{'} r: 1, g: 1, b: 1 {'}'}</code></td><td>Solid color of the cover layer (0–1 linear).</td></tr>
		<tr><td><code>accentColor</code></td><td><code>RGB</code></td><td><code>{'{'} r: 0.2, g: 0.35, b: 0.7 {'}'}</code></td><td>Fringe accent color at reveal edges (0–1 linear).</td></tr>
		<tr><td><code>fringeColor</code></td><td><code>RGB</code></td><td><code>{'{'} r: 0.6, g: 0.7, b: 0.85 {'}'}</code></td><td>Outer fringe color between cover and accent (0–1 linear).</td></tr>
		<tr><td><code>fadeBack</code></td><td><code>boolean</code></td><td><code>true</code></td><td>Whether revealed areas gradually fade back to covered.</td></tr>
		<tr><td><code>fadeSpeed</code></td><td><code>number</code></td><td>—</td><td>Explicit dissipation value. 1.0 = permanent, 0.99 = slow fade. Overrides <code>fadeBack</code>.</td></tr>
		<tr><td><code>autoReveal</code></td><td><code>boolean</code></td><td><code>false</code></td><td>Auto-animate a smooth looping path to reveal content before user interaction.</td></tr>
		<tr><td><code>autoRevealSpeed</code></td><td><code>number</code></td><td><code>1.0</code></td><td>Speed of the auto-reveal animation.</td></tr>
	</tbody>
</table>

<p>Also accepts <code>width</code>, <code>height</code>, <code>class</code>, <code>style</code>, <code>lazy</code>, <code>autoPause</code>, <code>fallback</code>, <code>poster</code>, <code>posterAlt</code>, <code>fallbackText</code>, <code>onReady</code>, <code>onError</code>, and all <a href="{base}/docs/configuration">FluidConfig</a> props.</p>

<div class="callout">
	<strong>Note:</strong> The canvas sits on top of children for alpha compositing. Interactive elements (links, buttons) inside the slot will not receive pointer events.
</div>

<div class="callout">
	<strong>Contrast:</strong> Revealed content is your own DOM, so its contrast is the text colour you choose against the page behind it. Fully revealed pixels (cover alpha under 0.1) keep at least 80% of that contrast (measured, 5th percentile). The cover and its fringe are a deliberate partial state and are <em>not</em> AA-guaranteed: do not put essential text only reachable through a half-revealed cover. Reduced-motion users get the content with no cover. Pick <code>coverColor</code> and text colour as a pair with at least 4.5:1 (ADR-0086).
</div>

<!-- ============================================================ -->
<h2 id="fluiddistortion">&lt;FluidDistortion&gt;</h2>

<p>The fluid velocity field warps an underlying image like liquid glass. Move your cursor to create ripples.</p>

<pre><code>{SCRIPT_OPEN}
  import {'{'} FluidDistortion {'}'} from 'svelte-fluid';
{SCRIPT_CLOSE}

&lt;FluidDistortion src="/hero.jpg" strength={'{'}0.4{'}'} intensity={'{'}24{'}'} /&gt;</code></pre>

<table>
	<thead><tr><th>Prop</th><th>Type</th><th>Default</th><th>Description</th></tr></thead>
	<tbody>
		<tr><td><code>src</code></td><td><code>string</code></td><td>—</td><td>URL of the image to distort. <strong>Required.</strong></td></tr>
		<tr><td><code>strength</code></td><td><code>number</code></td><td><code>0.4</code></td><td>How strongly velocity warps the image. 0–1.</td></tr>
		<tr><td><code>intensity</code></td><td><code>number</code></td><td><code>24</code></td><td>How much dye each interaction injects.</td></tr>
		<tr><td><code>fit</code></td><td><code>'cover' | 'contain'</code></td><td><code>'cover'</code></td><td>How the image fits the canvas.</td></tr>
		<tr><td><code>scale</code></td><td><code>number</code></td><td><code>1.0</code></td><td>Image scale. &gt;1 zooms out, &lt;1 zooms in.</td></tr>
		<tr><td><code>autoDistort</code></td><td><code>boolean</code></td><td><code>false</code></td><td>Auto-animate distortion along a smooth looping path before user interaction.</td></tr>
		<tr><td><code>autoDistortSpeed</code></td><td><code>number</code></td><td><code>1.0</code></td><td>Speed of auto-distort animation.</td></tr>
		<tr><td><code>initialSplats</code></td><td><code>number</code></td><td><code>20</code></td><td>Random splats at startup. Creates a chaotic distortion that settles. 0 to start clean.</td></tr>
		<tr><td><code>bleed</code></td><td><code>number</code></td><td><code>60</code></td><td>Extra canvas pixels beyond visible edges. Prevents velocity bounce at boundaries.</td></tr>
	</tbody>
</table>

<p>Also accepts <code>width</code>, <code>height</code>, <code>class</code>, <code>style</code>, <code>lazy</code>, <code>autoPause</code>, <code>fallback</code>, <code>poster</code>, <code>posterAlt</code>, <code>fallbackText</code>, <code>onReady</code>, <code>onError</code>, and all <a href="{base}/docs/configuration">FluidConfig</a> props.</p>

<!-- ============================================================ -->
<h2 id="fluidstick">&lt;FluidStick&gt;</h2>

<p>Dye clings to text or SVG paths. The mask makes dye last longer on the shape, while a small pressure push moves fluid around it.</p>

<pre><code>{SCRIPT_OPEN}
  import {'{'} FluidStick {'}'} from 'svelte-fluid';
{SCRIPT_CLOSE}

&lt;!-- Text mode --&gt;
&lt;FluidStick text="FLUID" font="900 120px sans-serif" /&gt;

&lt;!-- SVG path mode --&gt;
&lt;FluidStick d="M55 5 L25 45 L45 45 L20 95 L75 50 L55 50 L80 5 Z" /&gt;</code></pre>

<table>
	<thead><tr><th>Prop</th><th>Type</th><th>Default</th><th>Description</th></tr></thead>
	<tbody>
		<tr><td><code>text</code></td><td><code>string</code></td><td>—</td><td>Text to render as the sticky mask.</td></tr>
		<tr><td><code>font</code></td><td><code>string</code></td><td><code>'bold 72px sans-serif'</code></td><td>CSS font string for text mode.</td></tr>
		<tr><td><code>d</code></td><td><code>string</code></td><td>—</td><td>SVG path data. Takes precedence over <code>text</code> if both are set.</td></tr>
		<tr><td><code>maskViewBox</code></td><td><code>[n, n, n, n]</code></td><td><code>[0,0,100,100]</code></td><td>viewBox for path mode.</td></tr>
		<tr><td><code>maskFillRule</code></td><td><code>'nonzero' | 'evenodd'</code></td><td><code>'nonzero'</code></td><td>Fill rule for path mode.</td></tr>
		<tr><td><code>maskResolution</code></td><td><code>number</code></td><td><code>512</code></td><td>Mask rasterization resolution.</td></tr>
		<tr><td><code>maskBlur</code></td><td><code>number</code></td><td><code>4</code></td><td>Blur radius in mask pixels. Softens edges.</td></tr>
		<tr><td><code>maskPadding</code></td><td><code>number</code></td><td><code>0.9</code></td><td>How much of the texture the text fills (text mode only).</td></tr>
		<tr><td><code>strength</code></td><td><code>number</code></td><td><code>0.95</code></td><td>How strongly dissipation is reduced on the mask. 1 = dye never fades.</td></tr>
		<tr><td><code>stickyPressureAmount</code></td><td><code>number</code></td><td><code>0.15</code></td><td>Artificial pressure on the mask to push fluid around it.</td></tr>
		<tr><td><code>amplify</code></td><td><code>number</code></td><td><code>2.0</code></td><td>Splat intensity multiplier on the mask.</td></tr>
		<tr><td><code>autoAnimate</code></td><td><code>boolean</code></td><td><code>true</code></td><td>Auto-animate a smooth looping path to deposit dye before user interaction.</td></tr>
		<tr><td><code>autoAnimateSpeed</code></td><td><code>number</code></td><td><code>2.0</code></td><td>Speed of auto-animation.</td></tr>
		<tr><td><code>autoAnimateDuration</code></td><td><code>number</code></td><td><code>5.0</code></td><td>Seconds before auto-animation stops. 0 = indefinite.</td></tr>
	</tbody>
</table>

<p>Also accepts <code>width</code>, <code>height</code>, <code>class</code>, <code>style</code>, <code>lazy</code>, <code>autoPause</code>, <code>fallback</code>, <code>poster</code>, <code>posterAlt</code>, <code>fallbackText</code>, <code>onReady</code>, <code>onError</code>, and all <a href="{base}/docs/configuration">FluidConfig</a> props.</p>

<!-- ============================================================ -->
<h2 id="fluidtext">&lt;FluidText&gt;</h2>

<p>Fluid confined inside text. Wraps <code>&lt;Fluid&gt;</code> with an <code>svgPath</code> container shape in text mode. Automatically measures the text so the font keeps a consistent visual height regardless of length.</p>

<pre><code>{SCRIPT_OPEN}
  import {'{'} FluidText {'}'} from 'svelte-fluid';
{SCRIPT_CLOSE}

&lt;FluidText
  text="SVELTE"
  height={'{'}100{'}'}
  seed={'{'}42{'}'}
  splatOnHover
  shading
  colorful
/&gt;</code></pre>

<table>
	<thead><tr><th>Prop</th><th>Type</th><th>Default</th><th>Description</th></tr></thead>
	<tbody>
		<tr><td><code>text</code></td><td><code>string</code></td><td>—</td><td>The text to render as fluid-filled letterforms. <strong>Required.</strong></td></tr>
		<tr><td><code>font</code></td><td><code>string</code></td><td><code>'bold 100px "Helvetica Neue", Arial, sans-serif'</code></td><td>CSS font string for mask rasterization.</td></tr>
		<tr><td><code>maskResolution</code></td><td><code>number</code></td><td><code>512</code></td><td>Mask rasterization resolution.</td></tr>
		<tr><td><code>height</code></td><td><code>number</code></td><td>—</td><td>Fixed height in CSS px.</td></tr>
		<tr><td><code>minContrast</code></td><td><code>number</code></td><td><code>3</code></td><td>WCAG ratio the glyph outline keeps against the page. <code>3</code> = AA large text; use <code>4.5</code> for small text, <code>1</code> to disable (0.8.0 look).</td></tr>
		<tr><td><code>contrastColor</code></td><td><code>RGB</code></td><td>nearest opaque ancestor background</td><td>Page colour (0–255) to guarantee contrast against. Measured once on mount; set it for gradients, images or theme switches.</td></tr>
	</tbody>
</table>

<div class="callout">
	<strong>Contrast:</strong> The canvas is transparent, so dim dye was indistinguishable from the page (measured 1.0:1 on every preset). A thin ~1.5 CSS px outline supplies at least 3:1 contrast against the page (WCAG halo technique); interior dye stays bit-identical. The existing jump-flood SDF keeps the band anti-aliased at native DPR. WebGL1 builds the same outline from the coverage mask. Page colour is measured on mount (any CSS colour syntax, alpha composited); consumer responsibility: page backgrounds that are images or gradients need an explicit <code>contrastColor</code> (ADR-0086).
</div>

<p>Also accepts <code>class</code>, <code>style</code>, <code>lazy</code>, <code>autoPause</code>, <code>fallback</code>, <code>poster</code>, <code>posterAlt</code>, <code>fallbackText</code>, <code>onReady</code>, <code>onError</code>, and all <a href="{base}/docs/configuration">FluidConfig</a> props. Defaults to <code>transparent=true</code>.</p>

<h2 id="interface-primitives">Interface primitives</h2>

<p>Six components for interactive UI rather than backgrounds. Each is a real native element (button, radio group, file input, switch or <code>div</code>) with a decorative WebGL2 surface behind or over it. They share one WebGL2 context per page (ADR-0088/0093), so a dense page does not hit the browser's context cap. Without WebGL2 each renders a plain, fully styled native control that behaves identically. They are not <code>&lt;Fluid&gt;</code> wrappers and take no <code>FluidConfig</code> props.</p>

<!-- ============================================================ -->
<h2 id="inkpaper">&lt;InkPaper&gt;</h2>

<p>A paper-textured panel that takes watercolour from pointer, touch and pen strokes, for editorial and note-taking surfaces.</p>

<div class="example">
	<InkPaper paper="#f4ecdc" pigments={['#2549a8', '#e7b112']} brush={{ size: 28 }} style="height: 240px; padding: 1.5rem; border-radius: 12px; color: #1d1a14">
		<h3 data-ink-resist style="margin: 0 0 0.5rem; color: inherit; width: fit-content">Field notes</h3>
		<p data-ink-resist style="margin: 0 0 1rem; max-width: 28rem; width: fit-content; color: inherit">Drag across the paper to lay colour. Pigment mixes subtractively and dries into the grain.</p>
		<button data-ink-resist data-ink-wick="0" style="padding: 0.5rem 1rem; border: 1px solid #1d1a14; border-radius: 8px; background: #fffaf0; color: #1d1a14; font: inherit; cursor: pointer">Keep this dry</button>
	</InkPaper>
</div>

<pre><code>{INK_EXAMPLE}</code></pre>

<table>
	<thead><tr><th>Prop</th><th>Type</th><th>Default</th><th>Description</th></tr></thead>
	<tbody>
		<tr><td><code>paper</code></td><td><code>string</code></td><td><code>#f4ecdc</code></td><td>Paper colour, any CSS colour (normalised to opaque sRGB). Also the fallback background.</td></tr>
		<tr><td><code>pigments</code></td><td><code>string[]</code></td><td>4 built-in colours</td><td>Up to four <code>#rgb</code>/<code>#rrggbb</code> pigments, mixed subtractively. Invalid entries are dropped.</td></tr>
		<tr><td><code>brush</code></td><td><code>InkBrush</code></td><td><code>&#123; size: 23, water: 1, pigment: null &#125;</code></td><td><code>size</code> in CSS px (2–120), <code>water</code> relative load (0.1–3), <code>pigment</code> index or <code>null</code> to rotate after each pause. Omitted fields keep their value.</td></tr>
		<tr><td><code>seed</code></td><td><code>number</code></td><td><code>1</code></td><td>Seeds the paper grain and opening wash.</td></tr>
		<tr><td><code>children</code></td><td><code>Snippet</code></td><td>—</td><td>Content above the paper. Descendants with <code>data-ink-resist</code> stay dry; focusing or hovering a <code>data-ink-wick</code> descendant blooms pigment (an integer value picks the pigment).</td></tr>
		<tr><td><code>...rest</code></td><td><code>HTMLAttributes&lt;HTMLDivElement&gt;</code></td><td>—</td><td>All other <code>div</code> attributes are forwarded.</td></tr>
	</tbody>
</table>

<div class="callout">
	<strong>Input:</strong> mouse, touch and pen strokes paint (pen pressure scales the brush). Vertical touch drags still scroll the page. Keyboard: the paper takes no input; focusing a <code>data-ink-wick</code> control blooms pigment around it, and your children keep their own native keyboard behaviour.<br>
	<strong>Reduced motion:</strong> no painting and no animation; the paper settles to one finished still.<br>
	<strong>Contrast:</strong> children are your own DOM drawn above the paper, so text contrast is the colour you choose against <code>paper</code>. Pigment never covers a <code>data-ink-resist</code> box. Keep body text at 4.5:1 against the paper and the darkest pigment mix.<br>
	<strong>No WebGL2:</strong> the <code>div</code> is a flat <code>paper</code> colour and every child works. Shares one WebGL2 context per page with the other interface primitives (ADR-0088/0093), so many on one page do not hit the context cap.
</div>

<!-- ============================================================ -->
<h2 id="liquidbutton">&lt;LiquidButton&gt;</h2>

<p>A button for primary actions, with a lit liquid surface that ripples when pressed.</p>

<div class="example">
	<LiquidButton>Save changes</LiquidButton>
</div>

<pre><code>{BTN_EXAMPLE}</code></pre>

<table>
	<thead><tr><th>Prop</th><th>Type</th><th>Default</th><th>Description</th></tr></thead>
	<tbody>
		<tr><td><code>tone</code></td><td><code>'light' | 'dark' | 'auto'</code></td><td><code>'auto'</code></td><td>Palette. <code>'auto'</code> measures the page colour behind the control once per change.</td></tr>
		<tr><td><code>type</code></td><td><code>'button' | 'submit' | 'reset'</code></td><td><code>'button'</code></td><td>Native button type.</td></tr>
		<tr><td><code>children</code></td><td><code>Snippet</code></td><td>—</td><td>Label, drawn by the DOM above the liquid.</td></tr>
		<tr><td><code>...rest</code></td><td><code>HTMLButtonAttributes</code></td><td>—</td><td>Every native attribute and handler (<code>onclick</code>, <code>disabled</code>, <code>aria-*</code>) is forwarded to the <code>&lt;button&gt;</code>.</td></tr>
		<tr><td><code>class</code></td><td><code>string</code></td><td>—</td><td>Class on the root element.</td></tr>
	</tbody>
</table>

<div class="callout">
	<strong>Input:</strong> a real <code>&lt;button&gt;</code>. Click, tap, pen, Enter and Space all activate it and send one ripple (pen pressure scales it). The focus ring appears on <code>:focus-visible</code> and follows the shape. Minimum height 2.75rem.<br>
	<strong>Reduced motion:</strong> presses add no ripple; the surface is drawn once as a still.<br>
	<strong>Contrast:</strong> the label rides above the liquid; light added under it is clamped so the label keeps at least 4.5:1 in both tones (ADR-0092).<br>
	<strong>No WebGL2 / forced colours:</strong> a gradient-filled native button with a native outline; under <code>forced-colors</code> it uses system colours. Shares one WebGL2 context per page with the other interface primitives (ADR-0088/0093), so many on one page do not hit the context cap.
</div>

<!-- ============================================================ -->
<h2 id="liquidsegmented">&lt;LiquidSegmented&gt;</h2>

<p>A single-choice selector (time range, view mode) where the selected option sits on a liquid lens that sloshes across on change.</p>

<div class="example">
	<LiquidSegmented name="docs-range" legend="Time range" options={[{ value: 'day', label: 'Day' }, { value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }]} bind:value={segmented} />
	<p class="example-out">Selected: <code>{segmented}</code></p>
</div>

<pre><code>{SEG_EXAMPLE}</code></pre>

<table>
	<thead><tr><th>Prop</th><th>Type</th><th>Default</th><th>Description</th></tr></thead>
	<tbody>
		<tr><td><code>options</code></td><td><code>&#123; value: string; label: string &#125;[]</code></td><td>—</td><td><strong>Required.</strong> The choices.</td></tr>
		<tr><td><code>value</code></td><td><code>string</code></td><td>—</td><td>Selected value; <code>bind:value</code>.</td></tr>
		<tr><td><code>name</code></td><td><code>string</code></td><td>—</td><td><strong>Required.</strong> Radio group name; unique on the page.</td></tr>
		<tr><td><code>legend</code></td><td><code>string</code></td><td>—</td><td><strong>Required.</strong> Visible group label (<code>&lt;legend&gt;</code>).</td></tr>
		<tr><td><code>tone</code></td><td><code>'light' | 'dark' | 'auto'</code></td><td><code>'auto'</code></td><td>Palette. <code>'auto'</code> measures the page colour behind the control once per change.</td></tr>
		<tr><td><code>disabled</code></td><td><code>boolean</code></td><td><code>false</code></td><td>Disable the group.</td></tr>
		<tr><td><code>class</code></td><td><code>string</code></td><td>—</td><td>Class on the <code>&lt;fieldset&gt;</code>.</td></tr>
	</tbody>
</table>

<div class="callout">
	<strong>Input:</strong> a <code>&lt;fieldset&gt;</code> of native radios. Tab enters the group, arrow keys move and select, and it submits in forms; click, tap and pen select an option. Focus is shown by a ring around the selected option.<br>
	<strong>Reduced motion:</strong> the lens snaps to the selection with no slosh.<br>
	<strong>Contrast:</strong> labels keep at least 4.5:1 against the surface in both tones (ADR-0092).<br>
	<strong>No WebGL2 / forced colours:</strong> a plain styled segmented control with a checked tint; system colours under <code>forced-colors</code>. Shares one WebGL2 context per page with the other interface primitives (ADR-0088/0093), so many on one page do not hit the context cap.
</div>

<!-- ============================================================ -->
<h2 id="liquiddropzone">&lt;LiquidDropZone&gt;</h2>

<p>A file picker that doubles as a drop target, for uploads: the zone raises a meniscus toward the pointer as a file is dragged in.</p>

<div class="example">
	<LiquidDropZone accept="image/*" multiple label="Choose images or drop them here" onfiles={(files) => (dropped = files.map((f) => f.name).join(', '))} announce={(files) => files.length + (files.length === 1 ? ' image ready' : ' images ready')} />
	<p class="example-out">Last pick: {dropped}</p>
</div>

<pre><code>{DROP_EXAMPLE}</code></pre>

<table>
	<thead><tr><th>Prop</th><th>Type</th><th>Default</th><th>Description</th></tr></thead>
	<tbody>
		<tr><td><code>accept</code></td><td><code>string</code></td><td>—</td><td>Native <code>accept</code> list; dropped files are filtered by it too.</td></tr>
		<tr><td><code>multiple</code></td><td><code>boolean</code></td><td><code>false</code></td><td>Allow several files; otherwise a drop keeps the first match.</td></tr>
		<tr><td><code>label</code></td><td><code>string</code></td><td><code>'Choose a file or drop it here'</code></td><td>Visible text; <code>children</code> replaces it.</td></tr>
		<tr><td><code>children</code></td><td><code>Snippet</code></td><td>—</td><td>Custom content instead of <code>label</code>.</td></tr>
		<tr><td><code>onfiles</code></td><td><code>(files: File[]) =&gt; void</code></td><td>—</td><td>Picked or dropped files (never empty). Exceptions are caught and logged.</td></tr>
		<tr><td><code>announce</code></td><td><code>(files: File[]) =&gt; string</code></td><td>count message</td><td>Polite live-region text for a result.</td></tr>
		<tr><td><code>tone</code></td><td><code>'light' | 'dark' | 'auto'</code></td><td><code>'auto'</code></td><td>Palette. <code>'auto'</code> measures the page colour behind the control once per change.</td></tr>
		<tr><td><code>disabled</code></td><td><code>boolean</code></td><td><code>false</code></td><td>Disable the zone.</td></tr>
		<tr><td><code>name</code></td><td><code>string</code></td><td>—</td><td>Native input <code>name</code>, for form submission.</td></tr>
		<tr><td><code>...rest</code></td><td><code>HTMLLabelAttributes</code></td><td>—</td><td>Other attributes go to the <code>&lt;label&gt;</code>.</td></tr>
	</tbody>
</table>

<div class="callout">
	<strong>Input:</strong> a <code>&lt;label&gt;</code> around a visually hidden but focusable <code>&lt;input type="file"&gt;</code>. Click, tap, pen, Enter and Space open the browser's picker; drag and drop works with a mouse or pen. Results are announced in a polite live region.<br>
	<strong>Reduced motion:</strong> the meniscus snaps to its target and drops send no ripple.<br>
	<strong>Contrast:</strong> the label keeps at least 4.5:1 in both tones (ADR-0094).<br>
	<strong>No WebGL2 / forced colours:</strong> a plain styled native control; system colours under <code>forced-colors</code>. Shares one WebGL2 context per page with the other interface primitives (ADR-0088/0093), so many on one page do not hit the context cap.
</div>

<!-- ============================================================ -->
<h2 id="liquidcaustics">&lt;LiquidCaustics&gt;</h2>

<p>A wrapper that lays caustic light over live content where the user acts, for emphasis on cards and callouts.</p>

<div class="example">
	<LiquidCaustics tone="dark" intensity={0.75} style="padding: 1.5rem; border-radius: 12px; background: #14181f; color: #e8ecf4">
		<h3 style="margin: 0 0 0.5rem; color: inherit">Tide tables</h3>
		<p style="margin: 0 0 0.5rem; max-width: 28rem; color: inherit">Move the pointer over this block, or tab into it, to send a ripple of light across the text. The text stays selectable and crisp.</p>
		<a href="#liquidcaustics" style="color: #a4bce6">A focusable link</a>
	</LiquidCaustics>
</div>

<pre><code>{CAU_EXAMPLE}</code></pre>

<table>
	<thead><tr><th>Prop</th><th>Type</th><th>Default</th><th>Description</th></tr></thead>
	<tbody>
		<tr><td><code>tone</code></td><td><code>'light' | 'dark' | 'auto'</code></td><td><code>'auto'</code></td><td>Palette. <code>'auto'</code> measures the page colour behind the control once per change.</td></tr>
		<tr><td><code>intensity</code></td><td><code>number</code></td><td><code>0.75</code></td><td>Strength 0–1. Always clamped so body text keeps at least 4.5:1 against its measured background.</td></tr>
		<tr><td><code>children</code></td><td><code>Snippet</code></td><td>—</td><td>The live content. It is never resampled.</td></tr>
		<tr><td><code>...rest</code></td><td><code>HTMLAttributes&lt;HTMLDivElement&gt;</code></td><td>—</td><td>All other <code>div</code> attributes are forwarded.</td></tr>
	</tbody>
</table>

<div class="callout">
	<strong>Input:</strong> pointer moves and focus send a ripple that spreads and fades over about a second. At rest nothing is drawn or scheduled. The overlay ignores pointer events, so the content stays fully interactive, selectable and zoomable.<br>
	<strong>Reduced motion:</strong> no ripples and nothing drawn; the content alone.<br>
	<strong>Contrast:</strong> dark tone adds light, light tone adds soft shade, and the peak is clamped so the block's <code>color</code> keeps at least 4.5:1 against its background (ADR-0094).<br>
	<strong>No WebGL2 / forced colours:</strong> the content alone. Shares one WebGL2 context per page with the other interface primitives (ADR-0088/0093), so many on one page do not hit the context cap.
</div>

<!-- ============================================================ -->
<h2 id="foilswitch">&lt;FoilSwitch&gt;</h2>

<p>An on/off switch for settings, drawn as a metal arch that snaps between two stable states (arched is off, bowed is on).</p>

<div class="example">
	<FoilSwitch bind:checked={foilOn} style="color: #e8ecf4">Notifications</FoilSwitch>
	<p class="example-out">State: <code>{foilOn ? 'on' : 'off'}</code></p>
</div>

<pre><code>{FOIL_EXAMPLE}</code></pre>

<table>
	<thead><tr><th>Prop</th><th>Type</th><th>Default</th><th>Description</th></tr></thead>
	<tbody>
		<tr><td><code>checked</code></td><td><code>boolean</code></td><td><code>false</code></td><td>On/off; <code>bind:checked</code>.</td></tr>
		<tr><td><code>onchange</code></td><td><code>(checked: boolean) =&gt; void</code></td><td>—</td><td>Called with the new state after a user toggle. Exceptions are caught and logged.</td></tr>
		<tr><td><code>tone</code></td><td><code>'light' | 'dark' | 'auto'</code></td><td><code>'auto'</code></td><td>Palette for the focus ring and vector fallback.</td></tr>
		<tr><td><code>disabled</code></td><td><code>boolean</code></td><td><code>false</code></td><td>Disable the switch.</td></tr>
		<tr><td><code>children</code></td><td><code>Snippet</code></td><td>—</td><td>Visible label; part of the accessible name.</td></tr>
		<tr><td><code>...rest</code></td><td><code>HTMLButtonAttributes</code></td><td>—</td><td>Other button attributes are forwarded. <code>type</code>, <code>role</code> and <code>aria-checked</code> are fixed.</td></tr>
	</tbody>
</table>

<div class="callout">
	<strong>Input:</strong> a native <code>&lt;button type="button" role="switch"&gt;</code> with <code>aria-checked</code>. Click, tap, pen, Space and Enter toggle it; the state flips immediately, before <code>onchange</code>. The hit area is at least 48&times;48 CSS px and there is no border or chrome. The focus ring shows on <code>:focus-visible</code>.<br>
	<strong>Reduced motion:</strong> the arch is drawn in its final state with no snap animation.<br>
	<strong>Contrast:</strong> the arch carries the state, so the metal is clamped to at least 3:1 against the page in both tones (WCAG 1.4.11, ADR-0096).<br>
	<strong>No WebGL2 / forced colours:</strong> an SVG arch of the same shape shows the state, in <code>ButtonText</code> under <code>forced-colors</code>. Shares one WebGL2 context per page with the other interface primitives (ADR-0088/0093), so many on one page do not hit the context cap.
</div>

<style>
	.example {
		margin: 1rem 0;
		padding: 1.25rem;
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 12px;
		background: #151823;
	}
	.example-out {
		margin: 0.75rem 0 0;
		font-size: 0.85rem;
	}
	.component-index {
		line-height: 1.8;
	}
</style>
