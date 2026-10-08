// ADR 0112: canvas-scoped lab opt-in; absent from the public entry point.
export interface ImageConvergenceExperiment {
	variant: 0 | 1 | 2 | '2s';
	onFrame?: (state: {
		seconds: number;
		final: boolean;
		draws: number;
		pixels: number;
		dyeFormat: 'RGBA32F' | 'RGBA16F';
		velocityMax: number;
		targetErrorMax: number;
	}) => void;
}
const experiments = new WeakMap<
	HTMLCanvasElement,
	ImageConvergenceExperiment
>();
export function registerImageConvergence(
	canvas: HTMLCanvasElement,
	experiment: ImageConvergenceExperiment
): () => void {
	if (experiment.variant !== '2s' && ![0, 1, 2].includes(experiment.variant))
		throw new RangeError('Unknown image convergence variant');
	experiments.set(canvas, experiment);
	return () => {
		if (experiments.get(canvas) === experiment) experiments.delete(canvas);
	};
}
export function imageConvergenceFor(
	canvas: HTMLCanvasElement
): ImageConvergenceExperiment | undefined {
	return experiments.get(canvas);
}
export function targetCurlKeep(seconds: number): number {
	return Math.min(1, Math.max(0, 1 - (seconds - 0.75) / 3));
}
export function targetRelaxation(seconds: number): number {
	return seconds < 0.75
		? 0
		: 0.35 + 2.65 * Math.min(1, Math.max(0, (seconds - 0.75) / 3));
}
export function referenceDisplacement(
	displacement: number,
	departureOffset: number,
	lambda: number,
	dt: number
): number {
	return (displacement + departureOffset) * relaxationKeep(lambda, dt);
}
export function relaxationKeep(lambda: number, dt: number): number {
	if (!Number.isFinite(lambda) || !Number.isFinite(dt) || lambda < 0 || dt < 0)
		throw new RangeError('Invalid relaxation step');
	return Math.exp(-lambda * dt);
}
