import { WebGpuResourceTracker, type WebGpuResourceSnapshot } from './resources.js';
import {
	FluidUnavailableError,
	type FluidGpuDeviceSnapshot,
	type FluidUnavailableReason
} from '../gpu-support.js';

export { FluidUnavailableError as WebGpuUnavailableError };
export type WebGpuUnavailableReason = FluidUnavailableReason;

export type WebGpuDeviceSnapshot = FluidGpuDeviceSnapshot & WebGpuResourceSnapshot;

export interface WebGpuDeviceLease {
	readonly adapter: GPUAdapter;
	readonly device: GPUDevice;
	readonly format: GPUTextureFormat;
	readonly tracker: WebGpuResourceTracker;
	readonly lost: Promise<GPUDeviceLostInfo>;
	pipeline(
		name: string,
		source: string,
		targetFormat: GPUTextureFormat,
		constants?: Record<string, number>
	): Promise<GPURenderPipeline>;
	snapshot(): WebGpuDeviceSnapshot;
	release(): void;
}

export interface WebGpuAcquireOptions {
	requireHardwareAcceleration?: boolean;
}

interface DeviceEntry {
	adapter: GPUAdapter;
	device: GPUDevice;
	format: GPUTextureFormat;
	tracker: WebGpuResourceTracker;
	modules: Map<string, Promise<GPUShaderModule>>;
	pipelines: Map<string, Promise<GPURenderPipeline>>;
	leases: number;
	generation: number;
	lost: Promise<GPUDeviceLostInfo>;
	errorHandler: (event: GPUUncapturedErrorEvent) => void;
}

function browserGpu(): GPU | undefined {
	if (typeof navigator === 'undefined') return undefined;
	return (navigator as Navigator & { gpu?: GPU }).gpu;
}

async function checkedShaderModule(device: GPUDevice, name: string, source: string): Promise<GPUShaderModule> {
	device.pushErrorScope('validation');
	const module = device.createShaderModule({
		label: `svelte-fluid-${name}`,
		code: source
	});
	// Pop before the first await. Each concurrently requested module therefore
	// owns a complete push/create/pop scope instead of sharing an async stack.
	const scopedError = device.popErrorScope();
	const [compilation, validationError] = await Promise.all([module.getCompilationInfo(), scopedError]);
	const errors = compilation.messages.filter((message) => message.type === 'error');
	if (errors.length > 0) {
		throw new Error(
			`svelte-fluid: WebGPU shader ${name} failed to compile:\n${errors
				.map((message) => `${message.lineNum}:${message.linePos} ${message.message}`)
				.join('\n')}`
		);
	}
	if (validationError) {
		throw new Error(`svelte-fluid: WebGPU shader ${name} failed validation: ${validationError.message}`);
	}
	return module;
}

async function checkedPipeline(
	device: GPUDevice,
	name: string,
	module: GPUShaderModule,
	targetFormat: GPUTextureFormat,
	constants?: Record<string, number>
): Promise<GPURenderPipeline> {
	try {
		// createRenderPipelineAsync rejects validation failures for this descriptor.
		// A device error scope would be shared stack state and can attribute errors
		// to the wrong request while cold-start pipelines compile concurrently.
		return await device.createRenderPipelineAsync({
			label: `svelte-fluid-${name}`,
			layout: 'auto',
			vertex: { module, entryPoint: 'vs_main' },
			fragment: {
				module,
				entryPoint: 'fs_main',
				constants,
				targets: [{ format: targetFormat }]
			},
			primitive: { topology: 'triangle-list' }
		});
	} catch (cause) {
		throw new Error(`svelte-fluid: WebGPU pipeline ${name} failed validation`, { cause });
	}
}

export class WebGpuDevicePool {
	private entry: DeviceEntry | null = null;
	private pending: Promise<DeviceEntry> | null = null;
	private generation = 0;

