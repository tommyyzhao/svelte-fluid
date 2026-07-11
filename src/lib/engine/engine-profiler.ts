import type { GL } from './gl-utils.js';

export const PROFILE_GROUPS = ['solver', 'bloom', 'sunrays', 'display', 'glass'] as const;
export type ProfileGroup = (typeof PROFILE_GROUPS)[number];
export const PROFILE_LIFECYCLE_PHASES = [
	'contextCreate',
	'shaderCompile',
	'programLink',
	'initialAllocation',
	'reconfigure',
	'resize',
	'contextRestore'
] as const;
export type ProfileLifecyclePhase = (typeof PROFILE_LIFECYCLE_PHASES)[number];
export type ProfileInvalidReason = 'disjoint' | 'context-lost' | 'blank-frame' | 'timer-error';

export interface ProfileGroupSample {
	cpuMs: number;
	gpuMs: number | null;
	draws: number;
	pixels: number;
}

export interface ProfileFrameSample {
	id: number;
	cpuMs: number;
	gpuMs: number | null;
	draws: number;
	pixels: number;
	groups: Record<ProfileGroup, ProfileGroupSample>;
}

export interface ProfileEnvironment {
	browser: string;
	webglVersion: 'WebGL1' | 'WebGL2';
	renderer: string;
	vendor: string;
	devicePixelRatio: number;
	effectivePixelRatioX: number;
	effectivePixelRatioY: number;
	cssWidth: number;
	cssHeight: number;
	drawingBufferWidth: number;
	drawingBufferHeight: number;
	canvasPixels: number;
	simWidth: number;
	simHeight: number;
	dyeWidth: number;
	dyeHeight: number;
	linearFiltering: boolean;
	timerQuery: 'webgl2' | 'webgl1' | 'cpu';
	contextLost: boolean;
}

export interface ProfileResources {
	estimatedTextureBytes: number;
	canvasPixels: number;
}

export interface EngineProfileSnapshot {
	version: 1;
	timingSource: 'gpu' | 'cpu';
	valid: boolean;
	invalidReasons: ProfileInvalidReason[];
	environment: ProfileEnvironment;
	lifecycle: Record<ProfileLifecyclePhase, number[]>;
	resources: ProfileResources;
	frames: ProfileFrameSample[];
	rejected: Record<ProfileInvalidReason, number>;
}

export interface TimerQueryAdapter {
	readonly kind: 'webgl2' | 'webgl1';
	create(): WebGLQuery | null;
	begin(query: WebGLQuery): void;
	end(): void;
	available(query: WebGLQuery): boolean;
	resultNanos(query: WebGLQuery): number | null;
	disjoint(): boolean;
	delete(query: WebGLQuery): void;
}

interface WebGL2TimerExtension {
	TIME_ELAPSED_EXT: number;
	GPU_DISJOINT_EXT: number;
}

interface WebGL1TimerExtension extends WebGL2TimerExtension {
	QUERY_RESULT_AVAILABLE_EXT: number;
	QUERY_RESULT_EXT: number;
	createQueryEXT(): WebGLQuery | null;
	beginQueryEXT(target: number, query: WebGLQuery): void;
	endQueryEXT(target: number): void;
	getQueryObjectEXT(query: WebGLQuery, pname: number): boolean | number | null;
	deleteQueryEXT(query: WebGLQuery): void;
}

/** Normalize the incompatible WebGL1 and WebGL2 timer-query APIs. */
export function createTimerQueryAdapter(gl: GL, forceCpu = false): TimerQueryAdapter | null {
	if (forceCpu) return null;
	if (typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext) {
		const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2') as WebGL2TimerExtension | null;
		if (!ext) return null;
		return {
			kind: 'webgl2',
			create: () => gl.createQuery(),
			begin: (query) => gl.beginQuery(ext.TIME_ELAPSED_EXT, query),
			end: () => gl.endQuery(ext.TIME_ELAPSED_EXT),
			available: (query) => !!gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE),
			resultNanos: (query) => {
				const value = gl.getQueryParameter(query, gl.QUERY_RESULT);
				return typeof value === 'number' ? value : null;
			},
			disjoint: () => !!gl.getParameter(ext.GPU_DISJOINT_EXT),
			delete: (query) => gl.deleteQuery(query)
		};
	}

	const ext = gl.getExtension('EXT_disjoint_timer_query') as WebGL1TimerExtension | null;
	if (!ext) return null;
	return {
		kind: 'webgl1',
		create: () => ext.createQueryEXT(),
		begin: (query) => ext.beginQueryEXT(ext.TIME_ELAPSED_EXT, query),
		end: () => ext.endQueryEXT(ext.TIME_ELAPSED_EXT),
		available: (query) => !!ext.getQueryObjectEXT(query, ext.QUERY_RESULT_AVAILABLE_EXT),
		resultNanos: (query) => {
			const value = ext.getQueryObjectEXT(query, ext.QUERY_RESULT_EXT);
			return typeof value === 'number' ? value : null;
		},
		disjoint: () => !!gl.getParameter(ext.GPU_DISJOINT_EXT),
		delete: (query) => ext.deleteQueryEXT(query)
	};
}

