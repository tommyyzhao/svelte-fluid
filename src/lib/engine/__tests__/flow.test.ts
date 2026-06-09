import { describe, it, expect } from 'vitest';
import engineSrc from '../FluidEngine.ts?raw';
import shadersSrc from '../shaders.ts?raw';

describe('flow source math', () => {
	function parabolic(t: number): number {
		const centered = t * 2 - 1;
		return Math.max(0, 1 - centered * centered);
	}

	it('parabolic line profile peaks at center and vanishes at edges', () => {
		expect(parabolic(0)).toBe(0);
		expect(parabolic(0.5)).toBe(1);
		expect(parabolic(1)).toBe(0);
		expect(parabolic(0.25)).toBeCloseTo(0.75);
	});
});

describe('flow outlet math', () => {
	function outlet(value: number, keep: number, gate: number): number {
		return value * (1 - gate) + value * keep * gate;
	}

	it('keeps target content outside the outlet and damps inside', () => {
		expect(outlet(2, 0, 0)).toBe(2);
		expect(outlet(2, 0, 1)).toBe(0);
		expect(outlet(2, 0.25, 1)).toBe(0.5);
	});

	it('batches multiple outlet gates with the same multiplicative damping as sequential passes', () => {
		const first = outlet(2, 0.5, 1);
		const second = outlet(first, 0.25, 1);
		expect(second).toBe(2 * 0.5 * 0.25);
		expect(shadersSrc).toContain('keepProduct *= mix(1.0, uKeep[i], gate);');
		expect(engineSrc).toContain('const FLOW_OUTLET_BATCH_SIZE = 4;');
		expect(engineSrc).toContain('private applyFlowOutletBatch');
		expect(engineSrc).not.toContain('private applyFlowOutlet(outlet: FlowOutlet');
	});
});

describe('flow boundary precedence', () => {
	it('uses per-edge flow boundaries as the authoritative divergence input', () => {
		expect(shadersSrc).not.toContain('uOpenBoundary');
		expect(shadersSrc).toContain('if (uOpenEdges.x < 0.5)');
		expect(engineSrc).toMatch(/kind === 'open'\s*\?\s*1\s*:\s*kind === 'wall'\s*\?\s*0\s*:\s*fallback/);
		expect(engineSrc).toContain('const fallback = this.config.OPEN_BOUNDARY ? 1 : 0;');
	});
});

describe('flow force math', () => {
	function buoyancy(scalar: number, ambient: number, strength: number, dt: number): number {
		return (scalar - ambient) * strength * dt;
	}

	it('uses scalar difference from ambient for buoyancy', () => {
		expect(buoyancy(0.8, 0.2, 100, 0.01)).toBeCloseTo(0.6);
		expect(buoyancy(0.1, 0.2, 100, 0.01)).toBeCloseTo(-0.1);
	});

	it('treats pressureGradient as a semantic velocity-space body force', () => {
		expect(engineSrc).toContain("force.kind === 'gravity' || force.kind === 'pressureGradient'");
		expect(engineSrc).toMatch(/uniforms\.uGravity[\s\S]*force\.vector\.x[\s\S]*force\.vector\.y/);
	});
});

describe('mask-aware projection shader wiring', () => {
	it('divergence, pressure, and gradient shaders sample the solid mask', () => {
		expect(shadersSrc.match(/uniform sampler2D uSolidMask/g)?.length).toBeGreaterThanOrEqual(3);
		// Neighbor solidity comes from the precomputed face-aperture texture
		// (epic 0001 1b): one RGBA fetch replaces four solidAt() probes.
		expect(shadersSrc).toContain('if (nb.x > 0.5) { L = -C.x; }');
		expect(shadersSrc).toContain('if (nb.x > 0.5) { L = C; }');
		expect(shadersSrc.match(/uniform sampler2D uSolidNeighbors/g)?.length).toBeGreaterThanOrEqual(3);
	});

	it('builds a combined binary solid mask from containers and obstructions', () => {
		expect(engineSrc).toContain('private solidMaskTexture: WebGLTexture | null = null;');
		expect(engineSrc).toContain('private initSolidMaskTexture(): void');
		expect(engineSrc).toContain('outsideContainer || insideObstruction ? 255 : 0');
		expect(engineSrc).toContain('containerMask(shape, uvX, uvY, aspect, containerCtx) < 0.5');
		expect(engineSrc).toContain('obstructionMask(uvX, uvY, obstructionCtx) >= 0.5');
		expect(engineSrc).toContain('const has = !!this.solidMaskTexture && !!this.solidNeighborTexture;');
	});
});

