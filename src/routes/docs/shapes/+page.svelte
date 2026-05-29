<script lang="ts">
	const SCRIPT_OPEN = '<' + 'script lang="ts">';
	const SCRIPT_CLOSE = '</' + 'script>';
	const LB = '{';
	const RB = '}';
</script>

<svelte:head>
	<title>Container Shapes — svelte-fluid</title>
	<meta name="description" content="Confine fluid to geometric boundaries — circle, frame, rounded rect, annulus, or SVG path." />
</svelte:head>

<h1>Container Shapes</h1>
<p class="subtitle">Confine the fluid to a geometric boundary. The simulation physically enforces the wall — velocity bounces and dye cannot escape.</p>

<p>
	The <code>containerShape</code> prop defines the boundary geometry. When set, the engine zeroes
	velocity outside the shape after every physics pass and masks dye after advection. The fluid
	is physically contained, not merely clipped visually.
</p>

<p>
	Coordinates follow a normalized convention: <code>cx</code>/<code>cy</code> are in the range [0, 1]
	(left-to-right, bottom-to-top). Radius values are normalized by canvas height, so
	<code>radius: 0.45</code> gives a physical radius of 45% of the canvas height.
</p>

<p>Five shape types are available:</p>

<ul>
	<li><a href="#circle"><code>circle</code></a> — fluid inside a circle</li>
	<li><a href="#frame"><code>frame</code></a> — fluid around a rectangular cutout (picture frame)</li>
	<li><a href="#roundedrect"><code>roundedRect</code></a> — fluid inside a rounded rectangle</li>
	<li><a href="#annulus"><code>annulus</code></a> — fluid inside a circular ring</li>
	<li><a href="#svgpath"><code>svgPath</code></a> — fluid inside an SVG path or text glyph</li>
</ul>

<p>
	Separately, the <a href="#obstructions"><code>obstructions</code></a> prop adds interior obstacles
	the fluid flows <em>around</em> — the inverse of a container, and orthogonal to
	<code>containerShape</code>.
</p>

<hr />

<h2 id="circle">circle</h2>

<p>Fluid contained inside a circle. Everything outside is zeroed.</p>

<table>
	<thead>
		<tr>
			<th>Field</th>
			<th>Type</th>
			<th>Description</th>
		</tr>
	</thead>
	<tbody>
		<tr>
			<td><code>type</code></td>
			<td><code>'circle'</code></td>
			<td>Discriminant</td>
		</tr>
		<tr>
			<td><code>cx</code></td>
			<td><code>number</code></td>
			<td>Horizontal center (0 = left, 1 = right)</td>
		</tr>
		<tr>
			<td><code>cy</code></td>
			<td><code>number</code></td>
			<td>Vertical center (0 = bottom, 1 = top)</td>
		</tr>
		<tr>
			<td><code>radius</code></td>
			<td><code>number</code></td>
			<td>Circle radius, normalized by canvas height</td>
		</tr>
	</tbody>
</table>

<pre><code>&lt;Fluid containerShape={LB}{LB} type: 'circle', cx: 0.5, cy: 0.5, radius: 0.45 {RB}{RB} /&gt;</code></pre>

<p>The most common container shape. Aspect correction is applied so the circle appears round regardless of canvas aspect ratio. A radius of <code>0.45</code> fits comfortably inside landscape canvases.</p>

<hr />

<h2 id="frame">frame</h2>

<p>Fluid flows everywhere <em>except</em> inside a rectangular cutout — like a picture frame. The inner rectangle is empty, and the fluid fills the border region around it.</p>

