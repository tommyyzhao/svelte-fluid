import type { FlowConfig } from './types.js';

/** Conservative: these declarations can create/replace velocity or material. */
export function flowCanDriveSolver(flow: FlowConfig | null | undefined): boolean {
	const prescribed = flow?.prescribed;
	const hasPrescribed = !!(
		prescribed?.velocity ||
		(prescribed?.scalars && Object.values(prescribed.scalars).some((field) => field !== undefined))
	);
	const hasSource = flow?.sources?.some((source) => {
		if (source.rate === 0) return false;
		if (source.velocity && (source.velocity.x !== 0 || source.velocity.y !== 0)) return true;
		if (source.dye && (source.dye.r !== 0 || source.dye.g !== 0 || source.dye.b !== 0)) return true;
		return Object.values(source.scalars ?? {}).some((value) => value !== 0);
	});
	const hasForce = flow?.forces?.some((force) =>
		force.kind === 'buoyancy'
			? force.strength !== 0
			: force.vector.x !== 0 || force.vector.y !== 0
	);
	return !!(
		hasPrescribed ||
		hasSource ||
		hasForce
	);
}
