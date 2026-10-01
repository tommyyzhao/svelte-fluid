import { createStressGlass, type StressGlass } from './stress-glass.js';
import { createSnapFoil, type SnapFoilExperiment } from './snap-foil.js';
import type { LiquidExperiment } from './types.js';

export type TactileKind = 'glass' | 'foil';

/** Authored interaction envelope; a mouse neither measures force nor changes
 * this disk's boundary geometry. Angle rotates the complete load/pad frame. */
export class GlassGesture {
	pressure = 0;
	angle = 0;
	hovered = false;
	held = false;
	pulseRemaining = 0;
	move(x: number, y: number, aspect: number) {
		if (![x, y, aspect].every(Number.isFinite) || aspect <= 0) return;
		const dx = (x - 0.5) * aspect, dy = y - 0.5;
		if (Math.hypot(dx, dy) > 0.025) this.angle = Math.atan2(dx, -dy);
		this.hovered = true;
	}
	press(held: boolean) { this.held = held; if (held) this.pressure = Math.max(this.pressure, 0.55); }
	pulse() { this.pulseRemaining = 0.2; this.pressure = 0.94; }
	advance(dt: number) {
		if (!Number.isFinite(dt) || dt <= 0) return;
		const target = this.held || this.pulseRemaining > 0 ? 0.94 : this.hovered ? 0.13 : 0;
		this.pulseRemaining = Math.max(0, this.pulseRemaining - dt);
		this.pressure += (target - this.pressure) * (1 - Math.exp(-Math.min(dt, 0.05) * 18));
		if (Math.abs(this.pressure - target) < 0.0001) this.pressure = target;
	}
	cancel() { this.held = false; this.hovered = false; this.pulseRemaining = 0; this.pressure = 0; }
}

export interface TactileMaterial extends LiquidExperiment {
	move(x: number, y: number): void;
	leave(): void;
	press(held: boolean): void;
	pulse(): void;
	commit(selected: boolean, immediate?: boolean): void;
	interrupt(): void;
}

export async function createTactileMaterial(device: GPUDevice, format: GPUTextureFormat, kind: TactileKind, selected = false): Promise<TactileMaterial> {
	const model = kind === 'glass' ? await createStressGlass(device, format) : await createSnapFoil(device, format);
	const glass = kind === 'glass' ? model as StressGlass : undefined;
	const foil = kind === 'foil' ? model as SnapFoilExperiment : undefined;
	const gesture = new GlassGesture();
	let aspect = 1, committed = selected, disposed = false;
	glass?.setLoad(0); foil?.setCommitted(selected, true);
	function sync() { glass?.setOrientation(gesture.angle); glass?.setLoad(gesture.pressure); }
	return {
		get memoryBytes() { return model.memoryBytes; },
		move(x, y) { if (disposed) return; gesture.move(x, y, aspect); foil?.setHover(x, y, true); sync(); },
		leave() { if (disposed) return; gesture.hovered = false; gesture.held = false; foil?.setHover(0.5, 0.5, false); },
		press(held) { if (disposed) return; gesture.press(held); sync(); },
		pulse() { if (disposed) return; gesture.pulse(); sync(); },
		commit(value, immediate = false) { if (disposed) return; committed = value; foil?.setCommitted(value, immediate); },
		interrupt() { if (disposed) return; gesture.cancel(); sync(); foil?.setHover(0.5, 0.5, false); foil?.setCommitted(committed, true); },
		resize(width, height) { model.resize(width, height); aspect = width / height; },
		reset() { if (disposed) return; gesture.cancel(); model.reset(); sync(); },
		step(encoder, dt, input) {
			if (disposed) return;
			if (glass) { gesture.advance(dt); sync(); }
			else foil!.step(encoder, dt, input);
		},
		render(encoder, target) { model.render(encoder, target); },
		async inspect() { const snapshot = await model.inspect(); snapshot.details.held = gesture.held ? 1 : 0; snapshot.details.pulseRemaining = gesture.pulseRemaining; snapshot.details.selected = committed ? 1 : 0; return snapshot; },
		dispose() { if (!disposed) { disposed = true; model.dispose(); } }
	};
}