<table>
	<thead>
		<tr>
			<th>Field</th>
			<th>Type</th>
			<th>Description</th>
		</tr>
	</thead>
	<tbody>
		<tr>
			<td><code>type</code></td>
			<td><code>'frame'</code></td>
			<td>Discriminant</td>
		</tr>
		<tr>
			<td><code>cx</code></td>
			<td><code>number</code></td>
			<td>Horizontal center of the inner cutout</td>
		</tr>
		<tr>
			<td><code>cy</code></td>
			<td><code>number</code></td>
			<td>Vertical center of the inner cutout</td>
		</tr>
		<tr>
			<td><code>halfW</code></td>
			<td><code>number</code></td>
			<td>Half-width of the inner rectangle in UV space (0–1)</td>
		</tr>
		<tr>
			<td><code>halfH</code></td>
			<td><code>number</code></td>
			<td>Half-height of the inner rectangle in UV space (0–1)</td>
		</tr>
		<tr>
			<td><code>innerCornerRadius</code></td>
			<td><code>number?</code></td>
			<td>Corner radius for the inner cutout. Default 0 (sharp corners).</td>
		</tr>
		<tr>
			<td><code>outerHalfW</code></td>
			<td><code>number?</code></td>
			<td>Half-width of the outer boundary. Default 0.5 (full canvas).</td>
		</tr>
		<tr>
			<td><code>outerHalfH</code></td>
			<td><code>number?</code></td>
			<td>Half-height of the outer boundary. Default 0.5 (full canvas).</td>
		</tr>
		<tr>
			<td><code>outerCornerRadius</code></td>
			<td><code>number?</code></td>
			<td>Corner radius for the outer boundary. Default 0 (sharp corners).</td>
		</tr>
	</tbody>
</table>

<pre><code>&lt;Fluid containerShape={LB}{LB}
  type: 'frame',
  cx: 0.5, cy: 0.5,
  halfW: 0.25, halfH: 0.25,
  innerCornerRadius: 0.03
{RB}{RB} /&gt;</code></pre>

<p>
	Think of it as a picture frame: <code>halfW: 0.25</code> means the inner rectangle extends 25%
	of canvas width on each side of <code>cx</code>. The outer boundary defaults to the full canvas;
	set <code>outerHalfW</code>/<code>outerHalfH</code> to constrain it. Both inner and outer
	boundaries support rounded corners via their respective radius parameters. Rounded corners are
	aspect-corrected so they appear circular (like CSS <code>border-radius</code>).
</p>

<hr />

<h2 id="roundedrect">roundedRect</h2>

<p>Fluid stays <em>inside</em> a rounded rectangle. Like <code>frame</code> but inverted — the rectangle is the containment region, not the cutout.</p>

<table>
	<thead>
		<tr>
			<th>Field</th>
			<th>Type</th>
			<th>Description</th>
		</tr>
	</thead>
	<tbody>
		<tr>
			<td><code>type</code></td>
			<td><code>'roundedRect'</code></td>
			<td>Discriminant</td>
		</tr>
		<tr>
			<td><code>cx</code></td>
			<td><code>number</code></td>
			<td>Horizontal center</td>
		</tr>
		<tr>
			<td><code>cy</code></td>
			<td><code>number</code></td>
			<td>Vertical center</td>
		</tr>
		<tr>
			<td><code>halfW</code></td>
			<td><code>number</code></td>
			<td>Half-width in UV space</td>
		</tr>
		<tr>
			<td><code>halfH</code></td>
			<td><code>number</code></td>
			<td>Half-height in UV space</td>
		</tr>
		<tr>
			<td><code>cornerRadius</code></td>
			<td><code>number</code></td>
			<td>Corner rounding radius in UV space</td>
		</tr>
	</tbody>
</table>

<pre><code>&lt;Fluid containerShape={LB}{LB}
  type: 'roundedRect',
  cx: 0.5, cy: 0.5,
  halfW: 0.35, halfH: 0.4,
  cornerRadius: 0.06
{RB}{RB} /&gt;</code></pre>

<p>
	Uses the Inigo Quilez rounded-box SDF internally. Corner radius is aspect-corrected so corners
	appear circular in physical space. The LavaLamp preset uses this shape with
	<code>cornerRadius: 0.15</code> for a pill-like vessel.
</p>

<hr />

<h2 id="annulus">annulus</h2>

<p>Fluid contained within a circular ring between an inner and outer circle. Both the inner hole and the outer edge are physical walls.</p>