	async acquire(options: WebGpuAcquireOptions = {}): Promise<WebGpuDeviceLease> {
		const entry = this.entry ?? (await this.createEntry());
		if (options.requireHardwareAcceleration && entry.adapter.info.isFallbackAdapter) {
			throw new FluidUnavailableError(
				'svelte-fluid: WebGPU is available only through a software fallback adapter',
				'software-adapter'
			);
		}
		entry.leases += 1;
		let released = false;
		return {
			adapter: entry.adapter,
			device: entry.device,
			format: entry.format,
			tracker: entry.tracker,
			lost: entry.lost,
			pipeline: (name, source, targetFormat, constants) => {
				const constantKey = Object.entries(constants ?? {})
					.sort(([a], [b]) => a.localeCompare(b))
					.map(([key, value]) => `${key}=${value}`)
					.join(',');
				// Labels aid diagnostics but do not change a pipeline descriptor. Reuse
				// identical source/format/constants across dye, scalar, and other roles.
				const key = `${targetFormat}:${constantKey}:${source}`;
				let pipeline = entry.pipelines.get(key);
				if (!pipeline) {
					let module = entry.modules.get(source);
					if (!module) {
						module = checkedShaderModule(entry.device, name, source);
						entry.modules.set(source, module);
						void module.catch(() => {
							if (entry.modules.get(source) === module) entry.modules.delete(source);
						});
					}
					pipeline = module.then((resolved) =>
						checkedPipeline(entry.device, name, resolved, targetFormat, constants)
					);
					entry.pipelines.set(key, pipeline);
					void pipeline.catch(() => {
						if (entry.pipelines.get(key) === pipeline) entry.pipelines.delete(key);
					});
				}
				return pipeline;
			},
			snapshot: () => ({
				...entry.tracker.snapshot(),
				leases: entry.leases,
				pipelines: entry.pipelines.size,
				generation: entry.generation
			}),
			release: () => {
				if (released) return;
				released = true;
				entry.leases = Math.max(0, entry.leases - 1);
			}
		};
	}

	snapshot(): WebGpuDeviceSnapshot | null {
		const entry = this.entry;
		if (!entry) return null;
		return {
			...entry.tracker.snapshot(),
			leases: entry.leases,
			pipelines: entry.pipelines.size,
			generation: entry.generation
		};
	}

	private async createEntry(): Promise<DeviceEntry> {
		if (this.pending) return this.pending;
		this.pending = this.requestEntry();
		try {
			const entry = await this.pending;
			this.entry = entry;
			return entry;
		} finally {
			this.pending = null;
		}
	}

	private async requestEntry(): Promise<DeviceEntry> {
		const gpu = browserGpu();
		if (!gpu) {
			throw new FluidUnavailableError('svelte-fluid: WebGPU is not exposed in this browser', 'no-webgpu');
		}
		const adapter = await gpu.requestAdapter();
		if (!adapter) {
			throw new FluidUnavailableError('svelte-fluid: no compatible WebGPU adapter was returned', 'no-adapter');
		}
		let device: GPUDevice;
		try {
			device = await adapter.requestDevice();
		} catch (cause) {
			throw new FluidUnavailableError('svelte-fluid: requesting a WebGPU device failed', 'device-request-failed', {
				cause
			});
		}
		// Diagnostic only. The device is shared, so an uncaptured error cannot be
		// attributed to one instance; failing every lease would let one bad canvas
		// drop the whole page to fallback. Instance work (resource transitions and
		// frame submits) owns per-instance error scopes; device loss is the only
		// shared terminal signal and travels through `lost`.
		const errorHandler = (event: GPUUncapturedErrorEvent): void => {
			event.preventDefault();
			console.error('svelte-fluid: uncaptured WebGPU error', event.error);
		};
		device.addEventListener('uncapturederror', errorHandler);
		const entry: DeviceEntry = {
			adapter,
			device,
			format: gpu.getPreferredCanvasFormat(),
			tracker: new WebGpuResourceTracker(),
			modules: new Map(),
			pipelines: new Map(),
			leases: 0,
			generation: ++this.generation,
			lost: device.lost,
			errorHandler
		};
		void entry.lost.then(() => {
			entry.device.removeEventListener('uncapturederror', entry.errorHandler);
			if (this.entry === entry) this.entry = null;
		});
		return entry;
	}
}

export const sharedWebGpuDevicePool = new WebGpuDevicePool();
