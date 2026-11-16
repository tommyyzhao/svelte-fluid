import { describe, expect, it } from 'vitest';
import engine from '../FluidEngine.ts?raw';
import { baselineThermalAdvectionShader } from '../__benches__/fixtures/thermal-advection-b66d623.js';
import * as S from '../shaders.js';

// Execute the production scalar GLSL bodies, not an independent DDA mirror.
// Only vector construction/sampling is bridged; changes outside this subset fail compilation.
function traversal(
	width: number,
	height: number,
	solid: (x: number, y: number) => boolean,
	hasMask = true,
	float32 = false
) {
	const source = S.thermalAdvectionShader;
	expect(source).toContain(
		'texture2D(uSolidMask, (vec2(x, y) + 0.5) / uSolidMaskSize).r < 0.5'
	);
	const body = source.slice(
		source.indexOf('    bool maskEndpointClear('),
		source.indexOf('    float donorWeight(')
	);
	let js = body
		.replace(/bool (\w+)\(float x, float y\)/g, 'function $1(x, y)')
		.replace('bool segmentClear(vec2 a, vec2 b)', 'function segmentClear(a, b)')
		.replace(/\b(?:float|bool|int) (\w+)/g, 'let $1');
	if (float32) {
		// Round every arithmetic operation in the production crossing-time expressions.
		js = js
			.replaceAll(
				'(dx > 0.0 ? cx + 1.0 - x : x - cx) * deltaX',
				'F((dx > 0.0 ? F(F(cx + 1.0) - x) : F(x - cx)) * deltaX)'
			)
			.replaceAll(
				'(dy > 0.0 ? cy + 1.0 - y : y - cy) * deltaY',
				'F((dy > 0.0 ? F(F(cy + 1.0) - y) : F(y - cy)) * deltaY)'
			)
			.replaceAll(
				'(1.0 - a.y) * uSolidMaskSize.y',
				'F(F(1.0 - a.y) * uSolidMaskSize.y)'
			)
			.replaceAll(
				'(1.0 - b.y) * uSolidMaskSize.y',
				'F(F(1.0 - b.y) * uSolidMaskSize.y)'
			)
			.replace(/let (\w+) = ([^;]+);/g, 'let $1 = F($2);')
			.replace('abs(tx - ty)', 'abs(F(tx - ty))');
	}
	let reads = 0;
	const maskCellClear = (x: number, y: number) => {
		if (x < 0 || y < 0 || x >= width || y >= height) return true;
		reads++;
		return !solid(x, y);
	};
	const run = new Function(
		'uSolidMaskSize',
		'uHasSolidMask',
		'inside',
		'maskCellClear',
		`
		const {floor,min,max,abs,sign,fround: F} = Math;
		${js}
		return segmentClear;
	`
	)(
		{ x: width, y: height },
		hasMask ? 1 : 0,
		(p: { x: number; y: number }) =>
			+(p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1),
		maskCellClear
	) as (a: { x: number; y: number }, b: { x: number; y: number }) => boolean;
	return {
		clear: (a: number[], b: number[]) =>
			run({ x: a[0], y: a[1] }, { x: b[0], y: b[1] }),
		reads: () => reads
	};
}
const start = [8.5 / 32, 8.5 / 32];
const add = (a: number[], b: number[]) => a.map((v, i) => v + b[i]);
function capped(d: number[]) {
	const cells = Math.ceil(Math.max(...d.map((v) => Math.abs(v * 32))) * 2);
	return d.map((v) => v * Math.min(1, 256 / cells));
}

