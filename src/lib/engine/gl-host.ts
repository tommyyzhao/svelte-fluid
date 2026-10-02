/*
 * One hidden WebGL2 context shared by second-generation model engines
 * (ADR-0088). This is the only module-level GL state in the library: the
 * context, a program cache and one fullscreen-quad VAO. Instances own their
 * fields and a visible 'bitmaprenderer' canvas; every render goes through
 * run(), so no instance can depend on state a sibling left behind. Frames come
 * from the shared frame-scheduler; the host never schedules work itself.
 * Internal: never root-exported, so GL types stay out of public declarations.
 */

import { compileShader, createBlit, getWebGLContext, makeProgram, WebGLUnavailableError } from './gl-utils.js';
import type { BlitFn, ProgramWrap } from './gl-utils.js';
import { notifyHost } from './notify-host.js';
import type { ExtInfo, FBO } from './types.js';

export interface GlHostInstance {
	/** Visible canvas; its width/height are the instance's pixel size. */
	readonly canvas: HTMLCanvasElement;
	/** Every cached program and instance resource is gone; stop rendering. */
	onContextLost?(): void;
	/** Context is back: rebuild fields. Programs recompile on demand. */
	onContextRestored?(): void;
}

export interface GlHost {
	readonly gl: WebGL2RenderingContext;
	readonly ext: ExtInfo;
	/**
	 * Cached program. `name` identifies vertex+fragment; `defines` are part of
	 * the key. The position attribute must sit at location 0 (the only
	 * attribute, or `layout(location = 0)`). The cache owns the program, and
	 * siblings share it, so set every uniform and texture binding you read.
	 */
	program(name: string, vertex: string, fragment: string, defines?: string[]): ProgramWrap;
	/** Draw the shared quad into `target` (null = host drawing buffer). Only inside run(). */
	blit(target: FBO | null, clear?: boolean): void;
	/**
	 * Size the drawing buffer to `instance.canvas`, reset viewport, FBO, blend,
	 * program and VAO, then call `fn`. Returns false (without calling) while lost.
	 */
	run(instance: GlHostInstance, fn: (gl: WebGL2RenderingContext) => void): boolean;
	/**
	 * Snapshot the drawing buffer for the instance's visible canvas. Call right
	 * after run(); the snapshot is taken synchronously, and the promise
	 * resolves once it is on screen.
	 */
	present(instance: GlHostInstance): Promise<void>;
}

type Surface = OffscreenCanvas | HTMLCanvasElement;
interface Quad {
	vao: WebGLVertexArrayObject;
	buffers: WebGLBuffer[];
	blit: BlitFn;
}
interface Presenter {
	ctx: ImageBitmapRenderingContext;
	seq: number;
}

function createSurface(): { surface: Surface; gl: WebGL2RenderingContext; ext: ExtInfo } {
	const attributes: WebGLContextAttributes = {
		alpha: true, depth: false, stencil: false, antialias: false, preserveDrawingBuffer: false
	};
	let surface: Surface | null = null;
	let gl: WebGL2RenderingContext | null = null;
	if (typeof OffscreenCanvas !== 'undefined') {
		try {
			surface = new OffscreenCanvas(1, 1);
			gl = surface.getContext('webgl2', attributes);
		} catch {
			// OffscreenCanvas exists but WebGL2 is unsupported.
		}
	}
	if (!gl) {
		surface = document.createElement('canvas');
		gl = surface.getContext('webgl2', attributes);
	}
	if (!gl || !surface) throw new WebGLUnavailableError('no-webgl', 'svelte-fluid: WebGL2 is not supported in this browser');
	try {
		// Reuses the context above; never invokes gl-utils' WebGL1 fallback.
		return { surface, gl, ext: getWebGLContext(surface as HTMLCanvasElement).ext };
	} catch (error) {
		gl.getExtension('WEBGL_lose_context')?.loseContext();
		throw error;
	}
}

function createQuad(gl: WebGL2RenderingContext): Quad {
	const vao = gl.createVertexArray();
	const vertices = gl.createBuffer();
	const indices = gl.createBuffer();
	try {
		if (!vao || !vertices || !indices) throw new Error('svelte-fluid: could not allocate the shared quad');
		gl.bindVertexArray(vao);
		const blit = createBlit(gl, vertices, indices);
		gl.bindVertexArray(null);
		return { vao, buffers: [vertices, indices], blit };
	} catch (error) {
		gl.deleteVertexArray(vao);
		gl.deleteBuffer(vertices);
		gl.deleteBuffer(indices);
		throw error;
	}
}

class Host implements GlHost {
	readonly instances = new Map<GlHostInstance, Presenter>();
	readonly gl: WebGL2RenderingContext;
	ext: ExtInfo;
	private surface: Surface;
	private programs = new Map<string, ProgramWrap>();
	private quad: Quad | null;

	constructor() {
		({ surface: this.surface, gl: this.gl, ext: this.ext } = createSurface());
		try {
			this.quad = createQuad(this.gl);
		} catch (error) {
			this.gl.getExtension('WEBGL_lose_context')?.loseContext();
			throw error;
		}
		this.surface.addEventListener('webglcontextlost', this.onLost);
		this.surface.addEventListener('webglcontextrestored', this.onRestored);
	}

