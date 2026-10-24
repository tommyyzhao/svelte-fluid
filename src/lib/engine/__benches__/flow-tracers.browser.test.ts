import { afterEach, expect, it, vi } from 'vitest';
import { commands } from 'vitest/browser';
import { FluidEngine, _setContextTier } from '../FluidEngine.js';
import type { FluidConfig, FlowConfig } from '../types.js';
import type { FlowTracers } from '../tracers.js';
import type { FBO } from '../internal-types.js';
import { renderer } from './renderer.js';

const absorption = {
	absorbance: [
		{ r: 1, g: 0.2, b: 0.05 },
		{ r: 0.1, g: 1, b: 0.2 },
		{ r: 0.1, g: 0.2, b: 1 }
	] as [
		{ r: number; g: number; b: number },
		{ r: number; g: number; b: number },
		{ r: number; g: number; b: number }
	]
};
const options: NonNullable<FlowConfig['tracers']> = {
	sources: [
		{ from: { x: 0.15, y: 0.35 }, to: { x: 0.15, y: 0.65 }, species: 0 }
	],
	capacity: 512,
	rate: 128
};
const config: FluidConfig = {
	seed: 704,
	initialSplatCount: 0,
	pointerInput: false,
	simResolution: 32,
	dyeResolution: 96,
	bloom: false,
	sunrays: false,
	shading: false,
	curl: 0,
	densityDissipation: 0,
	velocityDissipation: 0,
	flow: {
		mode: 'prescribed',
		boundary: { left: 'open', right: 'open', top: 'wall', bottom: 'wall' },
		prescribed: {
			kind: 'grid',
			velocity: { width: 1, height: 1, data: [4, 0], scale: 4 }
		},
		visualization: { absorption }
	}
};
const engines: Array<FluidEngine> = [];
afterEach(() => {
	vi.restoreAllMocks();
	for (const e of engines.splice(0)) e.dispose();
	_setContextTier('auto');
	document.querySelectorAll('[data-tracer-shot]').forEach((e) => e.remove());
});
function create(tracers = false, shared = false, extra: FluidConfig = {}) {
	const canvas = document.createElement('canvas');
	canvas.width = 288;
	canvas.height = 96;
	_setContextTier(shared);
	try {
		const e = new FluidEngine({
			canvas,
			autoStart: false,
			config: {
				...config,
				...extra,
				flow: {
					...config.flow,
					...extra.flow,
					...(tracers ? { tracers: options } : {})
				}
			}
		});
		engines.push(e);
		return e;
	} finally {
		_setContextTier('auto');
	}
}
function h(e: FluidEngine) {
	return e as unknown as {
		gl: WebGL2RenderingContext;
		canvas: HTMLCanvasElement;
		tracers: FlowTracers;
		velocity: { read: FBO };
		withGl<T>(f: () => T): T;
		tracerFailure: string | null;
	};
}
const bytes = (a: Float32Array) => new Uint8Array(a.buffer);
async function hash(a: ArrayBufferView) {
	return [
		...new Uint8Array(
			await crypto.subtle.digest('SHA-256', a.buffer as ArrayBuffer)
		)
	]
		.map((n) => n.toString(16).padStart(2, '0'))
		.join('');
}
function pixels(e: FluidEngine) {
	e.renderOnce();
	const gl = (e as unknown as { gl: WebGL2RenderingContext }).gl;
	const p = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
	gl.bindFramebuffer(gl.FRAMEBUFFER, null);
	gl.readPixels(
		0,
		0,
		gl.drawingBufferWidth,
		gl.drawingBufferHeight,
		gl.RGBA,
		gl.UNSIGNED_BYTE,
		p
	);
	return p;
}
function read(e: FluidEngine, target: FBO) {
	return h(e).withGl(() => {
		const gl = h(e).gl,
			p = new Float32Array(target.width * target.height * 4);
		gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
		gl.readPixels(0, 0, target.width, target.height, gl.RGBA, gl.FLOAT, p);
		return p;
	});
}
const command = commands as unknown as {
	writeBenchJson(p: string, s: string): Promise<void>;
	writeBenchBase64(p: string, s: string): Promise<void>;
};
// ANGLE Metal captures, verified on M1/M2; other drivers need portable invariant gates below.
it.runIf(/ANGLE Metal/.test(renderer))(
	'default fields/canvas match frozen pre-tracer snapshot',
	async () => {
		// Captured by direct byte comparison with the pre-edit snapshot on Apple M2;
		// repeated unchanged after the labelled harness fixes before removing the snapshot.
		const e = create();
		e.splat(0.1, 0.5, 0, 0, { r: 0.3, g: 0.6, b: 0.9 });
		e.advance(48, 1 / 120);
		const current = pixels(e);
		const pins = {
			velocity: await hash(e.readField('velocity').data),
			dye: await hash(e.readField('dye').data),
			canvas: await hash(current)
		};
		expect(pins.velocity).toBe(
			'a23c95e5ae782df20b599a0fd4463a352dbdc812050caf776161f61638959751'
		);
		expect(pins.dye).toBe(
			'0aafd551bcf7e5919cb2f88035e140058186d8f940c67b438c5e2865f0738333'
		);
		expect(pins.canvas).toBe(
			'30a3853e38f18e4a40d6c94cb342a41f293c0edbf3c5ddd4d0f4cb3511b6ec9c'
		);
		console.log('TRACER_PINS', JSON.stringify(pins));
		await command.writeBenchJson(
			'.svelte-kit/public-tracers/pins.json',
			JSON.stringify(pins)
		);
	}
);
it('tracers leave velocity/grid dye byte-identical', () => {
	const a = create(),
		b = create(true);
	expect(h(b).tracerFailure).toBeNull();
	expect(h(b).tracers).toBeTruthy();
	for (const e of [a, b]) {
		e.splat(0.1, 0.5, 0, 0, { r: 0.3, g: 0.6, b: 0.9 });
		e.advance(100, 0.01);
		pixels(e);
	}
	for (const field of ['velocity', 'dye'] as const)
		expect(bytes(a.readField(field).data)).toEqual(
			bytes(b.readField(field).data)
		);
	expect(h(b).gl.getError()).toBe(0);
});
it('uniform translation drift <.001 cell; splat mass error <3.5%', async () => {
	const e = create(true);
	e.advance(1, 0.01);
	const t = h(e).tracers,
		gl = h(e).gl;
	const state = new Float32Array(t.capacity * 4);
	for (let i = 0; i < 128; i++) {
		state[i * 4] = 0.2 + i * 0.0002;
		state[i * 4 + 1] = 0.4 + (i % 8) * 0.015;
		// Post-hoc unit correction: preserve the original .01-cell-area fixture as UV area.
		state[i * 4 + 2] = 0.01 / (96 * 32);
	}
	h(e).withGl(() => {
		gl.bindTexture(gl.TEXTURE_2D, t.state.read.texture);
		gl.texSubImage2D(
			gl.TEXTURE_2D,
			0,
			0,
			0,
			t.state.width,
			t.state.height,
			gl.RGBA,
			gl.FLOAT,
			state
		);
	});
	// Isolate transport from injection without changing the pre-registered prescribed flow.
	e.setConfig({
		flow: { ...config.flow, tracers: { ...options, rate: 1e-9 } }
	});
	e.advance(100, 0.01);
	const after = read(e, t.state.read),
		v = e.readField('velocity').data;
	let drift = 0;
	for (let i = 0; i < 128; i++)
		drift = Math.max(
			drift,
			Math.hypot(
				(after[i * 4] - state[i * 4]) * 96 - v[0],
				(after[i * 4 + 1] - state[i * 4 + 1]) * 32 - v[1]
			)
		);
	pixels(e);
	const depth = read(e, t.depth);
	let mass = 0,
		carried = 0;
	for (let i = 0; i < 128; i++) carried += after[i * 4 + 2];
	// Same physical mass gate; integrate optical depth over UV-area pixels.
	for (let i = 3; i < depth.length; i += 4)
		mass += depth[i] / (t.depth.width * t.depth.height);
	const error = Math.abs(mass / carried - 1);
	console.log(
		'TRACER_TRANSLATION',
		JSON.stringify({ drift, carried, mass, error })
	);
	await command.writeBenchJson(
		'.svelte-kit/public-tracers/translation.json',
		JSON.stringify({ drift, carried, mass, error })
	);
	expect(drift).toBeLessThan(0.001);
	expect(error).toBeLessThan(0.035);
});
it('solid obstruction contains zero tracer optical depth', () => {
	const e = create(true, false, {
		obstructions: [{ d: 'M 42 42 H 58 V 58 H 42 Z', viewBox: [0, 0, 100, 100] }]
	});
	const gl = h(e).gl,
		initial = new Float32Array(h(e).tracers.capacity * 4);
	// Post-hoc unit correction: retain the same seeded optical mass in UV area.
	initial.set([0.46, 0.5, 0.01 / (96 * 32), 0]);
	h(e).withGl(() => {
		const state = h(e).tracers.state;
		gl.bindTexture(gl.TEXTURE_2D, state.read.texture);
		gl.texSubImage2D(
			gl.TEXTURE_2D,
			0,
			0,
			0,
			state.width,
			state.height,
			gl.RGBA,
			gl.FLOAT,
			initial
		);
	});
	e.advance(100, 0.02);
	pixels(e);
	const t = h(e).tracers,
		p = read(e, t.depth);
	let maximum = 0;
	for (let y = 0; y < t.depth.height; y++)
		for (let x = 0; x < t.depth.width; x++)
			if (
				Math.hypot(
					((x + 0.5) / t.depth.width - 0.5) * 3,
					(y + 0.5) / t.depth.height - 0.5
				) < 0.07
			)
				maximum = Math.max(maximum, p[(y * t.depth.width + x) * 4 + 3]);
	expect(p.some((value) => value > 0)).toBe(true);
	expect(read(e, t.state.read)[0]).toBeLessThan(0.48);
	expect(maximum).toBe(0);
	expect(h(e).gl.getError()).toBe(0);
});
it('hot uniforms allocate/link nothing; presence/depth resize preserve ownership', () => {
	const e = create(),
		gl = h(e).gl,
		creates = vi.spyOn(gl, 'createTexture'),
		deletes = vi.spyOn(gl, 'deleteTexture');
	e.setConfig({ flow: { ...config.flow, tracers: options } });
	expect(creates).toHaveBeenCalledTimes(4);
	expect(deletes).toHaveBeenCalledTimes(1);
	const fieldsFreed = vi.spyOn(gl, 'deleteFramebuffer');
	const t = h(e).tracers,
		state = t.state;
	const links = vi.spyOn(gl, 'linkProgram'),
		allocations = [
			'createTexture',
			'createFramebuffer',
			'createBuffer',
			'createVertexArray',
			'createProgram',
			'createShader',
			'texImage2D'
		].map((n) => vi.spyOn(gl, n as 'createTexture'));
	for (const s of allocations) s.mockClear();
	for (const patch of [
		{ rate: 256 },
		{ sigma: 1 },
		{
			sources: [
				{
					from: { x: 0.2, y: 0.2 },
					to: { x: 0.2, y: 0.8 },
					species: 2 as const
				}
			]
		}
	]) {
		e.setConfig({
			flow: { ...config.flow, tracers: { ...options, ...patch } }
		});
		e.advance(1, 0.01);
		pixels(e);
	}
	expect(links).not.toHaveBeenCalled();
	for (const s of allocations) expect(s).not.toHaveBeenCalled();
	e.resize(384, 96);
	expect(h(e).tracers.state).toBe(state);
	expect(h(e).tracers.depth.width).toBe(384);
	expect(gl.getError()).toBe(0);
	fieldsFreed.mockClear();
	deletes.mockClear();
	e.setConfig({ flow: config.flow });
	expect(h(e).tracers).toBeNull();
	expect(fieldsFreed).toHaveBeenCalledTimes(3);
	expect(deletes).toHaveBeenCalledTimes(3);
});
it('rate changes retain fractional emissions without bursts or gaps', () => {
	const e = create(true),
		t = h(e).tracers as unknown as { serial: number; fraction: number };
	e.setConfig({ flow: { ...config.flow, tracers: { ...options, rate: 10 } } });
	e.advance(1, 0.05);
	expect(t.serial).toBe(0);
	expect(t.fraction).toBeCloseTo(0.5);
	e.setConfig({ flow: { ...config.flow, tracers: { ...options, rate: 30 } } });
	e.advance(1, 0.05);
	expect(t.serial).toBe(2);
	expect(t.fraction).toBeCloseTo(0);
	e.setConfig({ flow: { ...config.flow, tracers: { ...options, rate: 5 } } });
	e.advance(1, 0.1);
	expect(t.serial).toBe(2);
	expect(t.fraction).toBeCloseTo(0.5);
});
it('failed capacity/depth allocation preserves config, inventory and retry', () => {
	const e = create(true),
		gl = h(e).gl,
		original = h(e).tracers;
	const internals = e as unknown as { config: { FLOW: FlowConfig } },
		old = internals.config.FLOW;
	const complete = gl.checkFramebufferStatus.bind(gl);
	const failure = vi
		.spyOn(gl, 'checkFramebufferStatus')
		.mockReturnValue(gl.FRAMEBUFFER_UNSUPPORTED);
	expect(() =>
		e.setConfig({
			flow: { ...config.flow, tracers: { ...options, capacity: 1024 } }
		})
	).toThrow();
	expect(internals.config.FLOW).toBe(old);
	expect(h(e).tracers).toBe(original);
	expect(() => e.setConfig({ dyeResolution: 128 })).toThrow();
	expect(() => e.resize(384, 96)).toThrow();
	expect(h(e).canvas.width).toBe(288);
	expect(h(e).tracers).toBe(original);
	failure.mockImplementation(complete);
	e.setConfig({
		flow: { ...config.flow, tracers: { ...options, capacity: 1024 } }
	});
	expect(h(e).tracers.capacity).toBe(1024);
	e.advance(1, 0.01);
	pixels(e);
	expect(gl.getError()).toBe(0);
});
it('forced blend-probe fallback warns once, preserves grid and retries after removal', () => {
	const plain = create(),
		e = create(),
		gl = h(e).gl;
	const warn = vi.spyOn(console, 'warn').mockImplementation(() => {}),
		readPixels = gl.readPixels.bind(gl);
	const probe = vi.spyOn(gl, 'readPixels').mockImplementation(((
		...args: unknown[]
	) => {
		// Post-hoc test correction: readPixels destination is argument 6, not 7.
		// The first M2 run never forced the probe failure; thresholds unchanged.
		if (args[2] === 1 && args[3] === 1 && args[6] instanceof Float32Array)
			(args[6] as Float32Array).fill(0);
		else Reflect.apply(readPixels, gl, args);
	}) as typeof gl.readPixels);
	e.setConfig({ flow: { ...config.flow, tracers: options } });
	expect(h(e).tracers).toBeNull();
	expect(h(e).tracerFailure).toContain('blending');
	expect(warn).toHaveBeenCalledTimes(1);
	probe.mockRestore();
	for (const engine of [plain, e]) engine.advance(2, 0.01);
	expect(pixels(e)).toEqual(pixels(plain));
	e.setConfig({ flow: config.flow });
	e.setConfig({ flow: { ...config.flow, tracers: options } });
	expect(h(e).tracers).toBeTruthy();
	expect(warn).toHaveBeenCalledTimes(1);
	expect(gl.getError()).toBe(0);
});
it('default 262144/2048 ring overwrites safely after 128 simulation seconds', () => {
	const e = create();
	e.setConfig({
		flow: { ...config.flow, tracers: { sources: options.sources } }
	});
	const t = h(e).tracers as unknown as { cursor: number; serial: number };
	e.advance(129, 1);
	const state = read(e, h(e).tracers.state.read);
	expect(state.every(Number.isFinite)).toBe(true);
	expect(h(e).tracers.capacity).toBe(262144);
	expect((t as unknown as { cursor: number }).cursor).toBe(2048);
	expect(h(e).gl.getError()).toBe(0);
});
it('context restoration rebuilds tracers without GL errors', async () => {
	const e = create(true),
		gl = h(e).gl,
		ext = gl.getExtension('WEBGL_lose_context')!;
	const c = h(e).canvas;
	const lost = new Promise<void>((r) =>
		c.addEventListener('webglcontextlost', () => r(), { once: true })
	);
	ext.loseContext();
	await lost;
	// Post-hoc harness correction: Chromium ignores restoreContext while the
	// loss-event task is unwinding; match context-restore.browser.test.ts.
	// The first M2 run timed out; the 60 s timeout and restore assertions stay fixed.
	await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
	const restored = new Promise<void>((r) =>
		c.addEventListener('webglcontextrestored', () => r(), { once: true })
	);
	ext.restoreContext();
	await restored;
	expect(h(e).tracers).toBeTruthy();
	e.advance(2, 0.01);
	pixels(e);
	expect(gl.getError()).toBe(0);
});
it('shared interleaving leaves a plain sibling byte-identical', () => {
	const ref = create(),
		plain = create(false, true),
		traced = create(true, true);
	for (const e of [ref, plain])
		e.splat(0.1, 0.5, 0, 0, { r: 0.3, g: 0.6, b: 0.9 });
	ref.advance(30, 0.01);
	for (let i = 0; i < 30; i++) {
		traced.advance(1, 0.01);
		traced.renderOnce();
		plain.advance(1, 0.01);
		plain.renderOnce();
	}
	for (const field of ['velocity', 'dye'] as const)
		expect(bytes(plain.readField(field).data)).toEqual(
			bytes(ref.readField(field).data)
		);
	expect(h(traced).gl.getError()).toBe(0);
});
it(
	'reports default-capacity GPU medians; saves absorption screenshot',
	{ timeout: 120000 },
	async () => {
		const a = create(false, false, { simResolution: 85, dyeResolution: 256 }),
			b = create(false, false, { simResolution: 85, dyeResolution: 256 });
		b.setConfig({
			flow: {
				...config.flow,
				tracers: { ...options, capacity: 262144, rate: 2048 }
			}
		});
		for (const e of [a, b]) {
			e.resize(768, 256);
			e.advance(60, 0.02);
		}
		const timings: number[][] = [[], []];
		for (const [index, e] of [a, b].entries()) {
			const gl = h(e).gl,
				ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
			// Release CI may use SwiftShader without GPU timers; keep visual/invariant gates portable.
			if (!ext) continue;
			for (let i = 0; i < 15; i++) {
				const q = gl.createQuery()!;
				gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
				e.advance(1, 0.01);
				e.renderOnce();
				gl.endQuery(ext.TIME_ELAPSED_EXT);
				gl.flush();
				while (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE))
					await new Promise((r) => setTimeout(r, 5));
				if (!gl.getParameter(ext.GPU_DISJOINT_EXT))
					timings[index].push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6);
				gl.deleteQuery(q);
			}
		}
		const medians = timings.map((v) =>
			v.length ? v.sort((a, b) => a - b)[Math.floor(v.length / 2)] : null
		);
		console.log('TRACER_PERF', JSON.stringify({ renderer, medians, timings }));
		await command.writeBenchJson(
			'.svelte-kit/public-tracers/perf.json',
			JSON.stringify({ renderer, medians, timings })
		);
		// Post-hoc visual-setup correction: the first M2 screenshot advanced
		// only ~5.6 cells at 4 cells/s, showing a source bar, not developed streaks.
		// Timing scene/measurements above and all registered thresholds are unchanged.
		b.setConfig({ flow: config.flow });
		b.setConfig({
			flow: {
				...config.flow,
				prescribed: {
					kind: 'grid',
					velocity: { width: 1, height: 1, data: [128, 0], scale: 128 }
				},
				tracers: {
					capacity: 262144,
					rate: 2048,
					sources: [
						{
							from: { x: 0.15, y: 0.43 },
							to: { x: 0.15, y: 0.45 },
							species: 0
						},
						{ from: { x: 0.15, y: 0.55 }, to: { x: 0.15, y: 0.57 }, species: 1 }
					]
				}
			}
		});
		b.advance(240, 0.01);
		b.renderOnce();
		const tracerDepth = h(b).tracers.depth,
			depthPixels = read(b, tracerDepth);
		let downstreamDepth = 0;
		for (let y = 0; y < tracerDepth.height; y++)
			for (
				let x = Math.floor(0.5 * tracerDepth.width);
				x < tracerDepth.width;
				x++
			)
				downstreamDepth += depthPixels[(y * tracerDepth.width + x) * 4 + 3];
		expect(downstreamDepth).toBeGreaterThan(0);
		const c = h(b).canvas;
		c.dataset.tracerShot = '';
		document.body.append(c);
		b.advance(1, 0.01);
		b.renderOnce();
		await command.writeBenchBase64(
			'.svelte-kit/public-tracers/absorption-tracers.png',
			c.toDataURL('image/png').split(',')[1]
		);
		b.resize(1152, 384);
		b.advance(1, 0.01);
		b.renderOnce();
		await command.writeBenchBase64(
			'.svelte-kit/public-tracers/filtering-upscale.png',
			c.toDataURL('image/png').split(',')[1]
		);
	}
);
