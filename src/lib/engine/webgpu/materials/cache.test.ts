import { describe, expect, it, vi } from 'vitest';
import { materialResources, materialShader, materialRenderPipeline, materialCacheSize } from './cache.js';

function device() {
	return {
		pushErrorScope: vi.fn(), popErrorScope: vi.fn(async () => null as GPUError | null),
		createShaderModule: vi.fn(() => ({ getCompilationInfo: async () => ({ messages: [] }) })),
		createRenderPipelineAsync: vi.fn(async () => ({}))
	};
}

describe('material candidate ownership and immutable caches', () => {
	it('pops scopes synchronously, before any sibling begins work', async () => {
		const mock = device(), resource = { destroy: vi.fn() };
		const result = materialResources(mock as unknown as GPUDevice, (own) => own(resource as unknown as GPUBuffer));
		expect(mock.popErrorScope).toHaveBeenCalledTimes(2);
		expect(await result).toBe(resource); expect(resource.destroy).not.toHaveBeenCalled();
	});
	it('destroys a partial candidate after synchronous failure', async () => {
		const mock = device(), resource = { destroy: vi.fn() };
		await expect(materialResources(mock as unknown as GPUDevice, (own) => { own(resource as unknown as GPUBuffer); throw new Error('allocation failed'); })).rejects.toThrow('allocation failed');
		expect(resource.destroy).toHaveBeenCalledOnce(); expect(mock.popErrorScope).toHaveBeenCalledTimes(2);
	});
	it('destroys every candidate resource after late validation or OOM rejection', async () => {
		for (const failure of ['validation', 'out-of-memory']) {
			const mock = device(), a = { destroy: vi.fn() }, b = { destroy: vi.fn() };
			mock.popErrorScope.mockResolvedValueOnce({ message: failure } as GPUError);
			await expect(materialResources(mock as unknown as GPUDevice, (own) => { own(a as unknown as GPUBuffer); own(b as unknown as GPUTexture); })).rejects.toThrow(failure);
			expect(a.destroy).toHaveBeenCalledOnce(); expect(b.destroy).toHaveBeenCalledOnce();
		}
	});
	it('coalesces concurrent shader and descriptor-equivalent pipeline requests', async () => {
		const mock = device(), gpu = mock as unknown as GPUDevice;
		const [a, b] = await Promise.all([materialShader(gpu, { code: 'shader', label: 'one' }), materialShader(gpu, { code: 'shader', label: 'two' })]);
		expect(a).toBe(b); expect(mock.createShaderModule).toHaveBeenCalledOnce();
		const descriptor: GPURenderPipelineDescriptor = { layout: 'auto', vertex: { module: a, entryPoint: 'v' } };
		const [p, q] = await Promise.all([materialRenderPipeline(gpu, { ...descriptor, label: 'one' }), materialRenderPipeline(gpu, { label: 'two', ...descriptor })]);
		expect(p).toBe(q); expect(mock.createRenderPipelineAsync).toHaveBeenCalledOnce();
		expect(materialCacheSize(gpu)).toEqual({ modules: 1, render: 1, compute: 0 });
	});
	it('evicts failed shaders and pipelines so explicit retry can recover', async () => {
		const mock = device(), gpu = mock as unknown as GPUDevice;
		mock.popErrorScope.mockResolvedValueOnce({ message: 'shader rejected' } as GPUError);
		await expect(materialShader(gpu, { code: 'shader' })).rejects.toThrow('shader rejected');
		const module = await materialShader(gpu, { code: 'shader' });
		expect(mock.createShaderModule).toHaveBeenCalledTimes(2);
		mock.createRenderPipelineAsync.mockRejectedValueOnce(new Error('pipeline rejected'));
		const descriptor: GPURenderPipelineDescriptor = { layout: 'auto', vertex: { module, entryPoint: 'v' } };
		await expect(materialRenderPipeline(gpu, descriptor)).rejects.toThrow('pipeline rejected');
		await materialRenderPipeline(gpu, descriptor);
		expect(mock.createRenderPipelineAsync).toHaveBeenCalledTimes(2);
	});
});
