import {
	compileShader,
	makeProgram,
	createBlit,
	createFBO,
	createDoubleFBO,
	disposeFBO,
	disposeDoubleFBO,
	type ProgramWrap
} from '$lib/engine/gl-utils.js';
import type { FBO, DoubleFBO } from '$lib/engine/internal-types.js';
import { createTimerQueryAdapter } from '$lib/engine/engine-profiler.js';
import * as S from '$lib/engine/shaders.js';
import * as L from './shaders.js';
import {
	PaperTracers,
	TRACERS,
	validateTracerOptions,
	type TracerSource
} from './tracers.js';
import {
	disturbanceBand,
	paperGeometry,
	PAPER_PATH,
	PAPER_VIEWBOX,
	PAPER_ISLAND_CENTERS
} from './geometry.js';
import { PAPER_ABSORPTION, PAPER_CARRIER } from '../tunings.js';

export interface MacOptions {
	direction: 1 | -1;
	force: number;
	width?: number;
	nu?: number;
	dt?: number;
	pressureSweeps?: number;
	dyeScale?: number;
	bufferRate?: number;
	noiseAcceleration?: number;
	targetRe?: number;
	dye?: 'grid' | 'tracers';
	plenumWidths?: number;
	spongeWidths?: number;
	disturbance?: {
		centerWidths?: number;
		halfWidthWidths?: number;
		timeFactor?: number;
		spatialDivisor?: number;
		seed?: number;
	};
	filament?: { widthCm?: number; spacingCm?: number };
	tracers?: { capacity?: number; rate?: number; sigma?: number };
	pressureSolver?: 'jacobi' | 'two-level';
}
export interface MacCheckpoint {
	options: MacOptions;
	step: number;
	velocity: number[];
	pressure: number[];
	dye: number[];
	tracers?: { state: number[]; serial: number; elapsed: number };
}

// Frozen from fig3a x=25: blue centre y=55, green y=44, FWHM≈2px;
// wet mouth y≈30..66, patent mouth .755622cm. No result-dependent adjustment.
export const FILAMENT = {
	widthCm: (0.755622 * 2) / 36,
	spacingCm: (0.755622 * 11) / 36
};
export function resolveMacOptions(o: MacOptions) {
	return {
		direction: o.direction,
		force: o.force,
		width: o.width ?? 1080,
		nu: o.nu ?? 1.8,
		dt: o.dt ?? 1 / 120,
		pressureSweeps: o.pressureSweeps ?? 64,
		dyeScale: o.dyeScale ?? 3,
		bufferRate: o.bufferRate ?? 10,
		noiseAcceleration: o.noiseAcceleration ?? 0,
		targetRe: o.targetRe ?? 200,
		dye: o.dye ?? 'grid',
		plenumWidths: o.plenumWidths ?? 4,
		spongeWidths: o.spongeWidths ?? 1,
		disturbance: {
			centerWidths: o.disturbance?.centerWidths ?? 2.25,
			halfWidthWidths: o.disturbance?.halfWidthWidths ?? 0.7,
			timeFactor: o.disturbance?.timeFactor ?? 0.05,
			spatialDivisor: o.disturbance?.spatialDivisor ?? 3,
			seed: o.disturbance?.seed ?? 704
		},
		filament: {
			widthCm: o.filament?.widthCm ?? FILAMENT.widthCm,
			spacingCm: o.filament?.spacingCm ?? FILAMENT.spacingCm
		},
		tracers: {
			capacity: o.tracers?.capacity ?? TRACERS.capacity,
			rate: o.tracers?.rate ?? TRACERS.rate,
			sigma: o.tracers?.sigma ?? TRACERS.sigma
		},
		pressureSolver: o.pressureSolver ?? 'jacobi'
	};
}
export type ResolvedMacOptions = ReturnType<typeof resolveMacOptions>;

type SourceGeometry = Pick<
	ReturnType<typeof paperGeometry>,
	'plenum' | 'valveWidth' | 'cellsPerCm' | 'mouths'
