import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GlHostInstance } from '../gl-host.js';

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	vi.resetModules();
});

/** Minimal WebGL2 stand-in: constants are their own names, methods are spies. */
function fakeGl() {
	const calls: Record<string, unknown[][]> = {};
	const overrides: Record<string, (...args: unknown[]) => unknown> = {
		checkFramebufferStatus: () => 'FRAMEBUFFER_COMPLETE',
		getShaderParameter: () => true,
		getProgramParameter: (_p, name) => (name === 'ACTIVE_UNIFORMS' ? 0 : true),
		isContextLost: () => false,
		getExtension: () => ({ loseContext: () => (calls.loseContext ??= []).push([]) })
	};
	const gl = new Proxy({} as Record<string, unknown>, {
		get(_t, prop: string) {
			if (prop === 'then') return undefined;
			if (prop === 'drawingBufferWidth' || prop === 'drawingBufferHeight') return 1;
			if (/^[A-Z0-9_]+$/.test(prop)) return prop;
			return (...args: unknown[]) => {
				(calls[prop] ??= []).push(args);
				return overrides[prop] ? overrides[prop](...args) : {};
			};
		}
	});
	return { gl, calls };
}

async function setup() {
	const { gl, calls } = fakeGl();
	const surfaces: FakeSurface[] = [];
	class FakeSurface {
		listeners: Record<string, (e: Event) => void> = {};
		constructor(
			public width: number,
			public height: number
		) {
			surfaces.push(this);
		}
		getContext = () => gl;
		addEventListener(type: string, fn: (e: Event) => void) {
			this.listeners[type] = fn;
		}
		removeEventListener(type: string) {
			delete this.listeners[type];
		}
	}
	vi.stubGlobal('OffscreenCanvas', FakeSurface);
	const mod = await import('../gl-host.js');
	const presents = vi.fn();
	const instance = (lost = vi.fn(), restored = vi.fn(), transfer = presents): GlHostInstance => ({
		canvas: { width: 4, height: 3, getContext: () => ({ transferFromImageBitmap: transfer }) } as unknown as HTMLCanvasElement,
		onContextLost: lost,
		onContextRestored: restored
	});
	const snapshots: { bitmap: { close: ReturnType<typeof vi.fn> }; resolve: () => void; reject: (e: unknown) => void }[] = [];
	vi.stubGlobal('createImageBitmap', vi.fn(() => new Promise((resolve, reject) => {
		const bitmap = { close: vi.fn() };
		snapshots.push({ bitmap, resolve: () => resolve(bitmap), reject });
	})));
	return { ...mod, calls, surfaces, instance, presents, snapshots };
}

