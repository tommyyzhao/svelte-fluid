<script lang="ts">
	const SCRIPT_OPEN = '<' + 'script lang="ts">';
	const SCRIPT_CLOSE = '</' + 'script>';
	const LB = '{';
	const RB = '}';
</script>

<svelte:head>
	<title>Presets — svelte-fluid</title>
	<meta name="description" content="Fourteen opinionated Fluid wrappers with tuned physics and visuals — drop in with zero config." />
</svelte:head>

<h1>Presets</h1>
<p class="subtitle">Opinionated Fluid wrappers with tuned physics and visuals.</p>

<p>
	Presets are zero-config wrappers around the core <code>&lt;Fluid&gt;</code> component. Each one
	pins physics constants, visual settings, and opening splats to produce a specific look. Import
	a preset and drop it in — no props required.
</p>

<pre><code>{SCRIPT_OPEN}
  import {LB} LavaLamp, Plasma, Aurora {RB} from 'svelte-fluid';
{SCRIPT_CLOSE}

&lt;LavaLamp /&gt;</code></pre>

<p>
	All presets accept <code>width</code>, <code>height</code>, <code>class</code>,
	<code>style</code>, <code>seed</code>, <code>lazy</code>, <code>splatOnHover</code>,
	<code>aria-label</code>, and <code>backColor</code> props for sizing, styling, accessibility,
	interactive splatting, and adapting the empty-canvas substrate to a host page background.
	Presets enable <code>splatOnHover</code> by default; pass <code>splatOnHover={LB}false{RB}</code>
	to disable pointer-driven splats. Each preset's table below shows the <code>backColor</code>
	value that ships by default; pass your own to override. Flow-scene presets also expose
	<code>pointerInput</code>.
</p>

<p>
	The examples below show the public wrapper API. The detailed tables describe the pinned
	<code>&lt;Fluid&gt;</code> recipe, but hand-authored <code>presetSplats</code> and
	<code>flow</code> scene configs live in the preset source so copy-paste examples stay small.
</p>

<hr />

<h2 id="lavalamp">LavaLamp</h2>

<p>Warm, slow-rising blobs inside a glass rounded-rect vessel on a light-silver background. The blobs never fade and sway with lazy buoyant motion, like real molten wax in a lava lamp.</p>

<p><strong>Container shape:</strong> <code>roundedRect</code> (cx: 0.5, cy: 0.5, halfW: 0.38, halfH: 0.45, cornerRadius: 0.15) with glass enabled.</p>

<pre><code>{SCRIPT_OPEN}
  import {LB} LavaLamp {RB} from 'svelte-fluid';
{SCRIPT_CLOSE}

&lt;LavaLamp /&gt;</code></pre>

<table>
	<thead>
		<tr>
			<th>Prop</th>
			<th>Value</th>
		</tr>
	</thead>
	<tbody>
		<tr><td><code>curl</code></td><td>5</td></tr>
		<tr><td><code>densityDissipation</code></td><td>0</td></tr>
		<tr><td><code>initialDensityDissipation</code></td><td>0.25</td></tr>
		<tr><td><code>initialDensityDissipationDuration</code></td><td>1.0</td></tr>
		<tr><td><code>velocityDissipation</code></td><td>0</td></tr>
		<tr><td><code>pressure</code></td><td>0.8</td></tr>
		<tr><td><code>splatRadius</code></td><td>0.75</td></tr>
		<tr><td><code>splatForce</code></td><td>2200</td></tr>
		<tr><td><code>shading</code></td><td>true</td></tr>
		<tr><td><code>colorful</code></td><td>false</td></tr>
		<tr><td><code>bloom</code></td><td>false</td></tr>
		<tr><td><code>sunrays</code></td><td>false</td></tr>
		<tr><td><code>glass</code></td><td>true</td></tr>
		<tr><td><code>glassRefraction</code></td><td>0.3</td></tr>
		<tr><td><code>glassReflectivity</code></td><td>0.08</td></tr>
		<tr><td><code>glassChromatic</code></td><td>0.1</td></tr>
		<tr><td><code>backColor</code></td><td>{LB} r: 222, g: 218, b: 215 {RB}</td></tr>
		<tr><td><code>initialSplatCount</code></td><td>0</td></tr>
		<tr><td><code>presetSplats</code></td><td>8 warm-spectrum blobs</td></tr>
	</tbody>
</table>

<hr />

<h2 id="plasma">Plasma</h2>

<p>A vivid plasma ball with full-spectrum colors converging from all compass directions and churning at the center. Eight inward jets establish a magnetic-pinch convergence zone with intense bloom glow on a near-black backdrop.</p>

<p><strong>Container shape:</strong> none (full canvas).</p>

<pre><code>&lt;Plasma /&gt;</code></pre>

