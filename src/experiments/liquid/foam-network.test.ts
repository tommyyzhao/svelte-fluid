import { describe, expect, it, vi } from 'vitest';
import { createFoamNetwork, foamEnergy, foamGradient, FoamNetworkState, foamSegments } from './foam-network.js';

function settle(state: FoamNetworkState) { for (let frame = 0; frame < 240; frame++) state.advance(1 / 120); }
describe('explicit four-cell T1 network', () => {
	it('rejects invalid initial geometry and ignores invalid live input without erasing state', () => {
		expect(() => new FoamNetworkState(NaN)).toThrow('must be finite');
		const state = new FoamNetworkState(-10); expect(state.strain).toBe(-1);
		const before = { ...state }; state.setStrain(Infinity); state.advance(NaN);
		expect(state).toEqual(before);
	});
	it('derives relaxation from the actual length energy', () => {
		for (const q of [0, 0.1, 0.3, 0.5]) {
			const epsilon = 0.000001;
			const derivative = (foamEnergy(q + epsilon, 0.69, 0.25) - foamEnergy(q - epsilon, 0.69, 0.25)) / (2 * epsilon);
			expect(foamGradient(q, 0.69, 0.25)).toBeCloseTo(derivative, 7);
		}
	});
	it('settles at 120-degree equal-tension junctions on either branch', () => {
		for (const strain of [-1, 1]) {
			const state = new FoamNetworkState(strain), edges = foamSegments(state);
			for (const junction of [edges[0][0], edges[0][1]]) {
				const directions = edges.flatMap(([from, to]) => {
					const atFrom = from[0] === junction[0] && from[1] === junction[1];
					const atTo = to[0] === junction[0] && to[1] === junction[1];
					if (!atFrom && !atTo) return [];
					const other = atFrom ? to : from, x = other[0] - junction[0], y = other[1] - junction[1], length = Math.hypot(x, y);
					return [[x / length, y / length]];
				});
				expect(directions.length).toBe(3);
				for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) expect(directions[i][0] * directions[j][0] + directions[i][1] * directions[j][1]).toBeCloseTo(-0.5, 12);
			}
		}
	});
	it('loses BD and gains distinct AC contact, with the reverse restoring original connectivity', () => {
		const state = new FoamNetworkState(-1), before = state.adjacency;
		expect(before[1][3]).toBe(1); expect(before[0][2]).toBe(0);
		state.setStrain(1); settle(state);
		expect(state.contact).toBe('AC'); expect(state.adjacency[1][3]).toBe(0); expect(state.adjacency[0][2]).toBe(1); expect(state.events).toBe(1);
		state.setStrain(-1); settle(state);
		expect(state.adjacency).toEqual(before); expect(state.events).toBe(2);
	});
	it('adopts a square fallback with its actual metastable branch and event count', () => {
		const state = new FoamNetworkState(-1);
		state.adoptRest({ strain: 0, branch: 'vertical', events: 3 });
		expect(state.contact).toBe('AC'); expect(state.events).toBe(3); expect(state.moving).toBe(false);
		expect(() => state.adoptRest({ strain: NaN, branch: 'vertical', events: 3 })).toThrow('Invalid resting');
		expect(state.contact).toBe('AC'); expect(state.events).toBe(3);
	});
	it('decreases energy at fixed boundary geometry without mistaking parameter work for dissipation', () => {
		const state = new FoamNetworkState(-1); state.halfLength = 0.02; state.moving = true;
		let previous = state.energy;
		for (let frame = 0; frame < 120; frame++) {
			state.advance(1 / 240);
			expect(state.energy).toBeLessThanOrEqual(previous + 0.000000001); previous = state.energy;
		}
		expect(state.events).toBe(0);
	});
	it('passes through an explicit fourfold graph without an energy jump at rewiring', () => {
		const state = new FoamNetworkState(1);
		state.branch = 'horizontal'; state.halfLength = 0.00000001; state.moving = true;
		const before = state.energy; state.advance(1 / 240);
		expect(state.branch).toBe('vertical'); expect(state.contact).toBe('fourfold'); expect(state.events).toBe(1);
		expect(state.adjacency.flat().reduce((sum, entry) => sum + entry, 0)).toBe(8);
		expect(state.energy).toBeLessThanOrEqual(before);
		let previous = state.energy;
		for (let frame = 0; frame < 240; frame++) {
			state.advance(1 / 240);
			expect(state.energy).toBeLessThanOrEqual(previous + 0.000000001); previous = state.energy;
		}
		expect(state.contact).toBe('AC'); expect(state.events).toBe(1);
	});
	it('does not ping-pong at a vanishing edge and preserves state on rapid retarget', () => {
		const state = new FoamNetworkState(-1);
		for (let turn = 0; turn < 30; turn++) {
			const before = [state.strain, state.halfLength, state.branch];
			state.setStrain(turn % 2 ? -1 : 1); expect([state.strain, state.halfLength, state.branch]).toEqual(before);
			for (let frame = 0; frame < 4; frame++) state.advance(1 / 120);
			expect(Number.isFinite(state.energy)).toBe(true); expect(state.halfLength).toBeGreaterThanOrEqual(0);
		}
		state.setStrain(1); settle(state); const events = state.events;
		for (let frame = 0; frame < 2000; frame++) state.advance(1 / 120);
		expect(state.events).toBe(events); expect(state.contact).toBe('AC'); expect(state.moving).toBe(false);
		const snapshot = { ...state }; state.advance(1); expect(state).toEqual(snapshot);
	});
});

describe('foam fixed resource ownership', () => {
	it.each(['bind throw', 'async OOM', 'scope rejection'] as const)('destroys the allocated uniform after %s and closes both scopes', async (failure) => {
		vi.stubGlobal('GPUBufferUsage', { UNIFORM: 64, COPY_DST: 8 });
		const destroy = vi.fn(), pop = vi.fn();
		if (failure === 'scope rejection') pop.mockRejectedValueOnce(new Error('scope failed')).mockResolvedValueOnce(null);
		else pop.mockResolvedValueOnce(failure === 'async OOM' ? { message: 'allocation failed' } : null).mockResolvedValueOnce(null);
		const gpu = {
			createShaderModule: () => ({ getCompilationInfo: async () => ({ messages: [] }) }),
			createRenderPipelineAsync: async () => ({ getBindGroupLayout: () => ({}) }),
			createBuffer: vi.fn(() => ({ destroy })),
			createBindGroup: () => { if (failure === 'bind throw') throw new Error('bind failed'); return {}; },
			pushErrorScope: vi.fn(), popErrorScope: pop
		} as unknown as GPUDevice;
		try {
			await expect(createFoamNetwork(gpu, 'rgba8unorm')).rejects.toThrow('failed');
			expect(gpu.createBuffer).toHaveBeenCalledWith(expect.objectContaining({ size: 112 }));
			expect(destroy).toHaveBeenCalledOnce(); expect(pop).toHaveBeenCalledTimes(2); expect(gpu.pushErrorScope).toHaveBeenCalledTimes(2);
		} finally { vi.unstubAllGlobals(); }
	});
});
