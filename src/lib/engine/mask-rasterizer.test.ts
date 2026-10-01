import { describe, expect, it } from 'vitest';
import { buildCanonicalMaskFields, packCanonicalMaskTextureData } from './mask-rasterizer.js';

describe('canonical CPU mask fields', () => {
	it('separates visual cropping from open-boundary physics', () => {
		const fields = buildCanonicalMaskFields({
			containerShape: { type: 'circle', cx: 0.5, cy: 0.5, radius: 0.3 },
			obstructions: null,
			openBoundary: true,
			width: 32,
			height: 32
		});
		expect(fields.allowed.data[0]).toBe(0);
		expect(fields.solid.data[0]).toBe(0);
		expect(fields.allowed.data[16 * 32 + 16]).toBe(255);
	});

	it('marks the exterior solid for a closed analytical container', () => {
		const fields = buildCanonicalMaskFields({
			containerShape: { type: 'roundedRect', cx: 0.5, cy: 0.5, halfW: 0.3, halfH: 0.25, cornerRadius: 0.05 },
			obstructions: null,
			openBoundary: false,
			width: 48,
			height: 32
		});
		expect(fields.solid.data[0]).toBe(255);
		expect(fields.solid.data[16 * 48 + 24]).toBe(0);
	});

	it('packs the cardinal stencil and capped clearance into one red byte', () => {
		const width = 9;
		const solid = new Uint8Array(width);
		solid[4] = 255;
		const fields = {
			solid: { data: solid, width, height: 1 },
			allowed: { data: new Uint8Array(width).fill(255), width, height: 1 },
			obstruction: { data: new Uint8Array(width), width, height: 1 }
		};
		const packed = packCanonicalMaskTextureData(fields);
		const red = (x: number): number => packed[x * 4]!;
		expect(red(4) & 0b1_1111).toBe(0b1_1001);
		expect((red(4) >> 5) & 0b111).toBe(0);
		expect((red(3) >> 5) & 0b111).toBe(1);
		expect((red(0) >> 5) & 0b111).toBe(4);
		expect(red(0) & 0b1_1111).toBe(0);
	});
});
