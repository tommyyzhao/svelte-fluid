import { expect, it } from "vitest";
import { FluidEngine, _setContextTier } from "./FluidEngine.js";
import { registerImageConvergence } from "./image-convergence.js";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
it("E5 V0 settles exact target, stops draws, wakes and disposes on both tiers", async () => {
  for (const tier of ["own", "shared"] as const) {
    _setContextTier(tier);
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    document.body.append(canvas);
    const source = document.createElement("canvas");
    source.width = 64;
    source.height = 64;
    const ctx = source.getContext("2d")!;
    ctx.fillStyle = "#46809e";
    ctx.fillRect(0, 0, 64, 64);
    let draws = 0,
      final = false;
    const unregister = registerImageConvergence(canvas, {
      variant: 0,
      onFrame: (s) => {
        draws = s.draws;
        final = s.final;
      },
    });
    const engine = new FluidEngine({
      canvas,
      config: {
        distortionImageUrl: source.toDataURL(),
        initialSplatCount: 2,
        seed: 5,
        simResolution: 32,
        dyeResolution: 64,
        densityDissipation: 0,
        velocityDissipation: 4,
        curl: 10,
        bloom: false,
        sunrays: false,
        shading: false,
      },
    });
    try {
      const wait = async () => {
        const start = performance.now();
        while (!engine.isSettled && performance.now() - start < 20000)
          await sleep(50);
        expect(engine.isSettled).toBe(true);
      };
      await wait();
      expect(engine.isPaused).toBe(true);
      expect(final).toBe(true);
      const before = draws;
      await sleep(300);
      expect(draws).toBe(before);
      expect(Math.max(...engine.readField("velocity").data.map(Math.abs))).toBe(
        0
      );
      engine.splat(0.5, 0.5, 120, -100, { r: 0.1, g: 0.2, b: 0.3 });
      expect(engine.isPaused).toBe(false);
      await wait();
      expect(final).toBe(true);
    } finally {
      engine.dispose();
      unregister();
      canvas.remove();
      _setContextTier("auto");
    }
  }
}, 60000);
