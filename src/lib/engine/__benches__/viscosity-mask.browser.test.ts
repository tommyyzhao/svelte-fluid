import { afterEach, describe, expect, it, vi } from 'vitest';
import { FluidEngine, _setContextTier } from '../FluidEngine.js';
import type { FluidConfig } from '../types.js';
import type { DoubleFBO, ResolvedConfig } from '../internal-types.js';
import { compileShader, makeProgram, type ProgramWrap } from '../gl-utils.js';
import baselineJson from './viscosity-mask.b66d623.json?raw';
const baseline: { viscosityShader: string; viscosityJacobi2Shader: string } =
	JSON.parse(baselineJson);

type Uniforms = Record<string, WebGLUniformLocation | null>;
interface Harness {
	gl: WebGL2RenderingContext;
	config: ResolvedConfig;
	ensureProgramsFor(config: ResolvedConfig): void;
	velocity: DoubleFBO;
	baseVertexShader: WebGLShader;
	viscosityProgram: ProgramWrap;
	viscosityJacobi2Program: ProgramWrap;
	withGl(fn: () => void): void;
	applyViscosity(dt: number): void;
	projectVelocity(): void;
	shouldMaskPhysics(): boolean;
	applyMask(target: DoubleFBO): void;
	bindInlineMaskUniforms(
		uniforms: Uniforms,
		mask: number,
		obstruction: number
	): boolean;
}
const engines: FluidEngine[] = [];
const baselineCleanup: Array<() => void> = [];
afterEach(() => {
	vi.restoreAllMocks();
	for (const cleanup of baselineCleanup.splice(0)) cleanup();
	for (const engine of engines.splice(0)) engine.dispose();
	_setContextTier('auto');
});
const circle = { type: 'circle', cx: 0.5, cy: 0.5, radius: 0.45 } as const;
function create(config: FluidConfig = {}, shared = false) {
	const canvas = document.createElement('canvas');
	canvas.width = canvas.height = 128;
	_setContextTier(shared);
	try {
		const engine = new FluidEngine({
			canvas,
			autoStart: false,
			config: {
				simResolution: 128,
				dyeResolution: 16,
				initialSplatCount: 0,
				pointerInput: false,
				bloom: false,
				sunrays: false,
				curl: 0,
				viscosity: 0.25,
				viscosityIterations: 2,
				pressureIterations: 20,
				containerShape: circle,
				flow: { walls: 'no-slip' },
				...config
			}
		});
		engines.push(engine);
		return engine;
	} finally {
		_setContextTier('auto');
	}
}

// Compile frozen old GLSL, not a candidate shader with masking disabled. The
// current driver may bind new uniforms absent from old GLSL; null is GL's no-op.
function frozenPrograms(engine: FluidEngine) {
	const h = engine as unknown as Harness;
	h.withGl(() => {
		for (const [field, source] of [
			['viscosityProgram', baseline.viscosityShader],
			['viscosityJacobi2Program', baseline.viscosityJacobi2Shader]
		] as const) {
			const fragment = compileShader(h.gl, h.gl.FRAGMENT_SHADER, source);
			let program: ProgramWrap;
			try {
				program = makeProgram(h.gl, h.baseVertexShader, fragment);
			} finally {
				h.gl.deleteShader(fragment);
			}
			const original = h[field];
			baselineCleanup.push(() =>
				h.withGl(() => {
					h[field] = original;
					h.gl.deleteProgram(program.program);
				})
			);
			program.uniforms = new Proxy(program.uniforms, {
				get: (uniforms, name: string) => uniforms[name] ?? null
			});
			h[field] = program;
		}
	});
}