	program(name: string, vertex: string, fragment: string, defines?: string[]): ProgramWrap {
		if (!this.quad || this.gl.isContextLost()) throw new Error('svelte-fluid: gl-host context is lost or released');
		const keywords = [...new Set(defines)].sort();
		const key = JSON.stringify([name, keywords]);
		let wrap = this.programs.get(key);
		if (wrap) return wrap;
		const gl = this.gl;
		// GLSL 300 requires #version before any #define; legacy GLSL has no version.
		const prefix = keywords.map((keyword) => `#define ${keyword}\n`).join('');
		const source = (src: string) => src.replace(/^(\s*#version[^\n]*\n)?/, (version) => version + prefix);
		const vs = compileShader(gl, gl.VERTEX_SHADER, source(vertex));
		try {
			const fs = compileShader(gl, gl.FRAGMENT_SHADER, source(fragment));
			try {
				wrap = makeProgram(gl, vs, fs);
			} finally {
				gl.deleteShader(fs);
			}
		} finally {
			gl.deleteShader(vs);
		}
		this.programs.set(key, wrap);
		return wrap;
	}

	blit(target: FBO | null, clear?: boolean): void {
		if (!this.quad) return;
		// Rebind: an instance may have bound its own VAO inside run().
		this.gl.bindVertexArray(this.quad.vao);
		this.quad.blit(target, clear);
	}

	run(instance: GlHostInstance, fn: (gl: WebGL2RenderingContext) => void): boolean {
		const gl = this.gl;
		if (!this.quad || gl.isContextLost() || !this.instances.has(instance)) return false;
		const width = Math.max(1, instance.canvas.width);
		const height = Math.max(1, instance.canvas.height);
		if (this.surface.width !== width) this.surface.width = width;
		if (this.surface.height !== height) this.surface.height = height;
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
		gl.disable(gl.BLEND);
		gl.useProgram(null);
		gl.bindVertexArray(this.quad.vao);
		fn(gl);
		return true;
	}

	present(instance: GlHostInstance): Promise<void> {
		const presenter = this.instances.get(instance);
		if (!presenter || this.gl.isContextLost()) return Promise.resolve();
		// Not transferToImageBitmap(): Chrome intermittently crashed the renderer
		// on loseContext() while a transferred WebGL bitmap was displayed
		// (ADR-0088). createImageBitmap snapshots the drawing buffer now and
		// resolves later; a newer present or a release drops the stale bitmap.
		const seq = ++presenter.seq;
		return createImageBitmap(this.surface).then(
			(bitmap) => {
				if (presenter.seq !== seq || this.instances.get(instance) !== presenter || this.gl.isContextLost()) {
					bitmap.close();
					return;
				}
				try {
					presenter.ctx.transferFromImageBitmap(bitmap);
				} finally {
					bitmap.close();
				}
			},
			(error) => {
				if (presenter.seq === seq && this.instances.get(instance) === presenter)
					console.error('svelte-fluid: gl-host present failed', error);
			}
		);
	}

	private onLost = (event: Event): void => {
		event.preventDefault();
		this.programs.clear();
		this.quad = null;
		for (const presenter of this.instances.values()) presenter.seq++;
		for (const instance of [...this.instances.keys()]) {
			if (this.instances.has(instance)) notifyHost(() => instance.onContextLost?.(), 'onContextLost');
		}
	};

	private onRestored = (): void => {
		try {
			// Extensions (EXT_color_buffer_float) must be re-enabled after a restore.
			this.ext = getWebGLContext(this.surface as HTMLCanvasElement).ext;
			this.quad = createQuad(this.gl);
		} catch (error) {
			console.error('svelte-fluid: gl-host restore failed', error);
			return;
		}
		for (const instance of [...this.instances.keys()]) {
			if (this.instances.has(instance)) notifyHost(() => instance.onContextRestored?.(), 'onContextRestored');
		}
	};

	dispose(): void {
		const gl = this.gl;
		this.surface.removeEventListener('webglcontextlost', this.onLost);
		this.surface.removeEventListener('webglcontextrestored', this.onRestored);
		if (!gl.isContextLost()) {
			for (const wrap of this.programs.values()) gl.deleteProgram(wrap.program);
			if (this.quad) {
				gl.deleteVertexArray(this.quad.vao);
				for (const buffer of this.quad.buffers) gl.deleteBuffer(buffer);
			}
		}
		this.programs.clear();
		this.quad = null;
		// Unlike an engine (invariant #6) nothing rebuilds on this context: the
		// next acquire makes a new host, so free the slot now rather than at GC,
		// or mount/unmount churn piles up contexts toward the page cap.
		gl.getExtension('WEBGL_lose_context')?.loseContext();
	}
}

let host: Host | null = null;

/** Register `instance` on the shared host, creating the context on first use. */
export function acquireGlHost(instance: GlHostInstance): GlHost {
	if (host?.instances.has(instance)) return host;
	const ctx = instance.canvas.getContext('bitmaprenderer');
	if (!ctx) throw new Error('svelte-fluid: canvas has no bitmaprenderer context (already used for another context type?)');
	host ??= new Host();
	host.instances.set(instance, { ctx, seq: 0 });
	return host;
}

/** Unregister `instance`; the last release disposes the context and cache. */
export function releaseGlHost(instance: GlHostInstance): void {
	if (!host?.instances.delete(instance)) return;
	if (host.instances.size > 0) return;
	host.dispose();
	host = null;
}