>;
function filamentSource(
	o: ResolvedMacOptions,
	g: SourceGeometry
): TracerSource {
	return {
		x: o.direction > 0 ? g.plenum - 3.5 : g.plenum + g.valveWidth + 3.5,
		y: g.mouths[o.direction > 0 ? 0 : 1],
		width: o.filament.widthCm * g.cellsPerCm,
		spacing: o.filament.spacingCm * g.cellsPerCm,
		direction: o.direction
	};
}

/** Pure checks; geometry-dependent checks run after rasterization, still before getContext(). */
export function validateMacOptions(
	options: MacOptions,
	g?: SourceGeometry & {
		meanWidth: number;
		grid: { width: number; height: number };
	}
) {
	const o = resolveMacOptions(options);
	const require = (ok: boolean, field: string) => {
		if (!ok) throw new RangeError(`Invalid MAC ${field}`);
	};
	const positive = (n: number, field: string) =>
		require(Number.isFinite(n) && n > 0, field);
	const nonnegative = (n: number, field: string) =>
		require(Number.isFinite(n) && n >= 0, field);
	require(o.direction === 1 || o.direction === -1, 'direction');
	positive(o.force, 'force');
	require(Number.isInteger(o.width) &&
		o.width >= 120 &&
		o.width <= 2160, 'width');
	positive(o.nu, 'nu');
	positive(o.dt, 'dt');
	require(o.nu * o.dt <= 0.2, 'nu * dt');
	require(Number.isInteger(o.pressureSweeps) &&
		o.pressureSweeps >= 2, 'pressureSweeps');
	require(Number.isInteger(o.dyeScale) &&
		o.dyeScale >= 1 &&
		o.dyeScale <= 3, 'dyeScale');
	nonnegative(o.bufferRate, 'bufferRate');
	nonnegative(o.noiseAcceleration, 'noiseAcceleration');
	positive(o.targetRe, 'targetRe');
	require(o.dye === 'grid' || o.dye === 'tracers', 'dye');
	positive(o.plenumWidths, 'plenumWidths');
	positive(o.spongeWidths, 'spongeWidths');
	require(o.spongeWidths <=
		o.plenumWidths, 'spongeWidths must not exceed plenumWidths');
	for (const field of [
		'centerWidths',
		'halfWidthWidths',
		'timeFactor',
		'spatialDivisor'
	] as const)
		positive(o.disturbance[field], `disturbance.${field}`);
	require(Number.isInteger(o.disturbance.seed) &&
		o.disturbance.seed >= 0 &&
		o.disturbance.seed <= 65535, 'disturbance.seed');
	positive(o.filament.widthCm, 'filament.widthCm');
	nonnegative(o.filament.spacingCm, 'filament.spacingCm');
	validateTracerOptions(o.tracers, o.dyeScale);
	if (o.pressureSolver === 'two-level')
		throw new RangeError('two-level pressure not available in this build');
	require(o.pressureSolver === 'jacobi', 'pressureSolver');
	if (g) {
		const source = filamentSource(o, g);
		require(Number.isFinite(source.x) &&
			source.x >= 0 &&
			source.x < g.grid.width &&
			Number.isFinite(source.y) &&
			source.y >= 0 &&
			source.y < g.grid.height, 'source position outside domain');
		const band = disturbanceBand(
			o.direction,
			g,
			o.disturbance.centerWidths,
			o.disturbance.halfWidthWidths
		);
		require(Number.isFinite(band.center) &&
			Number.isFinite(band.halfWidth) &&
			band.center - band.halfWidth >= 0 &&
			band.center + band.halfWidth <=
				g.grid.width, 'disturbance support outside domain');
		return source;
	}
}

// Fig3a island median x215..239,y33..39; grey edge sample x230,y45.
export const PLATE = { island: '#aacad0', outline: '#879193' };