<table>
	<thead>
		<tr>
			<th>Field</th>
			<th>Type</th>
			<th>Description</th>
		</tr>
	</thead>
	<tbody>
		<tr>
			<td><code>type</code></td>
			<td><code>'annulus'</code></td>
			<td>Discriminant</td>
		</tr>
		<tr>
			<td><code>cx</code></td>
			<td><code>number</code></td>
			<td>Horizontal center</td>
		</tr>
		<tr>
			<td><code>cy</code></td>
			<td><code>number</code></td>
			<td>Vertical center</td>
		</tr>
		<tr>
			<td><code>innerRadius</code></td>
			<td><code>number</code></td>
			<td>Radius of the inner circle (hole), normalized by canvas height</td>
		</tr>
		<tr>
			<td><code>outerRadius</code></td>
			<td><code>number</code></td>
			<td>Radius of the outer circle, normalized by canvas height</td>
		</tr>
	</tbody>
</table>

<pre><code>&lt;Fluid containerShape={LB}{LB}
  type: 'annulus',
  cx: 0.5, cy: 0.5,
  innerRadius: 0.15, outerRadius: 0.45
{RB}{RB} /&gt;</code></pre>

<p>
	Creates a donut-shaped fluid region. Aspect correction is applied like <code>circle</code>. The
	ToroidalTempest preset uses this shape to create a violent storm circulating in a ring. Pair with
	<code>autoSplatSwirl</code> to sustain orbital motion.
</p>

<hr />

<h2 id="svgpath">svgPath</h2>

<p>Fluid contained within the filled region of an SVG path string or Canvas 2D text. The shape is rasterized to a mask texture at construction time.</p>

<table>
	<thead>
		<tr>
			<th>Field</th>
			<th>Type</th>
			<th>Description</th>
		</tr>
	</thead>
	<tbody>
		<tr>
			<td><code>type</code></td>
			<td><code>'svgPath'</code></td>
			<td>Discriminant</td>
		</tr>
		<tr>
			<td><code>d</code></td>
			<td><code>string?</code></td>
			<td>SVG path data string (path mode). Uses <code>Path2D(d)</code> with <code>viewBox</code> mapping.</td>
		</tr>
		<tr>
			<td><code>text</code></td>
			<td><code>string?</code></td>
			<td>Text to rasterize (text mode). Uses <code>ctx.fillText()</code>. Centered in the mask.</td>
		</tr>
		<tr>
			<td><code>font</code></td>
			<td><code>string?</code></td>
			<td>CSS font string for text mode. Default <code>'bold 72px sans-serif'</code>.</td>
		</tr>
		<tr>
			<td><code>viewBox</code></td>
			<td><code>[number, number, number, number]?</code></td>
			<td>viewBox for path mode. Default <code>[0, 0, 100, 100]</code>.</td>
		</tr>
		<tr>
			<td><code>fillRule</code></td>
			<td><code>'nonzero' | 'evenodd'?</code></td>
			<td>Fill rule for path mode. Use <code>'evenodd'</code> for font outlines with counters. Default <code>'nonzero'</code>.</td>
		</tr>
		<tr>
			<td><code>maskResolution</code></td>
			<td><code>number?</code></td>
			<td>Rasterization resolution (longest dimension in pixels). Default 512.</td>
		</tr>
	</tbody>
</table>

<p>At least one of <code>d</code> or <code>text</code> must be provided. If both are given, <code>d</code> takes precedence.</p>

<h3>Text mode</h3>

<pre><code>&lt;Fluid containerShape={LB}{LB}
  type: 'svgPath',
  text: '&amp;',
  font: 'bold 200px Georgia, serif',
  fillRule: 'evenodd'
{RB}{RB} /&gt;</code></pre>

<p>Text mode uses <code>ctx.fillText()</code> to rasterize text into the mask. The text is automatically centered. Use <code>fillRule: 'evenodd'</code> for glyphs with counters (holes) like "A", "O", or "&amp;".</p>

<h3>Path mode</h3>

