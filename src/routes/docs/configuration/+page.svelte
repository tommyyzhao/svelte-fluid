<script lang="ts">
	import { base } from '$app/paths';
</script>

<svelte:head>
	<title>Configuration — svelte-fluid</title>
	<meta name="description" content="Complete prop reference for the FluidConfig interface in svelte-fluid." />
</svelte:head>

<h1>Configuration</h1>
<p class="subtitle">
	Full prop reference for <code>FluidConfig</code>. Every field is optional — the engine fills in
	defaults at construction time. Pass these as props to <code>&lt;Fluid&gt;</code> or any preset component.
</p>

<!-- ================================================================ -->
<h2>Simulation</h2>
<p>Core physics parameters that control grid resolution, dissipation, and solver behavior.</p>

<table>
	<thead>
		<tr>
			<th>Prop</th>
			<th>Type</th>
			<th>Default</th>
			<th>Description</th>
		</tr>
	</thead>
	<tbody>
		<tr>
			<td><code>simResolution</code></td>
			<td><code>number</code></td>
			<td><code>128</code></td>
			<td>Velocity grid resolution.</td>
		</tr>
		<tr>
			<td><code>dyeResolution</code></td>
			<td><code>number</code></td>
			<td><code>1024</code></td>
			<td>Dye grid resolution. Clamped to 512 if linear filtering is unsupported.</td>
		</tr>
		<tr>
			<td><code>densityDissipation</code></td>
			<td><code>number</code></td>
			<td><code>1</code></td>
			<td>How fast dye fades.</td>
		</tr>
		<tr>
			<td><code>initialDensityDissipation</code></td>
			<td><code>number</code></td>
			<td>same as <code>densityDissipation</code></td>
			<td>Starting dissipation value, ramped to <code>densityDissipation</code> over the duration. No ramp by default.</td>
		</tr>
		<tr>
			<td><code>initialDensityDissipationDuration</code></td>
			<td><code>number</code></td>
			<td><code>0</code></td>
			<td>Seconds over which to ramp from initial to steady dissipation. 0 disables the ramp.</td>
		</tr>
		<tr>
			<td><code>velocityDissipation</code></td>
			<td><code>number</code></td>
			<td><code>0.2</code></td>
			<td>How fast velocity fades.</td>
		</tr>
		<tr>
			<td><code>pressure</code></td>
			<td><code>number</code></td>
			<td><code>0.8</code></td>
			<td>Pressure solver weight.</td>
		</tr>
		<tr>
			<td><code>pressureIterations</code></td>
			<td><code>number</code></td>
			<td><code>20</code></td>
			<td>Pressure solver iterations per frame.</td>
		</tr>
		<tr>
			<td><code>curl</code></td>
			<td><code>number</code></td>
			<td><code>30</code></td>
			<td>Vorticity confinement strength.</td>
		</tr>
	</tbody>
</table>

<!-- ================================================================ -->
<h2>Splats</h2>
<p>Control how pointer-driven splats are created.</p>

<table>
	<thead>
		<tr>
			<th>Prop</th>
			<th>Type</th>
			<th>Default</th>
			<th>Description</th>
		</tr>
	</thead>
	<tbody>
		<tr>
			<td><code>splatRadius</code></td>
			<td><code>number</code></td>
			<td><code>0.25</code></td>
			<td>Splat radius in NDC units.</td>
		</tr>
		<tr>
			<td><code>splatForce</code></td>
			<td><code>number</code></td>
			<td><code>6000</code></td>
			<td>Splat impulse force multiplier.</td>
		</tr>
		<tr>
			<td><code>splatOnHover</code></td>
			<td><code>boolean</code></td>
			<td><code>false</code></td>
			<td>Create splats on mouse move without requiring a click. No effect when <code>pointerInput</code> is false.</td>
		</tr>
		<tr>
			<td><code>pointerInput</code></td>
			<td><code>boolean</code></td>
			<td><code>true</code></td>
			<td>Enable mouse and touch input.</td>
		</tr>
		<tr>
			<td><code>pointerTarget</code></td>
			<td><code>'canvas' | 'window'</code></td>
			<td><code>'canvas'</code></td>
			<td>Where to attach pointer listeners. <code>'window'</code> drives the sim from pointer activity anywhere on the page.</td>
		</tr>
	</tbody>
