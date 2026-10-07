// @ts-nocheck -- measurement-only private prototype probes; never published.
// Measurement-only entry: Vite compiles the real component and resolves Svelte's browser export.
import { mount, unmount } from 'svelte';
import Fluid from './lib/Fluid.svelte';
import { FluidEngine } from './lib/engine/FluidEngine.js';
import { PRESETS } from './lib/presets/registry.js';

let component, engine, mountedAt, firstQuietAt = null, settledAt = null;
const ticks = [], raf = [], transitions = [], errors = [];
function refresh() { raf.push(performance.timeOrigin + performance.now()); requestAnimationFrame(refresh); }
requestAnimationFrame(refresh);
const epoch = () => performance.timeOrigin + performance.now();
const start = FluidEngine.prototype.startRaf;
FluidEngine.prototype.startRaf = function (...args) {
	engine = this;
	return start.apply(this, args);
};
const update = FluidEngine.prototype.update;
FluidEngine.prototype.update = function (...args) {
	ticks.push(epoch());
	return update.apply(this, args);
};
const stop = FluidEngine.prototype.stopRaf;
FluidEngine.prototype.stopRaf = function (...args) {
	if (this.isSettled && settledAt === null) settledAt = epoch();
	transitions.push({ at: epoch(), settled: this.isSettled });
	return stop.apply(this, args);
};
const visibility = [];
document.addEventListener('visibilitychange', () => visibility.push({ at: epoch(), state: document.visibilityState }));

window.__energy = {
	async mount({ preset, w, h, seed, override, diagnostic = false }) {
		const entry = PRESETS.find((p) => p.id === preset);
		if (preset !== '(default)' && !entry) throw new Error(`Unknown preset ${preset}`);
		if (diagnostic) {
			// Separate run only: observe the existing issue-time quiet probe, never add readbacks.
			const issue = FluidEngine.prototype.issueSettleProbe;
			FluidEngine.prototype.issueSettleProbe = function (...args) {
				const result = issue.apply(this, args);
				if (this.settleProbe) this.settleProbe.energyIssueAt = epoch();
				return result;
			};
			const poll = FluidEngine.prototype.pollSettleProbe;
			FluidEngine.prototype.pollSettleProbe = function (...args) {
				const issueAt = this.settleProbe?.energyIssueAt;
				const result = poll.apply(this, args);
				if (result === true && firstQuietAt === null) firstQuietAt = issueAt ?? epoch();
				return result;
			};
		}
		await new Promise((resolve, reject) => {
			component = mount(Fluid, {
				target: document.getElementById('target'),
				props: {
					...entry?.config, ...override, width: w, height: h, seed,
					onReady: () => { mountedAt = epoch(); resolve(); },
					onError: (error) => { errors.push(String(error)); reject(error); }
				}
			});
		});
		// Move scrollbars outside the scene: never shrink its CSS or native backing.
		document.body.style.minHeight = `${h + innerHeight + 300}px`;
		const gl = engine.gl, debug = gl.getExtension('WEBGL_debug_renderer_info');
		const canvas = document.querySelector('canvas'), rect = canvas.getBoundingClientRect();
		return {
			mountedAt, dprActual: devicePixelRatio, cssActual: [rect.width, rect.height],
			backing: [canvas.width, canvas.height], ua: navigator.userAgent,
			adapter: String(debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)),
			config: engine.config
		};
	},
	state() {
		return {
			at: epoch(), visibility: document.visibilityState, focus: document.hasFocus(),
			paused: engine?.isPaused ?? null, settled: engine?.isSettled ?? null,
			rafSubscribed: engine ? !!engine.stopFrames : null,
			firstQuietAt, settledAt, errors: [...errors]
		};
	},
	snapshot() { return { ...this.state(), mountedAt, ticks, raf, transitions, visibility }; },
	async dispose() { if (component) await unmount(component); component = null; }
};
