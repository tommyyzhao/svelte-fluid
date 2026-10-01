import { DISABLED_PERFORMANCE_STATE } from './performance-governor.js';
import { MAX_QUEUED_SPLATS, snapshotFluidConfig } from './config-snapshot.js';
import { FluidUnavailableError } from './gpu-support.js';
import { randomSeed } from './rng.js';
import type { FluidConfig, FluidHandle, PerformanceState, RGB } from './types.js';
import { NativeWebGpuFluidEngine } from './webgpu/NativeWebGpuFluidEngine.js';

export interface FluidEngineOptions {
	canvas: HTMLCanvasElement;
	config?: FluidConfig;
	autoStart?: boolean;
	/** Called before deterministic reconstruction after the shared device is lost. */
	onRecovering?: () => void;
	/** Called after a replacement device and simulation have become usable. */
	onRecovered?: () => void;
	/** Receives uncaptured WebGPU validation/runtime errors. */
	onError?: (error: Error) => void;
	/** Receives distortion-image loading or upload failures. */
	onAssetError?: (error: Error) => void;
	/** Called after a distortion image has been uploaded successfully. */
	onAssetReady?: () => void;
	/** Receives a terminal recovery failure that leaves this engine unusable. */
	onFatalError?: (error: Error) => void;
}

type PendingInput =
	| { kind: 'splat'; x: number; y: number; dx: number; dy: number; color: RGB }
	| { kind: 'random'; count: number };

const CONSTRUCT_ONLY_CONFIG = [
	'seed',
	'initialSplatCount',
	'initialSplatCountMin',
	'initialSplatCountMax',
	'presetSplats',
	'requireHardwareAcceleration'
] as const;
const MAX_PENDING_INPUTS = MAX_QUEUED_SPLATS;

function definedConfigPatch(patch: FluidConfig): FluidConfig {
	return Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)) as FluidConfig;
}

/**
 * Framework-agnostic WebGPU fluid engine and its device-loss boundary.
 *
 * Construction begins adapter and pipeline acquisition immediately. Calls made
 * before {@link ready} resolves are retained in order, which gives Svelte and
 * non-Svelte hosts one stable object across asynchronous startup and recovery.
 */
export class FluidEngine implements FluidHandle {
	readonly ready: Promise<void>;

	private engine: NativeWebGpuFluidEngine | null = null;
	private config: FluidConfig;
	private readonly options: FluidEngineOptions;
	private readonly pendingInputs: PendingInput[] = [];
	private disposed = false;
	private shouldRun: boolean;
	private recoveryToken = 0;
	private configVersion = 0;
	private sizeVersion = 0;
	private desiredWidth: number;
	private desiredHeight: number;

	constructor(options: FluidEngineOptions) {
		this.options = options;
		this.config = snapshotFluidConfig({
			...definedConfigPatch(options.config ?? {}),
			seed: (options.config?.seed ?? randomSeed()) >>> 0
		});
		this.desiredWidth = options.canvas.width;
		this.desiredHeight = options.canvas.height;
		this.shouldRun = options.autoStart !== false;
		this.ready = this.createNativeEngine();
	}

	static async create(options: FluidEngineOptions): Promise<FluidEngine> {
		const engine = new FluidEngine(options);
		await engine.ready;
		return engine;
	}

	splat(x: number, y: number, dx: number, dy: number, color: RGB): void {
		if (this.disposed) return;
		if (this.engine) this.engine.splat(x, y, dx, dy, color);
		else {
			if (this.pendingInputs.length >= MAX_PENDING_INPUTS) this.pendingInputs.shift();
			this.pendingInputs.push({ kind: 'splat', x, y, dx, dy, color: { ...color } });
		}
	}

	randomSplats(count: number): void {
		if (this.disposed) return;
		const resolved = Number.isFinite(count) ? Math.max(0, Math.min(MAX_QUEUED_SPLATS, Math.floor(count))) : 0;
		if (this.engine) this.engine.randomSplats(resolved);
		else {
			const previous = this.pendingInputs.at(-1);
			if (previous?.kind === 'random') previous.count = Math.min(MAX_QUEUED_SPLATS, previous.count + resolved);
			else {
				if (this.pendingInputs.length >= MAX_PENDING_INPUTS) this.pendingInputs.shift();
				this.pendingInputs.push({ kind: 'random', count: resolved });
			}
		}
	}

	pause(): void {
		this.shouldRun = false;
		this.engine?.pause();
	}

	resume(): void {
		if (this.disposed) return;
		this.shouldRun = true;
		this.engine?.resume();
	}

	get isPaused(): boolean {
		return !this.shouldRun || !this.engine || this.engine.isPaused;
	}

	getPerformanceState(): PerformanceState {
		return this.engine?.getPerformanceState() ?? DISABLED_PERFORMANCE_STATE;
	}

	setConfig(patch: FluidConfig): void {
		if (this.disposed) return;
		try {
			const hotPatch = snapshotFluidConfig(definedConfigPatch(patch));
			for (const key of CONSTRUCT_ONLY_CONFIG) delete hotPatch[key];
			this.engine?.setConfig(hotPatch);
			this.config = snapshotFluidConfig({ ...this.config, ...hotPatch });
			this.configVersion += 1;
		} catch (cause) {
			this.reportConfigurationError(cause);
			return;
		}
	}

