import type { FlowConfig } from './types.js';

/** Conservative: these declarations can create/replace velocity or material. */
export function flowCanDriveSolver(flow: FlowConfig | null | undefined): boolean {
	return !!(
		flow?.prescribed ||
		(flow?.sources && flow.sources.length > 0) ||
		(flow?.forces && flow.forces.length > 0)
	);
}