<table>
	<thead>
		<tr>
			<th>Prop</th>
			<th>Value</th>
		</tr>
	</thead>
	<tbody>
		<tr><td><code>curl</code></td><td>40</td></tr>
		<tr><td><code>densityDissipation</code></td><td>0.12</td></tr>
		<tr><td><code>initialDensityDissipation</code></td><td>0.6</td></tr>
		<tr><td><code>initialDensityDissipationDuration</code></td><td>2.0</td></tr>
		<tr><td><code>velocityDissipation</code></td><td>0.08</td></tr>
		<tr><td><code>pressure</code></td><td>0.8</td></tr>
		<tr><td><code>splatRadius</code></td><td>0.35</td></tr>
		<tr><td><code>splatForce</code></td><td>5000</td></tr>
		<tr><td><code>shading</code></td><td>true</td></tr>
		<tr><td><code>colorful</code></td><td>true</td></tr>
		<tr><td><code>colorUpdateSpeed</code></td><td>8</td></tr>
		<tr><td><code>bloom</code></td><td>true</td></tr>
		<tr><td><code>bloomThreshold</code></td><td>0.6</td></tr>
		<tr><td><code>bloomIntensity</code></td><td>1.5</td></tr>
		<tr><td><code>sunrays</code></td><td>true</td></tr>
		<tr><td><code>sunraysWeight</code></td><td>0.5</td></tr>
		<tr><td><code>backColor</code></td><td>{LB} r: 4, g: 2, b: 12 {RB}</td></tr>
		<tr><td><code>initialSplatCount</code></td><td>0</td></tr>
		<tr><td><code>autoSplatRate</code></td><td>0.4</td></tr>
		<tr><td><code>autoSplatCount</code></td><td>4</td></tr>
		<tr><td><code>autoSplatCenterY</code></td><td>0.5</td></tr>
		<tr><td><code>presetSplats</code></td><td>8 inward compass jets</td></tr>
	</tbody>
</table>

<hr />

<h2 id="inkinwater">InkInWater</h2>

<p>Concentrated ink droplets sinking through dark water, blooming outward as they fall. Modeled after india ink in a deep tank with organic tendrils from gentle Rayleigh-Taylor instability.</p>

<p><strong>Container shape:</strong> none (full canvas).</p>

<pre><code>&lt;InkInWater /&gt;</code></pre>

<table>
	<thead>
		<tr>
			<th>Prop</th>
			<th>Value</th>
		</tr>
	</thead>
	<tbody>
		<tr><td><code>curl</code></td><td>8</td></tr>
		<tr><td><code>densityDissipation</code></td><td>0.3</td></tr>
		<tr><td><code>velocityDissipation</code></td><td>0.15</td></tr>
		<tr><td><code>pressure</code></td><td>0.85</td></tr>
		<tr><td><code>splatRadius</code></td><td>0.12</td></tr>
		<tr><td><code>splatForce</code></td><td>800</td></tr>
		<tr><td><code>shading</code></td><td>true</td></tr>
		<tr><td><code>colorful</code></td><td>false</td></tr>
		<tr><td><code>bloom</code></td><td>true</td></tr>
		<tr><td><code>bloomIntensity</code></td><td>0.6</td></tr>
		<tr><td><code>bloomThreshold</code></td><td>0.4</td></tr>
		<tr><td><code>sunrays</code></td><td>false</td></tr>
		<tr><td><code>backColor</code></td><td>{LB} r: 6, g: 8, b: 20 {RB}</td></tr>
		<tr><td><code>initialSplatCount</code></td><td>0</td></tr>
		<tr><td><code>autoSplatRate</code></td><td>0.2</td></tr>
		<tr><td><code>autoSplatColor</code></td><td>{LB} r: 0.06, g: 0.07, b: 0.5 {RB}</td></tr>
		<tr><td><code>autoSplatVelocityY</code></td><td>-180</td></tr>
		<tr><td><code>autoSplatCenterY</code></td><td>0.9</td></tr>
		<tr><td><code>presetSplats</code></td><td>5 ink droplets near the top</td></tr>
	</tbody>
</table>

<hr />

<h2 id="frozenswirl">FrozenSwirl</h2>

<p>A single dramatic icy whirlpool in a circular vessel that spins itself out and comes to rest. High velocity dissipation freezes the motion fast, leaving a permanent crystalline curl on a deep navy backdrop.</p>

<p><strong>Container shape:</strong> <code>circle</code> (cx: 0.5, cy: 0.5, radius: 0.45).</p>

<pre><code>&lt;FrozenSwirl /&gt;</code></pre>