<pre><code>&lt;Fluid containerShape={LB}{LB}
  type: 'svgPath',
  d: 'M50 10 L90 90 L10 90 Z',
  viewBox: [0, 0, 100, 100]
{RB}{RB} /&gt;</code></pre>

<p>Path mode uses <code>Path2D(d)</code> with viewBox mapping. The <code>viewBox</code> defines the coordinate space for the path data. Any valid SVG path data string works.</p>

<hr />

<h2 id="obstructions">Interior Obstructions</h2>

<p>
	Where <code>containerShape</code> marks where the fluid is <em>contained</em>, the
	<code>obstructions</code> prop marks where it is <em>blocked</em> — arbitrary interior
	obstacles the fluid flows around. Think pillars in a current, letters the dye weaves
	between, or walls forming a maze.
</p>

<p>
	Each <code>Obstruction</code> reuses the same <code>svgPath</code> / text descriptor as the
	<a href="#svgpath"><code>svgPath</code></a> container variant — the filled region of the path
	(or rasterized text) marks the blocked area.
</p>

<table>
	<thead>
		<tr>
			<th>Field</th>
			<th>Type</th>
			<th>Description</th>
		</tr>
	</thead>
	<tbody>
		<tr>
			<td><code>d</code></td>
			<td><code>string?</code></td>
			<td>SVG path data string (path mode). Takes precedence over <code>text</code>.</td>
		</tr>
		<tr>
			<td><code>text</code></td>
			<td><code>string?</code></td>
			<td>Text to rasterize as the obstruction (text mode). Centered in the mask.</td>
		</tr>
		<tr>
			<td><code>font</code></td>
			<td><code>string?</code></td>
			<td>CSS font string for text mode. Default <code>'bold 72px sans-serif'</code>.</td>
		</tr>
		<tr>
			<td><code>viewBox</code></td>
			<td><code>[number, number, number, number]?</code></td>
			<td>viewBox for path mode. Default <code>[0, 0, 100, 100]</code>.</td>
		</tr>
		<tr>
			<td><code>fillRule</code></td>
			<td><code>'nonzero' | 'evenodd'?</code></td>
			<td>Fill rule for path mode. Default <code>'nonzero'</code>.</td>
		</tr>
		<tr>
			<td><code>offset</code></td>
			<td><code>{LB} x: number; y: number {RB}?</code></td>
			<td>UV-space translation applied after the base fit transform (0–1, bottom-to-top). Default <code>{LB} x: 0, y: 0 {RB}</code>.</td>
		</tr>
		<tr>
			<td><code>scale</code></td>
			<td><code>number?</code></td>
			<td>Multiplier on the base fit scale (1 = fit as-is, 2 = double, 0.5 = half). Default 1.</td>
		</tr>
		<tr>
			<td><code>fit</code></td>
			<td><code>'contain' | 'fill'?</code></td>
			<td>
				How the <code>viewBox</code> maps onto a non-square canvas. <code>'contain'</code>
				(default) uniform-fits and centers — shape-accurate but letterboxes, leaving open
				margins; best for discrete obstacles placed with <code>offset</code>/<code>scale</code>.
				<code>'fill'</code> stretches each axis to fill the canvas at any aspect (no margins);
				best for canvas-spanning geometry like a maze or nozzle channel where the fluid must
				be confined edge-to-edge. Path mode only.
			</td>
		</tr>
	</tbody>
</table>

<pre><code>&lt;Fluid obstructions={LB}[{LB} d: 'M40 0 L60 0 L60 100 L40 100 Z' {RB}]{RB} /&gt;</code></pre>

<p>
	You can pass several obstructions at once. Use <code>offset</code> and <code>scale</code> to
	place and size each one independently:
</p>

<pre><code>&lt;Fluid obstructions={LB}[
  {LB} text: 'A', offset: {LB} x: -0.2, y: 0 {RB}, scale: 0.6 {RB},
  {LB} text: 'B', offset: {LB} x: 0.2, y: 0 {RB}, scale: 0.6 {RB}
]{RB} /&gt;</code></pre>