/** Own-context, route-only MAC laboratory. Never imported by the package entrypoint. */
export class PaperMacEngine {
	readonly geometry;
	readonly gl: WebGL2RenderingContext;
	readonly options: ResolvedMacOptions;
	private readonly source: TracerSource;
	tracers: PaperTracers | null = null;
	tracerFallback: string | null = null;
	readonly velocity: DoubleFBO;
	readonly pressure: DoubleFBO;
	readonly dye: DoubleFBO;
	readonly divergence: FBO;
	readonly columns: FBO;
	readonly edges: FBO;
	private readonly scratch: FBO;
	private readonly dyeScratch: FBO;
	private readonly programs: Record<string, ProgramWrap> = {};
	private readonly textures: WebGLTexture[] = [];
	private readonly shaders: WebGLShader[] = [];
	private readonly buffers: WebGLBuffer[] = [];
	private readonly targets: (FBO | DoubleFBO)[] = [];
	private readonly blit;
	private aperture!: WebGLTexture;
	private cells!: WebGLTexture;
	private dyeMask!: WebGLTexture;
	private plate!: WebGLTexture;
	private dummy!: WebGLTexture;
	private disposed = false;
	private timer: ReturnType<typeof createTimerQueryAdapter> = null;
	private pendingTimer: ReturnType<
		NonNullable<ReturnType<typeof createTimerQueryAdapter>>['create']
	> = null;
	readonly gpuFrameMs: number[] = [];
	stepCount = 0;

	constructor(readonly canvas: HTMLCanvasElement, options: MacOptions) {
		this.options = resolveMacOptions(options);
		const o = this.options;
		validateMacOptions(o);
		this.geometry = paperGeometry(o.width, o.plenumWidths, o.spongeWidths);
		this.source = validateMacOptions(o, this.geometry)!;
		if (this.geometry.height > 512)
			throw new RangeError('MAC metric reduction height exceeded');
		const gl = canvas.getContext('webgl2', {
			alpha: false,
			antialias: false,
			depth: false,
			stencil: false,
			preserveDrawingBuffer: true
		});
		if (!gl || !gl.getExtension('EXT_color_buffer_float'))
			throw new Error(
				'This paper experiment requires WebGL2 with float render targets.'
			);
		this.gl = gl;
		const { grid: g } = this.geometry;
		if (
			Math.max(g.width, g.height) * o.dyeScale >
			gl.getParameter(gl.MAX_TEXTURE_SIZE)
		)
			throw new Error('This GPU cannot allocate the paper dye grid.');
		try {
			this.timer = createTimerQueryAdapter(gl);
			const vertex = compileShader(gl, gl.VERTEX_SHADER, S.baseVertexShader);
			this.shaders.push(vertex);
			for (const [name, source] of Object.entries({
				force: S.staggeredForceShader,
				advection: S.staggeredAdvectionShader,
				viscosity: L.explicitViscosityShader,
				divergence: S.staggeredDivergenceShader,
				pair: S.staggeredPressureJacobi2Shader,
				pressure: S.staggeredPressureShader,
				gradient: S.staggeredGradientShader,
				columns: L.columnsShader,
				sponge: L.spongeShader,
				disturbance: L.disturbanceShader,
				edges: L.edgeShader,
				dye: L.dyeShader,
				display: L.displayShader
			})) {
				const fragment = compileShader(gl, gl.FRAGMENT_SHADER, source);
				this.shaders.push(fragment);
				this.programs[name] = makeProgram(gl, vertex, fragment);
			}
			for (let i = 0; i < 2; i++) {
				const buffer = gl.createBuffer();
				if (!buffer) throw new Error('MAC buffer allocation failed');
				this.buffers.push(buffer);
			}
			this.blit = createBlit(gl, this.buffers[0], this.buffers[1]);
			gl.clearColor(0, 0, 0, 0);
			const target = (
				w: number,
				h: number,
				channels: 1 | 2 | 4,
				double = false
			) => {
				const args = [
					gl,
					w,
					h,
					channels === 1 ? gl.R32F : channels === 2 ? gl.RG32F : gl.RGBA32F,
					channels === 1 ? gl.RED : channels === 2 ? gl.RG : gl.RGBA,
					gl.FLOAT,
					gl.NEAREST
				] as const;
				const f = double ? createDoubleFBO(...args) : createFBO(...args);
				this.targets.push(f);
				gl.bindFramebuffer(gl.FRAMEBUFFER, 'read' in f ? f.read.fbo : f.fbo);
				if (
					gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE
				)
					throw new Error('Float framebuffer unsupported');
				return f;
			};
			this.velocity = target(g.width + 1, g.height + 1, 2, true) as DoubleFBO;
			this.pressure = target(g.width, g.height, 1, true) as DoubleFBO;
			this.divergence = target(g.width, g.height, 1) as FBO;
			this.scratch = target(g.width + 1, g.height + 1, 2) as FBO;
			this.columns = target(g.width + 1, 1, 4) as FBO;
			this.edges = target(2, 1, 4) as FBO;
			this.dye = target(
				g.width * o.dyeScale,
				g.height * o.dyeScale,
				4,
				true
			) as DoubleFBO;
			this.dyeScratch = target(this.dye.width, this.dye.height, 4) as FBO;
			this.aperture = this.texture(
				g.faces,
				g.width + 1,
				g.height + 1,
				gl.RG8,
				gl.RG
			);
			this.cells = this.texture(g.cells, g.width, g.height, gl.R8, gl.RED);
			this.dyeMask = this.makeDyeMask();
			this.plate = this.makePlate();
			this.dummy = this.texture(new Uint8Array(4), 1, 1, gl.RGBA8, gl.RGBA);
			// The rig starts water-filled; only the two filament species start absent.
			const initialDye = new Float32Array(this.dye.width * this.dye.height * 4);
			for (let i = 0; i < initialDye.length; i += 4) {
				initialDye[i + 2] = PAPER_CARRIER;
				initialDye[i + 3] = 1;
			}
			gl.bindTexture(gl.TEXTURE_2D, this.dye.read.texture);
			gl.texSubImage2D(
				gl.TEXTURE_2D,
				0,
				0,
				0,
				this.dye.width,
				this.dye.height,
				gl.RGBA,
				gl.FLOAT,
				initialDye
			);
			if (o.dye === 'tracers') {
				try {
					this.tracers = new PaperTracers(
						gl,
						[g.width, g.height],
						this.dyeMask,
						o.dyeScale,
						this.source,
						o.tracers
					);
				} catch (error) {
					this.tracerFallback = String(error);
				}
			}
		} catch (error) {
			this.dispose();
			throw error;
		}
	}

