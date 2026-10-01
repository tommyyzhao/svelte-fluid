import { MaterialRuntime, type MaterialDriver } from './runtime.js';
import { createSnapFoil } from './snap-foil.js';
import { createImageWake } from './image-wake.js';
import { coverImageBytes, loadCoverImage } from './living-cover.js';
import { createFilm, type FilmExperiment } from './film.js';
import { coarseEnamel } from './enamel-profile.js';
import { enamelTextSource } from './text-source.js';
import type { MaterialStatus } from '../../types.js';

const check = (signal: AbortSignal) => { if (signal.aborted) throw new Error('Material preparation was cancelled.'); };
const targetFor = (canvas: HTMLCanvasElement) => canvas.closest<HTMLElement>('button,a,input,[role="switch"]') ?? canvas.parentElement!;

export function attachMaterialFoil(canvas: HTMLCanvasElement, selected: boolean, enabled: boolean, notify: (status: MaterialStatus) => void) {
	return new MaterialRuntime(canvas, targetFor(canvas), async (lease, size, reserve, signal) => {
		reserve(32); const model = await createSnapFoil(lease.device, lease.format, () => 0, true);
		if (signal.aborted) { model.dispose(); check(signal); }
		model.resize(size.width, size.height);
		return { get active() { return !model.settled; },
			async layout(next) { reserve(32); model.resize(next.width, next.height); },
			step: model.step, render: model.render, quiet: model.reset, select: model.setCommitted, hover: model.setHover, dispose: model.dispose };
	}, notify, enabled, selected);
}

export function attachMaterialImage(canvas: HTMLCanvasElement, src: string, enabled: boolean, notify: (status: MaterialStatus) => void) {
	return new MaterialRuntime(canvas, targetFor(canvas), async (lease, size, reserve, signal) => {
		const bitmap = await loadCoverImage(src, signal); let model;
		try { check(signal); reserve(coverImageBytes(bitmap.width, bitmap.height).bytes + 1024); model = await createImageWake(lease.device, lease.format, bitmap, 'sparse', 'cover'); }
		finally { bitmap.close(); }
		if (signal.aborted) { model.dispose(); check(signal); }
		model.resize(size.width, size.height);
		return { get active() { return model.occupancy > 0; },
			async layout(next) { reserve(model.memoryBytes); model.resize(next.width, next.height); model.endInput?.(); },
			step: model.step, render: model.render, prime: model.primeInput, end: model.breakStroke, quiet: model.reset, dispose: model.dispose };
	}, notify, enabled);
}

export function attachMaterialEnamel(canvas: HTMLCanvasElement, source: HTMLElement, enabled: boolean, notify: (status: MaterialStatus) => void) {
	return new MaterialRuntime(canvas, source.parentElement!, async (lease, initialSize, reserve, signal) => {
		await document.fonts.ready; check(signal);
		let film: FilmExperiment | undefined, geometry = '', profileBytes = 0, modelBytes = 0, tail = 0;
		let profileWidth = 0, profileHeight = 0;
		let disposed = false;
		const driver: MaterialDriver = {
			get active() { return tail > 0; },
			async layout(size) {
				check(signal); if (disposed) return;
				const candidateBytes = size.width * size.height * 4;
				const native = enamelTextSource(source, canvas, size);
				if (film && native.geometry === geometry) {
					if (size.width !== profileWidth || size.height !== profileHeight) {
						reserve(modelBytes + profileBytes + candidateBytes);
						await film.updateEnamelProfile(native.profile); check(signal);
					}
					film.setColor(native.color); profileBytes = candidateBytes;
				} else {
					reserve(modelBytes + profileBytes + candidateBytes + 4 * 384 * 384 * 5 + 1100);
					const profile = native.profile;
					const aspect = size.cssWidth / Math.max(1, size.cssHeight);
					const width = Math.max(32, Math.min(384, Math.round(192 * Math.sqrt(aspect))));
					const height = Math.max(32, Math.min(384, Math.round(width / aspect)));
					const candidate = await createFilm(lease.device, lease.format, { width, height, transparent: true,
						color: native.color, brushRadius: 0.075, ...coarseEnamel(profile, width, height), enamel: profile });
					if (disposed || signal.aborted) { candidate.dispose(); check(signal); return; }
					film?.dispose(); film = candidate; profileBytes = candidateBytes;
					geometry = native.geometry; tail = 0;
				}
				modelBytes = film.memoryBytes - profileBytes; reserve(film.memoryBytes);
				profileWidth = size.width; profileHeight = size.height;
			},
			step(encoder, dt, input) {
				if (input.active || input.press) tail = 3;
				if (tail <= 0) return;
				// A bounded presentation tail, not a declaration of mathematical convergence.
				tail = Math.max(0, tail - dt); film?.step(encoder, dt, input);
			},
			render(encoder, target) { film?.render(encoder, target); },
			quiet() { tail = 0; film?.reset(); },
			dispose() { disposed = true; film?.dispose(); }
		};
		try { await driver.layout(initialSize); return driver; } catch (error) { driver.dispose(); throw error; }
	}, notify, enabled);
}