<h3>Union behavior</h3>

<p>
	All obstructions in the array rasterize into a <strong>single combined mask</strong> — their
	filled regions union together (overlapping fills accumulate). Cost is constant regardless of how
	many obstructions you pass: one extra texture sample per fragment.
</p>

<h3>Orthogonality to containerShape</h3>

<p>
	Obstructions are fully <strong>orthogonal</strong> to <code>containerShape</code>. They compose
	with any container — or with no container at all (a full-rectangle maze). The allowed fluid
	region is <code>container × (1 − obstruction)</code>: where a container says "fluid here" and an
	obstruction says "blocked here", blocked wins.
</p>

<pre><code>&lt;Fluid
  containerShape={LB}{LB} type: 'circle', cx: 0.5, cy: 0.5, radius: 0.45 {RB}{RB}
  obstructions={LB}[{LB} text: 'X', scale: 0.5 {RB}]{RB}
/&gt;</code></pre>

<h3>Minimum feature size</h3>

<p>
	Like container shapes, obstructions use post-hoc mask penalisation: the boundary is roughly one
	texel wide at the simulation resolution. The smallest reliably-resolved obstacle is about
	<code>2 / simResolution</code> in UV units (~0.016 at the default <code>simResolution: 128</code>).
	Walls thinner than that may leak — raise <code>simResolution</code> for finer mazes. The wall is
	free-slip (it stops flow crossing it but applies no drag along it), and the pressure solver
	produces emergent flow-around and venturi acceleration through gaps. See ADR-0034.
</p>

<p>
	Note that obstructions are mutually exclusive with <code>distortion</code> mode (they share an
	internal display texture unit).
</p>

<hr />

<h2>Open Boundaries</h2>

<p>
	By default, all boundaries are <strong>closed</strong> — fluid bounces off both the canvas edges
	and the container shape walls. The <code>openBoundary</code> prop changes this behavior:
</p>

<pre><code>&lt;Fluid
  containerShape={LB}{LB} type: 'circle', cx: 0.5, cy: 0.5, radius: 0.45 {RB}{RB}
  openBoundary
/&gt;</code></pre>

<p>
	When <code>openBoundary</code> is <code>true</code>, fluid flows freely instead of bouncing. The
	divergence solver skips no-penetration enforcement at the canvas edges, and the container shape
	becomes a visual crop rather than a physical wall — dye and velocity are not zeroed outside the
	shape. The <code>FluidReveal</code> component defaults to <code>openBoundary: true</code> for
	natural scratch behavior.
</p>

<p>
	<a href="#obstructions"><code>obstructions</code></a> behave differently from container shapes
	here: an obstruction is a <strong>physical wall regardless of <code>openBoundary</code></strong>.
	Velocity and dye are always zeroed inside obstacles, so fluid flows around them whether the
	boundary is open or closed. Combining <code>openBoundary</code> with obstructions is the natural
	setup for throughflow scenes (a nozzle, a venturi, flow past a body): fluid enters one side,
	flows around the obstacles, and vents off the canvas edge instead of recirculating.
</p>

<hr />

<h2>Mask Texture Approach</h2>

<p>
	The <code>circle</code>, <code>frame</code>, <code>roundedRect</code>, and <code>annulus</code> types use
	<strong>analytical SDFs</strong> (signed distance functions) evaluated directly in the GLSL shader.
	These are cheap to compute and produce perfectly smooth edges.
</p>

<p>
	The <code>svgPath</code> type uses a <strong>mask texture</strong> approach instead. An
	<code>OffscreenCanvas</code> rasterizes the path or text at the configured
	<code>maskResolution</code> (default 512px), producing a grayscale alpha mask. This mask is
	uploaded as a WebGL texture and sampled by the physics shaders to determine which regions contain fluid.
</p>

<p>
	Random splat spawning uses rejection sampling against a CPU-side copy of the mask data,
	ensuring splats only appear inside the shape. Increase <code>maskResolution</code> for finer
	detail on complex paths; decrease it for better performance on simple shapes.
</p>