	private texture(
		data: Uint8Array,
		w: number,
		h: number,
		internal: number,
		format: number
	) {
		const gl = this.gl,
			t = gl.createTexture();
		if (!t) throw new Error('MAC texture allocation failed');
		this.textures.push(t);
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
	}

	private makeDyeMask() {
		const { grid: g, plenum, valveWidth, height } = this.geometry,
			scale = this.options.dyeScale;
		const path = new Path2D(PAPER_PATH),
			ctx = new OffscreenCanvas(1, 1).getContext('2d')!;
		const data = new Uint8Array(g.width * height * scale * scale);
		for (let y = 0; y < height * scale; y++)
			for (let x = 0; x < g.width * scale; x++) {
				const vx = (x + 0.5) / scale - plenum;
				data[y * g.width * scale + x] =
					vx < 0 ||
					vx >= valveWidth ||
					ctx.isPointInPath(
						path,
						// Match the declared MAC open-face cross-section, including the slanted cut.
						(Math.max(0.5, Math.min(valveWidth - 0.5, vx)) * PAPER_VIEWBOX[2]) /
							valveWidth,
						((height - (y + 0.5) / scale) * PAPER_VIEWBOX[3]) / height,
						'evenodd'
					)
						? 255
						: 0;
			}
		return this.texture(
			data,
			g.width * scale,
			height * scale,
			this.gl.R8,
			this.gl.RED
		);
	}