</table>

<!-- ================================================================ -->
<h2>Visuals</h2>
<p>Shading, pointer color cycling, pause, and background.</p>

<table>
	<thead>
		<tr>
			<th>Prop</th>
			<th>Type</th>
			<th>Default</th>
			<th>Description</th>
		</tr>
	</thead>
	<tbody>
		<tr>
			<td><code>shading</code></td>
			<td><code>boolean</code></td>
			<td><code>true</code></td>
			<td>3D-style shading effect.</td>
		</tr>
		<tr>
			<td><code>colorful</code></td>
			<td><code>boolean</code></td>
			<td><code>true</code></td>
			<td>Rotate pointer/touch splat colors over time. Does not change hand-authored <code>presetSplats</code>.</td>
		</tr>
		<tr>
			<td><code>colorUpdateSpeed</code></td>
			<td><code>number</code></td>
			<td><code>10</code></td>
			<td>Pointer/touch color rotation rate (1/seconds). Only matters when <code>colorful</code> is true.</td>
		</tr>
		<tr>
			<td><code>paused</code></td>
			<td><code>boolean</code></td>
			<td><code>false</code></td>
			<td>Pause the simulation step. Rendering still occurs.</td>
		</tr>
		<tr>
			<td><code>backColor</code></td>
			<td><code>RGB</code></td>
			<td><code>{'{ r: 0, g: 0, b: 0 }'}</code></td>
			<td>Background color in 0-255 RGB (CSS-style). Normalized internally before reaching the shader.</td>
		</tr>
		<tr>
			<td><code>transparent</code></td>
			<td><code>boolean</code></td>
			<td><code>false</code></td>
			<td>Render with a transparent background.</td>
		</tr>
	</tbody>
</table>

<!-- ================================================================ -->
<h2>Bloom</h2>
<p>Post-processing glow effect.</p>

<table>
	<thead>
		<tr>
			<th>Prop</th>
			<th>Type</th>
			<th>Default</th>
			<th>Description</th>
		</tr>
	</thead>
	<tbody>
		<tr>
			<td><code>bloom</code></td>
			<td><code>boolean</code></td>
			<td><code>true</code></td>
			<td>Enable bloom effect.</td>
		</tr>
		<tr>
			<td><code>bloomIterations</code></td>
			<td><code>number</code></td>
			<td><code>8</code></td>
			<td>Bloom blur iterations.</td>
		</tr>
		<tr>
			<td><code>bloomResolution</code></td>
			<td><code>number</code></td>
			<td><code>256</code></td>
			<td>Bloom framebuffer resolution.</td>
		</tr>
		<tr>
			<td><code>bloomIntensity</code></td>
			<td><code>number</code></td>
			<td><code>0.8</code></td>
			<td>Bloom intensity multiplier.</td>
		</tr>
		<tr>
			<td><code>bloomThreshold</code></td>
			<td><code>number</code></td>
			<td><code>0.6</code></td>
			<td>Luminance threshold for bloom.</td>
		</tr>
		<tr>
			<td><code>bloomSoftKnee</code></td>
			<td><code>number</code></td>
			<td><code>0.7</code></td>
			<td>Bloom soft-knee curve.</td>
		</tr>
	</tbody>
</table>

<!-- ================================================================ -->
<h2>Sunrays</h2>
<p>Volumetric light ray effect.</p>

<table>
	<thead>
		<tr>
			<th>Prop</th>
			<th>Type</th>
			<th>Default</th>
			<th>Description</th>
		</tr>
	</thead>
	<tbody>
		<tr>
			<td><code>sunrays</code></td>
			<td><code>boolean</code></td>
			<td><code>true</code></td>
			<td>Enable sunrays effect.</td>
		</tr>
		<tr>
			<td><code>sunraysResolution</code></td>
			<td><code>number</code></td>
			<td><code>196</code></td>
			<td>Sunrays framebuffer resolution.</td>
		</tr>
		<tr>
			<td><code>sunraysWeight</code></td>
			<td><code>number</code></td>
			<td><code>1</code></td>
			<td>Sunrays intensity weight.</td>
		</tr>
	</tbody>
