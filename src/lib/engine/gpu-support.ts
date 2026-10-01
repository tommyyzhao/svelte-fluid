export type FluidUnavailableReason =
	| 'no-webgpu'
	| 'no-adapter'
	| 'software-adapter'
	| 'device-request-failed'
	| 'device-lost'
	| 'initialization-failed'
	| 'runtime-failed'
	| 'asset-failed';

export class FluidUnavailableError extends Error {
	constructor(message: string, readonly reason: FluidUnavailableReason, options?: ErrorOptions) {
		super(message, options);
		this.name = 'FluidUnavailableError';
	}
}

export interface FluidFieldResult {
	readonly data: Float32Array;
	readonly width: number;
	readonly height: number;
	readonly components: number;
}

export interface FluidGpuResourceSnapshot {
	texturesCreated: number;
	texturesDestroyed: number;
	buffersCreated: number;
	buffersDestroyed: number;
	liveTextures: number;
	liveBuffers: number;
}

export interface FluidGpuDeviceSnapshot extends FluidGpuResourceSnapshot {
	leases: number;
	pipelines: number;
	generation: number;
}

export function isFluidUnavailableError(error: unknown): error is FluidUnavailableError {
	return error instanceof FluidUnavailableError;
}

/** Probe adapter acquisition rather than merely checking for `navigator.gpu`. */
export async function isFluidGpuAvailable(
	options: { requireHardwareAcceleration?: boolean } = {}
): Promise<boolean> {
	if (typeof navigator === 'undefined' || !('gpu' in navigator)) return false;
	try {
		const adapter = await navigator.gpu.requestAdapter();
		if (!adapter) return false;
		return !options.requireHardwareAcceleration || !adapter.info.isFallbackAdapter;
	} catch {
		return false;
	}
}
