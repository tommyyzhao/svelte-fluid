import { compileShader, createFBO, disposeFBO, makeProgram, supportRenderTextureFormat } from '../gl-utils.js';
import type { ProgramWrap } from '../gl-utils.js';
import type { FBO } from '../internal-types.js';
import { WebGLUnavailableError } from '../gl-support.js';
import { mulberry32 } from '../rng.js';
import type { Rng } from '../rng.js';
import { mixtureLut } from './palette.js';
import * as shaders from './liquid-shaders.js';
import type { Counts, LiquidOptions, LiquidScene, LiquidSim, LiquidTick, Rect, RenderOptions, SensorFrame, Species, Wind } from './types.js';

const CAPACITY = 65_536;
const SUBSTEPS = 2;
const PRESSURE_ITERATIONS = 24;
const OMEGA = 1.8;
const DENSITY_CORRECTION = 8;
const FLIP_RATIO = 0.7;
const UNAVAILABLE = 'This garden needs WebGL2 floating-point rendering. Enable hardware acceleration or try another browser.';
type MutableCounts = [number, number, number];
type Pair = { a: FBO; b: FBO; fbo: WebGLFramebuffer };
type Snapshot = {
	tick: number;
	epoch: number;
	seeded: MutableCounts;
	emitted: MutableCounts;
	drained: MutableCounts[];
};
type Readback = {
	buffer: WebGLBuffer;
	sync: WebGLSync | null;
	snapshot: Snapshot | null;
};
type SceneResources = {
	terrain: FBO;
	faces: FBO;
	old: FBO;
	velocity: [FBO, FBO];
	cells: Pair;
	divergence: FBO;
	pressure: [FBO, FBO];
	sensors: Pair;
	tally: FBO;
	occupancy: FBO;
	mixture: [FBO, FBO];
	mixtureTick: number;
};

function integer(value: number, name: string, min: number, max: number): void {
	if (!Number.isInteger(value) || value < min || value > max)
		throw new RangeError(`Liquid ${name} must be an integer from ${min} to ${max}`);
}
function finite(value: number, name: string, min: number, max: number): void {
	if (!Number.isFinite(value) || value < min || value > max) throw new RangeError(`Liquid ${name} must be finite, from ${min} to ${max}`);
}
function rectangle(rect: Rect, width: number, height: number, name: string): void {
	if (!rect) throw new TypeError(`Liquid ${name} needs a rectangle`);
	integer(rect.x, `${name}.x`, 0, width - 1);
	integer(rect.y, `${name}.y`, 0, height - 1);
	integer(rect.w, `${name}.w`, 1, width - rect.x);
	integer(rect.h, `${name}.h`, 1, height - rect.y);
}
function species(value: Species): void {
	integer(value, 'species', 0, 2);
}

/** Internal, instance-owned WebGL2 MAC-grid PIC/FLIP solver. Never root-exported. */
export class LiquidEngine implements LiquidSim {
	readonly canvas: HTMLCanvasElement;
	private readonly gl: WebGL2RenderingContext;
	private readonly programs = new Map<string, ProgramWrap>();
	private readonly targets = new Set<FBO>();
	private readonly framebuffers = new Set<WebGLFramebuffer>();
	private particles!: [Pair, Pair];
	private palette!: FBO;
	private vao: WebGLVertexArrayObject | null = null;
	private resources: SceneResources | null = null;
	private scene: LiquidScene | null = null;
	private readbacks: Readback[] = [];
	private density: [FBO, FBO] | null = null;
	private wind: FBO | null = null;
	private lastWind: Wind | null = null;
	private windData = new Float32Array(0);
	private hasWind = false;
	private rng: Rng = mulberry32(1);
	private nextSlot = 0;
	private particleSide = 0;
	private pressureSide = 0;
	private epoch = 0;
	private lastTick = -1;
	private seededCounts: MutableCounts = [0, 0, 0];
	private emittedCounts: MutableCounts = [0, 0, 0];
	private drainedCounts: MutableCounts[] = [];
	private lost = false;
	private disposed = false;

	constructor(private readonly options: LiquidOptions) {
		if (!options?.canvas || typeof options.canvas.getContext !== 'function') throw new TypeError('Liquid needs a canvas');
		integer(options.seed, 'seed', 0, 0xffff_ffff);
		const lut = mixtureLut(options.palette);
		this.canvas = options.canvas;
		const gl = this.canvas.getContext('webgl2', {
			alpha: true,
			premultipliedAlpha: true,
			antialias: false,
			depth: false,
			stencil: false
		});
		if (!gl) throw new WebGLUnavailableError('no-webgl', UNAVAILABLE);
		this.gl = gl;
		try {
			this.build(lut);
		} catch (error) {
			this.release();
			throw error;
		}
		this.canvas.addEventListener('webglcontextlost', this.contextLost);
		this.canvas.addEventListener('webglcontextrestored', this.contextRestored);
	}

