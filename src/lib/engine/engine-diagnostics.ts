import type { FluidEngine } from './FluidEngine.js';
import type { FluidFieldResult, FluidGpuDeviceSnapshot } from './gpu-support.js';
import type { NativeWebGpuFluidEngine } from './webgpu/NativeWebGpuFluidEngine.js';

/** Internal deterministic surface for browser tests and local measurement routes. */
export interface FluidEngineDiagnostics {
	readField(field: 'velocity' | 'dye' | 'scalar' | 'pressure'): Promise<FluidFieldResult>;
	advance(steps: number, dt: number): void;
	advanceFrames(frames: number, elapsed: number): void;
	resourceSnapshot(): FluidGpuDeviceSnapshot | null;
	awaitIdle(): Promise<void>;
	forceDeviceLoss(): void;
}

export function getFluidEngineDiagnostics(engine: FluidEngine): FluidEngineDiagnostics {
	// Deliberately lives outside the root export graph. TypeScript `private` is a
	// public-API declaration boundary, not a runtime security boundary; local R&D
	// can inspect the controller without installing hooks on every production instance.
	const active = () =>
		(engine as unknown as { engine: NativeWebGpuFluidEngine | null }).engine;
	return {
		readField: (field) => {
			const native = active();
			if (!native) return Promise.reject(new Error('svelte-fluid: WebGPU engine is recovering'));
			return native.readField(field);
		},
		advance: (steps, dt) => active()?.advance(steps, dt),
		advanceFrames: (frames, elapsed) => active()?.advanceFrames(frames, elapsed),
		resourceSnapshot: () => active()?.resourceSnapshot() ?? null,
		awaitIdle: () => active()?.awaitIdle() ?? Promise.resolve(),
		forceDeviceLoss: () => active()?.forceDeviceLoss()
	};
}
