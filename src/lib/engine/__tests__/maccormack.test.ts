import { describe, it, expect } from 'vitest';
import engineSrc from '../FluidEngine.ts?raw';
import shadersSrc from '../shaders.ts?raw';

// Epic 0001 Phase 2 — opt-in velocity-only MacCormack advection. These node-tier
// assertions are source-level (GL construction needs a browser) and guard the two
// hard invariants: the shared semi-Lagrangian path for dye/scalar/velocity is left
// byte-identical, and MacCormack is OFF by default behind a capability gate.
describe('maccormack: dye/scalar advection untouched', () => {
	it('keeps the shared advectionShader semi-Lagrangian #else branch byte-identical', () => {
		// The dye/scalar/SL-velocity path runs the shared advectionProgram, whose
		// non-manual-filtering branch must not change so existing behavior is
		// preserved when MacCormack is off (or unavailable).
		const slBranch = [
			'    #else',
			'        vec2 coord = vUv - dt * texture2D(uVelocity, vUv).xy * texelSize;',
			'        vec4 result = texture2D(uSource, coord);',
			'    #endif'
		].join('\n');
		expect(shadersSrc).toContain(slBranch);
	});

	it('puts MacCormack in a separate shader/program, not in the shared advection program', () => {
		expect(shadersSrc).toContain('export const advectionMacCormackShader');
		// The MacCormack pass reads phi_hat from its own sampler; the shared
		// advection shader never references it.
		expect(shadersSrc).toContain('uniform sampler2D uPhiHat;');
		expect(engineSrc).toContain('private advectionMacCormackProgram!: ProgramWrap;');
		expect(engineSrc).toContain('this.advectionMacCormackProgram = makeProgram(gl, this.baseVertexShader, f.advectionMacCormack);');
	});

	it('leaves advectDye and advectScalar on the shared advectionProgram', () => {
		// Neither dye nor scalar advection may reach the MacCormack program.
		expect(engineSrc).toMatch(
			/private advectDye\(dt: number\): void \{[\s\S]*?this\.advectionProgram\.bind\(\);[\s\S]*?private advectScalar/
		);
		expect(engineSrc).toMatch(
			/private advectScalar\(dt: number\): void \{[\s\S]*?this\.advectionProgram\.bind\(\);[\s\S]*?private flowOpenEdges/
		);
		expect(engineSrc).not.toMatch(/advectDye[\s\S]*?advectionMacCormackProgram[\s\S]*?private advectScalar/);
	});
});

describe('maccormack: default-off + capability gate', () => {
	it('defaults the construct-only advectionScheme to semi-Lagrangian', () => {
		expect(engineSrc).toContain("this.advectionScheme = opts.advectionScheme ?? 'semilagrangian';");
		expect(engineSrc).toContain("advectionScheme?: 'semilagrangian' | 'maccormack';");
	});

	it('forces semi-Lagrangian whenever linear filtering is unavailable', () => {
		expect(engineSrc).toContain(
			"this.useMacCormack = this.advectionScheme === 'maccormack' && this.ext.supportLinearFiltering;"
		);
	});

	it('branches velocity advection on the gated flag, falling back to the SL path', () => {
		expect(engineSrc).toMatch(
			/private advectVelocity\(dt: number\): void \{\s*if \(this\.useMacCormack\) \{\s*this\.advectVelocityMacCormack\(dt\);\s*return;\s*\}/
		);
	});
});

describe('maccormack: correction math is single-sourced in GLSL', () => {
	it('forms the BFECC correction and the Selle limiter in the shader', () => {
		expect(shadersSrc).toContain('vec2 corrected = phiHat + 0.5 * (phiN - phiBar);');
		expect(shadersSrc).toContain('corrected = clamp(corrected, lo, hi);');
		// First-order fallback near solids and open boundaries.
		expect(shadersSrc).toContain('if (nearSolid || nearOpenEdge) {');
		expect(shadersSrc).toContain('uniform vec4 uOpenEdges;');
	});
});