	private makePlate() {
		const w = this.geometry.valveWidth * 3,
			h = this.geometry.height * 3;
		const ctx = new OffscreenCanvas(w, h).getContext('2d')!;
		ctx.fillStyle = '#ffffff';
		ctx.fillRect(0, 0, w, h);
		ctx.scale(w / PAPER_VIEWBOX[2], h / PAPER_VIEWBOX[3]);
		const subpaths = PAPER_PATH.split(/(?=M\s)/).filter(Boolean);
		ctx.fillStyle = PLATE.island;
		for (const island of subpaths.slice(1)) ctx.fill(new Path2D(island));
		ctx.lineWidth = (PAPER_VIEWBOX[2] / w) * 1.25;
		ctx.strokeStyle = PLATE.outline;
		ctx.stroke(new Path2D(PAPER_PATH));
		const data = ctx.getImageData(0, 0, w, h).data;
		ctx.clearRect(0, 0, PAPER_VIEWBOX[2], PAPER_VIEWBOX[3]);
		ctx.fillStyle = '#fff';
		ctx.fill(new Path2D(PAPER_PATH), 'evenodd');
		ctx.globalCompositeOperation = 'destination-out';
		ctx.stroke(new Path2D(PAPER_PATH));
		const mask = ctx.getImageData(0, 0, w, h).data;
		const flipped = new Uint8Array(w * h * 4);
		for (let y = 0; y < h; y++)
			for (let x = 0; x < w; x++) {
				const i = (y * w + x) * 4,
					j = ((h - y - 1) * w + x) * 4;
				flipped[j] = data[i];
				flipped[j + 1] = data[i + 1];
				flipped[j + 2] = data[i + 2];
				flipped[j + 3] = mask[i + 3];
			}
		return this.texture(flipped, w, h, this.gl.RGBA8, this.gl.RGBA);
	}

	/**
	 * `target` is the FBO the pass renders into. Its texture is replaced by a 1x1 dummy on
	 * the unit it would otherwise occupy so no program ever samples its own render target
	 * (a WebGL feedback loop). The shaders never read the target in that pass, so output is unchanged.
	 */
	private bind(name: string, target?: FBO) {
		const gl = this.gl,
			p = this.programs[name],
			g = this.geometry.grid;
		gl.disable(gl.BLEND);
		p.bind();
		gl.uniform2f(p.uniforms.uSize, g.width, g.height);
		gl.uniform1i(p.uniforms.uFaces, this.velocity.read.attach(0));
		gl.uniform1i(p.uniforms.uPressure, this.pressure.read.attach(1));
		gl.uniform1i(
			p.uniforms.uDivergence,
			this.attachUnless(this.divergence, 2, target)
		);
		for (const [unit, name, texture] of [
			[3, 'uApertures', this.aperture],
			[4, 'uCells', this.cells],
			[8, 'uDyeMask', this.dyeMask],
			[9, 'uPlate', this.plate]
		] as const) {
			gl.activeTexture(gl.TEXTURE0 + unit);
			gl.bindTexture(gl.TEXTURE_2D, texture);
			gl.uniform1i(p.uniforms[name], unit);
		}
		gl.uniform1i(
			p.uniforms.uColumns,
			this.attachUnless(this.columns, 5, target)
		);
		gl.uniform1i(
			p.uniforms.uPhiHat,
			this.attachUnless(this.scratch, 6, target)
		);
		gl.uniform1i(p.uniforms.uDye, this.dye.read.attach(7));
		return p;
	}

	private attachUnless(fbo: FBO, unit: number, target?: FBO) {
		if (fbo !== target) return fbo.attach(unit);
		this.gl.activeTexture(this.gl.TEXTURE0 + unit);
		this.gl.bindTexture(this.gl.TEXTURE_2D, this.dummy);
		return unit;
	}

	private flip(name: string, setup?: (p: ProgramWrap) => void) {
		const p = this.bind(name);
		setup?.(p);
		this.blit(this.velocity.write);
		this.velocity.swap();
	}

	onBeforeProject?: () => void;
	pressureSolverOverride?: () => void;

