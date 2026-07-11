import { describe, it, expect } from 'vitest';
import { PRESETS } from '../../presets/registry.js';
import { DEFAULTS, resolveConfig } from '../FluidEngine.js';
import engineSrc from '../FluidEngine.ts?raw';
import shadersSrc from '../shaders.ts?raw';
import typesSrc from '../types.ts?raw';

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
	it('defaults the public advectionScheme to semi-Lagrangian', () => {
		expect(DEFAULTS.ADVECTION_SCHEME).toBe('semilagrangian');
		expect(resolveConfig(undefined, DEFAULTS).ADVECTION_SCHEME).toBe('semilagrangian');
		expect(typesSrc).toContain("advectionScheme?: 'semilagrangian' | 'maccormack';");
	});

	it('resolves public maccormack config while keeping the bench/test constructor override', () => {
		expect(resolveConfig({ advectionScheme: 'maccormack' }, DEFAULTS).ADVECTION_SCHEME).toBe('maccormack');
		expect(engineSrc).toContain('if (opts.advectionScheme !== undefined)');
		expect(engineSrc).toContain('this.config.ADVECTION_SCHEME = opts.advectionScheme;');
	});

	it('treats advectionScheme as Bucket D at runtime', () => {
		expect(engineSrc).toContain('next.ADVECTION_SCHEME = this.config.ADVECTION_SCHEME;');
		expect(engineSrc).toContain('`advectionScheme`');
	});

	it('forces semi-Lagrangian whenever linear filtering is unavailable', () => {
		expect(engineSrc).toContain(
			"this.useMacCormack = this.config.ADVECTION_SCHEME === 'maccormack' && this.ext.supportLinearFiltering;"
		);
	});

	it('branches velocity advection on the gated flag, falling back to the SL path', () => {
		expect(engineSrc).toMatch(
			/private advectVelocity\(dt: number\): void \{\s*if \(this\.useMacCormack\) \{\s*this\.advectVelocityMacCormack\(dt\);\s*return;\s*\}/
		);
	});
});

describe('maccormack: presets stay default-off', () => {
	it('resolves every preset to semi-Lagrangian', () => {
		for (const preset of PRESETS) {
			expect(Object.hasOwn(preset.config, 'advectionScheme'), preset.id).toBe(false);
			expect(resolveConfig(preset.config, DEFAULTS).ADVECTION_SCHEME, preset.id).toBe('semilagrangian');
		}
	});
});

describe('maccormack: correction math is single-sourced in GLSL', () => {
	it('forms the BFECC correction and the Selle limiter in the shader', () => {
		expect(shadersSrc).toContain('vec2 corrected = phiHat + 0.5 * (phiN - phiBar);');
		expect(shadersSrc).toContain('corrected = clamp(corrected, lo, hi);');
		// First-order fallback covers complete departure paths/stencils near solids
		// and scales its open-edge band with the actual trace length.
		expect(shadersSrc).toContain('uniform sampler2D uSolidClearance;');
		expect(shadersSrc).toContain('float traceRadius = ceil(max(abs(dt * phiN.x), abs(dt * phiN.y))) + 1.0;');
		expect(shadersSrc).toContain('solidClearance <= traceRadius');
		expect(shadersSrc).toContain('traceRadius * texelSize.x');
		expect(shadersSrc).toContain('if (nearSolid || nearOpenEdge) {');
		expect(shadersSrc).toContain('uniform vec4 uOpenEdges;');
		expect(engineSrc).toContain('this.bindMacCormackClearanceUniforms(this.advectionMacCormackProgram.uniforms, 4);');
	});
});
