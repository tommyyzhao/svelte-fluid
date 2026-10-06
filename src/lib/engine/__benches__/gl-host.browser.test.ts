import { afterEach, describe, expect, it } from 'vitest';
import { FluidEngine, _setContextTier } from '../FluidEngine.js';
import { activeFrameSubscribers } from '../frame-scheduler.js';
import { acquireGlHost, releaseGlHost } from '../gl-host.js';
import type { GlHost, GlHostInstance } from '../gl-host.js';
import { createBlit, getWebGLContext, compileShader, disposeFBO } from '../gl-utils.js';
import { JumpFlood } from '../jump-flood.js';
import { baseVertexShader, jumpFloodSeedShader } from '../shaders.js';
import type { FBO } from '../internal-types.js';

const VERTEX = `#version 300 es
layout(location = 0) in vec2 aPosition;
void main () { gl_Position = vec4(aPosition, 0.0, 1.0); }`;
const SOLID = `#version 300 es
precision highp float;
uniform vec4 uColor;
out vec4 color;
void main () { color = uColor; }`;
// A second program whose output depends on gl_FragCoord, so a leaked viewport shows.
const STRIPES = `#version 300 es
precision highp float;
uniform vec4 uColor;
out vec4 color;
void main () { color = mod(floor(gl_FragCoord.x), 2.0) < 1.0 ? uColor : vec4(0.0, 0.0, 0.0, 1.0); }`;

const live: GlHostInstance[] = [];
afterEach(() => {
	for (const instance of live.splice(0)) releaseGlHost(instance);
	document.body.replaceChildren();
});

function instance(width: number, height: number): GlHostInstance & { lost: number; restored: number } {
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	document.body.append(canvas);
	const it = {
		canvas,
		lost: 0,
		restored: 0,
		onContextLost() {
			it.lost++;
		},
		onContextRestored() {
			it.restored++;
		}
	};
	live.push(it);
	return it;
}

function colour(i: number): [number, number, number] {
	return [(i * 37) % 256, (i * 91 + 40) % 256, (i * 151 + 80) % 256];
}

async function draw(host: GlHost, inst: GlHostInstance, name: 'solid' | 'stripes', rgb: [number, number, number]): Promise<void> {
	const ok = host.run(inst, (gl) => {
		expect(gl.getParameter(gl.FRAMEBUFFER_BINDING)).toBeNull();
		expect(gl.getParameter(gl.CURRENT_PROGRAM)).toBeNull();
		expect(gl.isEnabled(gl.BLEND)).toBe(false);
		expect(gl.getParameter(gl.VERTEX_ARRAY_BINDING)).not.toBeNull();
		expect(Array.from(gl.getParameter(gl.VIEWPORT) as Int32Array)).toEqual([0, 0, inst.canvas.width, inst.canvas.height]);
		const p = host.program(name, VERTEX, name === 'solid' ? SOLID : STRIPES);
		p.bind();
		gl.uniform4f(p.uniforms.uColor, rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, 1);
		host.blit(null);
		// Deliberately leak state a careless sibling could depend on.
		gl.enable(gl.BLEND);
		gl.blendFunc(gl.ZERO, gl.ZERO);
		gl.viewport(0, 0, 1, 1);
		gl.bindVertexArray(null);
		gl.useProgram(null);
	});
	expect(ok).toBe(true);
	await host.present(inst);
}

/** Pixels of the visible bitmaprenderer canvas, via a 2D copy. */
function pixels(canvas: HTMLCanvasElement): Uint8ClampedArray {
	const copy = document.createElement('canvas');
	copy.width = canvas.width;
	copy.height = canvas.height;
	const ctx = copy.getContext('2d')!;
	ctx.drawImage(canvas, 0, 0);
	return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
}

function expectSolid(canvas: HTMLCanvasElement, rgb: [number, number, number], stripes = false): void {
	const px = pixels(canvas);
	for (let i = 0; i < px.length; i += 4) {
		const x = (i / 4) % canvas.width;
		const want = stripes && x % 2 === 1 ? [0, 0, 0] : rgb;
		expect([px[i], px[i + 1], px[i + 2], px[i + 3]]).toEqual([...want, 255]);
	}
}