</table>

<!-- ================================================================ -->
<h2>Initial Splats</h2>
<p>Splats created once at engine construction. These are construct-only (Bucket D) — changing them at runtime has no effect.</p>

<table>
	<thead>
		<tr>
			<th>Prop</th>
			<th>Type</th>
			<th>Default</th>
			<th>Description</th>
		</tr>
	</thead>
	<tbody>
		<tr>
			<td><code>initialSplatCountMin</code></td>
			<td><code>number</code></td>
			<td><code>5</code></td>
			<td>Minimum number of initial random splats.</td>
		</tr>
		<tr>
			<td><code>initialSplatCountMax</code></td>
			<td><code>number</code></td>
			<td><code>25</code></td>
			<td>Maximum number of initial random splats.</td>
		</tr>
		<tr>
			<td><code>initialSplatCount</code></td>
			<td><code>number | undefined</code></td>
			<td>—</td>
			<td>Exact initial splat count. Overrides min/max when set.</td>
		</tr>
		<tr>
			<td><code>seed</code></td>
			<td><code>number</code></td>
			<td>auto-generated</td>
			<td>32-bit unsigned integer seed for the deterministic PRNG. Reused across resizes for consistent patterns.</td>
		</tr>
		<tr>
			<td><code>presetSplats</code></td>
			<td><code>PresetSplat[]</code></td>
			<td>—</td>
			<td>Hand-crafted splats applied after the random initial splats. Combine with <code>initialSplatCount: 0</code> to suppress random splats.</td>
		</tr>
	</tbody>
</table>

<!-- ================================================================ -->
<h2>Automatic Splats</h2>
<p>
	Automatic splat generation for ambient motion without pointer input.
	Think of it as a timer that injects small bursts of dye and velocity.
</p>

<table>
	<thead>
		<tr>
			<th>Prop</th>
			<th>Type</th>
			<th>Default</th>
			<th>Description</th>
		</tr>
	</thead>
	<tbody>
		<tr>
			<td><code>autoSplatRate</code></td>
			<td><code>number</code></td>
			<td><code>0</code></td>
			<td>Automatic burst rate in splats per second. 0 = disabled.</td>
		</tr>
		<tr>
			<td><code>autoSplatCount</code></td>
			<td><code>number</code></td>
			<td><code>1</code></td>
			<td>Number of splats emitted each automatic burst.</td>
		</tr>
		<tr>
			<td><code>autoSplatColor</code></td>
			<td><code>RGB | null</code></td>
			<td><code>null</code></td>
			<td>Fixed color for automatic splats (0-1 linear range). <code>null</code> = fresh random color per splat.</td>
		</tr>
		<tr>
			<td><code>autoSplatVelocityX</code></td>
			<td><code>number</code></td>
			<td><code>0</code></td>
			<td>X velocity for automatic splats (raw, not scaled by <code>splatForce</code>). Ignored when <code>autoSplatSwirl</code> is nonzero.</td>
		</tr>
		<tr>
			<td><code>autoSplatVelocityY</code></td>
			<td><code>number</code></td>
			<td><code>0</code></td>
			<td>Y velocity for automatic splats (raw). Negative = downward in DOM. Ignored when <code>autoSplatSwirl</code> is nonzero.</td>
		</tr>
		<tr>
			<td><code>autoSplatCenterY</code></td>
			<td><code>number</code></td>
			<td><code>0.5</code></td>
			<td>Vertical center of the spawn band: <code>0</code> = bottom, <code>0.5</code> = center, <code>1</code> = top.</td>
		</tr>
		<tr>
			<td><code>autoSplatEvenX</code></td>
			<td><code>boolean</code></td>
			<td><code>false</code></td>
			<td>Within each burst, use equal x positions such as 25%, 50%, 75% instead of random x positions.</td>
		</tr>
		<tr>
			<td><code>autoSplatSwirl</code></td>
			<td><code>number</code></td>
			<td><code>0</code></td>
			<td>Orbital velocity around the container/canvas center. Positive = counter-clockwise; negative = clockwise.</td>
		</tr>
		<tr>
			<td><code>autoSplatBandHeight</code></td>
			<td><code>number</code></td>
			<td><code>0.1</code></td>
			<td>Height of the spawn band. <code>0</code> = one horizontal line, <code>0.1</code> = ±5%, <code>2.0</code> = full canvas.</td>
		</tr>
	</tbody>
