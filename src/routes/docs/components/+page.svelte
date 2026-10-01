<script lang="ts">
	import { base } from '$app/paths';

	const SCRIPT_OPEN = '<' + 'script lang="ts">';
	const SCRIPT_CLOSE = '</' + 'script>';
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
	<meta name="description" content="Fluid components and experimental native-UI material treatments for Svelte 5." />
</svelte:head>

<h1>Components</h1>
<p class="subtitle">Six fluid components share one native WebGPU solver. Three experimental material treatments compose with your existing text, images and controls.</p>

<h2 id="materials">Experimental material treatments</h2>
<p><code>MaterialEnamel</code>, <code>MaterialFoil</code> and <code>MaterialImage</code> are small visual layers, not a second UI kit. Your native heading, button or link owns its content, focus, activation and state. <a href="{base}/lab/interfaces/library">Try the borderless foil appearance switch</a>; its Plain comparison is in Study notes. The page deliberately does not stack all three treatments.</p>
<pre><code>{SCRIPT_OPEN}
  import {'{'} MaterialEnamel, MaterialFoil, MaterialImage {'}'} from 'svelte-fluid';
  let dark = $state(false);
{SCRIPT_CLOSE}

&lt;h1&gt;&lt;MaterialEnamel text="Made to be felt." /&gt;&lt;/h1&gt;
&lt;button type="button" role="switch" aria-label="Dark appearance"
  aria-checked={'{'}dark{'}'} onclick={'{'}() =&gt; dark = !dark{'}'}&gt;
  &lt;MaterialFoil selected={'{'}dark{'}'} /&gt;
  Dark appearance: {'{'}dark ? 'On' : 'Off'{'}'}
&lt;/button&gt;
&lt;a href="/journal/arles"&gt;
  &lt;MaterialImage src="/arles.jpg" alt="Sunlit arches in Arles"
    width={'{'}3803{'}'} height={'{'}3162{'}'} /&gt;
&lt;/a&gt;</code></pre>
<p>Your application applies the theme; foil observes <code>selected</code> without changing it. Enamel inherits font, color and native wrapping. It keeps the silhouette stationary. The image retains its real <code>img</code>, alt text and reserved aspect ratio; its local wake is never required to follow the link.</p>
<table><thead><tr><th>Component</th><th>Required props</th><th>Scope</th></tr></thead><tbody>
<tr><td><code>MaterialEnamel</code></td><td><code>text: string</code></td><td>Short plain display text; horizontal writing, no text-transform. Unsupported text keeps its ordinary rendering.</td></tr>
<tr><td><code>MaterialFoil</code></td><td><code>selected: boolean</code></td><td>A decorative 6rem × 3rem snap mechanism, normally inside a native binary control.</td></tr>
<tr><td><code>MaterialImage</code></td><td><code>src</code>, <code>alt</code>, positive <code>width</code>, <code>height</code></td><td>An explicit image with local distortion. Cross-origin image fetches need CORS.</td></tr>
</tbody></table>
<p>Shared props: <code>enabled</code> (default true), <code>class</code>, and <code>onStatus(status: MaterialStatus)</code>. States are <code>loading</code>, <code>ready</code>, <code>static</code> and <code>unavailable</code>, with an optional <code>reason</code>. A component reference exposes <code>retry()</code>. Use local recovery copy when appropriate. Disabling a treatment releases GPU resources.</p>
<p>All use actual CSS × DPR pixels, one shared device and an idle-aware frame scheduler. Reduced motion uses still finishes and immediate state changes; forced colors uses native content and a vector foil. Canvases do not capture pointers or cancel native scrolling. GPU failure never disables the host control.</p>
<div class="callout"><strong>Experimental, deliberately bounded:</strong> these are illustrative material laws, not calibrated mechanics or arbitrary DOM capture. The image uses invertible coordinate maps, not a full fluid solver. Large source images still cost memory; oversized native resources fall back rather than blur. Enamel reflow/text changes reset transient deformation; DPR-only changes retain fields and color-only changes do not allocate GPU resources. Real-phone energy/thermal and broad assistive-technology validation remain open evaluation work.</div>

<!-- ============================================================ -->
<h2 id="fluid">&lt;Fluid&gt;</h2>

