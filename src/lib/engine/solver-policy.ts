export const SOLVER_REFERENCE_RESOLUTION = 128;

export function clampSimulationDeltaSeconds(
	frameSeconds: number,
	maxTimeStep: number,
	requestedSubsteps: number
): number {
	return Math.min(frameSeconds, maxTimeStep * requestedSubsteps);
}

export function viscosityAlpha(
	viscosity: number,
	dt: number,
	width: number,
	height: number,
	referenceResolution = SOLVER_REFERENCE_RESOLUTION
): number {
	const actualResolution = Math.min(width, height);
	return viscosity * dt * Math.max(width, height) * (actualResolution / referenceResolution);
}

export function curlScale(
	curl: number,
	width: number,
	height: number,
	referenceResolution = SOLVER_REFERENCE_RESOLUTION
): number {
	const actualResolution = Math.min(width, height);
	return curl * (referenceResolution / actualResolution);
}