describe('flow visualization precedence', () => {
	it('keeps reveal and distortion authoritative over flow visualization', () => {
		expect(engineSrc).toContain(
			"return !!colorBy && colorBy !== 'dye' && !this.config.REVEAL && !this.config.DISTORTION;"
		);
		expect(engineSrc).toMatch(
			/if \(this\.flowVisualizationActive\(\)\) keywords\.push\('FLOW_VISUALIZATION'\);[\s\S]*if \(this\.config\.DISTORTION\) keywords\.push\('DISTORTION'\);[\s\S]*else if \(this\.config\.REVEAL\) keywords\.push\('REVEAL'\);/
		);
	});

	it('suppresses field overlays at solid mask seams while preserving antialiased display masks', () => {
		expect(shadersSrc).toContain('float flowMask = cmask;');
		expect(shadersSrc).toContain('flowMask *= smoothstep(0.75, 0.98, cmask);');
		expect(shadersSrc).toContain('float solidEdge = texture2D(uObstructionMask, solidUv).r;');
		expect(shadersSrc).toContain('float containerEdge = 1.0 - texture2D(uContainerMaskTexture, containerUv).r;');
		expect(shadersSrc).toContain('c = max(c, flowColor * flowMask);');
		expect(engineSrc).toContain('gl.uniform2f(this.displayMaterial.uniforms.texelSize, 1.0 / width, 1.0 / height);');
	});

	it('composites opaque backgrounds in the display shader instead of a separate full-screen pass', () => {
		expect(shadersSrc).toContain('uniform vec3 uBackColor;');
		expect(shadersSrc).toContain('uniform float uCompositeBackground;');
		expect(shadersSrc).toContain('c + uBackColor * (1.0 - a)');
		expect(engineSrc).toContain('this.drawDisplay(displayTarget, this.config.TRANSPARENT ? null : this.normalizedBackColor);');
		expect(engineSrc).not.toContain('this.drawColor(displayTarget, this.normalizedBackColor);');
		expect(engineSrc).not.toContain('private colorProgram');
		expect(engineSrc).not.toContain('f.color');
	});
});

describe('prescribed field shader wiring', () => {
	it('supports uploaded velocity/scalar grids with decoded normalized textures', () => {
		expect(shadersSrc).toContain('uniform int uUseGrid;');
		expect(shadersSrc).toContain('uniform sampler2D uGridTexture;');
		expect(shadersSrc).toContain('uniform float uGridScale;');
		expect(shadersSrc).toContain('vec2 field = (grid.rg * 2.0 - 1.0) * uGridScale;');
		expect(shadersSrc).toContain('float scalar = grid.r * uGridScale;');
		expect(shadersSrc).toContain('uniform int uScalarChannel;');
	});

	it('runs prescribed flow before advection and skips projection in prescribed mode', () => {
		expect(engineSrc).toContain("if (this.config.FLOW?.prescribed && this.flowMode() !== 'live')");
		expect(engineSrc).toContain("const prescribedOnly = this.flowMode() === 'prescribed';");
		expect(engineSrc).toContain('this.applyFlowSources(dt, !prescribedOnly);');
		expect(engineSrc).toContain('if (!prescribedOnly) this.applyFlowForces(dt);');
		expect(engineSrc).toMatch(
			/if \(prescribedOnly\) \{[\s\S]*this\.advectDye\(dt\);[\s\S]*this\.advectScalar\(dt\);[\s\S]*return;[\s\S]*\}[\s\S]*this\.advectVelocity\(dt\);/
		);
	});
});

