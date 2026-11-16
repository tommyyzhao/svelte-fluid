import { expect, it } from 'vitest';
import { commands } from 'vitest/browser';
import { PaperMacEngine, type MacOptions } from './engine.js';
import { PaperTracers, TRACERS, type TracerOptions } from './tracers.js';
import { createFBO, disposeFBO } from '$lib/engine/gl-utils.js';

const io = commands as unknown as {
	writeBenchJson(path: string, data: string): Promise<void>;
	writeBenchBase64(path: string, data: string): Promise<void>;
	readBenchBase64(path: string): Promise<string>;
};

const alternate: TracerOptions = { capacity: 131072, rate: 1024, sigma: 0.3 };

function laboratory(obstacle = false, options: TracerOptions = {}) {
	const canvas = document.createElement('canvas');
	const gl = canvas.getContext('webgl2', { antialias: false })!;
	if (!gl || !gl.getExtension('EXT_color_buffer_float'))
		throw new Error('Hardware WebGL2 required');
	const w = 64,
		h = 32,
		scale = 3;
	const mask = gl.createTexture()!;
	gl.bindTexture(gl.TEXTURE_2D, mask);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
	const data = new Uint8Array(w * h * scale ** 2).fill(255);
	if (obstacle)
		for (let y = 0; y < h * scale; y++) data[y * w * scale + 31 * scale] = 0;
	gl.texImage2D(
		gl.TEXTURE_2D,
		0,
		gl.R8,
		w * scale,
		h * scale,
		0,
		gl.RED,
		gl.UNSIGNED_BYTE,
		data
	);
	const faces = createFBO(
		gl,
		w + 1,
		h + 1,
		gl.RG32F,
		gl.RG,
		gl.FLOAT,
		gl.NEAREST
	);
	const tracers = new PaperTracers(
		gl,
		[w, h],
		mask,
		scale,
		{
			x: 2,
			y: 16,
			width: 1.5,
			spacing: 4,
			direction: 1
		},
		options
	);
	const upload = (state: number[]) => {
		const field = new Float32Array(tracers.options.capacity * 4);
		field.set(state);
		gl.bindTexture(gl.TEXTURE_2D, tracers.state.read.texture);
		gl.texSubImage2D(
			gl.TEXTURE_2D,
			0,
			0,
			0,
			tracers.state.width,
			tracers.state.height,
			gl.RGBA,
			gl.FLOAT,
			field
		);
	};
	const read = (n: number) => {
		const field = new Float32Array(tracers.options.capacity * 4);
		gl.bindFramebuffer(gl.FRAMEBUFFER, tracers.state.read.fbo);
		gl.readPixels(
			0,
			0,
			tracers.state.width,
			tracers.state.height,
			gl.RGBA,
			gl.FLOAT,
			field
		);
		return field.slice(0, n * 4);
	};
	const velocity = (f: (x: number, y: number) => [number, number]) => {
		const field = new Float32Array((w + 1) * (h + 1) * 2);
		for (let y = 0; y <= h; y++)
			for (let x = 0; x <= w; x++) {
				const i = (y * (w + 1) + x) * 2;
				field[i] = f(x === w ? 0 : x + 1, y + 0.5)[0];
				field[i + 1] = f(x + 0.5, y === h ? 0 : y + 1)[1];
			}
		gl.bindTexture(gl.TEXTURE_2D, faces.texture);
		gl.texSubImage2D(
			gl.TEXTURE_2D,
			0,
			0,
			0,
			w + 1,
			h + 1,
			gl.RG,
			gl.FLOAT,
			field
		);
	};
	const depth = () => {
		tracers.accumulate([1, 0, 0], [0, 1, 0]);
		const field = new Float32Array(w * h * scale ** 2 * 4);
		gl.bindFramebuffer(gl.FRAMEBUFFER, tracers.depth.fbo);
		gl.readPixels(0, 0, w * scale, h * scale, gl.RGBA, gl.FLOAT, field);
		return field;
	};
	return {
		gl,
		tracers,
		faces,
		upload,
		read,
		velocity,
		depth,
		dispose() {
			tracers.dispose();
			disposeFBO(gl, faces);
			gl.deleteTexture(mask);
		}
	};
}