</table>

<!-- ================================================================ -->
<h2>Container</h2>
<p>Confine the simulation to a geometric shape. The boundary is physically enforced, not just a visual clip.</p>

<table>
	<thead>
		<tr>
			<th>Prop</th>
			<th>Type</th>
			<th>Default</th>
			<th>Description</th>
		</tr>
	</thead>
	<tbody>
		<tr>
			<td><code>containerShape</code></td>
			<td><code>ContainerShape | null</code></td>
			<td><code>null</code></td>
			<td>Shape constraint for the fluid. Supports <code>circle</code>, <code>frame</code>, <code>roundedRect</code>, <code>annulus</code>, and <code>svgPath</code>. <code>null</code> = full rectangle.</td>
		</tr>
		<tr>
			<td><code>openBoundary</code></td>
			<td><code>boolean</code></td>
			<td><code>false</code></td>
			<td>When true, fluid flows freely at boundaries instead of bouncing back. Shape becomes a visual crop, not a physical wall.</td>
		</tr>
	</tbody>
</table>

<!-- ================================================================ -->
<h2>Glass</h2>
<p>Simulates a glass vessel effect with refraction and specular highlights. Requires a <code>containerShape</code>.</p>

<table>
	<thead>
		<tr>
			<th>Prop</th>
			<th>Type</th>
			<th>Default</th>
			<th>Description</th>
		</tr>
	</thead>
	<tbody>
		<tr>
			<td><code>glass</code></td>
			<td><code>boolean</code></td>
			<td><code>false</code></td>
			<td>Enable glass vessel post-processing. Ignored when <code>containerShape</code> is null.</td>
		</tr>
		<tr>
			<td><code>glassThickness</code></td>
			<td><code>number</code></td>
			<td><code>0.04</code></td>
			<td>Wall thickness in UV units. Controls how wide the refraction band is at the boundary.</td>
		</tr>
		<tr>
			<td><code>glassRefraction</code></td>
			<td><code>number</code></td>
			<td><code>0.4</code></td>
			<td>Refraction strength, 0-1. Mapped internally to IOR 1.0-2.0.</td>
		</tr>
		<tr>
			<td><code>glassReflectivity</code></td>
			<td><code>number</code></td>
			<td><code>0.12</code></td>
			<td>Specular reflectivity (Fresnel F0), 0-1. 0 = matte, 1 = mirror.</td>
		</tr>
		<tr>
			<td><code>glassChromatic</code></td>
			<td><code>number</code></td>
			<td><code>0.15</code></td>
			<td>Chromatic aberration strength, 0-1. Splits refraction into R/G/B for prismatic fringes.</td>
		</tr>
	</tbody>
</table>

<!-- ================================================================ -->
<h2>Reveal</h2>
<p>Dye acts as an opacity mask — scratch to reveal content behind. Colors are in 0-1 linear range.</p>