	resize(width: number, height: number): boolean {
		if (this.disposed || !Number.isFinite(width) || !Number.isFinite(height)) return false;
		const nextWidth = Math.max(1, Math.floor(width));
		const nextHeight = Math.max(1, Math.floor(height));
		const changed = this.desiredWidth !== nextWidth || this.desiredHeight !== nextHeight;
		if (!changed) return false;
		if (this.engine) {
			const resized = this.engine.resize(nextWidth, nextHeight);
			if (!resized) return false;
			this.desiredWidth = nextWidth;
			this.desiredHeight = nextHeight;
			this.sizeVersion += 1;
			return true;
		}
		this.desiredWidth = nextWidth;
		this.desiredHeight = nextHeight;
		this.sizeVersion += 1;
		this.options.canvas.width = nextWidth;
		this.options.canvas.height = nextHeight;
		return true;
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.recoveryToken += 1;
		this.pendingInputs.length = 0;
		this.engine?.dispose();
		this.engine = null;
	}

	private async createNativeEngine(
		recoveryBase?: { config: FluidConfig; width: number; height: number }
	): Promise<void> {
		const token = ++this.recoveryToken;
		let next: NativeWebGpuFluidEngine | null = null;
		next = await NativeWebGpuFluidEngine.create({
			canvas: this.options.canvas,
			config: recoveryBase?.config ?? this.config,
			autoStart: false,
			onError: (error) =>
				this.invokeHostCallback(() => this.options.onError?.(new Error(error.message, { cause: error })), 'onError'),
			onConfigurationError: (error, transition) => {
				if (!this.disposed && token === this.recoveryToken) {
					if (transition.kind === 'config') {
						this.config = transition.acceptedConfig;
						this.configVersion += 1;
					} else {
						this.desiredWidth = transition.acceptedWidth;
						this.desiredHeight = transition.acceptedHeight;
						this.sizeVersion += 1;
					}
				}
				this.reportConfigurationError(error);
			},
			onAssetError: this.options.onAssetError
				? (error) => this.invokeHostCallback(() => this.options.onAssetError?.(error), 'onAssetError')
				: undefined,
			onAssetReady: this.options.onAssetReady
				? () => this.invokeHostCallback(this.options.onAssetReady, 'onAssetReady')
				: undefined,
			onFatalError: (error) => {
				// A candidate that has not been published reports through its rejected
				// ready promise. Only a live engine can become terminal asynchronously.
				if (next && this.engine === next) {
					next.dispose();
					this.engine = null;
					if (this.options.onFatalError)
						this.invokeHostCallback(() => this.options.onFatalError?.(error), 'onFatalError');
					else console.error(error);
				}
			},
			onDeviceLost: () => void this.recover()
		});
		if (this.disposed || token !== this.recoveryToken) {
			next.dispose();
			return;
		}
		try {
			// Reconcile through the GPU fence. An update can arrive while validation
			// scopes settle, so version equality before that await is insufficient.
			while (!this.disposed && token === this.recoveryToken) {
				const configVersion = this.configVersion;
				const sizeVersion = this.sizeVersion;
				try {
					next.setConfig(this.config);
				} catch (cause) {
					this.config = next.acceptedState().config;
					this.configVersion += 1;
					this.reportConfigurationError(cause);
				}
				try {
					next.resize(this.desiredWidth, this.desiredHeight);
				} catch (cause) {
					const accepted = next.acceptedState();
					this.desiredWidth = accepted.width;
					this.desiredHeight = accepted.height;
					this.sizeVersion += 1;
					this.reportConfigurationError(cause);
				}
				await next.awaitIdle();
				if (configVersion === this.configVersion && sizeVersion === this.sizeVersion) break;
			}
			if (this.disposed || token !== this.recoveryToken) {
				next.dispose();
				return;
			}
			this.engine = next;
			for (const input of this.pendingInputs.splice(0)) {
				if (input.kind === 'splat') next.splat(input.x, input.y, input.dx, input.dy, input.color);
				else next.randomSplats(input.count);
			}
			if (this.shouldRun) next.resume();
		} catch (error) {
			next.dispose();
			throw error;
		}
	}

	private async recover(): Promise<void> {
		if (this.disposed) return;
		const previous = this.engine;
		const recoveryBase = previous?.acceptedState();
		this.engine = null;
		previous?.dispose();
		this.invokeHostCallback(this.options.onRecovering, 'onRecovering');
		try {
			if (recoveryBase) {
				this.options.canvas.width = recoveryBase.width;
				this.options.canvas.height = recoveryBase.height;
			}
			await this.createNativeEngine(recoveryBase);
			if (!this.disposed && this.engine) this.invokeHostCallback(this.options.onRecovered, 'onRecovered');
		} catch (cause) {
			if (this.disposed) return;
			const root = cause instanceof Error ? cause : new Error(String(cause));
			const error =
				root instanceof FluidUnavailableError
					? root
					: new FluidUnavailableError('svelte-fluid: WebGPU device recovery failed', 'device-lost', {
							cause: root
						});
			if (this.options.onFatalError) this.invokeHostCallback(() => this.options.onFatalError?.(error), 'onFatalError');
			else console.error(error);
		}
	}

	private reportConfigurationError(cause: unknown): void {
		const error = cause instanceof Error ? cause : new Error(String(cause));
		if (this.options.onError) this.invokeHostCallback(() => this.options.onError?.(error), 'onError');
		else console.error('svelte-fluid: rejected WebGPU configuration update', error);
	}

	private invokeHostCallback(callback: (() => void) | undefined, name: string): void {
		if (!callback) return;
		try {
			callback();
		} catch (cause) {
			console.error(`svelte-fluid: ${name} callback threw`, cause);
		}
	}
}