	get emitted(): Counts {
		return [...this.emittedCounts];
	}
	get capacityLeft(): number {
		return CAPACITY - this.nextSlot;
	}

	load(input: LiquidScene): void {
		this.assertLive();
		this.validateScene(input);
		if (this.lost) return;
		this.clearScene();
		const scene: LiquidScene = {
			...input,
			terrain: input.terrain.slice(),
			fills: input.fills.map((v) => ({ ...v, rect: { ...v.rect } })),
			sensors: input.sensors.map((v) => ({ ...v, rect: { ...v.rect } })),
			drains: input.drains.map((v) => ({ ...v, rect: { ...v.rect } }))
		};
		this.scene = scene;
		this.epoch++;
		this.lastTick = -1;
		this.nextSlot = 0;
		this.particleSide = this.pressureSide = 0;
		this.seededCounts = [0, 0, 0];
		this.emittedCounts = [0, 0, 0];
		this.drainedCounts = scene.drains.map(() => [0, 0, 0]);
		this.rng = mulberry32((this.options.seed + this.epoch) >>> 0);
		for (const pair of this.particles) this.clear(pair.fbo, 256, 256, true);
		const { gl } = this;
		const { width: w, height: h } = scene;
		try {
			this.resources = {
				terrain: this.target(w, h, gl.R8, gl.RED, gl.UNSIGNED_BYTE),
				faces: this.target(w + 1, h + 1),
				old: this.target(w + 1, h + 1),
				velocity: [this.target(w + 1, h + 1), this.target(w + 1, h + 1)],
				cells: this.pair(w, h),
				divergence: this.target(w, h),
				pressure: [this.target(w, h), this.target(w, h)],
				sensors: this.pair(32, 1),
				tally: this.target(17, 1),
				occupancy: this.target(w, h, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE),
				mixture: [
					this.target(w, h, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.LINEAR),
					this.target(w, h, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.LINEAR)
				],
				mixtureTick: -2
			};
			this.uploadTerrain();
			for (const fill of scene.fills) {
				this.spawn(fill.species, fill.markers, fill.rect, 0, 0, true);
				this.seededCounts[fill.species] += fill.markers;
			}
			for (let i = 0; i < 3; i++) {
				const buffer = gl.createBuffer();
				if (!buffer) throw new Error('Liquid could not allocate readback buffer');
				this.readbacks.push({ buffer, sync: null, snapshot: null });
				gl.bindBuffer(gl.PIXEL_PACK_BUFFER, buffer);
				gl.bufferData(gl.PIXEL_PACK_BUFFER, this.readbackBytes(), gl.STREAM_READ);
			}
			gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
		} catch (error) {
			this.clearScene();
			this.options.onError?.(error);
			throw error;
		}
	}

	step(input: LiquidTick): void {
		this.assertLive();
		if (this.lost) return;
		const scene = this.requireScene();
		integer(input.tick, 'tick', 0, Number.MAX_SAFE_INTEGER);
		if (input.tick <= this.lastTick) throw new RangeError('Liquid tick must strictly increase');
		if (!Array.isArray(input.emit) || !Array.isArray(input.edits)) throw new TypeError('Liquid tick needs emit and edits arrays');
		for (const edit of input.edits) {
			integer(edit.x, 'edit.x', 0, scene.width - 1);
			integer(edit.y, 'edit.y', 0, scene.height - 1);
			integer(edit.kind, 'edit.kind', 0, 6);
		}
		for (const emit of input.emit) {
			species(emit.species);
			integer(emit.count, 'emit.count', 0, Number.MAX_SAFE_INTEGER);
			rectangle(emit.rect, scene.width, scene.height, 'emit.rect');
			finite(emit.velocity?.x, 'emit.velocity.x', -10_000, 10_000);
			finite(emit.velocity?.y, 'emit.velocity.y', -10_000, 10_000);
		}
		this.updateWind(input.wind);
		this.lastTick = input.tick;
		for (const edit of input.edits) scene.terrain[edit.y * scene.width + edit.x] = edit.kind;
		if (input.edits.length) this.uploadTerrain();
		for (const emit of input.emit) {
			const count = Math.min(emit.count, this.capacityLeft);
			this.spawn(emit.species, count, emit.rect, emit.velocity.x, emit.velocity.y, false);
			this.emittedCounts[emit.species] += count;
		}
		const { gl } = this;
		gl.bindVertexArray(this.vao);
		gl.disable(gl.DEPTH_TEST);
		gl.disable(gl.SCISSOR_TEST);
		gl.disable(gl.BLEND);
		gl.colorMask(true, true, true, true);
		if (input.edits.length) for (const pressure of this.resources!.pressure) this.clear(pressure.fbo, pressure.width, pressure.height);
		for (let i = 0; i < SUBSTEPS; i++) this.substep();
		this.measure();
	}