<table>
	<thead>
		<tr>
			<th>Prop</th>
			<th>Value</th>
		</tr>
	</thead>
	<tbody>
		<tr><td><code>curl</code></td><td>50</td></tr>
		<tr><td><code>densityDissipation</code></td><td>0</td></tr>
		<tr><td><code>velocityDissipation</code></td><td>1.0</td></tr>
		<tr><td><code>pressure</code></td><td>0.95</td></tr>
		<tr><td><code>splatRadius</code></td><td>0.5</td></tr>
		<tr><td><code>splatForce</code></td><td>8000</td></tr>
		<tr><td><code>shading</code></td><td>true</td></tr>
		<tr><td><code>colorful</code></td><td>false</td></tr>
		<tr><td><code>bloom</code></td><td>true</td></tr>
		<tr><td><code>bloomIntensity</code></td><td>1.0</td></tr>
		<tr><td><code>sunrays</code></td><td>false</td></tr>
		<tr><td><code>backColor</code></td><td>{LB} r: 4, g: 8, b: 24 {RB}</td></tr>
		<tr><td><code>initialSplatCount</code></td><td>0</td></tr>
		<tr><td><code>presetSplats</code></td><td>3 icy-blue splats (1 central + 2 off-axis)</td></tr>
	</tbody>
</table>

<hr />

<h2 id="aurora">Aurora</h2>

<p>Northern lights — green, magenta, and pale-blue ribbons layered across a deep night sky. The opening bands have a sideways push, then settle into a luminous steady wash while heavy bloom and sunrays grow the atmospheric glow over time.</p>

<p><strong>Container shape:</strong> none (full canvas).</p>

<pre><code>&lt;Aurora /&gt;</code></pre>

<table>
	<thead>
		<tr>
			<th>Prop</th>
			<th>Value</th>
		</tr>
	</thead>
	<tbody>
		<tr><td><code>curl</code></td><td>40</td></tr>
		<tr><td><code>densityDissipation</code></td><td>0</td></tr>
		<tr><td><code>velocityDissipation</code></td><td>0.3</td></tr>
		<tr><td><code>pressure</code></td><td>0.85</td></tr>
		<tr><td><code>splatRadius</code></td><td>0.4</td></tr>
		<tr><td><code>splatForce</code></td><td>6000</td></tr>
		<tr><td><code>shading</code></td><td>true</td></tr>
		<tr><td><code>colorful</code></td><td>false</td></tr>
		<tr><td><code>bloom</code></td><td>true</td></tr>
		<tr><td><code>bloomIntensity</code></td><td>1.5</td></tr>
		<tr><td><code>sunrays</code></td><td>true</td></tr>
		<tr><td><code>sunraysWeight</code></td><td>1.4</td></tr>
		<tr><td><code>backColor</code></td><td>{LB} r: 2, g: 4, b: 18 {RB}</td></tr>
		<tr><td><code>initialSplatCount</code></td><td>0</td></tr>
		<tr><td><code>presetSplats</code></td><td>5 horizontal-band ribbon splats</td></tr>
	</tbody>
</table>

<hr />

<h2 id="toroidal">Toroidal</h2>

<p>A violent full-spectrum storm circulating in a toroidal ring. Eight high-velocity dye blobs orbit inside an annular container with fierce counter-clockwise flow. Periodic re-injection every 2 seconds keeps the ring fed with fresh color.</p>

<p><strong>Container shape:</strong> <code>annulus</code> (cx: 0.5, cy: 0.5, innerRadius: 0.15, outerRadius: 0.42).</p>

<pre><code>&lt;Toroidal /&gt;</code></pre>

<table>
	<thead>
		<tr>
			<th>Prop</th>
			<th>Value</th>
		</tr>
	</thead>
	<tbody>
		<tr><td><code>curl</code></td><td>50</td></tr>
		<tr><td><code>densityDissipation</code></td><td>0.25</td></tr>
		<tr><td><code>initialDensityDissipation</code></td><td>0.6</td></tr>
		<tr><td><code>initialDensityDissipationDuration</code></td><td>2.0</td></tr>
		<tr><td><code>velocityDissipation</code></td><td>0.02</td></tr>
		<tr><td><code>pressure</code></td><td>0.8</td></tr>
		<tr><td><code>splatRadius</code></td><td>0.4</td></tr>
		<tr><td><code>splatForce</code></td><td>6000</td></tr>
		<tr><td><code>shading</code></td><td>true</td></tr>
		<tr><td><code>colorful</code></td><td>true</td></tr>
		<tr><td><code>colorUpdateSpeed</code></td><td>8</td></tr>
		<tr><td><code>bloom</code></td><td>true</td></tr>
		<tr><td><code>bloomThreshold</code></td><td>0.6</td></tr>
		<tr><td><code>bloomIntensity</code></td><td>1.8</td></tr>
		<tr><td><code>sunrays</code></td><td>true</td></tr>
		<tr><td><code>sunraysWeight</code></td><td>0.6</td></tr>
		<tr><td><code>backColor</code></td><td>{LB} r: 2, g: 2, b: 10 {RB}</td></tr>
		<tr><td><code>initialSplatCount</code></td><td>0</td></tr>
		<tr><td><code>presetSplats</code></td><td>8 tangential ring splats at 45-degree intervals</td></tr>
	</tbody>
</table>

<hr />