const nextTask = () => new Promise((r) => setTimeout(r, 0));

describe('gl-host (ADR-0088)', () => {
	it('presents 24 instances of mixed sizes on one live context', async () => {
		const instances = Array.from({ length: 24 }, (_, i) => instance(16 + i, 12 + (i % 5)));
		const host = acquireGlHost(instances[0]);
		let contextLost = 0;
		const onLost = () => contextLost++;
		host.gl.canvas.addEventListener('webglcontextlost', onLost);
		for (const inst of instances) expect(acquireGlHost(inst)).toBe(host);
		// All 24 snapshots start in this task, before any promise resolves. A
		// readback from each canvas proves snapshot-at-call despite surface reuse.
		await Promise.all(instances.map((inst, i) => draw(host, inst, 'solid', colour(i))));
		instances.forEach((inst, i) => expectSolid(inst.canvas, colour(i)));
		expect(contextLost).toBe(0);
		expect(host.gl.isContextLost()).toBe(false);
		expect(instances.every((inst) => inst.lost === 0)).toBe(true);
		expect(host.gl.getError()).toBe(host.gl.NO_ERROR);
		// The host never subscribes frames; idle instances cost nothing.
		expect(activeFrameSubscribers()).toBe(0);
		await new Promise((r) => setTimeout(r, 20));
		instances.forEach((inst, i) => expectSolid(inst.canvas, colour(i)));
		expect(activeFrameSubscribers()).toBe(0);
		host.gl.canvas.removeEventListener('webglcontextlost', onLost);
	});

	it('does not leak GL state between instances alternating two programs', async () => {
		const a = instance(20, 10);
		const b = instance(13, 17);
		const host = acquireGlHost(a);
		acquireGlHost(b);
		const poisonFbo = host.gl.createFramebuffer();
		try {
			for (let round = 0; round < 4; round++) {
				await draw(host, a, 'solid', [200, 30, 90]);
				host.gl.bindFramebuffer(host.gl.FRAMEBUFFER, poisonFbo);
				await draw(host, b, 'stripes', [10, 220, 140]);
				host.gl.bindFramebuffer(host.gl.FRAMEBUFFER, poisonFbo);
				expectSolid(a.canvas, [200, 30, 90]);
				expectSolid(b.canvas, [10, 220, 140], true);
			}
			expect(host.gl.getError()).toBe(host.gl.NO_ERROR);
		} finally {
			host.gl.deleteFramebuffer(poisonFbo);
		}
	});

	it('recovers every instance after a forced context loss and restore', async () => {
		const instances = Array.from({ length: 24 }, (_, i) => instance(18, 14 + i));
		const host = acquireGlHost(instances[0]);
		for (const inst of instances) acquireGlHost(inst);
		await Promise.all(instances.map((inst, i) => draw(host, inst, 'solid', colour(i))));
		const lose = host.gl.getExtension('WEBGL_lose_context')!;
		const surface = host.gl.canvas;
		const lost = new Promise((r) => surface.addEventListener('webglcontextlost', r, { once: true }));
		lose.loseContext();
		await lost;
		expect(instances.every((inst) => inst.lost === 1)).toBe(true);
		expect(host.run(instances[0], () => {})).toBe(false);
		// Lost: the last presented frame stays on every visible canvas.
		instances.forEach((inst, i) => expectSolid(inst.canvas, colour(i)));
		// Chromium ignores restoreContext() inside the loss event's task.
		await nextTask();
		const restored = new Promise((r) => surface.addEventListener('webglcontextrestored', r, { once: true }));
		lose.restoreContext();
		await restored;
		expect(instances.every((inst) => inst.restored === 1)).toBe(true);
		await Promise.all(instances.map((inst, i) => draw(host, inst, 'stripes', colour(i + 7))));
		instances.forEach((inst, i) => expectSolid(inst.canvas, colour(i + 7), true));
		host.gl.getError();
		await draw(host, instances[0], 'solid', [1, 2, 3]);
		expect(host.gl.getError()).toBe(host.gl.NO_ERROR);
	});

	it('matches default and none colour conversion for premultiplied translucent snapshots', async () => {
		const a = instance(32, 24);
		const b = instance(32, 24);
		const host = acquireGlHost(a);
		acquireGlHost(b);
		const fragment = `#version 300 es
precision highp float;
out vec4 color;
void main () {
	float alpha = floor(gl_FragCoord.x / 8.0) / 4.0;
	color = vec4(vec3(0.8, 0.4, 0.2) * alpha, alpha);
}`;
		host.run(a, () => {
			host.program('snapshot-alpha', VERTEX, fragment).bind();
			host.blit(null);
		});
		expect(host.gl.getContextAttributes()?.premultipliedAlpha).toBe(true);
		const pending = host.present(a);
		const bitmap = await createImageBitmap(host.gl.canvas, { colorSpaceConversion: 'none' });
		try {
			b.canvas.getContext('bitmaprenderer')!.transferFromImageBitmap(bitmap);
		} finally {
			bitmap.close();
		}
		await pending;
		expect(pixels(b.canvas)).toEqual(pixels(a.canvas));
		// Native compositing must also agree, not just unpremultiplied readback.
		for (const colorSpace of ['srgb', 'display-p3'] as const) for (const background of ['#fff', '#172331']) {
			const composite = (canvas: HTMLCanvasElement) => {
				const copy = document.createElement('canvas');
				copy.width = canvas.width;
				copy.height = canvas.height;
				const ctx = copy.getContext('2d', { colorSpace })!;
				ctx.fillStyle = background;
				ctx.fillRect(0, 0, copy.width, copy.height);
				ctx.drawImage(canvas, 0, 0);
				return ctx.getImageData(0, 0, copy.width, copy.height).data;
			};
			expect(composite(b.canvas)).toEqual(composite(a.canvas));
		}
		expect(Array.from(pixels(a.canvas)).filter((_, i) => i % 4 === 3)).toContain(128);
		expect(host.gl.getError()).toBe(host.gl.NO_ERROR);
	});

	for (const toneMapping of ['none', 'neutral', 'agx'] as const) {
		for (const output of ['transparent', 'reveal', 'distortion'] as const) {
			it(`preserves visible sRGB ${output} ${toneMapping} snapshots against none conversion`, async () => {
				const a = instance(160, 100);
				const b = instance(160, 100);
				_setContextTier('shared');
				let engine: FluidEngine | undefined;
				try {
					engine = new FluidEngine({ canvas: a.canvas, autoStart: false, config: {
						seed: 5, pointerInput: false, initialSplatCount: 0, dyeResolution: 128,
						simResolution: 32, transparent: true, toneMapping,
						reveal: output === 'reveal', distortion: output === 'distortion'
					} });
					const host = acquireGlHost(engine as unknown as GlHostInstance);
					acquireGlHost(b);
					for (const [x, color] of [[0.25, { r: 10, g: 0, b: 0 }], [0.5, { r: 0, g: 10, b: 0 }], [0.75, { r: 0, g: 0, b: 10 }]] as const)
						engine.splat(x, 0.5, 0, 0, color);
					engine.advance(3, 1 / 60);
					engine.renderOnce();
					const reference = await createImageBitmap(host.gl.canvas, { colorSpaceConversion: 'none' });
					try { b.canvas.getContext('bitmaprenderer')!.transferFromImageBitmap(reference); }
					finally { reference.close(); }
					await engine.presented();
					expect(pixels(a.canvas)).toEqual(pixels(b.canvas));
					expect(pixels(a.canvas).some((v, i) => i % 4 === 3 && v > 0 && v < 255)).toBe(true);
				} finally {
					_setContextTier('auto');
					engine?.dispose();
				}
			});
		}
	}

	it('compiles define variants after the GLSL 300 version directive', async () => {
		const a = instance(12, 9);
		const host = acquireGlHost(a);
		host.run(a, () => {
			const fragment = SOLID.replace('color = uColor;', 'color = TINT;');
			const p = host.program('defined-solid', VERTEX, fragment, ['TINT vec4(1.0, 0.0, 0.0, 1.0)']);
			p.bind();
			host.blit(null);
		});
		await host.present(a);
		expectSolid(a.canvas, [255, 0, 0]);
		expect(host.gl.getError()).toBe(host.gl.NO_ERROR);
	});

	it('keeps only the latest of overlapping presents, including after release/acquire churn', async () => {
		for (let i = 0; i < 24; i++) {
			const a = instance(12 + (i % 3), 9);
			const host = acquireGlHost(a);
			const old = draw(host, a, 'solid', [200, 0, 0]);
			const latest = draw(host, a, 'solid', colour(i));
			await Promise.all([old, latest]);
			expectSolid(a.canvas, colour(i));
			releaseGlHost(a);
		}
		expect(live.every((inst) => (inst as ReturnType<typeof instance>).lost === 0)).toBe(true);
	});

	it('builds the same jump-flood SDF through the host program cache as standalone', () => {
		const size = 128;
		const r = 40;
		const coverage = new Uint8Array(size * size * 4);
		for (let y = 0; y < size; y++)
			for (let x = 0; x < size; x++) {
				coverage[(y * size + x) * 4] = Math.hypot(x + 0.5 - 64, y + 0.5 - 64) <= r ? 255 : 0;
				coverage[(y * size + x) * 4 + 3] = 255;
			}
		const upload = (gl: WebGL2RenderingContext) => {
			const tex = gl.createTexture()!;
			gl.bindTexture(gl.TEXTURE_2D, tex);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, coverage);
			return tex;
		};
		const read = (gl: WebGL2RenderingContext, sdf: FBO) => {
			const px = new Float32Array(size * size * 4);
			gl.bindFramebuffer(gl.FRAMEBUFFER, sdf.fbo);
			gl.readPixels(0, 0, size, size, gl.RGBA, gl.FLOAT, px);
			return Array.from({ length: size * size }, (_, i) => px[i * 4]);
		};

		// Standalone: the FluidEngine construction path.
		const own = document.createElement('canvas');
		const { gl: g, ext } = getWebGLContext(own);
		const gl = g as WebGL2RenderingContext;
		const vao = gl.createVertexArray();
		gl.bindVertexArray(vao);
		const vertices = gl.createBuffer()!;
		const indices = gl.createBuffer()!;
		const blit = createBlit(gl, vertices, indices);
		const vs = compileShader(gl, gl.VERTEX_SHADER, baseVertexShader);
		const standaloneJfa = new JumpFlood(gl, ext, vs, blit);
		const source = upload(gl);
		const output = standaloneJfa.build(source, size, size, null);
		const expected = read(gl, output);
		standaloneJfa.dispose();
		disposeFBO(gl, output);
		gl.deleteTexture(source);
		gl.deleteShader(vs);
		gl.deleteBuffer(vertices);
		gl.deleteBuffer(indices);
		gl.deleteVertexArray(vao);
		gl.getExtension('WEBGL_lose_context')?.loseContext();

		const inst = instance(size, size);
		const host = acquireGlHost(inst);
		let actual: number[] = [];
		host.run(inst, (hgl) => {
			const jfa = new JumpFlood(
				hgl,
				host.ext,
				(name, fragment) => host.program(name, baseVertexShader, fragment),
				host.blit.bind(host)
			);
			const source = upload(hgl);
			const sdf = jfa.build(source, size, size, null);
			actual = read(hgl, sdf);
			jfa.dispose();
			disposeFBO(hgl, sdf);
			hgl.deleteTexture(source);
			// The cache still owns the programs after the JumpFlood is gone.
			expect(hgl.isProgram(host.program('jfa-seed', baseVertexShader, jumpFloodSeedShader).program)).toBe(true);
		});
		expect(actual).toHaveLength(size * size);
		expect(actual[64 * size + 64]).toBeLessThan(-30);
		expect(actual[0]).toBeGreaterThan(30);
		expect(actual).toEqual(expected);
		expect(host.gl.getError()).toBe(host.gl.NO_ERROR);
	});
});