	pollSensors(): readonly SensorFrame[] {
		this.assertLive();
		if (this.lost || !this.scene) return [];
		const { gl, scene } = this;
		const frames: SensorFrame[] = [];
		const pending = this.readbacks.filter((r) => r.snapshot).sort((a, b) => a.snapshot!.tick - b.snapshot!.tick);
		for (const item of pending) {
			if (!item.sync || gl.getSyncParameter(item.sync, gl.SYNC_STATUS) !== gl.SIGNALED) break;
			const snapshot = item.snapshot!;
			const bytes = new Uint8Array(this.readbackBytes());
			gl.bindBuffer(gl.PIXEL_PACK_BUFFER, item.buffer);
			gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, bytes);
			gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
			gl.deleteSync(item.sync);
			item.sync = null;
			item.snapshot = null;
			if (snapshot.epoch !== this.epoch) continue;
			const floats = new Float32Array(bytes.buffer, 0, 32 * 8 + 17 * 4);
			const sensors: Record<string, { counts: Counts; flux: { x: number; y: number } }> = Object.create(null);
			const triple = (at: number): MutableCounts => [Math.round(floats[at]), Math.round(floats[at + 1]), Math.round(floats[at + 2])];
			scene.sensors.forEach((sensor, i) => {
				sensors[sensor.id] = {
					counts: triple(i * 4),
					flux: { x: floats[128 + i * 4], y: floats[129 + i * 4] }
				};
			});
			const drained: Record<string, Counts> = Object.create(null);
			scene.drains.forEach((drain, i) => {
				const counts = triple(256 + (i + 1) * 4);
				drained[drain.id] = counts.map((v, j) => v + snapshot.drained[i][j]) as MutableCounts;
			});
			const alive = triple(256);
			const aliveTotal = alive.reduce((a, b) => a + b, 0);
			const offset = (32 * 8 + 17 * 4) * 4;
			const occupancy = new Uint8Array(scene.width * scene.height);
			for (let i = 0; i < occupancy.length; i++) occupancy[i] = bytes[offset + i * 4];
			frames.push({
				tick: snapshot.tick,
				epoch: snapshot.epoch,
				sensors,
				drained,
				alive,
				seeded: snapshot.seeded,
				emitted: snapshot.emitted,
				activity: aliveTotal ? floats[259] / aliveTotal : 0,
				occupancy
			});
		}
		return frames;
	}

	compact(): void {
		this.assertLive();
		if (this.lost) return;
		this.requireScene();
		const { a, b } = this._debugParticles();
		let alive = 0;
		for (let i = 0; i < this.nextSlot; i++) {
			const at = i * 4;
			if (b[at + 1] === 2) this.drainedCounts[b[at + 2]][b[at] as Species]++;
			else if (b[at + 1] === 1) {
				a.copyWithin(alive * 4, at, at + 4);
				b.copyWithin(alive * 4, at, at + 4);
				alive++;
			}
		}
		for (const pair of this.particles) this.clear(pair.fbo, 256, 256, true);
		this.nextSlot = alive;
		this.uploadSlots(this.particles[this.particleSide].a, a.subarray(0, alive * 4), 0);
		this.uploadSlots(this.particles[this.particleSide].b, b.subarray(0, alive * 4), 0);
	}

	render(options: RenderOptions): void {
		this.assertLive();
		finite(options.time, 'render.time', -1e10, 1e10);
		finite(options.glow ?? 0, 'render.glow', 0, 1);
		if (this.lost) return;
		const { gl } = this;
		if (!this.scene || !this.resources) {
			this.clear(null, this.canvas.width, this.canvas.height);
			return;
		}
		const w = Math.max(1, Math.ceil(this.canvas.width / 2));
		const h = Math.max(1, Math.ceil(this.canvas.height / 2));
		if (!this.density || this.density[0].width !== w || this.density[0].height !== h) {
			this.freeDensity();
			this.density = [
				this.target(w, h, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.LINEAR),
				this.target(w, h, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.LINEAR)
			];
		}
		gl.bindVertexArray(this.vao);
		gl.disable(gl.DEPTH_TEST);
		gl.disable(gl.SCISSOR_TEST);
		gl.disable(gl.BLEND);
		this.clear(this.density[0].fbo, w, h);
		let p = this.use('density');
		this.bindParticles(p, 2);
		this.bindGrid(p);
		gl.uniform2f(p.uniforms.sceneSize, this.scene.width, this.scene.height);
		gl.uniform2f(p.uniforms.imageSize, w, h);
		this.additive();
		gl.drawArrays(gl.POINTS, 0, this.nextSlot);
		gl.disable(gl.BLEND);
		p = this.use('blur');
		this.texture(p, 'source', this.density[0], 0);
		gl.uniform2f(p.uniforms.direction, Math.max(0.5, (w / this.scene.width) * 0.65) / w, 0);
		this.draw(this.density[1]);
		this.texture(p, 'source', this.density[1], 0);
		gl.uniform2f(p.uniforms.direction, 0, Math.max(0.5, (h / this.scene.height) * 0.65) / h);
		this.draw(this.density[0]);
		const mixture = this.resources.mixture;
		if (this.resources.mixtureTick !== this.lastTick) {
			p = this.use('mixtureSeed');
			this.bindGrid(p);
			this.texture(p, 'flux', this.resources.cells.b, 2);
			this.draw(mixture[0]);
			p = this.use('mixtureBlur');
			for (let i = 0; i < 4; i++) {
				this.texture(p, 'source', mixture[i % 2], 0);
				gl.uniform2i(p.uniforms.direction, 1 - (i % 2), i % 2);
				this.draw(mixture[1 - (i % 2)]);
			}
			this.resources.mixtureTick = this.lastTick;
		}
		p = this.use('composite');
		this.texture(p, 'mixture', mixture[0], 3);
		this.texture(p, 'density', this.density[0], 0);
		this.texture(p, 'palette', this.palette, 1);
		this.texture(p, 'terrain', this.resources.terrain, 2);
		gl.uniform2f(p.uniforms.imageSize, this.canvas.width, this.canvas.height);
		gl.uniform2f(p.uniforms.sceneSize, this.scene.width, this.scene.height);
		gl.uniform1f(p.uniforms.time, options.time);
		gl.uniform1f(p.uniforms.glow, options.glow ?? 0);
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		gl.viewport(0, 0, this.canvas.width, this.canvas.height);
		gl.drawArrays(gl.TRIANGLES, 0, 3);
	}

	resize(width: number, height: number): void {
		this.assertLive();
		integer(width, 'canvas width', 1, 8192);
		integer(height, 'canvas height', 1, 8192);
		if (this.canvas.width !== width) this.canvas.width = width;
		if (this.canvas.height !== height) this.canvas.height = height;
	}

	/** Test-only synchronous particle snapshot, tagged to the most recent step. */
	_debugParticles(): {
		a: Float32Array;
		b: Float32Array;
		slots: number;
		tick: number;
		epoch: number;
	} {
		this.assertLive();
		if (this.lost) throw new Error('Liquid context is lost');
		const { gl } = this;
		const pair = this.particles[this.particleSide];
		const a = new Float32Array(CAPACITY * 4);
		const b = new Float32Array(CAPACITY * 4);
		gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
		gl.bindFramebuffer(gl.READ_FRAMEBUFFER, pair.fbo);
		gl.readBuffer(gl.COLOR_ATTACHMENT0);
		gl.readPixels(0, 0, 256, 256, gl.RGBA, gl.FLOAT, a);
		gl.readBuffer(gl.COLOR_ATTACHMENT1);
		gl.readPixels(0, 0, 256, 256, gl.RGBA, gl.FLOAT, b);
		return {
			a,
			b,
			slots: this.nextSlot,
			tick: this.lastTick,
			epoch: this.epoch
		};
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.canvas.removeEventListener('webglcontextlost', this.contextLost);
		this.canvas.removeEventListener('webglcontextrestored', this.contextRestored);
		this.release();
	}

	private build(lut: Float32Array): void {
		const { gl } = this;
		if (
			!gl.getExtension('EXT_color_buffer_float') ||
			!gl.getExtension('EXT_float_blend') ||
			!supportRenderTextureFormat(gl, gl.RGBA32F, gl.RGBA, gl.FLOAT)
		)
			throw new WebGLUnavailableError('no-webgl', UNAVAILABLE);
		gl.clearColor(0, 0, 0, 0);
		gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
		gl.pixelStorei(gl.PACK_ALIGNMENT, 1);
		gl.disable(gl.DITHER);
		this.vao = gl.createVertexArray();
		if (!this.vao) throw new Error('Liquid could not allocate vertex array');
		gl.bindVertexArray(this.vao);
		const sources: [string, string, string][] = [
			['faces', shaders.FACE_SPLAT_VS, shaders.VALUE_FS],
			['cells', shaders.CELL_SPLAT_VS, shaders.CELL_SPLAT_FS],
			['normalize', shaders.FULLSCREEN, shaders.NORMALIZE_FS],
			['force', shaders.FULLSCREEN, shaders.FORCE_FS],
			['divergence', shaders.FULLSCREEN, shaders.DIVERGENCE_FS],
			['pressure', shaders.FULLSCREEN, shaders.PRESSURE_FS],
			['project', shaders.FULLSCREEN, shaders.PROJECT_FS],
			['extrapolate', shaders.FULLSCREEN, shaders.EXTRAPOLATE_FS],
			['advect', shaders.FULLSCREEN, shaders.ADVECT_FS],
			['sensors', shaders.FULLSCREEN, shaders.SENSOR_FS],
			['tally', shaders.TALLY_VS, shaders.VALUE_FS],
			['occupancy', shaders.FULLSCREEN, shaders.OCCUPANCY_FS],
			['density', shaders.DENSITY_VS, shaders.DENSITY_FS],
			['blur', shaders.FULLSCREEN, shaders.BLUR_FS],
			['mixtureSeed', shaders.FULLSCREEN, shaders.MIXTURE_SEED_FS],
			['mixtureBlur', shaders.FULLSCREEN, shaders.MIXTURE_BLUR_FS],
			['composite', shaders.FULLSCREEN, shaders.COMPOSITE_FS]
		];
		for (const [name, vertex, fragment] of sources) {
			const vs = compileShader(gl, gl.VERTEX_SHADER, vertex);
			let fs: WebGLShader | null = null;
			try {
				fs = compileShader(gl, gl.FRAGMENT_SHADER, fragment);
				this.programs.set(name, makeProgram(gl, vs, fs));
			} finally {
				gl.deleteShader(vs);
				if (fs) gl.deleteShader(fs);
			}
		}
		this.particles = [this.pair(256, 256), this.pair(256, 256)];
		this.palette = this.target(64, 64, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.LINEAR);
		gl.bindTexture(gl.TEXTURE_2D, this.palette.texture);
		gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 64, 64, gl.RGBA, gl.FLOAT, lut);
	}

	private substep(): void {
		const { gl } = this;
		const r = this.resources!;
		const scene = this.scene!;
		this.clear(r.faces.fbo, r.faces.width, r.faces.height);
		let p = this.use('faces');
		this.bindParticles(p);
		gl.uniform2i(p.uniforms.size, scene.width, scene.height);
		this.additive();
		gl.drawArrays(gl.POINTS, 0, this.nextSlot * 8);
		this.splatCells();
		gl.disable(gl.BLEND);
		p = this.use('normalize');
		this.texture(p, 'source', r.faces, 0);
		this.draw(r.old);
		p = this.use('force');
		this.bindGrid(p);
		this.texture(p, 'source', r.old, 2);
		gl.uniform1f(p.uniforms.acceleration, (scene.gravity ?? 300) / (60 * SUBSTEPS));
		this.draw(r.velocity[0]);
		p = this.use('divergence');
		this.bindGrid(p);
		this.texture(p, 'velocity', r.velocity[0], 2);
		gl.uniform1f(p.uniforms.densityCorrection, DENSITY_CORRECTION);
		this.draw(r.divergence);
		p = this.use('pressure');
		this.bindGrid(p);
		this.texture(p, 'divergence', r.divergence, 2);
		gl.uniform1f(p.uniforms.omega, OMEGA);
		for (let i = 0; i < PRESSURE_ITERATIONS * 2; i++) {
			this.texture(p, 'pressure', r.pressure[this.pressureSide], 3);
			gl.uniform1i(p.uniforms.parity, i & 1);
			this.pressureSide = 1 - this.pressureSide;
			this.draw(r.pressure[this.pressureSide]);
		}
		p = this.use('project');
		this.bindGrid(p);
		this.texture(p, 'source', r.velocity[0], 2);
		this.texture(p, 'pressure', r.pressure[this.pressureSide], 3);
		this.draw(r.velocity[1]);
		p = this.use('extrapolate');
		this.bindGrid(p);
		let velocitySide = 1;
		for (let i = 0; i < 3; i++) {
			this.texture(p, 'source', r.velocity[velocitySide], 2);
			velocitySide = 1 - velocitySide;
			this.draw(r.velocity[velocitySide]);
		}
		p = this.use('advect');
		this.bindGrid(p);
		this.bindParticles(p, 2);
		this.texture(p, 'velocity', r.velocity[velocitySide], 4);
		this.texture(p, 'oldVelocity', r.old, 5);
		this.texture(p, 'wind', this.wind ?? r.terrain, 6);
		gl.uniform1i(p.uniforms.hasWind, Number(this.hasWind));
		gl.uniform1f(p.uniforms.dt, 1 / (60 * SUBSTEPS));
		gl.uniform1f(p.uniforms.maxSpeed, scene.maxSpeed ?? 150);
		gl.uniform1f(p.uniforms.flipRatio, FLIP_RATIO);
		gl.uniform1f(p.uniforms.acceleration, (scene.gravity ?? 300) / (60 * SUBSTEPS));
		gl.uniform1i(p.uniforms.drainCount, scene.drains.length);
		if (scene.drains.length) gl.uniform4fv(p.uniforms['drainRects[0]'], this.rects(scene.drains));
		this.particleSide = 1 - this.particleSide;
		const pair = this.particles[this.particleSide];
		gl.bindFramebuffer(gl.FRAMEBUFFER, pair.fbo);
		// Scissor preserves texel coordinates while bounding work to allocated slots.
		gl.viewport(0, 0, 256, 256);
		gl.enable(gl.SCISSOR_TEST);
		gl.scissor(0, 0, 256, Math.max(1, Math.ceil(this.nextSlot / 256)));
		gl.drawArrays(gl.TRIANGLES, 0, 3);
		gl.disable(gl.SCISSOR_TEST);
	}

	private splatCells(): void {
		const r = this.resources!;
		this.clear(r.cells.fbo, r.cells.a.width, r.cells.a.height, true);
		const p = this.use('cells');
		this.bindParticles(p);
		this.gl.uniform2i(p.uniforms.size, this.scene!.width, this.scene!.height);
		this.additive();
		this.gl.drawArrays(this.gl.POINTS, 0, this.nextSlot);
	}

	private measure(): void {
		const { gl } = this;
		const r = this.resources!;
		this.splatCells();
		gl.disable(gl.BLEND);
		let p = this.use('sensors');
		this.texture(p, 'counts', r.cells.a, 0);
		this.texture(p, 'flux', r.cells.b, 1);
		gl.uniform1i(p.uniforms.sensorCount, this.scene!.sensors.length);
		if (this.scene!.sensors.length) gl.uniform4fv(p.uniforms['rects[0]'], this.rects(this.scene!.sensors));
		gl.bindFramebuffer(gl.FRAMEBUFFER, r.sensors.fbo);
		gl.viewport(0, 0, 32, 1);
		gl.drawArrays(gl.TRIANGLES, 0, 3);
		this.clear(r.tally.fbo, 17, 1);
		p = this.use('tally');
		this.bindParticles(p);
		this.additive();
		gl.drawArrays(gl.POINTS, 0, this.nextSlot);
		gl.disable(gl.BLEND);
		p = this.use('occupancy');
		this.texture(p, 'counts', r.cells.a, 0);
		this.draw(r.occupancy);
		const slot = this.readbacks.find((v) => !v.sync);
		if (!slot) return;
		gl.bindBuffer(gl.PIXEL_PACK_BUFFER, slot.buffer);
		gl.bindFramebuffer(gl.READ_FRAMEBUFFER, r.sensors.fbo);
		gl.readBuffer(gl.COLOR_ATTACHMENT0);
		gl.readPixels(0, 0, 32, 1, gl.RGBA, gl.FLOAT, 0);
		gl.readBuffer(gl.COLOR_ATTACHMENT1);
		gl.readPixels(0, 0, 32, 1, gl.RGBA, gl.FLOAT, 32 * 16);
		gl.bindFramebuffer(gl.READ_FRAMEBUFFER, r.tally.fbo);
		gl.readBuffer(gl.COLOR_ATTACHMENT0);
		gl.readPixels(0, 0, 17, 1, gl.RGBA, gl.FLOAT, 32 * 32);
		gl.bindFramebuffer(gl.READ_FRAMEBUFFER, r.occupancy.fbo);
		gl.readBuffer(gl.COLOR_ATTACHMENT0);
		gl.readPixels(0, 0, this.scene!.width, this.scene!.height, gl.RGBA, gl.UNSIGNED_BYTE, (32 * 8 + 17 * 4) * 4);
		gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
		slot.sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
		if (!slot.sync) throw new Error('Liquid could not create readback fence');
		slot.snapshot = {
			tick: this.lastTick,
			epoch: this.epoch,
			seeded: [...this.seededCounts],
			emitted: [...this.emittedCounts],
			drained: this.drainedCounts.map((v) => [...v])
		};
		gl.flush();
	}

	private spawn(kind: Species, count: number, rect: Rect, vx: number, vy: number, airOnly: boolean): void {
		if (!count) return;
		const scene = this.scene!;
		const cells: number[] = [];
		for (let y = rect.y; y < rect.y + rect.h; y++)
			for (let x = rect.x; x < rect.x + rect.w; x++) {
				if (!airOnly || scene.terrain[y * scene.width + x] === 0) cells.push(y * scene.width + x);
			}
		if (!cells.length) throw new RangeError('Liquid fill has no air cells');
		const a = new Float32Array(count * 4);
		const b = new Float32Array(count * 4);
		for (let i = 0; i < count; i++) {
			const cell = cells[Math.floor((i * cells.length) / count)];
			a[i * 4] = (cell % scene.width) + 0.05 + this.rng() * 0.9;
			a[i * 4 + 1] = Math.floor(cell / scene.width) + 0.05 + this.rng() * 0.9;
			a[i * 4 + 2] = vx;
			a[i * 4 + 3] = vy;
			b[i * 4] = kind;
			b[i * 4 + 1] = 1;
		}
		const pair = this.particles[this.particleSide];
		this.uploadSlots(pair.a, a, this.nextSlot);
		this.uploadSlots(pair.b, b, this.nextSlot);
		this.nextSlot += count;
	}

	private uploadSlots(target: FBO, data: Float32Array, first: number): void {
		const { gl } = this;
		gl.bindTexture(gl.TEXTURE_2D, target.texture);
		for (let offset = 0; offset < data.length / 4; ) {
			const slot = first + offset;
			const n = Math.min(256 - (slot % 256), data.length / 4 - offset);
			gl.texSubImage2D(
				gl.TEXTURE_2D,
				0,
				slot % 256,
				Math.floor(slot / 256),
				n,
				1,
				gl.RGBA,
				gl.FLOAT,
				data.subarray(offset * 4, (offset + n) * 4)
			);
			offset += n;
		}
	}

	private uploadTerrain(): void {
		const { gl } = this;
		const scene = this.scene!;
		gl.bindTexture(gl.TEXTURE_2D, this.resources!.terrain.texture);
		gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, scene.width, scene.height, gl.RED, gl.UNSIGNED_BYTE, scene.terrain);
	}

	private updateWind(wind: Wind | undefined): void {
		if (wind === undefined) {
			this.hasWind = false;
			return;
		}
		if (!wind) throw new TypeError('Liquid wind needs a field');
		integer(wind.width, 'wind.width', 1, 96);
		integer(wind.height, 'wind.height', 1, 60);
		if (
			!(wind.data instanceof Float32Array) ||
			wind.data.length !== wind.width * wind.height * 2
		)
			throw new RangeError(
				'Liquid wind data length must equal width * height * 2'
			);
		let changed =
			this.lastWind !== wind || this.windData.length !== wind.data.length;
		for (let i = 0; i < wind.data.length; i += 2) {
			const x = wind.data[i],
				y = wind.data[i + 1];
			if (!Number.isFinite(x) || !Number.isFinite(y) || Math.hypot(x, y) > 400)
				throw new RangeError(
					'Liquid wind vectors must be finite with magnitude <= 400'
				);
			changed ||= x !== this.windData[i] || y !== this.windData[i + 1];
		}
		const { gl } = this;
		if (
			!this.wind ||
			this.wind.width !== wind.width ||
			this.wind.height !== wind.height
		) {
			if (this.wind) this.freeTarget(this.wind);
			this.wind = this.target(wind.width, wind.height, gl.RG32F, gl.RG);
			changed = true;
		}
		if (changed) {
			gl.bindTexture(gl.TEXTURE_2D, this.wind.texture);
			gl.texSubImage2D(
				gl.TEXTURE_2D,
				0,
				0,
				0,
				wind.width,
				wind.height,
				gl.RG,
				gl.FLOAT,
				wind.data
			);
			this.windData = wind.data.slice();
		}
		this.lastWind = wind;
		this.hasWind = true;
	}

	private validateScene(scene: LiquidScene): void {
		if (!scene) throw new TypeError('Liquid needs a scene');
		integer(scene.width, 'width', 1, 256);
		integer(scene.height, 'height', 1, 160);
		if (!(scene.terrain instanceof Uint8Array) || scene.terrain.length !== scene.width * scene.height)
			throw new RangeError('Liquid terrain length must equal width * height');
		if (scene.terrain.some((v) => v > 6)) throw new RangeError('Liquid terrain kind must be 0..6');
		if (!Array.isArray(scene.fills) || !Array.isArray(scene.sensors) || !Array.isArray(scene.drains))
			throw new TypeError('Liquid scene needs fills, sensors and drains arrays');
		if (scene.sensors.length > 32 || scene.drains.length > 16) throw new RangeError('Liquid supports at most 32 sensors and 16 drains');
		finite(scene.gravity ?? 300, 'gravity', 0, 10_000);
		finite(scene.maxSpeed ?? 150, 'maxSpeed', 0, 1500);
		let total = 0;
		for (const fill of scene.fills) {
			species(fill.species);
			rectangle(fill.rect, scene.width, scene.height, 'fill.rect');
			integer(fill.markers, 'fill.markers', 0, CAPACITY);
			total += fill.markers;
			if (fill.markers) {
				let air = false;
				for (let y = fill.rect.y; y < fill.rect.y + fill.rect.h; y++)
					for (let x = fill.rect.x; x < fill.rect.x + fill.rect.w; x++) air ||= scene.terrain[y * scene.width + x] === 0;
				if (!air) throw new RangeError('Liquid fill has no air cells');
			}
		}
		if (total > CAPACITY) throw new RangeError('Liquid fills exceed 65536 marker capacity');
		for (const group of [scene.sensors, scene.drains]) {
			const ids = new Set<string>();
			for (const item of group) {
				if (typeof item.id !== 'string' || !item.id.length || item.id.length > 256 || ids.has(item.id))
					throw new TypeError('Liquid sensor/drain IDs must be nonempty and unique within their group');
				ids.add(item.id);
				rectangle(item.rect, scene.width, scene.height, item.id);
			}
		}
	}

	private target(
		w: number,
		h: number,
		internal: number = this.gl.RGBA32F,
		format: number = this.gl.RGBA,
		type: number = this.gl.FLOAT,
		filter: number = this.gl.NEAREST
	): FBO {
		const target = createFBO(this.gl, w, h, internal, format, type, filter);
		this.targets.add(target);
		if (this.gl.checkFramebufferStatus(this.gl.FRAMEBUFFER) !== this.gl.FRAMEBUFFER_COMPLETE)
			throw new WebGLUnavailableError('no-webgl', UNAVAILABLE);
		return target;
	}
	private pair(w: number, h: number): Pair {
		const { gl } = this;
		const a = this.target(w, h);
		const b = this.target(w, h);
		const fbo = gl.createFramebuffer();
		if (!fbo) throw new Error('Liquid could not allocate MRT framebuffer');
		this.framebuffers.add(fbo);
		gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
		gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, a.texture, 0);
		gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, b.texture, 0);
		gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
		if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new WebGLUnavailableError('no-webgl', UNAVAILABLE);
		this.clear(fbo, w, h, true);
		return { a, b, fbo };
	}
	private clear(fbo: WebGLFramebuffer | null, w: number, h: number, mrt = false): void {
		const { gl } = this;
		gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
		gl.viewport(0, 0, w, h);
		if (mrt) gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
		gl.clearColor(0, 0, 0, 0);
		gl.clear(gl.COLOR_BUFFER_BIT);
	}
	private use(name: string): ProgramWrap {
		const p = this.programs.get(name)!;
		p.bind();
		return p;
	}
	private texture(p: ProgramWrap, name: string, target: FBO, unit: number): void {
		this.gl.uniform1i(p.uniforms[name], target.attach(unit));
	}
	private bindParticles(p: ProgramWrap, first = 0): void {
		const pair = this.particles[this.particleSide];
		this.texture(p, 'particleA', pair.a, first);
		this.texture(p, 'particleB', pair.b, first + 1);
	}
	private bindGrid(p: ProgramWrap): void {
		this.gl.uniform2i(p.uniforms.size, this.scene!.width, this.scene!.height);
		this.texture(p, 'terrain', this.resources!.terrain, 0);
		this.texture(p, 'cells', this.resources!.cells.a, 1);
	}
	private draw(target: FBO): void {
		this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, target.fbo);
		this.gl.viewport(0, 0, target.width, target.height);
		this.gl.drawArrays(this.gl.TRIANGLES, 0, 3);
	}
	private additive(): void {
		this.gl.enable(this.gl.BLEND);
		this.gl.blendEquation(this.gl.FUNC_ADD);
		this.gl.blendFunc(this.gl.ONE, this.gl.ONE);
	}
	private rects(items: readonly { rect: Rect }[]): Float32Array {
		return new Float32Array(items.flatMap(({ rect: r }) => [r.x, r.y, r.w, r.h]));
	}
	private readbackBytes(): number {
		return (32 * 8 + 17 * 4) * 4 + this.scene!.width * this.scene!.height * 4;
	}
	private assertLive(): void {
		if (this.disposed) throw new Error('Liquid engine is disposed');
	}
	private requireScene(): LiquidScene {
		if (!this.scene) throw new Error('Liquid load(scene) must precede step');
		return this.scene;
	}
	private freeTarget(target: FBO): void {
		disposeFBO(this.gl, target);
		this.targets.delete(target);
	}
	private freeDensity(): void {
		if (this.density) for (const target of this.density) this.freeTarget(target);
		this.density = null;
	}
	private clearScene(): void {
		const { gl } = this;
		for (const slot of this.readbacks) {
			if (slot.sync) gl.deleteSync(slot.sync);
			gl.deleteBuffer(slot.buffer);
		}
		this.readbacks = [];
		const keep = new Set<FBO>(this.particles ? this.particles.flatMap((p) => [p.a, p.b]) : []);
		if (this.palette) keep.add(this.palette);
		for (const target of this.targets) if (!keep.has(target)) this.freeTarget(target);
		const pairFbos = new Set(this.particles?.map((p) => p.fbo));
		for (const fbo of this.framebuffers)
			if (!pairFbos.has(fbo)) {
				gl.deleteFramebuffer(fbo);
				this.framebuffers.delete(fbo);
			}
		this.density = null;
		this.wind = null;
		this.lastWind = null;
		this.windData = new Float32Array(0);
		this.hasWind = false;
		this.resources = null;
		this.scene = null;
	}
	private release(): void {
		this.clearScene();
		for (const target of this.targets) this.freeTarget(target);
		for (const fbo of this.framebuffers) this.gl.deleteFramebuffer(fbo);
		this.framebuffers.clear();
		for (const p of this.programs.values()) this.gl.deleteProgram(p.program);
		this.programs.clear();
		if (this.vao) this.gl.deleteVertexArray(this.vao);
		this.vao = null;
	}
	private contextLost = (event: Event): void => {
		event.preventDefault();
		this.lost = true;
		this.options.onContextLost?.();
	};
	private contextRestored = (): void => {
		if (this.disposed) return;
		try {
			// Lost-context handles are already invalid; deleting them after restoration is an error.
			this.targets.clear();
			this.framebuffers.clear();
			this.programs.clear();
			this.readbacks = [];
			this.resources = null;
			this.wind = null;
			this.lastWind = null;
			this.windData = new Float32Array(0);
			this.hasWind = false;
			this.density = null;
			this.scene = null;
			this.vao = null;
			this.build(mixtureLut(this.options.palette));
			this.lost = false;
			this.nextSlot = 0;
			this.seededCounts = [0, 0, 0];
			this.emittedCounts = [0, 0, 0];
			this.drainedCounts = [];
			this.options.onContextRestored?.();
		} catch (error) {
			this.release();
			this.options.onError?.(error);
		}
	};
}