<h2 id="circularfluid">CircularFluid</h2>

<p>Vivid swirling fluid contained inside a circle. Eight inward jets converge from the compass points, and the circular boundary reflects them back inward to produce a self-sustaining vortex. Automatic splats with orbital swirl sustain the motion.</p>

<p><strong>Container shape:</strong> <code>circle</code> (cx: 0.5, cy: 0.5, radius: 0.45).</p>

<pre><code>&lt;CircularFluid /&gt;

&lt;!-- also accepts splatOnHover --&gt;
&lt;CircularFluid splatOnHover /&gt;</code></pre>

<table>
	<thead>
		<tr>
			<th>Prop</th>
			<th>Value</th>
		</tr>
	</thead>
	<tbody>
		<tr><td><code>curl</code></td><td>35</td></tr>
		<tr><td><code>densityDissipation</code></td><td>0.15</td></tr>
		<tr><td><code>initialDensityDissipation</code></td><td>0.5</td></tr>
		<tr><td><code>initialDensityDissipationDuration</code></td><td>2.0</td></tr>
		<tr><td><code>velocityDissipation</code></td><td>0.06</td></tr>
		<tr><td><code>pressure</code></td><td>0.8</td></tr>
		<tr><td><code>splatRadius</code></td><td>0.38</td></tr>
		<tr><td><code>splatForce</code></td><td>5000</td></tr>
		<tr><td><code>shading</code></td><td>true</td></tr>
		<tr><td><code>colorful</code></td><td>true</td></tr>
		<tr><td><code>colorUpdateSpeed</code></td><td>8</td></tr>
		<tr><td><code>bloom</code></td><td>true</td></tr>
		<tr><td><code>bloomThreshold</code></td><td>0.6</td></tr>
		<tr><td><code>bloomIntensity</code></td><td>1.0</td></tr>
		<tr><td><code>sunrays</code></td><td>false</td></tr>
		<tr><td><code>backColor</code></td><td>{LB} r: 4, g: 2, b: 12 {RB}</td></tr>
		<tr><td><code>initialSplatCount</code></td><td>0</td></tr>
		<tr><td><code>autoSplatRate</code></td><td>1.2</td></tr>
		<tr><td><code>autoSplatCount</code></td><td>1</td></tr>
		<tr><td><code>autoSplatCenterY</code></td><td>0.5</td></tr>
		<tr><td><code>autoSplatBandHeight</code></td><td>0.8</td></tr>
		<tr><td><code>autoSplatSwirl</code></td><td>500</td></tr>
		<tr><td><code>presetSplats</code></td><td>8 inward compass jets</td></tr>
	</tbody>
</table>

<hr />

<h2 id="framefluid">FrameFluid</h2>

<p>Fluid swirling around a rectangular inner cutout, like a living picture frame. Four edge jets create clockwise circulation and four diagonal jets add turbulence at the corners. Accepts optional <code>innerCornerRadius</code> and <code>outerCornerRadius</code> props.</p>

<p><strong>Container shape:</strong> <code>frame</code> (cx: 0.5, cy: 0.5, halfW: 0.25, halfH: 0.25).</p>

<pre><code>&lt;FrameFluid /&gt;

&lt;!-- with rounded corners --&gt;
&lt;FrameFluid innerCornerRadius={LB}0.03{RB} outerCornerRadius={LB}0.05{RB} /&gt;</code></pre>

<table>
	<thead>
		<tr>
			<th>Prop</th>
			<th>Value</th>
		</tr>
	</thead>
	<tbody>
		<tr><td><code>curl</code></td><td>30</td></tr>
		<tr><td><code>densityDissipation</code></td><td>0.08</td></tr>
		<tr><td><code>initialDensityDissipation</code></td><td>0.5</td></tr>
		<tr><td><code>initialDensityDissipationDuration</code></td><td>2.0</td></tr>
		<tr><td><code>velocityDissipation</code></td><td>0.06</td></tr>
		<tr><td><code>pressure</code></td><td>0.8</td></tr>
		<tr><td><code>splatRadius</code></td><td>0.42</td></tr>
		<tr><td><code>splatForce</code></td><td>5000</td></tr>
		<tr><td><code>shading</code></td><td>true</td></tr>
		<tr><td><code>colorful</code></td><td>true</td></tr>
		<tr><td><code>colorUpdateSpeed</code></td><td>8</td></tr>
		<tr><td><code>bloom</code></td><td>true</td></tr>
		<tr><td><code>bloomThreshold</code></td><td>0.6</td></tr>
		<tr><td><code>bloomIntensity</code></td><td>0.9</td></tr>
		<tr><td><code>sunrays</code></td><td>false</td></tr>
		<tr><td><code>backColor</code></td><td>{LB} r: 0, g: 0, b: 0 {RB}</td></tr>
		<tr><td><code>initialSplatCount</code></td><td>0</td></tr>
		<tr><td><code>autoSplatRate</code></td><td>0.5</td></tr>
		<tr><td><code>autoSplatCount</code></td><td>6</td></tr>
		<tr><td><code>autoSplatCenterY</code></td><td>0.5</td></tr>
		<tr><td><code>autoSplatBandHeight</code></td><td>2.0</td></tr>
		<tr><td><code>autoSplatSwirl</code></td><td>300</td></tr>
		<tr><td><code>presetSplats</code></td><td>4 edge jets + 4 corner jets</td></tr>
	</tbody>
