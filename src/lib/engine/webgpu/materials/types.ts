/** Private experiment contract; deliberately not part of the package API. */
export interface LiquidInput {
	x: number;
	y: number;
	vx: number;
	vy: number;
	active: boolean;
	/** Explicit contact pressure, independent of hovering/velocity-driven brushing. */
	press?: number;
	tilt: number;
}

export interface LiquidSnapshot {
	finite: boolean;
	mass: number;
	initialMass: number;
	min: number;
	max: number;
	kinetic: number;
	details: Record<string, number>;
}

export interface LiquidExperiment {
	readonly memoryBytes: number;
	resize(width: number, height: number): void;
	reset(): void;
	/** End a pointer gesture without stepping or erasing persistent material state. */
	endInput?(): void;
	/** Steps encoded before a queue submission must share dt/input (captured GPU uniforms). */
	step(encoder: GPUCommandEncoder, dt: number, input: LiquidInput): void;
	render(encoder: GPUCommandEncoder, target: GPUTextureView): void;
	inspect(): Promise<LiquidSnapshot>;
	dispose(): void;
}

export type LiquidMode = 'film' | 'vessel';
