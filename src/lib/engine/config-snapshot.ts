import type {
	ContainerShape,
	FlowConfig,
	FlowForce,
	FlowGridField,
	FlowScalarField,
	FlowSource,
	FluidConfig,
	Obstruction,
	RGB,
	StickyMask,
	Vec2
} from './types.js';
import { flowScalarChannel } from './flow-policy.js';

/** The solver can consume 16 splats per frame; four frames of burst capacity is enough. */
export const MAX_QUEUED_SPLATS = 64;
const MAX_GPU_MAGNITUDE = 1_000_000_000;
const MAX_FLOW_SOURCES = 64;
const MAX_FLOW_OUTLETS = 32;
const MAX_FLOW_FORCES = 16;
const MAX_FLOW_SCALARS = 3;
const MAX_OBSTRUCTIONS = 64;
const MAX_PATH_CHARS = 512 * 1024;
const MAX_TEXT_CHARS = 64 * 1024;
const MAX_FONT_CHARS = 1024;
const MAX_OBSTRUCTION_TEXT_CHARS = 1024 * 1024;

function boundedDescriptors<T>(values: ReadonlyArray<T> | undefined, maximum: number, label: string): ReadonlyArray<T> | undefined {
	if (!values) return undefined;
	if (values.length > maximum) throw new RangeError(`svelte-fluid: ${label} supports at most ${maximum} entries`);
	return values;
}

function gpuNumber(value: number, label: string): number {
	if (!Number.isFinite(value) || Math.abs(value) > MAX_GPU_MAGNITUDE) {
		throw new RangeError(`svelte-fluid: ${label} must be a finite GPU-scale number`);
	}
	return value;
}

function boundedString(value: string | undefined, maximum: number, label: string): string | undefined {
	if (value !== undefined && value.length > maximum) {
		throw new RangeError(`svelte-fluid: ${label} exceeds ${maximum} characters`);
	}
	return value;
}

const optionalGpuNumber = (value: number | undefined, label: string): number | undefined =>
	value === undefined ? undefined : gpuNumber(value, label);

const cloneRgb = (color: RGB | null | undefined, label: string): RGB | null | undefined =>
	color == null
		? color
		: {
				r: gpuNumber(color.r, `${label}.r`),
				g: gpuNumber(color.g, `${label}.g`),
				b: gpuNumber(color.b, `${label}.b`)
			};

const cloneVec2 = (vector: Vec2 | undefined, label: string): Vec2 | undefined =>
	vector
		? { x: gpuNumber(vector.x, `${label}.x`), y: gpuNumber(vector.y, `${label}.y`) }
		: undefined;

function cloneViewBox(
	viewBox: [number, number, number, number] | undefined,
	label: string
): [number, number, number, number] | undefined {
	if (!viewBox) return undefined;
	const result = viewBox.map((value, index) => gpuNumber(value, `${label}[${index}]`)) as [
		number,
		number,
		number,
		number
	];
	if (result[2] === 0 || result[3] === 0) throw new RangeError(`svelte-fluid: ${label} dimensions must be non-zero`);
	return result;
}