</table>

<hr />

<h2 id="annularfluid">AnnularFluid</h2>

<p>A ring-vortex of fluid contained between two concentric circles. Eight tangential jets establish a counter-clockwise ring vortex. Automatic splats with orbital swirl sustain the motion.</p>

<p><strong>Container shape:</strong> <code>annulus</code> (cx: 0.5, cy: 0.5, innerRadius: 0.15, outerRadius: 0.45).</p>

<pre><code>&lt;AnnularFluid /&gt;</code></pre>

<table>
	<thead>
		<tr>
			<th>Prop</th>
			<th>Value</th>
		</tr>
	</thead>
	<tbody>
		<tr><td><code>curl</code></td><td>35</td></tr>
		<tr><td><code>densityDissipation</code></td><td>0.08</td></tr>
		<tr><td><code>initialDensityDissipation</code></td><td>0.5</td></tr>
		<tr><td><code>initialDensityDissipationDuration</code></td><td>2.0</td></tr>
		<tr><td><code>velocityDissipation</code></td><td>0.06</td></tr>
		<tr><td><code>pressure</code></td><td>0.8</td></tr>
		<tr><td><code>splatRadius</code></td><td>0.38</td></tr>
		<tr><td><code>splatForce</code></td><td>5000</td></tr>
		<tr><td><code>shading</code></td><td>true</td></tr>
		<tr><td><code>colorful</code></td><td>true</td></tr>
		<tr><td><code>colorUpdateSpeed</code></td><td>8</td></tr>
		<tr><td><code>bloom</code></td><td>true</td></tr>
		<tr><td><code>bloomThreshold</code></td><td>0.6</td></tr>
		<tr><td><code>bloomIntensity</code></td><td>1.0</td></tr>
		<tr><td><code>sunrays</code></td><td>false</td></tr>
		<tr><td><code>backColor</code></td><td>{LB} r: 4, g: 2, b: 12 {RB}</td></tr>
		<tr><td><code>initialSplatCount</code></td><td>0</td></tr>
		<tr><td><code>autoSplatRate</code></td><td>0.5</td></tr>
		<tr><td><code>autoSplatCount</code></td><td>5</td></tr>
		<tr><td><code>autoSplatCenterY</code></td><td>0.5</td></tr>
		<tr><td><code>autoSplatBandHeight</code></td><td>0.8</td></tr>
		<tr><td><code>autoSplatSwirl</code></td><td>600</td></tr>
		<tr><td><code>presetSplats</code></td><td>8 tangential ring jets</td></tr>
	</tbody>
</table>

<hr />

<h2 id="svgpathfluid">SvgPathFluid</h2>

<p>Fluid flowing inside a bold ampersand "&amp;" glyph, demonstrating text-mode container shapes. The letter is rasterized to a mask texture via Canvas 2D <code>fillText</code>, with <code>evenodd</code> fill rule so the counter (hole) in the glyph stays transparent.</p>

<p><strong>Container shape:</strong> <code>svgPath</code> (text: "&amp;", font: "bold 200px Georgia, serif", fillRule: "evenodd").</p>

<pre><code>&lt;SvgPathFluid /&gt;</code></pre>

<table>
	<thead>
		<tr>
			<th>Prop</th>
			<th>Value</th>
		</tr>
	</thead>
	<tbody>
		<tr><td><code>curl</code></td><td>30</td></tr>
		<tr><td><code>densityDissipation</code></td><td>0.3</td></tr>
		<tr><td><code>velocityDissipation</code></td><td>0.1</td></tr>
		<tr><td><code>pressure</code></td><td>0.8</td></tr>
		<tr><td><code>splatRadius</code></td><td>0.3</td></tr>
		<tr><td><code>splatForce</code></td><td>5000</td></tr>
		<tr><td><code>shading</code></td><td>true</td></tr>
		<tr><td><code>colorful</code></td><td>true</td></tr>
		<tr><td><code>bloom</code></td><td>true</td></tr>
		<tr><td><code>bloomIntensity</code></td><td>0.9</td></tr>
		<tr><td><code>sunrays</code></td><td>false</td></tr>
		<tr><td><code>backColor</code></td><td>{LB} r: 2, g: 2, b: 8 {RB}</td></tr>
		<tr><td><code>initialSplatCount</code></td><td>8</td></tr>
		<tr><td><code>autoSplatRate</code></td><td>0.8</td></tr>
		<tr><td><code>autoSplatCount</code></td><td>1</td></tr>
		<tr><td><code>autoSplatBandHeight</code></td><td>2.0</td></tr>
		<tr><td><code>autoSplatSwirl</code></td><td>400</td></tr>
	</tbody>
