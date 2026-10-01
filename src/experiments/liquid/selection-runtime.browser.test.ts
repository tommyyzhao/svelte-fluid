import { mount, unmount } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import LiquidSelection from './LiquidSelection.svelte';
import { LabSession } from './LabSession.js';

afterEach(() => vi.restoreAllMocks());

async function control(test: (host: HTMLDivElement) => Promise<void>) {
	const host = document.createElement('div');
	host.style.width = '600px';
	document.body.append(host);
	const component = mount(LiquidSelection, { target: host });
	try { await test(host); }
	finally { await unmount(component); host.remove(); }
}

async function waitFor(condition: () => boolean) {
	await vi.waitFor(() => expect(condition()).toBe(true), { timeout: 10_000, interval: 20 });
}

function radios(host: HTMLElement) {
	return [...host.querySelectorAll<HTMLButtonElement>('[role="radio"]')];
}

describe('liquid selection GPU failure and native controls', () => {
	it('runs the actual preferred-canvas-format pipelines through the live session', async () => {
		const create = LabSession.create.bind(LabSession);
		let session: LabSession | undefined;
		vi.spyOn(LabSession, 'create').mockImplementation(async (...args) => {
			session = await create(...args);
			return session;
		});
		await control(async (host) => {
			await waitFor(() => Boolean(host.querySelector('.selection.material')) || Boolean(host.querySelector('.gpu-error')));
			expect(host.querySelector('.gpu-error')?.textContent ?? '').toBe('');
			const choices = radios(host);
			choices[2]!.click();
			await waitFor(() => choices[2]!.getAttribute('aria-checked') === 'true');
			await waitFor(() => (session?.state.seconds ?? 0) > 0.1 || Boolean(session?.state.error));
			expect(session?.state.error).toBe('');
			expect(host.querySelector('.selection.material')).not.toBeNull();
			choices[2]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
			await waitFor(() => choices[1]!.getAttribute('aria-checked') === 'true');
			expect(document.activeElement).toBe(choices[1]);
			expect(choices.map((button) => button.tabIndex)).toEqual([-1, 0, -1]);
		});
	});

	it('shows the real adapter failure and keeps click and keyboard selection usable', async () => {
		vi.spyOn(navigator.gpu, 'requestAdapter').mockResolvedValue(null);
		await control(async (host) => {
			await waitFor(() => Boolean(host.querySelector('.gpu-error')));
			expect(host.textContent).toContain('No WebGPU adapter is available in this browser.');
			expect(host.textContent).toContain('Requesting a WebGPU adapter, device, and canvas');
			expect(host.querySelector('.selection.material')).toBeNull();
			expect(getComputedStyle(host.querySelector('canvas')!).visibility).toBe('hidden');
			const choices = radios(host);
			choices[1]!.click();
			await waitFor(() => choices[1]!.getAttribute('aria-checked') === 'true');
			choices[1]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
			await waitFor(() => choices[2]!.getAttribute('aria-checked') === 'true');
			expect(document.activeElement).toBe(choices[2]);
		});
	});

	it('preserves a browser device-request rejection verbatim instead of inventing a cause', async () => {
		const adapter = await navigator.gpu.requestAdapter();
		expect(adapter).not.toBeNull();
		vi.spyOn(navigator.gpu, 'requestAdapter').mockResolvedValue(adapter);
		vi.spyOn(adapter!, 'requestDevice').mockRejectedValue(new DOMException('Selection test: device creation refused', 'OperationError'));
		await control(async (host) => {
			await waitFor(() => Boolean(host.querySelector('.gpu-error')));
			expect(host.querySelector('pre')?.textContent).toBe('OperationError: Selection test: device creation refused');
			expect(host.textContent).toContain('not a diagnosis');
			radios(host)[2]!.click();
			await waitFor(() => radios(host)[2]!.getAttribute('aria-checked') === 'true');
		});
	});

	it('surfaces a real WGSL validation error at the pipeline stage without breaking native selection', async () => {
		const createShaderModule = GPUDevice.prototype.createShaderModule;
		vi.spyOn(GPUDevice.prototype, 'createShaderModule').mockImplementation(function (this: GPUDevice, descriptor) {
			return createShaderModule.call(this, { ...descriptor, code: 'this_is_deliberately_invalid_wgsl' });
		});
		await control(async (host) => {
			await waitFor(() => Boolean(host.querySelector('.gpu-error')));
			expect(host.textContent).toContain('Creating selection buffers and shader pipelines');
			expect(host.querySelector('pre')?.textContent).toMatch(/1: .+/);
			expect(host.querySelector('.selection.material')).toBeNull();
			radios(host)[1]!.click();
			await waitFor(() => radios(host)[1]!.getAttribute('aria-checked') === 'true');
		});
	});

	it('disposes a session whose asynchronous startup finishes after unmount', async () => {
		const create = LabSession.create.bind(LabSession);
		let release: (() => void) | undefined;
		let session: LabSession | undefined;
		let disposed = false;
		vi.spyOn(LabSession, 'create').mockImplementation(async (...args) => {
			await new Promise<void>((resolve) => { release = resolve; });
			session = await create(...args);
			const dispose = session.dispose.bind(session);
			vi.spyOn(session, 'dispose').mockImplementation(() => { disposed = true; dispose(); });
			return session;
		});
		await control(async () => { await waitFor(() => Boolean(release)); });
		release?.();
		await waitFor(() => disposed);
		expect(session?.state.ready).toBe(false);
	});
});