	private solvePressure() {
		if (this.pressureSolverOverride) {
			this.pressureSolverOverride();
			return;
		}
		const pairs = Math.floor(this.options.pressureSweeps / 2);
		for (const [name, n] of [
			['pair', pairs],
			['pressure', this.options.pressureSweeps - pairs * 2]
		] as const) {
			if (!n) continue;
			const p = this.bind(name);
			for (let k = 0; k < n; k++) {
				this.gl.uniform1i(p.uniforms.uPressure, this.pressure.read.attach(1));
				this.blit(this.pressure.write);
				this.pressure.swap();
			}
		}
	}

	advance(count = 1, dye = true) {
		if (this.disposed) throw new Error('MAC engine disposed');
		const { gl, options: o } = this;
		for (let i = 0; i < count; i++) {
			this.flip('force', (p) =>
				gl.uniform2f(p.uniforms.uImpulse, o.direction * o.force * o.dt, 0)
			);
			const a = this.bind('advection', this.scratch);
			gl.uniform1i(a.uniforms.uPhiHat, 3);
			gl.uniform1f(a.uniforms.dt, o.dt);
			gl.uniform1f(a.uniforms.uCorrection, 0);
			gl.uniform1f(a.uniforms.dissipation, 0);
			gl.uniform1f(a.uniforms.uWallSafe, 0);
			this.blit(this.scratch);
			gl.uniform1i(a.uniforms.uPhiHat, this.scratch.attach(6));
			gl.uniform1f(a.uniforms.uCorrection, 1);
			this.blit(this.velocity.write);
			this.velocity.swap();
			this.flip('viscosity', (p) =>
				gl.uniform1f(p.uniforms.uAlpha, o.nu * o.dt)
			);
			if (o.noiseAcceleration > 0) {
				const g = this.geometry,
					speed = (o.targetRe * o.nu) / g.hydraulicDiameter;
				this.flip('disturbance', (p) => {
					gl.uniform1f(p.uniforms.dt, o.dt);
					gl.uniform1f(p.uniforms.uNoiseTime, this.stepCount * o.dt);
					gl.uniform1f(
						p.uniforms.uNoiseTau,
						(o.disturbance.timeFactor * g.valveWidth) / speed
					);
					gl.uniform1f(
						p.uniforms.uNoiseScale,
						g.meanWidth / o.disturbance.spatialDivisor
					);
					gl.uniform1f(p.uniforms.uSeed, o.disturbance.seed);
					gl.uniform1f(p.uniforms.uNoiseAcceleration, o.noiseAcceleration);
					const band = disturbanceBand(
						o.direction,
						g,
						o.disturbance.centerWidths,
						o.disturbance.halfWidthWidths
					);
					gl.uniform1f(p.uniforms.uNoiseCenter, band.center);
					gl.uniform1f(p.uniforms.uNoiseHalfWidth, band.halfWidth);
				});
			}
			this.reduceColumns();
			// Flux-preserving column forcing precedes projection: its local divergence is removed.
			this.flip('sponge', (p) => {
				gl.uniform1f(p.uniforms.uWidth, this.geometry.buffer);
				gl.uniform1f(p.uniforms.dt, o.dt);
				gl.uniform1f(p.uniforms.uRate, o.bufferRate);
			});
			if (this.onBeforeProject) this.onBeforeProject();
			this.bind('divergence', this.divergence);
			this.blit(this.divergence);
			this.solvePressure();
			this.flip('gradient');
			if (dye) {
				this.advectDye();
				this.tracers?.advance(this.velocity.read, o.dt);
			}
			this.stepCount++;
		}
	}