</table>

<hr />

<h2 id="gasflare">GasFlare</h2>

<p>A natural-gas flare plume from a short exit nozzle. A hot vertical jet enters through a physical slot, entrains surrounding fluid, rolls into shear-layer vortices, and rises under temperature-scalar buoyancy with a fire transfer ramp.</p>

<p><strong>Obstructions:</strong> two lower slabs form the left and right walls of a flare stack, leaving a center nozzle slot open. The top and side edges drain the plume so hot content can vent instead of saturating the canvas.</p>

<p><strong>Honest physics note:</strong> this is an incompressible jet/plume simulation with advected heat scalar and buoyancy. It does not model combustion chemistry, compressibility, soot, radiation, or heat release.</p>

<pre><code>&lt;GasFlare /&gt;</code></pre>

<table>
	<thead>
		<tr>
			<th>Prop</th>
			<th>Value</th>
		</tr>
	</thead>
	<tbody>
		<tr><td><code>curl</code></td><td>16</td></tr>
		<tr><td><code>densityDissipation</code></td><td>0.42</td></tr>
		<tr><td><code>initialDensityDissipation</code></td><td>0.55</td></tr>
		<tr><td><code>velocityDissipation</code></td><td>0.055</td></tr>
		<tr><td><code>pressure</code></td><td>0.85</td></tr>
		<tr><td><code>pressureIterations</code></td><td>24</td></tr>
		<tr><td><code>splatRadius</code></td><td>0.06</td></tr>
		<tr><td><code>splatForce</code></td><td>3800</td></tr>
		<tr><td><code>shading</code></td><td>false</td></tr>
		<tr><td><code>colorful</code></td><td>false</td></tr>
		<tr><td><code>bloom</code></td><td>true</td></tr>
		<tr><td><code>bloomIterations</code></td><td>5</td></tr>
		<tr><td><code>bloomResolution</code></td><td>192</td></tr>
		<tr><td><code>bloomThreshold</code></td><td>0.48</td></tr>
		<tr><td><code>bloomIntensity</code></td><td>1.0</td></tr>
		<tr><td><code>sunrays</code></td><td>false</td></tr>
		<tr><td><code>sunraysWeight</code></td><td>0</td></tr>
		<tr><td><code>simResolution</code></td><td>160</td></tr>
		<tr><td><code>dyeResolution</code></td><td>768</td></tr>
		<tr><td><code>backColor</code></td><td>{LB} r: 6, g: 6, b: 8 {RB}</td></tr>
		<tr><td><code>initialSplatCount</code></td><td>0</td></tr>
		<tr><td><code>obstructions</code></td><td>2 flare-stack wall slabs around a center slot</td></tr>
		<tr><td><code>flow</code></td><td>live vertical hot-gas jet + crosswind source + top/side outlets + temperature-buoyancy fire visualization</td></tr>
	</tbody>
</table>

<hr />

<h2 id="venturi">Venturi</h2>

<p>Bernoulli's principle made visible. A gentle left-to-right body force acts like a pressure gradient, pushing fluid through a wide channel that is squeezed through a central throat formed by two concave obstruction islands. The visualization colors the velocity-magnitude field with a CFD-style blue→cyan→green→yellow→red ramp so the throat acceleration is readable instead of appearing as a uniform center jet.</p>

<p><strong>Obstructions:</strong> two concave islands (top + bottom) pinching a horizontal channel from a wide inlet to a ~5.3:1 contraction at the throat. Open left/right boundaries let the inlet feed throughflow while the solid obstruction mask forms the throat; laminar (<code>curl</code> 0) so the streamlines stay ordered.</p>

<p><strong>Honest physics note:</strong> the throat speed-up is an incompressible, low-speed effect and belongs in the live solver. Pressure/density changes from compressible gas flow are not modeled.</p>

<pre><code>&lt;Venturi /&gt;</code></pre>