describe('thermal conservative mask traversal (CPU production GLSL bodies; not GPU evidence)', () => {
	it('rejects the exact supported prescribed-grid forward miss and independent reverse miss', () => {
		const velocity = [-240, 0].map(
			(v) => ((Math.round(((v / 240) * 0.5 + 0.5) * 255) / 255) * 2 - 1) * 240
		);
		expect(velocity[1]).toBeCloseTo(0.941176470588232, 12);
		const disp = velocity.map((v) => -v / 60 / 128);
		expect(
			traversal(512, 512, (x) => x === 140).clear(start, add(start, disp))
		).toBe(false);
		const reverse = traversal(512, 512, (x) => x === 124);
		expect(reverse.clear(start, add(start, disp))).toBe(true);
		expect(
			reverse.clear(
				start,
				add(
					start,
					disp.map((v) => -v)
				)
			)
		).toBe(false);
		// Existing two half-scalar-cell probes miss each full-height wall.
		for (const sign of [-1, 1])
			for (const i of [1, 2])
				expect(
					Math.floor((start[0] + (sign * disp[0] * i) / 2) * 512)
				).not.toBe(sign === 1 ? 140 : 124);
	});
	it('rejects donor midpoint miss; blocked weights remove the former 0.25 cross-wall contribution', () => {
		const t = traversal(512, 512, (x) => x === 144);
		const departure = add(start, [0.25 / 32, 0]);
		const donor = add(start, [1 / 32, 0]);
		expect(t.clear(start, departure)).toBe(true);
		expect(((departure[0] + donor[0]) / 2) * 512).toBe(146);
		expect(t.clear(departure, donor)).toBe(false);
		const weight = t.clear(departure, donor) ? 0.25 : 0;
		expect(weight).toBe(0);
	});
	it('checks the capped prefix; exhaustion rejects even wall-free segments', () => {
		const disp = capped([200 / 32, 0]);
		expect(disp[0] * 32).toBe(128);
		expect(
			traversal(512, 512, (x) => x === 140).clear(start, add(start, disp))
		).toBe(false);
		const t = traversal(1024, 8, () => false);
		expect(t.clear([0.5 / 1024, 0.25], [255.5 / 1024, 0.25])).toBe(true);
		expect(t.clear([0.5 / 1024, 0.25], [256.5 / 1024, 0.25])).toBe(false);
		expect(t.clear([0.1, 0.25], [0.9, 0.25])).toBe(false);
	});
	it('uses both dimensions and flips raster y, including transposed aspect ratios', () => {
		for (const [w, h] of [
			[512, 64],
			[64, 512]
		]) {
			const row = Math.floor(h * 0.25);
			const t = traversal(w, h, (_x, y) => y === row);
			expect(t.clear([0.2, 0.9], [0.2, 0.6])).toBe(false);
			expect(t.clear([0.2, 0.4], [0.2, 0.1])).toBe(true);
			expect(
				traversal(w, h, (x) => x === 10).clear([8.5 / w, 0.4], [12.5 / w, 0.4])
			).toBe(false);
		}
	});
	it('supercovers corners, gridline-aligned paths and endpoint-only contacts', () => {
		const uv = (x: number, y: number) => [x / 8, 1 - y / 8];
		for (const cell of [
			[2, 1],
			[1, 2]
		]) {
			const t = traversal(8, 8, (x, y) => x === cell[0] && y === cell[1]);
			expect(t.clear(uv(1.5, 1.5), uv(2.5, 2.5))).toBe(false);
		}
		for (const x of [1, 2])
			expect(
				traversal(8, 8, (cx, cy) => cx === x && cy === 3).clear(
					uv(2, 1.5),
					uv(2, 5.5)
				)
			).toBe(false);
		for (const y of [1, 2])
			expect(
				traversal(8, 8, (cx, cy) => cx === 3 && cy === y).clear(
					uv(1.5, 2),
					uv(5.5, 2)
				)
			).toBe(false);
		expect(
			traversal(8, 8, (x, y) => x === 1 && y === 1).clear(
				uv(2, 2),
				uv(4.5, 2.5)
			)
		).toBe(false);
		expect(
			traversal(8, 8, (x, y) => x === 2 && y === 2).clear(
				uv(1.5, 1.5),
				uv(2, 2)
			)
		).toBe(false);
	});
	it('Float32 recomputed crossings retain the long-diagonal exact-corner side cell', () => {
		const t = traversal(512, 512, (x, y) => x === 9 && y === 128, true, true);
		expect(t.clear([8 / 512, 1 - 8 / 512], [11 / 512, 1 - 188 / 512])).toBe(
			false
		);
		expect(S.thermalAdvectionShader).not.toMatch(/t[xy] \+= delta[XY]/);
	});
	it('zero-length and inclusive domain endpoint1 remain valid only in clear touched cells', () => {
		const t = traversal(8, 8, () => false);
		for (const p of [
			[0, 0],
			[1, 1],
			[1, 0.5],
			[0.5, 1],
			[0.5, 0.5]
		])
			expect(t.clear(p, p)).toBe(true);
		expect(t.clear([0.2, 0.2], [1, 0.2])).toBe(true);
		expect(t.clear([0.2, 0.2], [0.2, 1])).toBe(true);
		expect(traversal(8, 8, (x) => x === 7).clear([0.8, 0.5], [1, 0.5])).toBe(
			false
		);
		expect(t.clear([0, 0], [1.0001, 0])).toBe(false);
	});
	it('no-mask fast path never samples; wiring caches donors, rejects forward, gates reverse', () => {
		const t = traversal(
			4096,
			8192,
			() => {
				throw Error('unmasked sample');
			},
			false
		);
		expect(t.clear([0, 0], [1, 1])).toBe(true);
		expect(t.reads()).toBe(0);
		const s = S.thermalAdvectionShader;
		expect(s).toContain('reachable = segmentClear(vUv, vUv + disp)');
		expect(s).toContain('if (!reachable) value = texture2D(uSource,vUv)');
		expect(s).toContain('clear = clear && segmentClear(vUv,reverseCoord)');
		expect(s).toContain('w *= donors');
		const loop =
			/for \(int i = 1; i <= 256; i\+\+\) \{[\s\S]*?coord = candidate;/;
		expect(s.match(loop)?.[0]?.replace(/\s+/g, '')).toBe(
			baselineThermalAdvectionShader.match(loop)?.[0]?.replace(/\s+/g, '')
		);
		const reverseLoop =
			/for \(int j = 1; j <= 256; j\+\+\) \{[\s\S]*?clear = false;/;
		expect(s.match(reverseLoop)?.[0]?.replace(/\s+/g, '')).toBe(
			baselineThermalAdvectionShader
				.match(reverseLoop)?.[0]
				?.replace(/\s+/g, '')
		);
		expect(s).not.toContain('donorWeight(a,coord) > 0.5');
		expect(engine).toContain(
			'gl.uniform2f(p.uniforms.uSolidMaskSize, this.solidMaskW || 1, this.solidMaskH || 1)'
		);
	});
	it('pins unaffected ordinary/default and scalar-pass shader bytes from b66d623', async () => {
		const hashes = {
			advectionShader:
				'b7fae089cbac0095bb7b57bd36ee9d789b1d30f1ec19bb08f0ebf9173a4e2456',
			thermalCopyShader:
				'4bfa262ef96ebcfa92cc052e2f5a137daad5da725a1b8de537ca20cab689c52f',
			scalarDiffusionShader:
				'38e48cde5fadf3656841923683f14f459c92282ed5f88e1fc23a0dfd256d7a09',
			scalarRadiationShader:
				'e31c494ace7251ea529e1b0cdb0021262fce86012eafb90f13568a893bf0742e',
			emissionShader:
				'4bf22a333e5b1448a5f98959a186e098a69e12d13e88a3f45e3f5edba90ded88'
		};
		for (const [name, source, hash] of [
			...Object.entries(hashes).map(([name, hash]) => [
				name,
				S[name as keyof typeof hashes],
				hash
			]),
			[
				'baseline',
				baselineThermalAdvectionShader,
				'29f4cad0d45c4d5ae79dd1b2b395f38ada4cf4a467e9a727916f9afe3c3aef8b'
			]
		]) {
			const digest = await crypto.subtle.digest(
				'SHA-256',
				new TextEncoder().encode(source)
			);
			expect(
				Array.from(new Uint8Array(digest), (n) =>
					n.toString(16).padStart(2, '0')
				).join(''),
				name
			).toBe(hash);
		}
	});
});