interface MutableFrame {
	id: number;
	startedAt: number;
	cpuMs: number;
	groups: Record<ProfileGroup, ProfileGroupSample>;
	pending: number;
	ended: boolean;
	invalid: ProfileInvalidReason | null;
}

interface PendingQuery {
	frame: number;
	group: ProfileGroup;
	query: WebGLQuery;
}

function emptyGroups(): Record<ProfileGroup, ProfileGroupSample> {
	return {
		solver: { cpuMs: 0, gpuMs: null, draws: 0, pixels: 0 },
		bloom: { cpuMs: 0, gpuMs: null, draws: 0, pixels: 0 },
		sunrays: { cpuMs: 0, gpuMs: null, draws: 0, pixels: 0 },
		display: { cpuMs: 0, gpuMs: null, draws: 0, pixels: 0 },
		glass: { cpuMs: 0, gpuMs: null, draws: 0, pixels: 0 }
	};
}

function emptyLifecycle(): Record<ProfileLifecyclePhase, number[]> {
	return {
		contextCreate: [], shaderCompile: [], programLink: [], initialAllocation: [],
		reconfigure: [], resize: [], contextRestore: []
	};
}

function emptyRejected(): Record<ProfileInvalidReason, number> {
	return { disjoint: 0, 'context-lost': 0, 'blank-frame': 0, 'timer-error': 0 };
}

export class EngineProfiler {
	private readonly timer: TimerQueryAdapter | null;
	private readonly now: () => number;
	private readonly sampleLimit: number;
	private nextFrame = 0;
	private activeFrame: MutableFrame | null = null;
	private activeGroup: { group: ProfileGroup; startedAt: number; query: WebGLQuery | null } | null = null;
	private frames = new Map<number, MutableFrame>();
	private pending: PendingQuery[] = [];
	private samples: ProfileFrameSample[] = [];
	private lifecycle = emptyLifecycle();
	private rejected = emptyRejected();
	private invalidReasons = new Set<ProfileInvalidReason>();

	constructor(timer: TimerQueryAdapter | null, now: () => number = () => performance.now(), sampleLimit = 240) {
		this.timer = timer;
		this.now = now;
		this.sampleLimit = sampleLimit;
	}

	get timerKind(): 'webgl2' | 'webgl1' | 'cpu' {
		return this.timer?.kind ?? 'cpu';
	}

	beginFrame(): void {
		this.poll();
		if (this.activeFrame) this.rejectFrame(this.activeFrame, 'timer-error');
		const frame: MutableFrame = {
			id: this.nextFrame++, startedAt: this.now(), cpuMs: 0, groups: emptyGroups(),
			pending: 0, ended: false, invalid: null
		};
		this.frames.set(frame.id, frame);
		this.activeFrame = frame;
	}

	endFrame(): void {
		if (!this.activeFrame) return;
		if (this.activeGroup) this.endGroup();
		this.activeFrame.cpuMs = Math.max(0, this.now() - this.activeFrame.startedAt);
		this.activeFrame.ended = true;
		this.activeFrame = null;
		this.finalizeReady();
	}

	beginGroup(group: ProfileGroup): void {
		if (!this.activeFrame) return;
		if (this.activeGroup) {
			this.rejectFrame(this.activeFrame, 'timer-error');
			return;
		}
		let query: WebGLQuery | null = null;
		if (this.timer) {
			try {
				query = this.timer.create();
				if (query) this.timer.begin(query);
			} catch {
				if (query) this.timer.delete(query);
				query = null;
				this.rejectFrame(this.activeFrame, 'timer-error');
			}
		}
		this.activeGroup = { group, startedAt: this.now(), query };
	}

	endGroup(): void {
		const active = this.activeGroup;
		const frame = this.activeFrame;
		if (!active || !frame) return;
		this.activeGroup = null;
		frame.groups[active.group].cpuMs += Math.max(0, this.now() - active.startedAt);
		if (!active.query || !this.timer) return;
		try {
			this.timer.end();
			frame.pending++;
			this.pending.push({ frame: frame.id, group: active.group, query: active.query });
		} catch {
			this.timer.delete(active.query);
			this.rejectFrame(frame, 'timer-error');
		}
	}

	recordDraw(pixels: number): void {
		if (!this.activeFrame || !this.activeGroup) return;
		const sample = this.activeFrame.groups[this.activeGroup.group];
		sample.draws++;
		sample.pixels += Math.max(0, Math.floor(pixels));
	}

	recordLifecycle(phase: ProfileLifecyclePhase, ms: number): void {
		if (!Number.isFinite(ms) || ms < 0) return;
		const samples = this.lifecycle[phase];
		samples.push(ms);
		while (samples.length > this.sampleLimit) samples.shift();
	}