function cloneContainerShape(shape: ContainerShape | null | undefined): ContainerShape | null | undefined {
	if (shape == null) return shape;
	switch (shape.type) {
		case 'circle':
			return {
				type: 'circle',
				cx: gpuNumber(shape.cx, 'containerShape.cx'),
				cy: gpuNumber(shape.cy, 'containerShape.cy'),
				radius: gpuNumber(shape.radius, 'containerShape.radius')
			};
		case 'frame':
			return {
				type: 'frame',
				cx: gpuNumber(shape.cx, 'containerShape.cx'),
				cy: gpuNumber(shape.cy, 'containerShape.cy'),
				halfW: gpuNumber(shape.halfW, 'containerShape.halfW'),
				halfH: gpuNumber(shape.halfH, 'containerShape.halfH'),
				innerCornerRadius: optionalGpuNumber(shape.innerCornerRadius, 'containerShape.innerCornerRadius'),
				outerHalfW: optionalGpuNumber(shape.outerHalfW, 'containerShape.outerHalfW'),
				outerHalfH: optionalGpuNumber(shape.outerHalfH, 'containerShape.outerHalfH'),
				outerCornerRadius: optionalGpuNumber(shape.outerCornerRadius, 'containerShape.outerCornerRadius')
			};
		case 'roundedRect':
			return {
				type: 'roundedRect',
				cx: gpuNumber(shape.cx, 'containerShape.cx'),
				cy: gpuNumber(shape.cy, 'containerShape.cy'),
				halfW: gpuNumber(shape.halfW, 'containerShape.halfW'),
				halfH: gpuNumber(shape.halfH, 'containerShape.halfH'),
				cornerRadius: gpuNumber(shape.cornerRadius, 'containerShape.cornerRadius')
			};
		case 'annulus':
			return {
				type: 'annulus',
				cx: gpuNumber(shape.cx, 'containerShape.cx'),
				cy: gpuNumber(shape.cy, 'containerShape.cy'),
				innerRadius: gpuNumber(shape.innerRadius, 'containerShape.innerRadius'),
				outerRadius: gpuNumber(shape.outerRadius, 'containerShape.outerRadius')
			};
		case 'svgPath':
			return {
				type: 'svgPath',
				d: boundedString(shape.d, MAX_PATH_CHARS, 'containerShape.d'),
				text: boundedString(shape.text, MAX_TEXT_CHARS, 'containerShape.text'),
				font: boundedString(shape.font, MAX_FONT_CHARS, 'containerShape.font'),
				viewBox: cloneViewBox(shape.viewBox, 'containerShape.viewBox'),
				fillRule: shape.fillRule,
				maskResolution: shape.maskResolution
			};
	}
}

function cloneObstruction(obstruction: Obstruction): Obstruction {
	return {
		d: boundedString(obstruction.d, MAX_PATH_CHARS, 'obstruction.d'),
		text: boundedString(obstruction.text, MAX_TEXT_CHARS, 'obstruction.text'),
		font: boundedString(obstruction.font, MAX_FONT_CHARS, 'obstruction.font'),
		viewBox: cloneViewBox(obstruction.viewBox, 'obstruction.viewBox'),
		fillRule: obstruction.fillRule,
		offset: cloneVec2(obstruction.offset, 'obstruction.offset'),
		scale: optionalGpuNumber(obstruction.scale, 'obstruction.scale'),
		fit: obstruction.fit
	};
}

function cloneObstructions(obstructions: ReadonlyArray<Obstruction> | undefined): Obstruction[] | undefined {
	const cloned = boundedDescriptors(obstructions, MAX_OBSTRUCTIONS, 'obstructions')?.map(cloneObstruction);
	const characters = cloned?.reduce(
		(total, obstruction) => total + (obstruction.d?.length ?? 0) + (obstruction.text?.length ?? 0),
		0
	) ?? 0;
	if (characters > MAX_OBSTRUCTION_TEXT_CHARS) {
		throw new RangeError(`svelte-fluid: obstruction vector/text data exceeds ${MAX_OBSTRUCTION_TEXT_CHARS} characters`);
	}
	return cloned;
}

function cloneStickyMask(mask: StickyMask | null | undefined): StickyMask | null | undefined {
	if (mask == null) return mask;
	return {
		d: boundedString(mask.d, MAX_PATH_CHARS, 'stickyMask.d'),
		text: boundedString(mask.text, MAX_TEXT_CHARS, 'stickyMask.text'),
		font: boundedString(mask.font, MAX_FONT_CHARS, 'stickyMask.font'),
		viewBox: cloneViewBox(mask.viewBox, 'stickyMask.viewBox'),
		fillRule: mask.fillRule,
		maskResolution: mask.maskResolution,
		blur: mask.blur,
		padding: mask.padding
	};
}

function cloneGridField(field: FlowGridField | undefined): FlowGridField | undefined {
	if (!field) return undefined;
	const scale = optionalGpuNumber(field.scale, 'prescribed grid scale');
	if (scale !== undefined && scale <= 0) {
		throw new RangeError('svelte-fluid: prescribed grid scale must be greater than zero');
	}
	return {
		width: gpuNumber(field.width, 'prescribed grid width'),
		height: gpuNumber(field.height, 'prescribed grid height'),
		// Grid payloads may be large. Identity plus `version` is their mutation contract.
		data: field.data,
		scale,
		version: field.version
	};
}