it('tracers remain passive; default and explicit grid are byte-identical including presentation', () => {
	const options: MacOptions = {
		direction: -1,
		force: 0.4,
		width: 240,
		dyeScale: 1,
		pressureSweeps: 16,
		noiseAcceleration: 0.03
	};
	const engines = [undefined, 'grid', 'tracers', 'tracers'].map(
		(dye, i) =>
			new PaperMacEngine(document.createElement('canvas'), {
				...options,
				...(i === 3 ? { tracers: alternate } : {}),
				...(dye ? { dye: dye as 'grid' | 'tracers' } : {})
			})
	);
	try {
		expect(engines[2].tracerFallback).toBeNull();
		expect(engines[3].tracerFallback).toBeNull();
		engines[1].onBeforeProject = () => {};
		for (const e of engines) {
			e.advance(12);
			e.render();
		}
		for (const key of ['velocity', 'pressure', 'dye'] as const)
			for (const e of engines.slice(1)) {
				const a = engines[0].read(engines[0][key].read, 4),
					b = e.read(e[key].read, 4);
				expect(new Uint8Array(a.buffer)).toEqual(new Uint8Array(b.buffer));
			}
		const pixels = engines.slice(0, 2).map((e) => {
			const p = new Uint8Array(e.canvas.width * e.canvas.height * 4);
			e.gl.bindFramebuffer(e.gl.FRAMEBUFFER, null);
			e.gl.readPixels(
				0,
				0,
				e.canvas.width,
				e.canvas.height,
				e.gl.RGBA,
				e.gl.UNSIGNED_BYTE,
				p
			);
			return p;
		});
		expect(pixels[0]).toEqual(pixels[1]);
		const tracer = engines[2],
			saved = tracer.checkpoint();
		tracer.advance(2);
		const continued = tracer.read(tracer.tracers!.state.read, 4);
		tracer.restore(saved);
		tracer.advance(2);
		expect(tracer.read(tracer.tracers!.state.read, 4)).toEqual(continued);
		for (const e of engines) expect(e.gl.getError()).toBe(e.gl.NO_ERROR);
	} finally {
		engines.forEach((e) => e.dispose());
	}
});

it.each([{}, alternate])(
	'uniform translation preserves width and mass; splats normalize within 3.5% (%j)',
	async (options) => {
		const l = laboratory(false, options);
		try {
			const state: number[] = [];
			for (let x = 0; x < 80; x++)
				for (let y = 0; y < 20; y++)
					state.push(10 + x * 0.125, 15.25 + ((y + 0.5) * 1.5) / 20, 0.02, -1);
			l.upload(state);
			l.velocity(() => [2, 0]);
			const before = l.depth();
			for (let i = 0; i < 100; i++) l.tracers.advance(l.faces, 0.1, false);
			const after = l.read(1600),
				image = l.depth();
			let maxPositionError = 0,
				mass = 0;
			for (let i = 0; i < state.length; i += 4) {
				maxPositionError = Math.max(
					maxPositionError,
					Math.abs(after[i] - state[i] - 20),
					Math.abs(after[i + 1] - state[i + 1])
				);
				expect(after[i + 2]).toBe(Math.fround(state[i + 2]));
				mass += after[i + 2];
			}
			const moments = (a: Float32Array) => {
				let m = 0,
					y = 0,
					y2 = 0;
				for (let j = 0; j < a.length; j += 4) {
					const py = (Math.floor(j / 4 / 192) + 0.5) / 3;
					m += a[j] / 9;
					y += (a[j] * py) / 9;
					y2 += (a[j] * py ** 2) / 9;
				}
				return { mass: m, sigma: Math.sqrt(y2 / m - (y / m) ** 2) };
			};
			const a = moments(before),
				b = moments(image);
			expect(maxPositionError).toBeLessThan(0.001);
			expect(Math.abs(b.sigma - a.sigma)).toBeLessThan(0.001);
			await io.writeBenchJson(
				`.svelte-kit/paper-tracers/translation-${l.tracers.options.rate}.json`,
				JSON.stringify({
					maxPositionError,
					carriedMass: mass,
					before: a,
					after: b,
					kernelSigma: l.tracers.options.sigma,
					pixel: 1 / 3,
					tolerance: '3.5% dense half-float splat mass; 0.001-cell width drift'
				})
			);
			expect(Math.abs(b.mass / mass - 1)).toBeLessThan(0.035);
			expect(l.gl.getError()).toBe(l.gl.NO_ERROR);
		} finally {
			l.dispose();
		}
	}
);