	advectDye() {
		const { gl, options: o } = this,
			p = this.bind('dye');
		gl.uniform2f(p.uniforms.uDyeSize, this.dye.width, this.dye.height);
		gl.uniform1f(p.uniforms.dt, o.dt);
		gl.uniform1f(p.uniforms.uDirection, o.direction);
		gl.uniform1f(p.uniforms.uCarrierConcentration, PAPER_CARRIER);
		gl.uniform1f(p.uniforms.uSourceX, this.source.x);
		gl.uniform1f(p.uniforms.uSourceY, this.source.y);
		gl.uniform1f(p.uniforms.uFilamentWidth, this.source.width);
		gl.uniform1f(p.uniforms.uFilamentSpacing, this.source.spacing);
		gl.uniform1i(p.uniforms.uPhiHat, this.dye.read.attach(6));
		gl.uniform1f(p.uniforms.uCorrection, 0);
		this.blit(this.dyeScratch);
		gl.uniform1i(p.uniforms.uPhiHat, this.dyeScratch.attach(6));
		gl.uniform1f(p.uniforms.uCorrection, 1);
		this.blit(this.dye.write);
		this.dye.swap();
	}

	reduceColumns() {
		this.bind('columns', this.columns);
		this.blit(this.columns);
	}
	readColumns() {
		this.reduceColumns();
		return this.read(this.columns, 4);
	}
	readEdges() {
		const p = this.bind('edges');
		this.gl.uniform1f(p.uniforms.uDirection, this.options.direction);
		this.blit(this.edges);
		return this.read(this.edges, 4);
	}