<p>The core component. Renders a native WebGPU fluid simulation on a canvas that fills its parent container.</p>

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
		<tr><td><code>maxPixelRatio</code></td><td><code>number | null</code></td><td><code>2</code></td><td>Cap physical pixels per CSS pixel on high-DPR displays. Pass <code>null</code> for native device DPR. CSS quality tiers are unchanged.</td></tr>
		<tr><td><code>class</code></td><td><code>string</code></td><td>—</td><td>Class on wrapper div.</td></tr>
		<tr><td><code>style</code></td><td><code>string</code></td><td>—</td><td>Inline style on wrapper div.</td></tr>
		<tr><td><code>lazy</code></td><td><code>boolean</code></td><td><code>false</code></td><td>Defer per-instance field allocation until the element enters the viewport, then release those fields when it leaves. The shared device and pipelines stay warm.</td></tr>
		<tr><td><code>autoPause</code></td><td><code>boolean</code></td><td><code>true</code></td><td>Pause the RAF loop when not visible or tab is hidden.</td></tr>
		<tr><td><code>fallback</code></td><td><code>Snippet&lt;[{'{'} reason {'}'}]&gt;</code></td><td>—</td><td>Custom UI rendered when WebGPU cannot start/recover or a distortion asset fails. Receives the typed failure <code>reason</code>, including <code>'asset-failed'</code>. Takes precedence over <code>poster</code>.</td></tr>
		<tr><td><code>poster</code></td><td><code>string</code></td><td>—</td><td>Static image (object-fit: cover) shown when WebGPU cannot run and no <code>fallback</code> is given. A graceful still of the animation.</td></tr>
		<tr><td><code>posterAlt</code></td><td><code>string</code></td><td><code>''</code></td><td>Alt text for the <code>poster</code> image. Defaults to empty (decorative) — set it when the poster conveys meaning.</td></tr>
		<tr><td><code>fallbackText</code></td><td><code>string</code></td><td><em>see below</em></td><td>Visually-hidden message for the default fallback, discoverable by assistive tech (rendered alongside a <code>poster</code> too). Set <code>''</code> to suppress for purely decorative instances.</td></tr>
	</tbody>
</table>

<div class="callout">
	<strong>WebGPU fallback (ADR-0041):</strong> when an adapter/device is unavailable, initialization fails, or device recovery fails, <code>&lt;Fluid&gt;</code> keeps the page intact. It renders, in order of preference, your <code>fallback</code> snippet, then a <code>poster</code> image, else a mode-aware color fill with a visually-hidden <code>fallbackText</code> message (default: <em>"This animation requires GPU graphics, which aren't available in your browser."</em>). Reveal mode always retains an opaque cover so hidden content is never exposed. For <code>distortion</code>, pass <code>poster=&#123;yourImageUrl&#125;</code> so the source still stands in for the warp. Set <a href="{base}/docs/configuration"><code>requireHardwareAcceleration</code></a> to reject a software-only adapter. The helper <code>isFluidGpuAvailable()</code> is exported if you want to probe support yourself.
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
	</tbody>
</table>

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

<p>Also accepts <code>width</code>, <code>height</code>, <code>class</code>, <code>style</code>, <code>lazy</code>, <code>autoPause</code>, and compatible <a href="{base}/docs/configuration">FluidConfig</a> physics props. Use <code>fadeBack</code> or <code>fadeSpeed</code> rather than <code>densityDissipation</code>: reveal uses an intentionally per-frame fade factor.</p>

<div class="callout">
	<strong>Note:</strong> The canvas sits on top of children for alpha compositing. Interactive elements (links, buttons) inside the slot will not receive pointer events.
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

<p>Also accepts <code>width</code>, <code>height</code>, <code>class</code>, <code>style</code>, <code>lazy</code>, <code>autoPause</code>, and all <a href="{base}/docs/configuration">FluidConfig</a> props.</p>

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

<p>Also accepts <code>width</code>, <code>height</code>, <code>class</code>, <code>style</code>, <code>lazy</code>, <code>autoPause</code>, and all <a href="{base}/docs/configuration">FluidConfig</a> props.</p>

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
	</tbody>
</table>

<p>Also accepts <code>class</code>, <code>style</code>, <code>lazy</code>, <code>autoPause</code>, and all <a href="{base}/docs/configuration">FluidConfig</a> props. Defaults to <code>transparent=true</code>.</p>
