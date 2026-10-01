import type { FlowConfig, FlowScalarField, FlowTransfer } from './types.js';

export const FLOW_TRANSFER_KIND = {
	fire: 0,
	water: 1,
	ink: 2,
	viridis: 3,
	cfd: 4
} as const satisfies Record<FlowTransfer, number>;

export function flowTransferKind(transfer: FlowTransfer | undefined): number {
	return FLOW_TRANSFER_KIND[transfer ?? 'fire'];
}

/** Three scalar channels are intentionally packed into one RGB16F field. */
export function flowScalarChannel(name: string | undefined, fields?: ReadonlyArray<FlowScalarField>): number {
	const resolved = name ?? fields?.[0]?.name ?? 'temperature';
	const index = fields?.findIndex((field) => field.name === resolved) ?? -1;
	if (index >= 0) return Math.min(index, 2);
	if (resolved === 'temperature') return 0;
	if (resolved === 'ink') return 1;
	return 2;
}

/** Semantic owners of the three packed channels; changing this invalidates stored scalar values. */
export function flowScalarLayoutSignature(flow: FlowConfig | null | undefined): string {
	if (!flow) return 'none';
	const names = new Set<string>();
	for (const field of flow.scalarFields ?? []) names.add(field.name);
	for (const source of flow.sources ?? []) {
		for (const name of Object.keys(source.scalars ?? {})) names.add(name);
	}
	for (const force of flow.forces ?? []) {
		if (force.kind === 'buoyancy') names.add(force.scalar);
	}
	for (const [name, field] of Object.entries(flow.prescribed?.scalars ?? {})) {
		if (field !== undefined) names.add(name);
	}
	if (flow.visualization?.scalar) names.add(flow.visualization.scalar);
	if (flow.visualization?.colorBy === 'temperature') names.add('temperature');
	if (flow.visualization?.colorBy === 'scalar' && names.size === 0) {
		names.add(flow.scalarFields?.[0]?.name ?? 'temperature');
	}
	if (names.size === 0) return 'none';
	const owners = ['', '', ''];
	for (const name of names) owners[flowScalarChannel(name, flow.scalarFields)] = name;
	return owners.join('|');
}

export function flowNeedsScalarField(flow: FlowConfig | null | undefined): boolean {
	if (!flow) return false;
	if (flow.scalarFields?.length) return true;
	if (flow.visualization?.colorBy === 'temperature' || flow.visualization?.colorBy === 'scalar') return true;
	if (flow.sources?.some((source) => source.scalars && Object.keys(source.scalars).length > 0)) return true;
	if (flow.forces?.some((force) => force.kind === 'buoyancy')) return true;
	return !!(
		flow.prescribed?.kind === 'grid' &&
		flow.prescribed.scalars &&
		Object.values(flow.prescribed.scalars).some((field) => field !== undefined)
	);
}

export function flowScalarDissipation(field: FlowScalarField | undefined, fallback: number): number {
	const dissipation = field?.dissipation ?? fallback;
	return field?.advection === 'low-dissipation' ? dissipation * 0.35 : dissipation;
}
