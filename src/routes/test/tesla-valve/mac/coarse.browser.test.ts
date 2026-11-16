import { expect, it } from 'vitest';
import {
	staggeredGeometry,
	staggeredLaplacian
} from '$lib/engine/staggered.js';
import { staggeredHarness } from '$lib/engine/__benches__/staggered-harness.js';
import { CoarseCorrection } from './__benches__/coarse-gpu.js';
import { createBlit } from '$lib/engine/gl-utils.js';

it('coarse GPU residual, restriction, inverse and prolongation match Float64 Galerkin', () => {
	const g = staggeredGeometry(
			32,
			12,
			(x, y) => !(x > 10 && x < 22 && y > 3 && y < 8),
			{ left: 'open', right: 'open' }
		),
		h = staggeredHarness(g),
		gl = h.gl;
	const c = new CoarseCorrection(gl, g, 1, 8),
		cg = c.geometry,
		vb = gl.createBuffer()!,
		ib = gl.createBuffer()!,
		blit = createBlit(gl, vb, ib);
	const texture = (
		data: Uint8Array,
		w: number,
		h: number,
		internal: number,
		format: number
	) => {
		const t = gl.createTexture()!;
		gl.bindTexture(gl.TEXTURE_2D, t);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
		gl.texImage2D(
			gl.TEXTURE_2D,
			0,
			internal,
			w,
			h,
			0,
			format,
			gl.UNSIGNED_BYTE,
			data
		);
		gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
		return t;
	};
	const apertures = texture(g.faces, g.width + 1, g.height + 1, gl.RG8, gl.RG),
		cells = texture(g.cells, g.width, g.height, gl.R8, gl.RED);
	try {
		const q = Float32Array.from(g.cells, (v, i) => (v ? 0.1 * Math.sin(i) : 0)),
			rhs = Float32Array.from(g.cells, (v, i) =>
				v ? 0.02 * Math.cos(i / 5) : 0
			);
		h.upload(h.pressure.read, q, 1);
		h.upload(h.divergence, rhs, 1);
		const aq = staggeredLaplacian(g, q),
			rc = new Float64Array(cg.count),
			ec = new Float64Array(cg.count);
		for (let i = 0; i < aq.length; i++)
			if (cg.ids[i] >= 0) rc[cg.ids[i]] += -rhs[i] - aq[i];
		for (let i = 0; i < cg.count; i++)
			for (let j = 0; j < cg.count; j++)
				ec[i] += cg.inverse[i * cg.count + j] * rc[j];
		c.run(h.pressure, h.divergence, apertures, cells, blit);
		const actual = h.read(h.pressure.read, 1);
		let error = 0;
		for (let i = 0; i < actual.length; i++)
			error = Math.max(
				error,
				Math.abs(actual[i] - (q[i] + (cg.ids[i] < 0 ? 0 : ec[cg.ids[i]])))
			);
		expect(error).toBeLessThan(1e-5);
		expect(gl.getError()).toBe(gl.NO_ERROR);
	} finally {
		c.dispose();
		gl.deleteTexture(apertures);
		gl.deleteTexture(cells);
		gl.deleteBuffer(vb);
		gl.deleteBuffer(ib);
		h.dispose();
	}
});