<table>
	<thead>
		<tr>
			<th>Prop</th>
			<th>Type</th>
			<th>Default</th>
			<th>Description</th>
		</tr>
	</thead>
	<tbody>
		<tr>
			<td><code>reveal</code></td>
			<td><code>boolean</code></td>
			<td><code>false</code></td>
			<td>Enable reveal mode. Dye becomes a transparency mask with iridescent fringes.</td>
		</tr>
		<tr>
			<td><code>revealSensitivity</code></td>
			<td><code>number</code></td>
			<td><code>0.1</code></td>
			<td>Multiplier on dye intensity before the power curve. Higher = easier reveal.</td>
		</tr>
		<tr>
			<td><code>revealCurve</code></td>
			<td><code>number</code></td>
			<td><code>0.5</code></td>
			<td>Power exponent for reveal alpha. Higher = crisper edge, lower = softer gradient.</td>
		</tr>
		<tr>
			<td><code>revealCoverColor</code></td>
			<td><code>RGB</code></td>
			<td><code>{'{ r: 1, g: 1, b: 1 }'}</code></td>
			<td>Cover layer color (0-1 linear). Visible before scratching.</td>
		</tr>
		<tr>
			<td><code>revealAccentColor</code></td>
			<td><code>RGB</code></td>
			<td><code>{'{ r: 0.05, g: 0.16, b: 0.32 }'}</code></td>
			<td>Fringe accent color (0-1 linear). Shown between cover and revealed content.</td>
		</tr>
		<tr>
			<td><code>revealFringeColor</code></td>
			<td><code>RGB</code></td>
			<td><code>{'{ r: 0.6, g: 0.7, b: 0.85 }'}</code></td>
			<td>Outer fringe color (0-1 linear). Creates a two-tone fringe: cover → fringe → accent → transparent.</td>
		</tr>
	</tbody>
</table>

<!-- ================================================================ -->
<h2>Distortion</h2>
<p>Velocity field warps an underlying image like liquid glass. Mutually exclusive with <code>reveal</code>.</p>

<table>
	<thead>
		<tr>
			<th>Prop</th>
			<th>Type</th>
			<th>Default</th>
			<th>Description</th>
		</tr>
	</thead>
	<tbody>
		<tr>
			<td><code>distortion</code></td>
			<td><code>boolean</code></td>
			<td><code>false</code></td>
			<td>Enable distortion mode. Cursor movement ripples and warps the image.</td>
		</tr>
		<tr>
			<td><code>distortionPower</code></td>
			<td><code>number</code></td>
			<td><code>0.4</code></td>
			<td>How strongly velocity warps UV coordinates, 0-1.</td>
		</tr>
		<tr>
			<td><code>distortionImageUrl</code></td>
			<td><code>string</code></td>
			<td>—</td>
			<td>URL of the image to distort. Required when <code>distortion</code> is true. Loaded asynchronously.</td>
		</tr>
		<tr>
			<td><code>distortionFit</code></td>
			<td><code>'cover' | 'contain'</code></td>
			<td><code>'cover'</code></td>
			<td>How the image fits the canvas. <code>'cover'</code> fills and crops, <code>'contain'</code> fits within.</td>
		</tr>
		<tr>
			<td><code>distortionScale</code></td>
			<td><code>number</code></td>
			<td><code>1.0</code></td>
			<td>Image scale factor. Values &gt; 1 zoom out, &lt; 1 zoom in.</td>
		</tr>
		<tr>
			<td><code>distortionBleedX</code></td>
			<td><code>number</code></td>
			<td><code>0</code></td>
			<td>Horizontal bleed fraction (0-0.5). Canvas extends invisibly beyond visible area to prevent edge bounce.</td>
		</tr>
		<tr>
			<td><code>distortionBleedY</code></td>
			<td><code>number</code></td>
			<td><code>0</code></td>
			<td>Vertical bleed fraction (0-0.5). See <code>distortionBleedX</code>.</td>
		</tr>
	</tbody>
</table>

<!-- ================================================================ -->
<h2>Sticky</h2>
<p>Dye clings to a mask region by modulating physics. Composable with container shapes, bloom, sunrays, and glass. Mutually exclusive with reveal and distortion.</p>