	probeInlet() {
		const { grid: g, plenum, valveWidth, mouths, meanWidth } = this.geometry;
		const x = Math.round(
			this.options.direction > 0
				? plenum - meanWidth
				: plenum + valveWidth + meanWidth
		);
		const y = Math.max(
			1,
			Math.min(
				g.height - 3,
				Math.round(mouths[this.options.direction > 0 ? 0 : 1]) - 1
			)
		);
		const data = new Float32Array(3 * 3 * 4);
		this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.velocity.read.fbo);
		this.gl.readPixels(x - 1, y, 3, 3, this.gl.RGBA, this.gl.FLOAT, data);
		const values: number[] = [];
		for (let i = 0; i < data.length; i += 4) values.push(data[i], data[i + 1]);
		return values;
	}

	probeUnits() {
		const { grid: g, plenum, valveWidth, mouths } = this.geometry,
			gl = this.gl;
		const sample = new Float32Array(4),
			values = PAPER_ISLAND_CENTERS.map((cm) => {
				const x = Math.round((cm / PAPER_VIEWBOX[2]) * valveWidth);
				const y = Math.max(
					0,
					Math.min(
						g.height - 2,
						Math.floor(mouths[0] + ((mouths[1] - mouths[0]) * x) / valveWidth)
					)
				);
				gl.bindFramebuffer(gl.FRAMEBUFFER, this.velocity.read.fbo);
				gl.readPixels(plenum + x, y, 1, 1, gl.RGBA, gl.FLOAT, sample);
				return sample[1];
			});
		return this.options.direction > 0 ? values : values.reverse();
	}

	probeTransverse() {
		const { grid: g, plenum, valveWidth, mouths } = this.geometry;
		const x =
			plenum +
			Math.round(valveWidth * (this.options.direction > 0 ? 0.8 : 0.2));
		const y = Math.max(
			1,
			Math.min(g.height - 2, Math.round((mouths[0] + mouths[1]) / 2))
		);
		const data = new Float32Array(4);
		this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.velocity.read.fbo);
		this.gl.readPixels(x, y, 1, 1, this.gl.RGBA, this.gl.FLOAT, data);
		return data[1];
	}

	read(target: FBO, components: 1 | 2 | 4) {
		const rgba = new Float32Array(target.width * target.height * 4);
		this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, target.fbo);
		this.gl.readPixels(
			0,
			0,
			target.width,
			target.height,
			this.gl.RGBA,
			this.gl.FLOAT,
			rgba
		);
		if (components === 4) return rgba;
		const out = new Float32Array(target.width * target.height * components);
		for (let i = 0; i < target.width * target.height; i++)
			for (let c = 0; c < components; c++)
				out[i * components + c] = rgba[4 * i + c];
		return out;
	}

	frame(steps: number) {
		const timer = this.timer;
		if (timer && this.pendingTimer && timer.available(this.pendingTimer)) {
			if (!timer.disjoint()) {
				const ns = timer.resultNanos(this.pendingTimer);
				if (ns !== null && Number.isFinite(ns) && ns >= 0) {
					this.gpuFrameMs.push(ns / 1e6);
					if (this.gpuFrameMs.length > 180) this.gpuFrameMs.shift();
				}
			}
			timer.delete(this.pendingTimer);
			this.pendingTimer = null;
		}
		const query = timer && !this.pendingTimer ? timer.create() : null;
		if (query) timer!.begin(query);
		try {
			this.advance(steps);
			this.render();
		} finally {
			if (query) {
				timer!.end();
				this.pendingTimer = query;
			}
		}
	}

	render() {
		if (this.disposed) return;
		if (this.tracers) {
			const depths = PAPER_ABSORPTION.absorbance.map((d) => [d.r, d.g, d.b]);
			this.tracers.accumulate(depths[0], depths[1]);
			this.tracers.render(
				this.plate,
				this.geometry.plenum,
				this.geometry.valveWidth,
				depths[2].map((v) => v * PAPER_CARRIER)
			);
			return;
		}
		const p = this.bind('display'),
			gl = this.gl;
		gl.uniform1f(p.uniforms.uOffset, this.geometry.plenum);
		gl.uniform1f(p.uniforms.uValveWidth, this.geometry.valveWidth);
		for (const [name, depth] of ['uBlue', 'uGreen', 'uCarrier'].map(
			(name, i) => [name, PAPER_ABSORPTION.absorbance[i]] as const
		))
			gl.uniform3f(p.uniforms[name], depth.r, depth.g, depth.b);
		this.blit(null);
	}

	checkpoint(): MacCheckpoint {
		return {
			options: resolveMacOptions(this.options),
			step: this.stepCount,
			velocity: [...this.read(this.velocity.read, 2)],
			pressure: [...this.read(this.pressure.read, 1)],
			dye: [...this.read(this.dye.read, 4)],
			...(this.tracers
				? {
						tracers: {
							state: [...this.read(this.tracers.state.read, 4)],
							...this.tracers.clock
						}
				  }
				: {})
		};
	}

	restore(state: MacCheckpoint) {
		if (
			JSON.stringify(resolveMacOptions(state.options)) !==
				JSON.stringify(resolveMacOptions(this.options)) ||
			!Number.isInteger(state.step) ||
			state.step < 0
		)
			throw new Error('Incompatible MAC checkpoint');
		for (const [target, data, channels] of [
			[this.velocity.read, state.velocity, 2],
			[this.pressure.read, state.pressure, 1],
			[this.dye.read, state.dye, 4]
		] as const) {
			if (
				data.length !== target.width * target.height * channels ||
				!data.every(Number.isFinite)
			)
				throw new Error('Corrupt MAC checkpoint');
			this.gl.bindTexture(this.gl.TEXTURE_2D, target.texture);
			this.gl.texSubImage2D(
				this.gl.TEXTURE_2D,
				0,
				0,
				0,
				target.width,
				target.height,
				channels === 1
					? this.gl.RED
					: channels === 2
					? this.gl.RG
					: this.gl.RGBA,
				this.gl.FLOAT,
				Float32Array.from(data)
			);
		}
		if (this.tracers) {
			if (!state.tracers) throw new Error('Tracer checkpoint missing');
			this.tracers.restore(state.tracers);
		}
		this.stepCount = state.step;
	}

	dispose() {
		if (this.disposed) return;
		this.disposed = true;
		const gl = this.gl;
		this.tracers?.dispose();
		if (this.pendingTimer) this.timer?.delete(this.pendingTimer);
		for (const f of this.targets)
			if ('read' in f) disposeDoubleFBO(gl, f);
			else disposeFBO(gl, f);
		for (const t of this.textures) gl.deleteTexture(t);
		for (const p of Object.values(this.programs)) gl.deleteProgram(p.program);
		for (const s of this.shaders) gl.deleteShader(s);
		for (const b of this.buffers) gl.deleteBuffer(b);
	}
}