// Independent placement oracle: same unmasked solve, standalone applyMask once.
// Keep samplers bound even when disabling coverage, avoiding false feedback errors.
function standaloneReference(engine: FluidEngine, applyStandaloneMask = true) {
	const h = engine as unknown as Harness;
	if (applyStandaloneMask) {
		// Live flow never selects applyMask; use engine-owned compilation and disposal
		// without changing the flow being solved or allocating prescribed-flow fields.
		h.withGl(() =>
			h.ensureProgramsFor({
				...h.config,
				CONTAINER_SHAPE: circle,
				OPEN_BOUNDARY: false,
				FLOW: {
					...h.config.FLOW,
					mode: 'prescribed',
					prescribed: {
						kind: 'grid',
						velocity: { width: 1, height: 1, data: [0, 0] }
					}
				}
			})
		);
	}
	const solve = h.applyViscosity.bind(h),
		bind = h.bindInlineMaskUniforms.bind(h);
	let solving = false;
	vi.spyOn(h, 'bindInlineMaskUniforms').mockImplementation(
		(uniforms, mask, obstruction) => {
			const active = bind(uniforms, mask, obstruction);
			if (!solving) return active;
			h.gl.uniform1f(uniforms.uApplyInlineMask, 0);
			return false;
		}
	);
	vi.spyOn(h, 'applyViscosity').mockImplementation((dt) => {
		solving = true;
		try {
			solve(dt);
		} finally {
			solving = false;
		}
		if (
			applyStandaloneMask &&
			h.config.VISCOSITY > 0 &&
			h.config.VISCOSITY_ITERATIONS > 0 &&
			h.shouldMaskPhysics()
		)
			h.applyMask(h.velocity);
	});
}
function compare(actual: FluidEngine, reference: FluidEngine, exact = false) {
	const a = actual.readField('velocity').data,
		b = reference.readField('velocity').data;
	expect(a.length).toBe(b.length);
	if (exact)
		expect(new Uint8Array(a.buffer, a.byteOffset, a.byteLength)).toEqual(
			new Uint8Array(b.buffer, b.byteOffset, b.byteLength)
		);
	// Preregistered: one extra binary16 rounding in standalone masking. Two
	// binary16 ULPs cover fused-vs-stored results; no post-observation widening.
	let error = 0,
		scale = 0;
	for (let i = 0; i < a.length; i++) {
		expect(Number.isFinite(a[i]) && Number.isFinite(b[i])).toBe(true);
		error = Math.max(error, Math.abs(a[i] - b[i]));
		scale = Math.max(scale, Math.abs(b[i]));
	}
	expect(error).toBeLessThanOrEqual(exact ? 0 : 0.002 * scale + 0.000002);
	for (const engine of [actual, reference]) {
		const gl = (engine as unknown as Harness).gl;
		expect(gl.getError()).toBe(gl.NO_ERROR);
	}
}
function seed(...list: FluidEngine[]) {
	for (const engine of list)
		engine.splat(0.94, 0.5, 0, 20, { r: 0, g: 0, b: 0 });
}
function solve(engine: FluidEngine, project = false) {
	const h = engine as unknown as Harness;
	h.withGl(() => {
		h.applyViscosity(1 / 60);
		if (project) h.projectVelocity();
	});
}