<table>
	<thead>
		<tr>
			<th>Prop</th>
			<th>Value</th>
		</tr>
	</thead>
	<tbody>
		<tr><td><code>curl</code></td><td>0</td></tr>
		<tr><td><code>densityDissipation</code></td><td>0.35</td></tr>
		<tr><td><code>velocityDissipation</code></td><td>0.09</td></tr>
		<tr><td><code>maxTimeStep</code></td><td>1 / 60</td></tr>
		<tr><td><code>substeps</code></td><td>1</td></tr>
		<tr><td><code>viscosity</code></td><td>0.016</td></tr>
		<tr><td><code>viscosityIterations</code></td><td>5</td></tr>
		<tr><td><code>wallFriction</code></td><td>0.16</td></tr>
		<tr><td><code>wallFrictionWidth</code></td><td>2</td></tr>
		<tr><td><code>pressure</code></td><td>0.9</td></tr>
		<tr><td><code>pressureIterations</code></td><td>26</td></tr>
		<tr><td><code>splatRadius</code></td><td>0.055</td></tr>
		<tr><td><code>splatForce</code></td><td>6000</td></tr>
		<tr><td><code>shading</code></td><td>false</td></tr>
		<tr><td><code>colorful</code></td><td>false</td></tr>
		<tr><td><code>bloom</code></td><td>false</td></tr>
		<tr><td><code>bloomThreshold</code></td><td>0.6</td></tr>
		<tr><td><code>bloomIntensity</code></td><td>0.5</td></tr>
		<tr><td><code>sunrays</code></td><td>false</td></tr>
		<tr><td><code>simResolution</code></td><td>160</td></tr>
		<tr><td><code>dyeResolution</code></td><td>512</td></tr>
		<tr><td><code>backColor</code></td><td>{LB} r: 6, g: 10, b: 14 {RB}</td></tr>
		<tr><td><code>initialSplatCount</code></td><td>0</td></tr>
		<tr><td><code>obstructions</code></td><td>2 concave throat islands (top + bottom)</td></tr>
		<tr><td><code>flow</code></td><td><code>pressureGradient</code> body-force drive + velocity-draining outlet + <code>transfer: 'cfd'</code> speed visualization, range [0, 170], scale 1.12</td></tr>
	</tbody>
</table>

<hr />

<h2 id="riverdelta">RiverDelta</h2>

<p>A wide, muted river entering from the left edge and braiding around a chain of staggered teardrop islands. The flow can't go straight through, so continuity routes the flux through the open channels between islands; a slow current (~120 px/s) carries frequent multicolor tracer packets that make the braided paths visible.</p>

<p><strong>Obstructions:</strong> five teardrop islands (each pointed upstream) staggered across x and y, instanced from one path via <code>offset</code>/<code>scale</code>. All canvas edges are open, with four-edge dye drains so the wide left-edge inlet can braid around the islands and leave through any border.</p>

<p><strong>Honest physics note:</strong> the branching around islands is solver-native routing through blocked channels, but this is still a qualitative visualization, not sediment transport or free-surface river physics.</p>

<pre><code>&lt;RiverDelta /&gt;</code></pre>

<table>
	<thead>
		<tr>
			<th>Prop</th>
			<th>Value</th>
		</tr>
	</thead>
	<tbody>
		<tr><td><code>curl</code></td><td>10</td></tr>
		<tr><td><code>densityDissipation</code></td><td>0.68</td></tr>
		<tr><td><code>velocityDissipation</code></td><td>0.07</td></tr>
		<tr><td><code>maxTimeStep</code></td><td>1 / 60</td></tr>
		<tr><td><code>substeps</code></td><td>1</td></tr>
		<tr><td><code>viscosity</code></td><td>0.012</td></tr>
		<tr><td><code>viscosityIterations</code></td><td>5</td></tr>
		<tr><td><code>wallFriction</code></td><td>0.12</td></tr>
		<tr><td><code>wallFrictionWidth</code></td><td>2</td></tr>
		<tr><td><code>pressure</code></td><td>0.9</td></tr>
		<tr><td><code>pressureIterations</code></td><td>24</td></tr>
		<tr><td><code>splatRadius</code></td><td>0.08</td></tr>
		<tr><td><code>splatForce</code></td><td>6000</td></tr>
		<tr><td><code>shading</code></td><td>false</td></tr>
		<tr><td><code>colorful</code></td><td>false</td></tr>
		<tr><td><code>bloom</code></td><td>false</td></tr>
		<tr><td><code>sunrays</code></td><td>false</td></tr>
		<tr><td><code>simResolution</code></td><td>160</td></tr>
		<tr><td><code>dyeResolution</code></td><td>640</td></tr>
		<tr><td><code>backColor</code></td><td>{LB} r: 4, g: 9, b: 10 {RB}</td></tr>
		<tr><td><code>initialSplatCount</code></td><td>0</td></tr>
		<tr><td><code>obstructions</code></td><td>5 staggered teardrop islands</td></tr>
		<tr><td><code>flow</code></td><td>left-edge parabolic line inlet + four-edge dye drains</td></tr>
		<tr><td><code>autoSplatRate</code></td><td>2.6</td></tr>
		<tr><td><code>autoSplatCount</code></td><td>3</td></tr>
		<tr><td><code>autoSplatColor</code></td><td>null (fresh hue per tracer packet)</td></tr>
		<tr><td><code>autoSplatVelocityX</code></td><td>120</td></tr>
		<tr><td><code>autoSplatCenterX</code></td><td>0.035</td></tr>
		<tr><td><code>autoSplatBandWidth</code></td><td>0.03</td></tr>
		<tr><td><code>autoSplatBandHeight</code></td><td>0.84</td></tr>
		<tr><td><code>presetSplats</code></td><td>4 muted left-edge startup jets</td></tr>
	</tbody>
