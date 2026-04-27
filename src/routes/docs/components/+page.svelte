<script lang="ts">
	import { base } from '$app/paths';

	const SCRIPT_OPEN = '<' + 'script lang="ts">';
	const SCRIPT_CLOSE = '</' + 'script>';
</script>

<svelte:head>
	<title>Components — svelte-fluid</title>
	<meta name="description" content="All six svelte-fluid components — Fluid, FluidBackground, FluidReveal, FluidDistortion, FluidStick, FluidText." />
</svelte:head>

<h1>Components</h1>
<p class="subtitle">Six components for different use cases. Each one wraps the same WebGL engine with a different interface.</p>

<!-- ============================================================ -->
<h2 id="fluid">&lt;Fluid&gt;</h2>

<p>The core component. Renders a WebGL fluid simulation on a canvas that fills its parent container.</p>

<pre><code>{SCRIPT_OPEN}
  import {'{'} Fluid {'}'} from 'svelte-fluid';
  import type {'{'} FluidHandle {'}'} from 'svelte-fluid';

  let handle = $state&lt;FluidHandle&gt;();
{SCRIPT_CLOSE}

&lt;div style="height: 400px"&gt;
  &lt;Fluid bind:this={'{'}handle{'}'} curl={'{'}30{'}'} bloom shading colorful /&gt;
&lt;/div&gt;</code></pre>

<p>Accepts all <a href="{base}/docs/configuration">FluidConfig</a> props plus:</p>

<table>
	<thead><tr><th>Prop</th><th>Type</th><th>Default</th><th>Description</th></tr></thead>
	<tbody>
		<tr><td><code>width</code></td><td><code>number</code></td><td>—</td><td>Fixed width in CSS px. Omit to fill parent.</td></tr>
		<tr><td><code>height</code></td><td><code>number</code></td><td>—</td><td>Fixed height in CSS px. Omit to fill parent.</td></tr>
		<tr><td><code>class</code></td><td><code>string</code></td><td>—</td><td>Class on wrapper div.</td></tr>
		<tr><td><code>style</code></td><td><code>string</code></td><td>—</td><td>Inline style on wrapper div.</td></tr>
		<tr><td><code>lazy</code></td><td><code>boolean</code></td><td><code>false</code></td><td>Defer engine until the element enters the viewport. Frees the WebGL context slot. Recommended when you have 6+ instances on one page.</td></tr>
		<tr><td><code>autoPause</code></td><td><code>boolean</code></td><td><code>true</code></td><td>Pause the RAF loop when not visible or tab is hidden.</td></tr>
	</tbody>
</table>

<p>Exposes a <a href="{base}/docs/api"><code>FluidHandle</code></a> via <code>bind:this</code> for programmatic control (splats, pause, resume).</p>

<!-- ============================================================ -->
<h2 id="fluidbackground">&lt;FluidBackground&gt;</h2>

<p>Full-viewport fluid behind page content. Pointer events are captured from the window, so the fluid responds to cursor movement over cards, text, and other elements.</p>

<pre><code>{SCRIPT_OPEN}
  import {'{'} FluidBackground {'}'} from 'svelte-fluid';
{SCRIPT_CLOSE}

&lt;FluidBackground exclude=".card, .sidebar" splatOnHover colorful shading bloom&gt;
  &lt;!-- your page content --&gt;
&lt;/FluidBackground&gt;</code></pre>

<p>DOM elements matching the <code>exclude</code> selector become physical "holes" — the fluid pools around them. The component observes scroll, resize, and DOM mutations to keep exclusion zones accurate.</p>

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

<p>The fluid acts as an opacity mask — cursor movement reveals content behind a solid cover. Great for scratch-to-reveal effects and interactive hero sections.</p>

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
		<tr><td><code>autoReveal</code></td><td><code>boolean</code></td><td><code>false</code></td><td>Auto-animate a Lissajous curve to reveal content before user interaction.</td></tr>
		<tr><td><code>autoRevealSpeed</code></td><td><code>number</code></td><td><code>1.0</code></td><td>Speed of the auto-reveal animation.</td></tr>
	</tbody>
</table>

<p>Also accepts <code>width</code>, <code>height</code>, <code>class</code>, <code>style</code>, <code>lazy</code>, <code>autoPause</code>, and all <a href="{base}/docs/configuration">FluidConfig</a> props.</p>

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
		<tr><td><code>autoDistort</code></td><td><code>boolean</code></td><td><code>false</code></td><td>Auto-animate distortion via Lissajous curve before user interacts.</td></tr>
		<tr><td><code>autoDistortSpeed</code></td><td><code>number</code></td><td><code>1.0</code></td><td>Speed of auto-distort animation.</td></tr>
		<tr><td><code>initialSplats</code></td><td><code>number</code></td><td><code>5</code></td><td>Random splats at startup. Creates a chaotic distortion that settles. 0 to start clean.</td></tr>
		<tr><td><code>bleed</code></td><td><code>number</code></td><td><code>60</code></td><td>Extra canvas pixels beyond visible edges. Prevents velocity bounce at boundaries.</td></tr>
	</tbody>
</table>

<p>Also accepts <code>width</code>, <code>height</code>, <code>class</code>, <code>style</code>, <code>lazy</code>, <code>autoPause</code>, and all <a href="{base}/docs/configuration">FluidConfig</a> props.</p>

<!-- ============================================================ -->
<h2 id="fluidstick">&lt;FluidStick&gt;</h2>

<p>Dye clings to text or SVG paths via physics-level modulation. Reduced dissipation on the mask makes dye persist, while artificial pressure pushes fluid around the shape.</p>

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
		<tr><td><code>autoAnimate</code></td><td><code>boolean</code></td><td><code>true</code></td><td>Auto-animate a Lissajous path to deposit dye before user interaction.</td></tr>
		<tr><td><code>autoAnimateSpeed</code></td><td><code>number</code></td><td><code>2.0</code></td><td>Speed of auto-animation.</td></tr>
		<tr><td><code>autoAnimateDuration</code></td><td><code>number</code></td><td><code>5.0</code></td><td>Seconds before auto-animation stops. 0 = indefinite.</td></tr>
	</tbody>
</table>

<p>Also accepts <code>width</code>, <code>height</code>, <code>class</code>, <code>style</code>, <code>lazy</code>, <code>autoPause</code>, and all <a href="{base}/docs/configuration">FluidConfig</a> props.</p>

<!-- ============================================================ -->
<h2 id="fluidtext">&lt;FluidText&gt;</h2>

<p>Fluid confined inside text letterforms. Wraps <code>&lt;Fluid&gt;</code> with an <code>svgPath</code> container shape in text mode. Automatically computes the correct aspect ratio via <code>measureText()</code> so the font appears at a consistent visual height regardless of text length.</p>

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
