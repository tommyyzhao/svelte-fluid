<script lang="ts">
	const SCRIPT_OPEN = '<' + 'script lang="ts">';
	const SCRIPT_CLOSE = '</' + 'script>';
	const LB = '{';
	const RB = '}';
</script>

<svelte:head>
	<title>Presets — svelte-fluid</title>
	<meta name="description" content="Ten opinionated Fluid wrappers with tuned physics and visuals — drop in with zero config." />
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
	<code>style</code>, <code>seed</code>, <code>lazy</code>, and <code>aria-label</code> props
	for sizing, styling, and accessibility. Some also accept <code>splatOnHover</code>.
</p>

<hr />

<h2>LavaLamp</h2>

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

<h2>Plasma</h2>

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
		<tr><td><code>randomSplatRate</code></td><td>0.4</td></tr>
		<tr><td><code>randomSplatCount</code></td><td>4</td></tr>
		<tr><td><code>randomSplatSpawnY</code></td><td>0.5</td></tr>
		<tr><td><code>presetSplats</code></td><td>8 inward compass jets</td></tr>
	</tbody>
</table>

<hr />

<h2>InkInWater</h2>

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
		<tr><td><code>randomSplatRate</code></td><td>0.2</td></tr>
		<tr><td><code>randomSplatColor</code></td><td>{LB} r: 0.06, g: 0.07, b: 0.50 {RB}</td></tr>
		<tr><td><code>randomSplatDx</code></td><td>0</td></tr>
		<tr><td><code>randomSplatDy</code></td><td>-180</td></tr>
		<tr><td><code>randomSplatSpawnY</code></td><td>0.90</td></tr>
		<tr><td><code>presetSplats</code></td><td>5 ink droplets near the top</td></tr>
	</tbody>
</table>

<hr />

<h2>FrozenSwirl</h2>

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

<h2>Aurora</h2>

<p>Northern lights — green, magenta, and pale-blue ribbons drifting laterally across a deep night sky. Heavy bloom and sunrays produce the characteristic atmospheric glow that slowly grows over time.</p>

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

<h2>ToroidalTempest</h2>

<p>A violent full-spectrum storm circulating in a toroidal ring. Eight high-velocity dye blobs orbit inside an annular container with fierce counter-clockwise flow. Periodic re-injection every 2 seconds keeps the ring fed with fresh color.</p>

<p><strong>Container shape:</strong> <code>annulus</code> (cx: 0.5, cy: 0.5, innerRadius: 0.15, outerRadius: 0.42).</p>

<pre><code>&lt;ToroidalTempest /&gt;</code></pre>

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
		<tr><td><code>bloomThreshold</code></td><td>0.5</td></tr>
		<tr><td><code>bloomIntensity</code></td><td>1.8</td></tr>
		<tr><td><code>sunrays</code></td><td>true</td></tr>
		<tr><td><code>sunraysWeight</code></td><td>0.6</td></tr>
		<tr><td><code>backColor</code></td><td>{LB} r: 2, g: 2, b: 10 {RB}</td></tr>
		<tr><td><code>initialSplatCount</code></td><td>0</td></tr>
		<tr><td><code>presetSplats</code></td><td>8 tangential ring splats at 45-degree intervals</td></tr>
	</tbody>
</table>

<hr />

<h2>CircularFluid</h2>

<p>Vivid swirling fluid contained inside a circle. Eight inward jets converge from the compass points, and the circular boundary reflects them back inward to produce a self-sustaining vortex. Continuous random splats with orbital swirl sustain the motion.</p>

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
		<tr><td><code>randomSplatRate</code></td><td>1.2</td></tr>
		<tr><td><code>randomSplatCount</code></td><td>1</td></tr>
		<tr><td><code>randomSplatSpawnY</code></td><td>0.5</td></tr>
		<tr><td><code>randomSplatSpread</code></td><td>0.8</td></tr>
		<tr><td><code>randomSplatSwirl</code></td><td>500</td></tr>
		<tr><td><code>presetSplats</code></td><td>8 inward compass jets</td></tr>
	</tbody>
</table>

<hr />

<h2>FrameFluid</h2>

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
		<tr><td><code>randomSplatRate</code></td><td>0.5</td></tr>
		<tr><td><code>randomSplatCount</code></td><td>6</td></tr>
		<tr><td><code>randomSplatSpawnY</code></td><td>0.5</td></tr>
		<tr><td><code>randomSplatSpread</code></td><td>2.0</td></tr>
		<tr><td><code>randomSplatSwirl</code></td><td>300</td></tr>
		<tr><td><code>presetSplats</code></td><td>4 edge jets + 4 corner jets</td></tr>
	</tbody>
</table>

<hr />

<h2>AnnularFluid</h2>

<p>A ring-vortex of fluid contained between two concentric circles. Eight tangential jets establish a counter-clockwise ring vortex. Continuous random splats with orbital swirl sustain the motion.</p>

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
		<tr><td><code>randomSplatRate</code></td><td>0.5</td></tr>
		<tr><td><code>randomSplatCount</code></td><td>5</td></tr>
		<tr><td><code>randomSplatSpawnY</code></td><td>0.5</td></tr>
		<tr><td><code>randomSplatSpread</code></td><td>0.8</td></tr>
		<tr><td><code>randomSplatSwirl</code></td><td>600</td></tr>
		<tr><td><code>presetSplats</code></td><td>8 tangential ring jets</td></tr>
	</tbody>
</table>

<hr />

<h2>SvgPathFluid</h2>

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
		<tr><td><code>randomSplatRate</code></td><td>0.8</td></tr>
		<tr><td><code>randomSplatCount</code></td><td>1</td></tr>
		<tr><td><code>randomSplatSpread</code></td><td>2.0</td></tr>
		<tr><td><code>randomSplatSwirl</code></td><td>400</td></tr>
	</tbody>
</table>

<hr />

<h2>Overriding Preset Props</h2>

<p>
	Presets hard-code their physics and visual props internally. However, each preset forwards
	sizing props (<code>width</code>, <code>height</code>), styling props (<code>class</code>,
	<code>style</code>), <code>seed</code>, <code>lazy</code>, and <code>aria-label</code> directly
	to the underlying <code>&lt;Fluid&gt;</code> component.
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
	<code>outerCornerRadius</code>, and several shape presets accept <code>splatOnHover</code>.
	Check the preset's exported type for the full list.
</p>
