import { expect, it } from "vitest";
import { FluidEngine, _setContextTier } from "./FluidEngine.js";
import { registerImageConvergence } from "./image-convergence.js";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
it("E5 arms settle exact target, stop draws, wake and dispose on both tiers", async () => {
  for (const variant of [0, 1, 2, "2s"] as const)
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
      const snapshot = document.createElement("canvas");
      snapshot.width = 64; snapshot.height = 64;
      let draws = 0,
        final = false,
        finalPixel: number[] = [];
      const unregister = registerImageConvergence(canvas, {
        variant,
        onFrame: (s) => {
          draws = s.draws;
          final = s.final;
          if (s.final) {
            const capture = snapshot.getContext("2d")!;
            capture.drawImage(canvas, 0, 0);
            finalPixel = [...capture.getImageData(32, 32, 1, 1).data];
          }
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
          while ((!engine.isSettled || !final) && performance.now() - start < 20000)
            await sleep(50);
          expect(engine.isSettled).toBe(true);
          expect(finalPixel).toEqual([70, 128, 158, 255]);
        };
        await wait();
        expect(engine.isPaused).toBe(true);
        expect(final).toBe(true);
        const before = draws;
        await sleep(300);
        expect(draws).toBe(before);
        expect(
          Math.max(...engine.readField("velocity").data.map(Math.abs))
        ).toBe(0);
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
}, 120000);
