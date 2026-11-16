import { describe, expect, it, vi } from 'vitest';
import { DEFAULTS, FluidEngine, resolveConfig } from '../FluidEngine.js';
import {
	flowOutletShader,
	flowOutletReduceShader,
	flowOutletRelaxShader
} from '../shaders.js';
import type { FlowOutlet } from '../types.js';

describe('flux-preserving outlet', () => {
	it.each(['invalid', '', null, 0])(
		'rejects invalid velocity %j',
		(velocity) => {
			expect(() =>
				resolveConfig(
					{ flow: { outlets: [{ edge: 'right', velocity } as FlowOutlet] } },
					DEFAULTS
				)
			).toThrow(/outlet.velocity/);
		}
	);
	it.each([0, -1, NaN, Infinity, -Infinity])(
		'rejects invalid relaxation rate %j',
		(relaxRate) => {
			expect(() =>
				resolveConfig(
					{ flow: { outlets: [{ edge: 'right', relaxRate }] } },
					DEFAULTS
				)
			).toThrow(/outlet.relaxRate/);
		}
	);
	it('accepts omission, both modes and a positive finite rate', () => {
		for (const velocity of [undefined, 'damp', 'relax'] as const)
			expect(() =>
				resolveConfig(
					{ flow: { outlets: [{ edge: 'right', velocity, relaxRate: 0.01 }] } },
					DEFAULTS
				)
			).not.toThrow();
	});
	it('selects relax programs only for effective relax outlets', () => {
		const h = Object.create(FluidEngine.prototype) as {
			selectedOptionalPrograms(config: typeof DEFAULTS): Set<string>;
		};
		const selected = (outlets: FlowOutlet[]) => [
			...h.selectedOptionalPrograms(
				resolveConfig(
					{ bloom: false, sunrays: false, flow: { outlets } },
					DEFAULTS
				)
			)
		];
		expect(selected([])).toEqual([]);
		for (const outlet of [
			{ edge: 'right' },
			{ edge: 'right', clearVelocity: true },
			{ edge: 'right', velocity: 'relax' },
			{ edge: 'right', clearVelocity: true, velocity: 'damp' }
		] as FlowOutlet[])
			expect(selected([outlet])).toEqual(['flowOutlet']);
		expect(
			selected([{ edge: 'right', clearVelocity: true, velocity: 'relax' }])
		).toEqual(['flowOutlet', 'flowOutletReduce', 'flowOutletRelax']);
	});
	it('allocates no reduction targets without effective relax presence', () => {
		const h = Object.create(FluidEngine.prototype) as {
			gl: {
				deleteFramebuffer: ReturnType<typeof vi.fn>;
				deleteTexture: ReturnType<typeof vi.fn>;
			};
			ext: object;
			outletReduceChains: unknown[][];
			config: typeof DEFAULTS;
			createOutletRelaxChains(
				config: typeof DEFAULTS,
				width: number,
				height: number
			): unknown[][];
		};
		h.gl = { deleteFramebuffer: vi.fn(), deleteTexture: vi.fn() };
		h.outletReduceChains = [[], []];
		h.config = DEFAULTS;
		expect(h.createOutletRelaxChains(DEFAULTS, 513, 1026)).toEqual([[], []]);
		expect(h.outletReduceChains).toEqual([[], []]);
		expect(h.gl.deleteFramebuffer).not.toHaveBeenCalled();
	});
	it.each(['createTexture', 'createFramebuffer'] as const)('cleans staged targets after %s failure without replacing live chains', (allocator) => {
		let calls = 0;
		const gl = {
			TEXTURE0: 0, TEXTURE_2D: 1, TEXTURE_MIN_FILTER: 2, TEXTURE_MAG_FILTER: 3,
			TEXTURE_WRAP_S: 4, TEXTURE_WRAP_T: 5, CLAMP_TO_EDGE: 6, FRAMEBUFFER: 7,
			COLOR_ATTACHMENT0: 8, COLOR_BUFFER_BIT: 9, NEAREST: 10,
			activeTexture: vi.fn(), bindTexture: vi.fn(), texParameteri: vi.fn(), texImage2D: vi.fn(),
			bindFramebuffer: vi.fn(), framebufferTexture2D: vi.fn(), viewport: vi.fn(), clear: vi.fn(),
			createTexture: vi.fn(() => ({})), createFramebuffer: vi.fn(() => ({})),
			deleteTexture: vi.fn(), deleteFramebuffer: vi.fn()
		};
		gl[allocator].mockImplementation(() => (++calls === 2 ? null : {})!);
		const h = Object.create(FluidEngine.prototype) as {
			gl: unknown; ext: unknown; outletReduceChains: unknown[][];
			createOutletRelaxChains(config: typeof DEFAULTS, width: number, height: number): unknown[][];
		};
		h.gl = gl; h.ext = { formatRG: { internalFormat: 1, format: 1 }, halfFloatTexType: 1 };
		const live = [[{}], [{}]]; h.outletReduceChains = live;
		const config = resolveConfig({ flow: { outlets: [{ edge: 'right', clearVelocity: true, velocity: 'relax' }] } }, DEFAULTS);
		expect(() => h.createOutletRelaxChains(config, 1026, 513)).toThrow(/returned null/);
		expect(h.outletReduceChains).toBe(live);
		expect(gl.deleteFramebuffer).toHaveBeenCalledTimes(1);
		expect(gl.deleteTexture).toHaveBeenCalledTimes(allocator === 'createFramebuffer' ? 2 : 1);
		gl[allocator].mockImplementation(() => ({}));
		expect(h.createOutletRelaxChains(config, 1026, 513).flat()).toHaveLength(8);
	});
	it('pins the legacy shader bytes; bounds reduction loops independently of grid size', async () => {
		const digest = await crypto.subtle.digest(
			'SHA-256',
			new TextEncoder().encode(flowOutletShader)
		);
		expect(
			[...new Uint8Array(digest)]
				.map((b) => b.toString(16).padStart(2, '0'))
				.join('')
		).toBe('42766f1ea10fa36302b7cd94593e1aa1e6159fad39711d8058744c46d02eaaff');
		expect(flowOutletReduceShader).toContain('i < 8');
		expect(flowOutletReduceShader).toContain('vec2(uv.x, 1.0 - uv.y)');
		expect(flowOutletRelaxShader).toContain('exp(-dt * uRate * gate * gate)');
	});
	it('mean plus occupancy survives binary16 stores for sparse, signed, odd >512 sections', () => {
		// Round-to-nearest-even binary16, including subnormals; no GPU required.
		const half = (value: number) => {
			if (value === 0) return value;
			const step =
				2 ** Math.max(-24, Math.floor(Math.log2(Math.abs(value))) - 10);
			const x = value / step,
				floor = Math.floor(x),
				fraction = x - floor;
			return (
				(fraction > 0.5 || (fraction === 0.5 && floor % 2 !== 0)
					? floor + 1
					: floor) * step
			);
		};
		const reduce = (values: number[][]): number[] => {
			let pairs = values;
			do {
				pairs = Array.from(
					{ length: Math.ceil(pairs.length / 8) },
					(_, group) => {
						const [weighted, occupancy] = pairs
							.slice(group * 8, group * 8 + 8)
							.reduce(
								(s, p) => [
									Math.fround(s[0] + Math.fround(p[0] * p[1])),
									Math.fround(s[1] + p[1])
								],
								[0, 0]
							);
						return [
							half(occupancy ? Math.fround(weighted / occupancy) : 0),
							half(occupancy / 8)
						];
					}
				);
			} while (pairs.length > 1);
			return pairs[0];
		};
		for (const length of [1, 7, 9, 511, 513, 4097]) {
			for (const velocity of [
				0.00010001659393310547, -0.00010001659393310547, 20, -20
			]) {
				const sparse = Array.from({ length }, (_, i) => [
					velocity,
					i === Math.floor(length / 2) ? 1 : 0
				]);
				const result = reduce(sparse);
				expect(result[1]).toBeGreaterThan(0);
				expect(result[0]).toBe(velocity);
				const a = Math.exp(-0.1 * 10 * 0.7 ** 2);
				expect(result[0] + (velocity - result[0]) * a).toBe(velocity);
			}
			const signed = Array.from({ length }, (_, i) => [
				half(Math.sin(i) * 20),
				i % 3 ? 1 : 0
			]);
			const total = signed.reduce((s, p) => s + p[0] * p[1], 0),
				count = signed.reduce((s, p) => s + p[1], 0);
			const result = reduce(signed);
			expect(Math.abs(result[0] * count - total)).toBeLessThan(
				0.002 * signed.reduce((s, p) => s + Math.abs(p[0]) * p[1], 0) + 1e-10
			);
			expect(reduce(Array.from({ length }, () => [20, 0]))).toEqual([0, 0]);
		}
	});
});