function cloneFlowSource(source: FlowSource): FlowSource {
	const scalarEntries = Object.entries(source.scalars ?? {});
	if (scalarEntries.length > MAX_FLOW_SCALARS) {
		throw new RangeError(`svelte-fluid: flow source scalars support at most ${MAX_FLOW_SCALARS} entries`);
	}
	const common = {
		velocity: cloneVec2(source.velocity, 'flow source velocity'),
		dye: cloneRgb(source.dye, 'flow source dye') ?? undefined,
		scalars: scalarEntries.length > 0
			? Object.fromEntries(
					scalarEntries.map(([name, value]) => [
						name,
						gpuNumber(value!, `flow source scalar ${name}`)
					])
				)
			: undefined,
		rate: optionalGpuNumber(source.rate, 'flow source rate'),
		radius: optionalGpuNumber(source.radius, 'flow source radius'),
		profile: source.profile
	};
	if (source.kind === 'point') {
		return {
			kind: 'point',
			x: gpuNumber(source.x, 'point source x'),
			y: gpuNumber(source.y, 'point source y'),
			...common
		};
	}
	if (source.kind === 'line') {
		return {
			kind: 'line',
			from: cloneVec2(source.from, 'line source from')!,
			to: cloneVec2(source.to, 'line source to')!,
			thickness: optionalGpuNumber(source.thickness, 'line source thickness'),
			...common
		};
	}
	return {
		kind: 'rect',
		x: gpuNumber(source.x, 'rect source x'),
		y: gpuNumber(source.y, 'rect source y'),
		width: gpuNumber(source.width, 'rect source width'),
		height: gpuNumber(source.height, 'rect source height'),
		...common
	};
}

function cloneFlowForce(force: FlowForce): FlowForce {
	if (force.kind === 'gravity' || force.kind === 'pressureGradient') {
		return { kind: force.kind, vector: cloneVec2(force.vector, `flow ${force.kind}`)! };
	}
	return {
		kind: 'buoyancy',
		scalar: force.scalar,
		direction: cloneVec2(force.direction, 'flow buoyancy direction'),
		strength: gpuNumber(force.strength, 'flow buoyancy strength'),
		ambient: optionalGpuNumber(force.ambient, 'flow buoyancy ambient')
	};
}