describe('no-slip viscosity final-mask hardware gates (authored, not measured)', () => {
	it.each([
		...[1, 2, 3, 8].map((viscosityIterations) => [
			`inactive no-slip ${viscosityIterations}`,
			{ containerShape: undefined, viscosityIterations }
		]),
		...[1, 2].flatMap((viscosityIterations) =>
			[false, true].map((active) => [
				`${active ? 'active' : 'inactive'} free-slip ${viscosityIterations}`,
				{
					containerShape: active ? circle : undefined,
					flow: { walls: 'free-slip' },
					viscosityIterations
				}
			])
		),
		['zero viscosity with physical mask', { viscosity: 0 }]
	] as Array<[string, FluidConfig]>)(
		'%s matches frozen b66d623 programs exactly before/after projection',
		(_, patch) => {
			for (const project of [false, true]) {
				const actual = create(patch),
					reference = create(patch);
				frozenPrograms(reference);
				seed(actual, reference);
				solve(actual, project);
				solve(reference, project);
				compare(actual, reference, true);
			}
		}
	);
	it('negative control detects missing crop, not frozen-baseline parity', () => {
		const omitted = create(),
			reference = create();
		standaloneReference(omitted, false);
		standaloneReference(reference);
		seed(omitted, reference);
		solve(omitted);
		solve(reference);
		const a = omitted.readField('velocity').data,
			b = reference.readField('velocity').data;
		expect(a.length).toBe(b.length);
		let error = 0,
			scale = 0;
		for (let i = 0; i < a.length; i++) {
			expect(Number.isFinite(a[i]) && Number.isFinite(b[i])).toBe(true);
			error = Math.max(error, Math.abs(a[i] - b[i]));
			scale = Math.max(scale, Math.abs(b[i]));
		}
		expect(error).toBeGreaterThan(0.002 * scale + 0.000002);
		for (const engine of [omitted, reference]) {
			const gl = (engine as unknown as Harness).gl;
			expect(gl.getError()).toBe(gl.NO_ERROR);
		}
	});
	for (const iterations of [1, 2, 3, 8]) {
		it(`analytic fractional coverage matches once-after reference: ${iterations} iterations, before/after projection`, () => {
			for (const project of [false, true]) {
				const a = create({ viscosityIterations: iterations }),
					b = create({ viscosityIterations: iterations });
				standaloneReference(b);
				seed(a, b);
				solve(a, project);
				solve(b, project);
				compare(a, b);
			}
		});
	}
	it.each([
		[
			'SVG fractional',
			{
				containerShape: {
					type: 'svgPath',
					d: 'M50 5 A45 45 0 1 1 49.99 5Z',
					fit: 'contain'
				}
			}
		],
		[
			'binary obstruction',
			{
				containerShape: undefined,
				obstructions: [{ d: 'M45 10H55V90H45Z', fit: 'fill' }]
			}
		],
		['above paired crossover', { simResolution: 576 }]
	] as Array<[string, FluidConfig]>)(
		'%s matches standalone once-after reference',
		(name, patch) => {
			for (const viscosityIterations of [2, 3]) {
				const a = create({ ...patch, viscosityIterations }),
					b = create({ ...patch, viscosityIterations });
				standaloneReference(b);
				seed(a, b);
				if (name === 'binary obstruction') {
					// Local signal must reach the obstacle; the circle-edge seed alone cannot.
					for (const engine of [a, b])
						engine.splat(0.56, 0.5, 0, 20, { r: 0, g: 0, b: 0 });
					const field = a.readField('velocity');
					const x = Math.floor(0.56 * field.width),
						y = Math.floor(0.5 * field.height);
					expect(
						Math.abs(field.data[(y * field.width + x) * 2 + 1])
					).toBeGreaterThan(1);
				}
				solve(a);
				solve(b);
				compare(a, b);
			}
		}
	);
	it.each([
		['inactive', { containerShape: undefined }],
		['open boundary', { openBoundary: true }],
		['zero viscosity', { viscosity: 0 }],
		[
			'free-slip inactive',
			{ containerShape: undefined, flow: { walls: 'free-slip' } }
		]
	] as Array<[string, FluidConfig]>)(
		'%s preserves exact output bytes',
		(_, patch) => {
			const a = create(patch),
				b = create(patch);
			standaloneReference(b);
			seed(a, b);
			solve(a);
			solve(b);
			compare(a, b, true);
		}
	);
	it('masked free-slip retains standalone final-crop semantics', () => {
		const a = create({ flow: { walls: 'free-slip' } }),
			b = create({ flow: { walls: 'free-slip' } });
		standaloneReference(b);
		seed(a, b);
		solve(a);
		solve(b);
		compare(a, b);
	});
	it('full step, hot wall/shape/resolution updates match independent crop placement', () => {
		const a = create(),
			b = create();
		standaloneReference(b);
		for (const patch of [
			{ viscosityIterations: 8 },
			{ viscosityIterations: 3, containerShape: { ...circle, radius: 0.4 } },
			{ flow: { walls: 'free-slip' } },
			{ flow: { walls: 'no-slip' }, simResolution: 96 },
			{ containerShape: undefined, openBoundary: true }
		] as FluidConfig[]) {
			for (const engine of [a, b]) engine.setConfig(patch);
			seed(a, b);
			a.advance(1, 1 / 60);
			b.advance(1, 1 / 60);
			compare(a, b);
		}
	});
	it('shared sibling gates/samplers cannot contaminate an inactive solve', () => {
		const own = create({ containerShape: undefined }),
			shared = create({ containerShape: undefined }, true);
		const sibling = create({}, true);
		expect(shared.sharedContext).toBe(true);
		seed(own, shared, sibling);
		for (const viscosityIterations of [8, 3, 2]) {
			sibling.setConfig({ viscosityIterations });
			solve(sibling);
			solve(own);
			const h = shared as unknown as Harness;
			h.withGl(() => {
				// Recreate stale display bindings that would alias the next write target.
				h.velocity.write.attach(4);
				h.velocity.read.attach(5);
				h.applyViscosity(1 / 60);
			});
			compare(shared, own, true);
		}
	});
});
