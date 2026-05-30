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
		expect(shadersSrc).toContain('if (solidAt(vL) > 0.5) { L = -C.x; }');
		expect(shadersSrc).toContain('if (solidAt(vL) > 0.5) { L = C; }');
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
		expect(shadersSrc).toContain('c = max(c, flowColor * flowMask);');
		expect(engineSrc).toContain('gl.uniform2f(this.displayMaterial.uniforms.texelSize, 1.0 / width, 1.0 / height);');
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
	it('uses one shader pass per line or rect source target instead of sample loops', () => {
		expect(shadersSrc).toContain('export const flowSourceShader');
		expect(shadersSrc).toContain('vec2 pa = aspectVec(vUv - uFrom);');
		expect(shadersSrc).toContain('vec2 closest = clamp(vUv, mn, mx);');
		expect(engineSrc).toContain('private applyFlowShapeSource');
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
