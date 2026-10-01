// Per-device immutable objects only. Instances still own their mutable resources.
interface Cache {
	modules: Map<string, Promise<GPUShaderModule>>;
	render: Map<string, Promise<GPURenderPipeline>>;
	compute: Map<string, Promise<GPUComputePipeline>>;
	groups: Map<string, GPUBindGroupLayout>;
	layouts: Map<string, GPUPipelineLayout>;
}
const caches = new WeakMap<GPUDevice, Cache>();
const identities = new WeakMap<object, number>();
let nextId = 0;
function key(value: unknown): string {
	if (value === undefined) return 'undefined';
	if (value === null || typeof value !== 'object') return JSON.stringify(value);
	if (Array.isArray(value)) return `[${value.map(key).join(',')}]`;
	if (Object.getPrototypeOf(value) !== Object.prototype) {
		if (!identities.has(value)) identities.set(value, ++nextId);
		return `@${identities.get(value)}`;
	}
	return `{${Object.entries(value).filter(([name]) => name !== 'label').sort(([a], [b]) => a.localeCompare(b)).map(([name, item]) => `${name}:${key(item)}`).join(',')}}`;
}
function cache(device: GPUDevice): Cache {
	let value = caches.get(device);
	if (!value) { value = { modules: new Map(), render: new Map(), compute: new Map(), groups: new Map(), layouts: new Map() }; caches.set(device, value); }
	return value;
}
export function materialShader(device: GPUDevice, descriptor: GPUShaderModuleDescriptor): Promise<GPUShaderModule> {
	const values = cache(device).modules;
	let module = values.get(descriptor.code);
	if (!module) {
		module = materialResources(device, () => device.createShaderModule(descriptor)).then(async (shader) => {
			const errors = (await shader.getCompilationInfo()).messages.filter((message) => message.type === 'error');
			if (errors.length) throw new Error(`${descriptor.label ?? 'Material shader'}: ${errors.map((error) => `${error.lineNum}: ${error.message}`).join('\n')}`);
			return shader;
		});
		values.set(descriptor.code, module); void module.catch(() => values.delete(descriptor.code));
	}
	return module;
}

/** The callback must be synchronous: no instance may hold a shared error scope
 * across an await. Failed candidates destroy every resource they created. */
export async function materialResources<T>(device: GPUDevice, prepare: (own: <R extends GPUBuffer | GPUTexture>(resource: R) => R) => T): Promise<T> {
	const resources: Array<GPUBuffer | GPUTexture> = [];
	let result: T | undefined, failure: unknown;
	device.pushErrorScope('validation'); device.pushErrorScope('out-of-memory');
	try { result = prepare((resource) => { resources.push(resource); return resource; }); }
	catch (error) { failure = error; }
	const scopes = [device.popErrorScope(), device.popErrorScope()];
	try {
		const error = (await Promise.all(scopes)).find(Boolean);
		if (failure || error) throw failure ?? new Error(error!.message);
		return result!;
	} catch (error) { for (const resource of resources) resource.destroy(); throw error; }
}
export function materialRenderPipeline(device: GPUDevice, descriptor: GPURenderPipelineDescriptor): Promise<GPURenderPipeline> {
	const values = cache(device).render, id = key(descriptor);
	let pipeline = values.get(id);
	if (!pipeline) { pipeline = device.createRenderPipelineAsync(descriptor); values.set(id, pipeline); void pipeline.catch(() => values.delete(id)); }
	return pipeline;
}
export function materialComputePipeline(device: GPUDevice, descriptor: GPUComputePipelineDescriptor): Promise<GPUComputePipeline> {
	const values = cache(device).compute, id = key(descriptor);
	let pipeline = values.get(id);
	if (!pipeline) { pipeline = device.createComputePipelineAsync(descriptor); values.set(id, pipeline); void pipeline.catch(() => values.delete(id)); }
	return pipeline;
}
export function materialBindGroupLayout(device: GPUDevice, descriptor: GPUBindGroupLayoutDescriptor): GPUBindGroupLayout {
	const values = cache(device).groups, id = key(descriptor);
	let layout = values.get(id);
	if (!layout) { layout = device.createBindGroupLayout(descriptor); values.set(id, layout); }
	return layout;
}
export function materialPipelineLayout(device: GPUDevice, descriptor: GPUPipelineLayoutDescriptor): GPUPipelineLayout {
	const values = cache(device).layouts, id = key(descriptor);
	let layout = values.get(id);
	if (!layout) { layout = device.createPipelineLayout(descriptor); values.set(id, layout); }
	return layout;
}
export function materialCacheSize(device: GPUDevice) {
	const value = cache(device);
	return { modules: value.modules.size, render: value.render.size, compute: value.compute.size };
}