<table>
	<thead>
		<tr>
			<th>Prop</th>
			<th>Type</th>
			<th>Default</th>
			<th>Description</th>
		</tr>
	</thead>
	<tbody>
		<tr>
			<td><code>sticky</code></td>
			<td><code>boolean</code></td>
			<td><code>false</code></td>
			<td>Enable sticky mode. Triggers mask texture rebuild.</td>
		</tr>
		<tr>
			<td><code>stickyMask</code></td>
			<td><code>StickyMask</code></td>
			<td>—</td>
			<td>Mask shape that dye sticks to. Supports text, SVG paths, or both. Required when <code>sticky</code> is true.</td>
		</tr>
		<tr>
			<td><code>stickyStrength</code></td>
			<td><code>number</code></td>
			<td><code>0.9</code></td>
			<td>How strongly dissipation is reduced on the mask, 0-1. 1 = dye never fades on mask.</td>
		</tr>
		<tr>
			<td><code>stickyPressure</code></td>
			<td><code>number</code></td>
			<td><code>0.15</code></td>
			<td>Artificial pressure on the mask to push fluid around the shape.</td>
		</tr>
		<tr>
			<td><code>stickyAmplify</code></td>
			<td><code>number</code></td>
			<td><code>0.3</code></td>
			<td>Splat intensity multiplier on the mask region. Higher = more dye deposited.</td>
		</tr>
	</tbody>
</table>

<!-- ================================================================ -->
<h2>Obstructions</h2>
<p>Interior obstacles the fluid flows around — the inverse of <code>containerShape</code>, and orthogonal to it. See the <a href="{base}/docs/shapes#obstructions">Container Shapes</a> page for the <code>Obstruction</code> descriptor and behavior.</p>

<table>
	<thead>
		<tr>
			<th>Prop</th>
			<th>Type</th>
			<th>Default</th>
			<th>Description</th>
		</tr>
	</thead>
	<tbody>
		<tr>
			<td><code>obstructions</code></td>
			<td><code>ReadonlyArray&lt;Obstruction&gt;</code></td>
			<td><code>undefined</code></td>
			<td>Interior obstacles the fluid flows around. Union into one combined mask; allowed region is <code>container × (1 − obstruction)</code>. Changing it rebuilds the obstruction mask texture (Bucket C) and recompiles the display shader. Mutually exclusive with <code>distortion</code>.</td>
		</tr>
	</tbody>
</table>

<!-- ================================================================ -->
<h2>Hot-update buckets</h2>
<p>
	When props change at runtime, <code>setConfig()</code> classifies each field into one of four buckets
	that determine how the change takes effect:
</p>

<h3>Bucket A — Hot scalars</h3>
<p>
	Written directly to the internal config object and picked up on the next simulation frame.
	Zero overhead. Most numeric props live here: <code>densityDissipation</code>,
	<code>velocityDissipation</code>, <code>pressure</code>, <code>curl</code>,
	<code>splatRadius</code>, <code>splatForce</code>, <code>colorUpdateSpeed</code>,
	<code>bloomIntensity</code>, <code>sunraysWeight</code>, all <code>autoSplat*</code> props,
	all <code>glass*</code> scalars, all <code>reveal*</code> scalars, all <code>distortion*</code>
	scalars, <code>stickyStrength</code>, <code>stickyPressure</code>, <code>stickyAmplify</code>,
	<code>pointerTarget</code>, and <code>openBoundary</code>.
</p>

<h3>Bucket B — Keyword recompile</h3>
<p>
	Triggers a display shader recompile (~1 ms). Applies to feature toggles that change which
	GLSL code paths are active: <code>shading</code>, <code>bloom</code>, <code>sunrays</code>,
	<code>reveal</code>, and <code>distortion</code>.
</p>

<h3>Bucket C — FBO rebuild</h3>
<p>
	Triggers framebuffer reallocation. Applies to resolution fields: <code>simResolution</code>,
	<code>dyeResolution</code>, <code>bloomResolution</code>, <code>bloomIterations</code>,
	and <code>sunraysResolution</code>. Also triggered by <code>containerShape</code> changes
	(mask texture rebuild), <code>obstructions</code> changes (obstruction mask rebuild +
	display keyword recompile), and <code>glass</code> toggle (scene FBO alloc/dispose).
</p>

<h3>Bucket D — Construct-only</h3>
<p>
	Ignored by <code>setConfig()</code> after construction. These values are consumed once when the
	engine is created: <code>seed</code>, <code>initialSplatCountMin</code>,
	<code>initialSplatCountMax</code>, <code>initialSplatCount</code>, and <code>presetSplats</code>.
</p>