describe('gl-host (ADR-0088)', () => {
	it('requests an untransformed native snapshot, retaining its sRGB premultiplied tag', async () => {
		const { acquireGlHost, releaseGlHost, instance, snapshots, surfaces } = await setup();
		const a = instance();
		const pending = acquireGlHost(a).present(a);
		expect(createImageBitmap).toHaveBeenCalledExactlyOnceWith(surfaces[0]);
		snapshots[0].resolve();
		await pending;
		releaseGlHost(a);
	});

	it('presents completed snapshots while newer requests remain pending, including sustained overlap', async () => {
		const { acquireGlHost, releaseGlHost, instance, presents, snapshots } = await setup();
		const a = instance();
		const host = acquireGlHost(a);
		let pending = host.present(a);
		for (let i = 0; i < 4; i++) {
			const newer = host.present(a);
			snapshots[i].resolve();
			await pending;
			expect(presents).toHaveBeenCalledTimes(i + 1);
			expect(presents).toHaveBeenLastCalledWith(snapshots[i].bitmap);
			pending = newer;
		}
		snapshots[4].resolve();
		await pending;
		expect(presents).toHaveBeenCalledTimes(5);
		for (const { bitmap } of snapshots) expect(bitmap.close).toHaveBeenCalledOnce();
		releaseGlHost(a);
	});

	it('keeps presentation progress isolated between siblings', async () => {
		const { acquireGlHost, releaseGlHost, instance, presents, snapshots } = await setup();
		const siblingPresents = vi.fn();
		const a = instance();
		const b = instance(vi.fn(), vi.fn(), siblingPresents);
		const host = acquireGlHost(a);
		acquireGlHost(b);
		const first = host.present(a);
		const newer = host.present(a);
		const sibling = host.present(b);
		snapshots[2].resolve();
		await sibling;
		snapshots[0].resolve();
		await first;
		expect(presents).toHaveBeenCalledExactlyOnceWith(snapshots[0].bitmap);
		expect(siblingPresents).toHaveBeenCalledExactlyOnceWith(snapshots[2].bitmap);
		snapshots[1].resolve();
		await newer;
		for (const { bitmap } of snapshots) expect(bitmap.close).toHaveBeenCalledOnce();
		releaseGlHost(a);
		releaseGlHost(b);
	});

	it.each(['transfer throw', 'snapshot rejection'])('%s does not suppress an older completed frame', async (failure) => {
		const { acquireGlHost, releaseGlHost, instance, presents, snapshots } = await setup();
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const a = instance();
		const host = acquireGlHost(a);
		const older = host.present(a);
		const newer = host.present(a);
		const reason = new Error(failure);
		if (failure === 'transfer throw') {
			presents.mockImplementationOnce(() => { throw reason; });
			const rejected = expect(newer).rejects.toBe(reason);
			snapshots[1].resolve();
			await rejected;
			expect(snapshots[1].bitmap.close).toHaveBeenCalledOnce();
		} else {
			snapshots[1].reject(reason);
			await newer;
			expect(error).toHaveBeenCalledExactlyOnceWith('svelte-fluid: gl-host present failed', reason);
			expect(snapshots[1].bitmap.close).not.toHaveBeenCalled();
		}
		presents.mockClear();
		snapshots[0].resolve();
		await older;
		expect(presents).toHaveBeenCalledExactlyOnceWith(snapshots[0].bitmap);
		expect(snapshots[0].bitmap.close).toHaveBeenCalledOnce();
		releaseGlHost(a);
	});

	it('presents only the newest successfully transferred overlapping snapshot, closing stale bitmaps', async () => {
		const { acquireGlHost, releaseGlHost, instance, presents, snapshots } = await setup();
		const a = instance();
		const host = acquireGlHost(a);
		const first = host.present(a);
		const second = host.present(a);
		snapshots[1].resolve();
		await second;
		snapshots[0].resolve();
		await first;
		expect(presents).toHaveBeenCalledExactlyOnceWith(snapshots[1].bitmap);
		expect(snapshots[0].bitmap.close).toHaveBeenCalledOnce();
		expect(snapshots[1].bitmap.close).toHaveBeenCalledOnce();
		releaseGlHost(a);
	});

	it('drops pending snapshots after loss, restore, release or reacquire', async () => {
		const { acquireGlHost, releaseGlHost, instance, presents, snapshots, surfaces } = await setup();
		const lost = vi.fn();
		const restored = vi.fn();
		const a = instance(lost, restored);
		const host = acquireGlHost(a);
		const pendingLoss = host.present(a);
		const pendingLossNewer = host.present(a);
		surfaces[0].listeners.webglcontextlost({ preventDefault() {} } as Event);
		surfaces[0].listeners.webglcontextrestored({} as Event);
		const postRestore = host.present(a);
		for (const i of [1, 0]) snapshots[i].resolve();
		await Promise.all([pendingLoss, pendingLossNewer]);
		expect(presents).not.toHaveBeenCalled();
		snapshots[2].resolve();
		await postRestore;
		expect(presents).toHaveBeenCalledExactlyOnceWith(snapshots[2].bitmap);
		presents.mockClear();
		const pendingRelease = host.present(a);
		releaseGlHost(a);
		const fresh = acquireGlHost(a);
		expect(fresh).not.toBe(host);
		snapshots[3].resolve();
		await pendingRelease;
		expect(presents).not.toHaveBeenCalled();
		for (const { bitmap } of snapshots) expect(bitmap.close).toHaveBeenCalledOnce();
		expect(lost).toHaveBeenCalledOnce();
		expect(restored).toHaveBeenCalledOnce();
		releaseGlHost(a);
	});

	it('invalidates the old registration when the same instance rejoins a live sibling host', async () => {
		const { acquireGlHost, releaseGlHost, instance, presents, snapshots } = await setup();
		const a = instance();
		const b = instance();
		const host = acquireGlHost(a);
		acquireGlHost(b);
		const old = host.present(a);
		releaseGlHost(a);
		expect(acquireGlHost(a)).toBe(host);
		const fresh = host.present(a);
		snapshots[0].resolve();
		await old;
		expect(presents).not.toHaveBeenCalled();
		snapshots[1].resolve();
		await fresh;
		expect(presents).toHaveBeenCalledExactlyOnceWith(snapshots[1].bitmap);
		for (const { bitmap } of snapshots) expect(bitmap.close).toHaveBeenCalledOnce();
		releaseGlHost(a);
		releaseGlHost(b);
	});

	it('does not log a rejected pending snapshot after release', async () => {
		const { acquireGlHost, releaseGlHost, instance, presents, snapshots } = await setup();
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const a = instance();
		const pending = acquireGlHost(a).present(a);
		releaseGlHost(a);
		snapshots[0].reject(new Error('snapshot rejected after teardown'));
		await pending;
		expect(presents).not.toHaveBeenCalled();
		expect(error).not.toHaveBeenCalled();
	});
	it('falls back to a detached canvas when OffscreenCanvas cannot create WebGL2', async () => {
		const { acquireGlHost, releaseGlHost, calls, instance } = await setup();
		const { gl } = fakeGl();
		vi.stubGlobal('OffscreenCanvas', class {
			getContext() { return null; }
		});
		const canvas = { width: 1, height: 1, getContext: vi.fn(() => gl), addEventListener: vi.fn(), removeEventListener: vi.fn() };
		const createElement = vi.fn(() => canvas);
		vi.stubGlobal('document', { createElement });
		const a = instance();
		expect(acquireGlHost(a).gl).toBe(gl);
		expect(createElement).toHaveBeenCalledExactlyOnceWith('canvas');
		expect(calls.createVertexArray).toBeUndefined();
		releaseGlHost(a);
	});

	it('leaves no host behind when the first canvas cannot take a bitmaprenderer', async () => {
		const { acquireGlHost, releaseGlHost, calls, surfaces, instance } = await setup();
		const taken = { ...instance(), canvas: { width: 4, height: 3, getContext: () => null } as unknown as HTMLCanvasElement };
		expect(() => acquireGlHost(taken)).toThrow(/bitmaprenderer/);
		// The host was created first (so a WebGL1 fallback never sees a locked
		// canvas) and must be torn down again, freeing its context slot.
		expect(calls.loseContext).toHaveLength(1);
		const a = instance();
		expect(acquireGlHost(a)).toBeTruthy();
		expect(surfaces).toHaveLength(2);
		releaseGlHost(a);
	});

	it('keys the program cache on name plus defines', async () => {
		const { acquireGlHost, releaseGlHost, calls, instance } = await setup();
		const a = instance();
		const host = acquireGlHost(a);
		const p = host.program('quad', 'vs', 'fs');
		// Edited source (HMR) is a new program, never a stale cached one.
		expect(host.program('quad', 'vs', 'edited fs')).not.toBe(p);
		const q = host.program('quad', 'vs', 'fs', ['SHADING']);
		expect(q).not.toBe(p);
		expect(host.program('quad', 'vs', 'fs', ['SHADING'])).toBe(q);
		const variant = host.program('quad', 'vs', 'fs', ['SHADING', 'BLOOM']);
		expect(host.program('quad', 'vs', 'fs', ['BLOOM', 'SHADING', 'BLOOM'])).toBe(variant);
		// Delimiters in the caller name cannot collide with a keyword suffix.
		expect(host.program('quad#SHADING', 'vs', 'fs')).not.toBe(q);
		expect(calls.linkProgram).toHaveLength(5);
		releaseGlHost(a);
	});

	it('shares one context across instances and disposes it when the count reaches zero', async () => {
		const { acquireGlHost, releaseGlHost, calls, surfaces, instance } = await setup();
		const a = instance();
		const b = instance();
		const host = acquireGlHost(a);
		expect(acquireGlHost(b)).toBe(host);
		expect(acquireGlHost(a)).toBe(host);
		expect(surfaces).toHaveLength(1);
		host.program('quad', 'vs', 'fs');
		releaseGlHost(a);
		releaseGlHost(a);
		expect(calls.deleteProgram).toBeUndefined();
		expect(calls.loseContext).toBeUndefined();
		releaseGlHost(b);
		expect(calls.deleteProgram).toHaveLength(1);
		expect(calls.deleteVertexArray).toHaveLength(1);
		expect(calls.loseContext).toHaveLength(1);
		expect(surfaces[0].listeners).toEqual({});
		expect(host.run(b, () => {})).toBe(false);
		for (let i = 0; i < 24; i++) {
			const c = instance();
			expect(acquireGlHost(c)).not.toBe(host);
			releaseGlHost(c);
		}
		expect(surfaces).toHaveLength(25);
		expect(calls.loseContext).toHaveLength(25);
	});

	it('clears the cache on loss and fans loss/restore out with isolated callbacks', async () => {
		const { acquireGlHost, releaseGlHost, calls, surfaces, instance } = await setup();
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const lostB = vi.fn();
		const restoredB = vi.fn();
		const a = instance(
			vi.fn(() => {
				throw new Error('consumer bug');
			}),
			vi.fn(() => {
				throw new Error('consumer bug');
			})
		);
		const b = instance(lostB, restoredB);
		const host = acquireGlHost(a);
		acquireGlHost(b);
		const p = host.program('quad', 'vs', 'fs');
		const preventDefault = vi.fn();
		surfaces[0].listeners.webglcontextlost({ preventDefault } as unknown as Event);
		expect(preventDefault).toHaveBeenCalled();
		expect(lostB).toHaveBeenCalledOnce();
		expect(host.run(a, () => {})).toBe(false);
		surfaces[0].listeners.webglcontextrestored({} as Event);
		expect(restoredB).toHaveBeenCalledOnce();
		expect(host.program('quad', 'vs', 'fs')).not.toBe(p);
		expect(calls.linkProgram).toHaveLength(2);
		const fn = vi.fn();
		expect(host.run(b, fn)).toBe(true);
		expect(fn).toHaveBeenCalledOnce();
		expect(surfaces[0].width).toBe(4);
		expect(surfaces[0].height).toBe(3);
		releaseGlHost(a);
		releaseGlHost(b);
	});
});