it.each([{}, alternate])(
	'midpoint smooth rotation returns within 0.002 velocity cells (%j)',
	async (options) => {
		const l = laboratory(false, options);
		try {
			const state: number[] = [];
			for (let i = 0; i < 64; i++) {
				const t = (i * Math.PI) / 32;
				state.push(32 + 5 * Math.cos(t), 16 + 5 * Math.sin(t), 0.01, -1);
			}
			l.upload(state);
			l.velocity((x, y) => [-(y - 16), x - 32]);
			for (const sign of [1, -1])
				for (let i = 0; i < 200; i++)
					l.tracers.advance(l.faces, sign * 0.01, false);
			const after = l.read(64);
			let maximum = 0;
			for (let i = 0; i < state.length; i += 4)
				maximum = Math.max(
					maximum,
					Math.hypot(after[i] - state[i], after[i + 1] - state[i + 1])
				);
			expect(maximum).toBeLessThan(0.002);
			await io.writeBenchJson(
				`.svelte-kit/paper-tracers/return-${l.tracers.options.rate}.json`,
				JSON.stringify({ maximumCells: maximum, steps: 400, dt: 0.01 })
			);
		} finally {
			l.dispose();
		}
	}
);

it.each([{}, alternate])(
	'segment traversal prevents tunnelling through a one-mask-texel solid (%j)',
	(options) => {
		const l = laboratory(true, options);
		try {
			l.upload([30.99, 16, 1, -1]);
			l.velocity(() => [4, 0]);
			for (let i = 0; i < 40; i++) l.tracers.advance(l.faces, 0.1, false);
			const p = l.read(1);
			expect(p[0]).toBeLessThan(31);
			expect(p[2]).toBe(1);
			const depth = l.depth();
			for (let y = 0; y < 96; y++)
				for (let x = 93; x < 192; x++) expect(depth[(y * 192 + x) * 4]).toBe(0);
		} finally {
			l.dispose();
		}
	}
);

it.each([{}, alternate])(
	'injection mass uses the actual emission rate (%j)',
	(options) => {
		const l = laboratory(false, options);
		try {
			l.velocity(() => [2, 0]);
			l.tracers.advance(l.faces, 0.125);
			const count = Math.floor(0.125 * l.tracers.options.rate),
				state = l.read(count);
			expect(l.tracers.clock.serial).toBe(count);
			for (let i = 0; i < state.length; i += 4)
				expect(state[i + 2]).toBe(
					Math.fround((2 * 1.5 * 2) / l.tracers.options.rate)
				);
		} finally {
			l.dispose();
		}
	}
);

it('stretching exposes finite sampling gaps instead of widening the kernel', async () => {
	const l = laboratory();
	try {
		const state: number[] = [];
		for (let i = 0; i < 9; i++) state.push(31 + i * 0.25, 16, 0.01, -1);
		l.upload(state);
		l.velocity((x, y) => [0.1 * (x - 32), -0.1 * (y - 16)]);
		for (let i = 0; i < 200; i++) l.tracers.advance(l.faces, 0.1, false);
		const p = l.read(9),
			positions = Array.from({ length: 9 }, (_, i) => p[i * 4]);
		const gaps = positions
			.slice(1)
			.map((x, i) => Math.max(0, x - positions[i] - 6 * TRACERS.sigma));
		const span = positions[8] - positions[0],
			uncovered = gaps.reduce((a, b) => a + b, 0);
		expect(uncovered).toBeGreaterThan(0);
		await io.writeBenchJson(
			'.svelte-kit/paper-tracers/stretch.json',
			JSON.stringify({
				positions,
				gapCells: gaps,
				coverage: 1 - uncovered / span,
				span,
				kernelSigma: l.tracers.options.sigma,
				adaptiveBlur: false
			})
		);
	} finally {
		l.dispose();
	}
});

it('Beer–Lambert overlap is order-independent within half-float accumulation error', () => {
	const l = laboratory();
	try {
		const a = [32, 16, 0.125, -1],
			b = [32, 16, 0.25, 1];
		l.upload([...a, ...b]);
		const first = l.depth();
		l.upload([...b, ...a]);
		const second = l.depth();
		for (let i = 0; i < first.length; i++)
			expect(Math.abs(Math.exp(-first[i]) - Math.exp(-second[i]))).toBeLessThan(
				0.001
			);
	} finally {
		l.dispose();
	}
});