</table>

<hr />

<h2 id="teslavalve">TeslaValve</h2>

<p>A passive Tesla-valve-like channel with a straight conduit and patent-style alternating bypass loops. A pressure-gradient drive carries discrete multicolor left-edge splats through a high-viscosity channel, making dye packets and side-bucket recirculation easier to inspect; forward throughflow is expected.</p>

<p><strong>Geometry:</strong> a cropped reference SVG path defines the conduit, side-channel buckets, and internal slots as one even-odd container mask. The filled SVG region is the physical fluid domain, so the slots and walls are solved as part of the same boundary.</p>

<p><strong>Honest physics note:</strong> this is a live incompressible throughflow visualization, not a hard-stop check valve. It gives plausible routing, separation, and recirculation cues, but it does not calculate a reverse/forward pressure-drop ratio or real valve rectification.</p>

<pre><code>&lt;TeslaValve /&gt;</code></pre>

<table>
	<thead>
		<tr>
			<th>Prop</th>
			<th>Value</th>
		</tr>
	</thead>
	<tbody>
		<tr><td><code>curl</code></td><td>10</td></tr>
		<tr><td><code>densityDissipation</code></td><td>0.36</td></tr>
		<tr><td><code>velocityDissipation</code></td><td>0.085</td></tr>
		<tr><td><code>maxTimeStep</code></td><td>1 / 60</td></tr>
		<tr><td><code>substeps</code></td><td>1</td></tr>
		<tr><td><code>viscosity</code></td><td>0.04</td></tr>
		<tr><td><code>viscosityIterations</code></td><td>10</td></tr>
		<tr><td><code>wallFriction</code></td><td>0.14</td></tr>
		<tr><td><code>wallFrictionWidth</code></td><td>2</td></tr>
		<tr><td><code>pressure</code></td><td>0.9</td></tr>
		<tr><td><code>pressureIterations</code></td><td>30</td></tr>
		<tr><td><code>splatRadius</code></td><td>0.085</td></tr>
		<tr><td><code>splatForce</code></td><td>6000</td></tr>
		<tr><td><code>autoSplatRate</code></td><td>5</td></tr>
		<tr><td><code>autoSplatCount</code></td><td>4</td></tr>
		<tr><td><code>autoSplatVelocityX</code></td><td>190</td></tr>
		<tr><td><code>autoSplatCenterX</code></td><td>0.035</td></tr>
		<tr><td><code>autoSplatBandWidth</code></td><td>0.024</td></tr>
		<tr><td><code>autoSplatCenterY</code></td><td>0.49</td></tr>
		<tr><td><code>autoSplatBandHeight</code></td><td>0.18</td></tr>
		<tr><td><code>shading</code></td><td>false</td></tr>
		<tr><td><code>colorful</code></td><td>false</td></tr>
		<tr><td><code>bloom</code></td><td>false</td></tr>
		<tr><td><code>simResolution</code></td><td>192</td></tr>
		<tr><td><code>dyeResolution</code></td><td>768</td></tr>
		<tr><td><code>backColor</code></td><td>{LB} r: 5, g: 9, b: 12 {RB}</td></tr>
		<tr><td><code>initialSplatCount</code></td><td>0</td></tr>
		<tr><td><code>containerShape</code></td><td>reference SVG conduit + even-odd internal slots</td></tr>
		<tr><td><code>maskResolution</code></td><td>2048</td></tr>
		<tr><td><code>flow</code></td><td>pressure-gradient drive + right-edge outlet</td></tr>
		<tr><td><code>presetSplats</code></td><td>none</td></tr>
	</tbody>
</table>

<hr />

<h2>Overriding Preset Props</h2>

	<p>
		Presets hard-code their physics and visual props internally. However, each preset forwards
		sizing props (<code>width</code>, <code>height</code>), styling props (<code>class</code>,
		<code>style</code>), <code>seed</code>, <code>lazy</code>, <code>splatOnHover</code>,
		<code>aria-label</code>, and <code>backColor</code> directly to the underlying
		<code>&lt;Fluid&gt;</code> component. Flow-scene presets also forward
		<code>pointerInput</code>.
	</p>

<p>
	If you need to override a pinned physics prop, you have two options:
</p>

<ul>
	<li>Use the base <code>&lt;Fluid&gt;</code> component directly and copy the preset's prop values as a starting point, changing what you need.</li>
	<li>Fork the preset source file into your own component — preset source is short (typically under 100 lines) and self-contained.</li>
</ul>

<p>
	Some presets expose additional props beyond the common set. For example,
	<code>&lt;FrameFluid&gt;</code> accepts <code>innerCornerRadius</code> and
	<code>outerCornerRadius</code>. Check the preset's exported type for the full list.
</p>
