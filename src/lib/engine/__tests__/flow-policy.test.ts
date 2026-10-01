import { describe, expect, it } from 'vitest';
import {
	flowNeedsScalarField,
	flowScalarChannel,
	flowScalarLayoutSignature,
	flowTransferKind
} from '../flow-policy.js';
import type { FlowTransfer } from '../types.js';
import shaderSource from '../webgpu/shaders.ts?raw';

describe('flow visualization mapping', () => {
	it('keeps signed scalar fields distinct from pressure magnitude', () => {
		expect(shaderSource).toContain('raw = abs(textureSampleLevel(pressure');
		expect(shaderSource).toContain('raw * params.flow_range.z');
		expect(shaderSource).toContain(')) * params.flow_range.z');
		expect(shaderSource).not.toContain('abs(raw) * params.flow_range.z');
	});

	it('maps every public transfer name to one WGSL branch', () => {
		const transfers: FlowTransfer[] = ['fire', 'water', 'ink', 'viridis', 'cfd'];
		expect(transfers.map(flowTransferKind)).toEqual([0, 1, 2, 3, 4]);
		for (const threshold of ['kind < 0.5', 'kind < 1.5', 'kind < 2.5', 'kind < 3.5']) {
			expect(shaderSource).toContain(threshold);
		}
	});

	it('uses declared scalar order without reserved-name channel collisions', () => {
		const fields = [{ name: 'smoke' }, { name: 'temperature' }, { name: 'ink' }];
		expect(flowScalarChannel('smoke', fields)).toBe(0);
		expect(flowScalarChannel('temperature', fields)).toBe(1);
		expect(flowScalarChannel('ink', fields)).toBe(2);
		expect(flowScalarChannel('temperature')).toBe(0);
		expect(flowScalarChannel('ink')).toBe(1);
	});

	it('makes packed-channel ownership explicit and ignores empty prescribed maps', () => {
		expect(
			flowScalarLayoutSignature({
				scalarFields: [{ name: 'smoke' }, { name: 'temperature' }, { name: 'ink' }]
			})
		).toBe('smoke|temperature|ink');
		expect(flowScalarLayoutSignature({ prescribed: { kind: 'grid', scalars: { ink: undefined } } })).toBe('none');
		expect(flowNeedsScalarField({ prescribed: { kind: 'grid', scalars: {} } })).toBe(false);
	});
});
