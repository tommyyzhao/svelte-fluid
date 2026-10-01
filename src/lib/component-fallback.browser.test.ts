import { mount, unmount } from 'svelte';
import { describe, expect, it } from 'vitest';
import FluidDistortion from './FluidDistortion.svelte';

describe('component asset fallback', () => {
	it('surfaces a failed distortion asset without tearing down the component contract', async () => {
		if (!('gpu' in navigator)) return;
		const target = document.createElement('div');
		target.style.width = '160px';
		target.style.height = '100px';
		document.body.append(target);
		let resolveFailure!: (error: Error) => void;
		const failure = new Promise<Error>((resolve) => (resolveFailure = resolve));
		const component = mount(FluidDistortion, {
			target,
			props: {
				src: 'http://127.0.0.1:1/svelte-fluid-missing-distortion.png',
				initialSplats: 0,
				onAssetError: resolveFailure
			}
		});
		try {
			const error = await Promise.race([
				failure,
				new Promise<never>((_, reject) =>
					setTimeout(() => reject(new Error('distortion asset failure timed out')), 10_000)
				)
			]);
			expect(error).toBeInstanceOf(Error);
			expect(target.textContent).toContain("This animation requires GPU graphics, which aren't available in your browser.");
			expect(target.querySelector('canvas')?.getAttribute('aria-hidden')).toBe('true');
		} finally {
			await unmount(component);
			target.remove();
		}
	}, 30_000);
});
