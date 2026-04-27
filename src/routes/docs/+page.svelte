<script lang="ts">
	import { base } from '$app/paths';

	const SCRIPT_OPEN = '<' + 'script lang="ts">';
	const SCRIPT_CLOSE = '</' + 'script>';
</script>

<svelte:head>
	<title>Getting Started — svelte-fluid</title>
	<meta name="description" content="Get started with svelte-fluid — WebGL fluid simulation as a Svelte 5 component." />
</svelte:head>

<h1>Getting Started</h1>
<p class="subtitle">Add a GPU-accelerated fluid simulation to your Svelte app in under a minute.</p>

<h2>Install</h2>

<pre><code>npm install svelte-fluid</code></pre>

<p>Or with your preferred package manager:</p>

<pre><code>bun add svelte-fluid
pnpm add svelte-fluid
yarn add svelte-fluid</code></pre>

<p>Requires <strong>Svelte 5</strong>. No runtime dependencies.</p>

<h2>Your first fluid</h2>

<p>Drop a <code>&lt;Fluid&gt;</code> component into any container. It fills its parent automatically.</p>

<pre><code>{SCRIPT_OPEN}
  import {'{'} Fluid {'}'} from 'svelte-fluid';
{SCRIPT_CLOSE}

&lt;div style="width: 100%; height: 400px"&gt;
  &lt;Fluid /&gt;
&lt;/div&gt;</code></pre>

<p>Click and drag to create splats. The simulation runs on the GPU via WebGL, so it's fast even on mobile.</p>

<h2>Use a preset</h2>

<p>Presets are opinionated <code>&lt;Fluid&gt;</code> wrappers with tuned physics and visuals. Drop one in with zero configuration:</p>

<pre><code>{SCRIPT_OPEN}
  import {'{'} LavaLamp, Plasma, Aurora {'}'} from 'svelte-fluid';
{SCRIPT_CLOSE}

&lt;!-- Warm blobs in a glass vessel --&gt;
&lt;LavaLamp /&gt;

&lt;!-- Rapid color jets with vivid bloom --&gt;
&lt;Plasma /&gt;

&lt;!-- Northern-lights ribbons --&gt;
&lt;Aurora /&gt;</code></pre>

<p>See all 10 presets on the <a href="{base}/docs/presets">Presets</a> page.</p>

<h2>Customize</h2>

<p>Every aspect of the simulation is controllable via props. Here's a common starting point:</p>

<pre><code>&lt;Fluid
  curl={'{'}30{'}'}
  splatRadius={'{'}0.3{'}'}
  splatForce={'{'}8000{'}'}
  densityDissipation={'{'}0.5{'}'}
  velocityDissipation={'{'}0.3{'}'}
  bloom
  shading
  colorful
/&gt;</code></pre>

<p>See the full list of 50+ props on the <a href="{base}/docs/configuration">Configuration</a> page.</p>

<h2>Container shapes</h2>

<p>Confine the fluid to a geometric shape. The simulation physically enforces the boundary — fluid bounces off the walls.</p>

<pre><code>&lt;Fluid containerShape={'{'}{'{'} type: 'circle', cx: 0.5, cy: 0.5, radius: 0.45 {'}'}{'}'}  /&gt;

&lt;Fluid containerShape={'{'}{'{'} type: 'roundedRect', cx: 0.5, cy: 0.5,
  halfW: 0.35, halfH: 0.4, cornerRadius: 0.06 {'}'}{'}'}  /&gt;</code></pre>

<p>Five shape types are available: <code>circle</code>, <code>frame</code>, <code>roundedRect</code>, <code>annulus</code>, and <code>svgPath</code>. See the <a href="{base}/docs/shapes">Container Shapes</a> guide.</p>

<h2>Beyond the basics</h2>

<p>svelte-fluid ships six component variants for different use cases:</p>

<table>
	<thead>
		<tr>
			<th>Component</th>
			<th>What it does</th>
		</tr>
	</thead>
	<tbody>
		<tr>
			<td><code><a href="{base}/docs/components#fluid">&lt;Fluid&gt;</a></code></td>
			<td>Core simulation canvas. 50+ props for physics and visuals.</td>
		</tr>
		<tr>
			<td><code><a href="{base}/docs/components#fluidbackground">&lt;FluidBackground&gt;</a></code></td>
			<td>Full-viewport fluid behind page content with DOM exclusion zones.</td>
		</tr>
		<tr>
			<td><code><a href="{base}/docs/components#fluidreveal">&lt;FluidReveal&gt;</a></code></td>
			<td>Fluid as an opacity mask — cursor movement reveals content below.</td>
		</tr>
		<tr>
			<td><code><a href="{base}/docs/components#fluiddistortion">&lt;FluidDistortion&gt;</a></code></td>
			<td>Fluid velocity warps an underlying image like liquid glass.</td>
		</tr>
		<tr>
			<td><code><a href="{base}/docs/components#fluidstick">&lt;FluidStick&gt;</a></code></td>
			<td>Dye clings to text or SVG paths via physics-level modulation.</td>
		</tr>
		<tr>
			<td><code><a href="{base}/docs/components#fluidtext">&lt;FluidText&gt;</a></code></td>
			<td>Fluid confined inside text letterforms.</td>
		</tr>
	</tbody>
</table>

<p>For programmatic control (injecting splats, pausing, resuming), see the <a href="{base}/docs/api">API Reference</a>.</p>