describe('solver pass order', () => {
	it('advects velocity before the projection so the displayed velocity is divergence-clean', () => {
		expect(engineSrc).toMatch(
			/this\.advectVelocity\(dt\);[\s\S]*this\.applyViscosity\(dt\);[\s\S]*this\.applyWallFriction\(\);[\s\S]*this\.projectVelocity\(\);/
		);
		expect(engineSrc).toMatch(
			/private projectVelocity\(\): void \{[\s\S]*this\.divergenceProgram\.bind\(\);[\s\S]*this\.pressureProgram\.bind\(\);[\s\S]*this\.gradientSubtractProgram\.bind\(\);/
		);
	});

	it('drains live velocity before projection and dye/scalar only after advection', () => {
		expect(engineSrc).toContain("if (!prescribedOnly) this.applyFlowOutlets(['velocity']);");
		expect(engineSrc).not.toContain("this.applyFlowOutlets(prescribedOnly ? ['dye', 'scalar'] : ['velocity', 'dye', 'scalar']);");
		expect(engineSrc).toMatch(
			/this\.projectVelocity\(\);[\s\S]*const simulateDye = this\.shouldSimulateDye\(\);[\s\S]*this\.advectScalar\(dt\);[\s\S]*this\.applyFlowOutlets\(simulateDye \? \['dye', 'scalar'\] : \['scalar'\]\);/
		);
	});

	it('skips empty dye advection and dye post-processing for field-visualization scenes', () => {
		expect(engineSrc).toContain('private dyeMayContainContent = false;');
		expect(engineSrc).toContain('private shouldSimulateDye(): boolean');
		expect(engineSrc).toContain('this.dyeMayContainContent = true;');
		expect(engineSrc).toContain('if (simulateDye) {');
		expect(engineSrc).toContain('if (this.config.BLOOM && hasDyeContent) this.applyBloom(this.dye.read, this.bloom);');
	});

	it('substeps the solver from maxTimeStep instead of injecting one large frame step', () => {
		expect(engineSrc).toContain('dt = Math.min(dt, this.config.MAX_TIME_STEP * this.config.SUBSTEPS);');
		expect(engineSrc).toContain('const stepCount = this.simulationSubsteps(dt);');
		expect(engineSrc).toContain('const stepDt = dt / stepCount;');
		expect(engineSrc).toContain('this.step(stepDt);');
	});

	it('wires implicit viscosity and obstruction-adjacent wall friction as optional GPU passes', () => {
		expect(shadersSrc).toContain('export const viscosityShader');
		expect(shadersSrc).toContain('vec2 velocity = (source + uAlpha * (L + R + T + B)) / (1.0 + 4.0 * uAlpha);');
		expect(shadersSrc).toContain('export const wallFrictionShader');
		expect(shadersSrc).toContain('float damping = clamp(1.0 - uWallFriction * edge, 0.0, 1.0);');
		expect(engineSrc).toContain('this.viscosityProgram = makeProgram');
		expect(engineSrc).toContain('this.wallFrictionProgram = makeProgram');
		expect(engineSrc).toContain('private velocitySource!: FBO;');
	});
});

describe('flow source and scalar shader wiring', () => {
	it('batches analytic flow source shapes per target instead of sample loops', () => {
		expect(shadersSrc).toContain('export const flowSourceShader');
		expect(shadersSrc).toContain('#define MAX_FLOW_SOURCE_BATCH 4');
		expect(shadersSrc).toContain('uniform int uCount;');
		expect(shadersSrc).toContain('vec2 pa = aspectVec(vUv - uFrom[i]);');
		expect(shadersSrc).toContain('vec2 closest = clamp(vUv, mn, mx);');
		expect(engineSrc).toContain('const FLOW_SOURCE_BATCH_SIZE = 4;');
		expect(engineSrc).toContain('private applyFlowSourceBatch');
		expect(engineSrc).toContain("this.arrayUniform(this.flowSourceProgram.uniforms, 'uColor')");
		expect(engineSrc).not.toContain('private applyFlowShapeSource');
		expect(engineSrc).not.toContain('for (let i = 0; i < samples; i++)');
	});

	it('supports scalar range, color, and per-channel dissipation uniforms', () => {
		expect(shadersSrc).toContain('uniform vec2 uFlowScalarRange;');
		expect(shadersSrc).toContain('uniform vec3 uFlowScalarColor;');
		expect(shadersSrc).toContain('uniform int uFlowUseRange;');
		expect(shadersSrc).toContain('float mapFlowValue(float rawValue)');
		expect(shadersSrc).toContain('uniform vec4 dissipationVector;');
		expect(shadersSrc).toContain('uniform float uUseDissipationVector;');
		expect(shadersSrc).toContain('uFlowGlowMode == 2');
		expect(engineSrc).toContain("glowBy === 'scalar' ? 2 : 0");
		expect(engineSrc).toContain("transfer === 'cfd'");
		expect(engineSrc).toContain('const visualizationRange');
		expect(engineSrc).toContain('private scalarDissipationVector');
		expect(engineSrc).toContain("field?.advection === 'low-dissipation'");
	});
});

describe('flow config equality', () => {
	it('does not stringify flow configs and uses grid data revisions', () => {
		expect(engineSrc).not.toContain('return JSON.stringify(a) === JSON.stringify(b);');
		expect(engineSrc).toContain('(a.version ?? null) === (b.version ?? null)');
		expect(engineSrc).toContain('a.data === b.data');
		expect(engineSrc).not.toContain('prescribedGridKey');
	});
});

describe('texture unit budget', () => {
	it('uses only WebGL1-guaranteed units 0 through 7 in shader and engine bindings', () => {
		const units = [
			...[...shadersSrc.matchAll(/TEXTURE(\d+)/g)].map((m) => Number(m[1])),
			...[...engineSrc.matchAll(/TEXTURE(\d+)/g)].map((m) => Number(m[1])),
			...[...engineSrc.matchAll(/attach\((\d+)\)/g)].map((m) => Number(m[1]))
		];
		for (const unit of units) {
			expect(unit).toBeLessThanOrEqual(7);
		}
	});
});
