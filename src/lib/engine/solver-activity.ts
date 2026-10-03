import type { FlowConfig } from './types.js';

/**
 * Conservative: true when a declaration can create/replace velocity or
 * material. Numerically inert declarations (zero rate, zero payload, zero
 * vector, empty prescribed grid) cannot, so an otherwise empty scene may idle.
 */
export function flowCanDriveSolver(flow: FlowConfig | null | undefined): boolean {
	const prescribed = flow?.prescribed;
	if (prescribed?.velocity || Object.values(prescribed?.scalars ?? {}).some((field) => field !== undefined)) {
		return true;
	}
	const hasSource = flow?.sources?.some((source) => {
		const rate = source.rate ?? 60;
		if (!Number.isFinite(rate) || rate <= 0) return false;
		if (source.velocity && (source.velocity.x !== 0 || source.velocity.y !== 0)) return true;
		// Black pigment still deposits thickness.
		if (source.dye) return true;
		return Object.values(source.scalars ?? {}).some((value) => value !== undefined && value !== 0);
	});
	if (hasSource) return true;
	return !!flow?.forces?.some((force) =>
		force.kind === 'buoyancy' ? force.strength !== 0 : force.vector.x !== 0 || force.vector.y !== 0
	);
}