function cloneFlow(flow: FlowConfig | null | undefined): FlowConfig | null | undefined {
	if (flow == null) return flow;
	const scalarFields: ReadonlyArray<FlowScalarField> | undefined = boundedDescriptors(
		flow.scalarFields,
		MAX_FLOW_SCALARS,
		'flow.scalarFields'
	)?.map((field) => ({
		name: field.name,
		dissipation: optionalGpuNumber(field.dissipation, `flow scalar ${field.name} dissipation`),
		advection: field.advection,
		color: cloneRgb(field.color, `flow scalar ${field.name} color`) ?? undefined,
		range: field.range
			? [
					gpuNumber(field.range[0], `flow scalar ${field.name} range start`),
					gpuNumber(field.range[1], `flow scalar ${field.name} range end`)
				] as [number, number]
			: undefined
	}));
	const sources = boundedDescriptors(flow.sources, MAX_FLOW_SOURCES, 'flow.sources')?.map(cloneFlowSource);
	const forces = boundedDescriptors(flow.forces, MAX_FLOW_FORCES, 'flow.forces')?.map(cloneFlowForce);
	const declaredScalarNames = new Set<string>();
	for (const field of scalarFields ?? []) {
		if (declaredScalarNames.has(field.name)) {
			throw new RangeError(`svelte-fluid: scalar field ${field.name} is declared more than once`);
		}
		declaredScalarNames.add(field.name);
	}
	const scalarEntries: Array<[string, FlowGridField]> = Object.entries(
		flow.prescribed?.scalars ?? {}
	)
		.filter((entry): entry is [string, FlowGridField] => entry[1] !== undefined)
		.map(([name, field]) => [name, cloneGridField(field)!]);
	if (scalarEntries.length > MAX_FLOW_SCALARS) {
		throw new RangeError(`svelte-fluid: prescribed scalars support at most ${MAX_FLOW_SCALARS} entries`);
	}
	const scalarNames = [
		...(scalarFields?.map((field) => field.name) ?? []),
		...(sources?.flatMap((source) => Object.keys(source.scalars ?? {})) ?? []),
		...(forces?.flatMap((force) => force.kind === 'buoyancy' && force.scalar ? [force.scalar] : []) ?? []),
		...scalarEntries.map(([name]) => name),
		...(flow.visualization?.scalar ? [flow.visualization.scalar] : [])
	];
	const channelOwners = new Map<number, string>();
	for (const name of scalarNames) {
		if (!name) throw new RangeError('svelte-fluid: scalar field names must not be empty');
		const channel = flowScalarChannel(name, scalarFields);
		const owner = channelOwners.get(channel);
		if (owner && owner !== name) {
			throw new RangeError(
				`svelte-fluid: scalar fields ${owner} and ${name} alias packed channel ${channel}; declare at most three unique fields in channel order`
			);
		}
		channelOwners.set(channel, name);
	}
	return {
		mode: flow.mode,
		boundary: flow.boundary ? { ...flow.boundary } : undefined,
		sources,
		outlets: boundedDescriptors(flow.outlets, MAX_FLOW_OUTLETS, 'flow.outlets')?.map((outlet) => ({
			edge: outlet.edge,
			from: optionalGpuNumber(outlet.from, 'flow outlet from'),
			to: optionalGpuNumber(outlet.to, 'flow outlet to'),
			width: optionalGpuNumber(outlet.width, 'flow outlet width'),
			clearDye: optionalGpuNumber(outlet.clearDye, 'flow outlet clearDye'),
			clearVelocity: outlet.clearVelocity,
			clearScalars: outlet.clearScalars
		})),
		scalarFields,
		forces,
		prescribed: flow.prescribed
			? {
					kind: 'grid',
					velocity: cloneGridField(flow.prescribed.velocity),
					scalars: Object.fromEntries(scalarEntries)
				}
			: undefined,
		visualization: flow.visualization
			? {
					...flow.visualization,
					range: flow.visualization.range
						? [
								gpuNumber(flow.visualization.range[0], 'flow visualization range start'),
								gpuNumber(flow.visualization.range[1], 'flow visualization range end')
							]
						: undefined,
					scale: optionalGpuNumber(flow.visualization.scale, 'flow visualization scale')
				}
			: undefined
	};
}

/**
 * Take ownership of mutable descriptors while retaining prescribed-grid data by
 * identity. Unknown nested metadata is intentionally discarded: it cannot
 * affect rendering and must not enter change signatures or recovery state.
 */
export function snapshotFluidConfig(config: FluidConfig): FluidConfig {
	return {
		...config,
		backColor: cloneRgb(config.backColor, 'backColor') ?? undefined,
		revealCoverColor: cloneRgb(config.revealCoverColor, 'revealCoverColor') ?? undefined,
		revealAccentColor: cloneRgb(config.revealAccentColor, 'revealAccentColor') ?? undefined,
		revealFringeColor: cloneRgb(config.revealFringeColor, 'revealFringeColor') ?? undefined,
		obstructionColor: cloneRgb(config.obstructionColor, 'obstructionColor'),
		autoSplatColor: cloneRgb(config.autoSplatColor, 'autoSplatColor'),
		containerShape: cloneContainerShape(config.containerShape),
		obstructions: cloneObstructions(config.obstructions),
		stickyMask: cloneStickyMask(config.stickyMask) ?? undefined,
		flow: cloneFlow(config.flow),
		presetSplats: config.presetSplats
			?.slice(0, MAX_QUEUED_SPLATS)
			.map((splat) => ({
				x: gpuNumber(splat.x, 'preset splat x'),
				y: gpuNumber(splat.y, 'preset splat y'),
				dx: gpuNumber(splat.dx, 'preset splat dx'),
				dy: gpuNumber(splat.dy, 'preset splat dy'),
				color: cloneRgb(splat.color, 'preset splat color')!
			}))
	};
}