	rejectContextLost(): void {
		for (const frame of this.frames.values()) this.rejectFrame(frame, 'context-lost');
		this.dropAllPending();
		this.activeFrame = null;
		this.activeGroup = null;
		this.finalizeReady();
	}

	poll(): void {
		if (!this.timer || this.pending.length === 0) return;
		if (this.timer.disjoint()) {
			for (const frame of this.frames.values()) if (frame.pending > 0) this.rejectFrame(frame, 'disjoint');
			this.dropAllPending();
			this.finalizeReady();
			return;
		}

		const keep: PendingQuery[] = [];
		for (const item of this.pending) {
			if (!this.timer.available(item.query)) {
				keep.push(item);
				continue;
			}
			const frame = this.frames.get(item.frame);
			try {
				const nanos = this.timer.resultNanos(item.query);
				if (!frame || nanos == null || !Number.isFinite(nanos) || nanos < 0) {
					if (frame) this.rejectFrame(frame, 'timer-error');
				} else {
					const group = frame.groups[item.group];
					group.gpuMs = (group.gpuMs ?? 0) + nanos / 1_000_000;
				}
			} finally {
				this.timer.delete(item.query);
				if (frame) frame.pending = Math.max(0, frame.pending - 1);
			}
		}
		this.pending = keep;
		this.finalizeReady();
	}

	snapshot(environment: ProfileEnvironment, resources: ProfileResources): EngineProfileSnapshot {
		this.poll();
		return {
			version: 1,
			timingSource: this.samples.some((frame) => frame.gpuMs != null) ? 'gpu' : 'cpu',
			valid: !environment.contextLost && this.samples.length > 0,
			invalidReasons: [...this.invalidReasons],
			environment: { ...environment },
			lifecycle: Object.fromEntries(PROFILE_LIFECYCLE_PHASES.map((phase) => [phase, [...this.lifecycle[phase]]])) as Record<ProfileLifecyclePhase, number[]>,
			resources: { ...resources },
			frames: this.samples.map((frame) => ({
				...frame,
				groups: Object.fromEntries(PROFILE_GROUPS.map((group) => [group, { ...frame.groups[group] }])) as Record<ProfileGroup, ProfileGroupSample>
			})),
			rejected: { ...this.rejected }
		};
	}

	dispose(): void {
		this.dropAllPending();
		this.frames.clear();
		this.activeFrame = null;
		this.activeGroup = null;
	}

	private rejectFrame(frame: MutableFrame, reason: ProfileInvalidReason): void {
		if (frame.invalid) return;
		frame.invalid = reason;
		this.rejected[reason]++;
		this.invalidReasons.add(reason);
	}

	private dropAllPending(): void {
		if (!this.timer) return;
		for (const item of this.pending) {
			this.timer.delete(item.query);
			const frame = this.frames.get(item.frame);
			if (frame) frame.pending = Math.max(0, frame.pending - 1);
		}
		this.pending = [];
	}

	private finalizeReady(): void {
		for (const [id, frame] of this.frames) {
			if (!frame.ended || frame.pending > 0) continue;
			const draws = PROFILE_GROUPS.reduce((sum, group) => sum + frame.groups[group].draws, 0);
			if (draws === 0 && !frame.invalid) this.rejectFrame(frame, 'blank-frame');
			if (!frame.invalid) {
				const gpuValues = PROFILE_GROUPS.map((group) => frame.groups[group].gpuMs).filter((value): value is number => value != null);
				this.samples.push({
					id: frame.id,
					cpuMs: frame.cpuMs,
					gpuMs: gpuValues.length ? gpuValues.reduce((sum, value) => sum + value, 0) : null,
					draws,
					pixels: PROFILE_GROUPS.reduce((sum, group) => sum + frame.groups[group].pixels, 0),
					groups: frame.groups
				});
				while (this.samples.length > this.sampleLimit) this.samples.shift();
			}
			this.frames.delete(id);
		}
	}
}

export function estimateTextureBytes(gl: GL, width: number, height: number, format: number, type: number, halfFloatType: number): number {
	let channels = 4;
	if (format === gl.RGB) channels = 3;
	else if (format === gl.LUMINANCE || format === gl.ALPHA) channels = 1;
	else if (format === gl.LUMINANCE_ALPHA) channels = 2;
	else if ('RED' in gl && format === (gl as WebGL2RenderingContext).RED) channels = 1;
	else if ('RG' in gl && format === (gl as WebGL2RenderingContext).RG) channels = 2;
	let bytesPerComponent = 1;
	if (type === gl.FLOAT) bytesPerComponent = 4;
	else if (type === halfFloatType) bytesPerComponent = 2;
	return Math.max(0, width) * Math.max(0, height) * channels * bytesPerComponent;
}
