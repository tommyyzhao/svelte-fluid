import assert from "node:assert/strict";
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { PNG } from "pngjs";
import {
  randomSides,
  unblind,
  pairVerdict,
  parseJudge,
} from "./quality-eval.mjs";
import { existsSync } from "node:fs";
assert(
  !existsSync("/tmp/svelte-fluid-gpu.lock"),
  "Do not load judge while another lane captures"
);
const ROOT = "/tmp/e5-spike";
const RUBRIC =
  'Read only pair.png. Each row is a sequence at simulation times 0.5, 1, 2, 4 seconds. Which sequence emerges like transported fluid rather than a crossfade/morph? Describe both; coherent advection, persistent swirls and colour carried by flow count; mere sharpness or layout do not. Tie if indistinguishable. Do not infer variant labels. Return ONLY JSON {"verdict":"left"|"right"|"tie","reason":"evidence"}. Left means top row, right means bottom row.';
async function judge(dir, prompt = RUBRIC, tools = "Read") {
  const env = { ...process.env };
  delete env.CLAUDECODE;
  const p = spawn(
    "claude",
    [
      "--model",
      "opus",
      "--dangerously-skip-permissions",
      "-p",
      prompt,
      "--tools",
      tools,
      "--allowedTools",
      tools,
      "--setting-sources",
      "",
      "--strict-mcp-config",
      "--mcp-config",
      '{"mcpServers":{}}',
    ],
    { cwd: dir, env, stdio: ["ignore", "pipe", "pipe"] }
  );
  let out = "",
    err = "";
  p.stdout.on("data", (s) => (out += s));
  p.stderr.on("data", (s) => (err += s));
  const timer = setTimeout(() => p.kill("SIGTERM"), 180000);
  try {
    const code = await new Promise((r, reject) => {
      p.once("error", reject);
      p.once("close", r);
    });
    assert(code === 0, err);
    return out;
  } finally {
    clearTimeout(timer);
  }
}
function composite(a, b, swap) {
  const strip = (frames) =>
    frames.map((f) =>
      PNG.sync.read(Buffer.from(f.png.split(",")[1], "base64"))
    );
  const rows = swap ? [strip(b), strip(a)] : [strip(a), strip(b)];
  assert(
    rows.every((r) => r.length === 4),
    "Four frozen capture times required"
  );
  const w = 256,
    h = Math.round((256 * rows[0][0].height) / rows[0][0].width),
    p = new PNG({ width: w * 4, height: h * 2 + 8 });
  p.data.fill(128);
  for (let row = 0; row < 2; row++)
    for (let f = 0; f < 4; f++)
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const s = rows[row][f],
            i =
              (Math.floor((y * s.height) / h) * s.width +
                Math.floor((x * s.width) / w)) *
              4;
          s.data.copy(
            p.data,
            ((row * (h + 8) + y) * p.width + f * w + x) * 4,
            i,
            i + 4
          );
        }
  return PNG.sync.write(p);
}
export function transportScore(frames) {
  const a = frames.map((f) =>
    PNG.sync.read(Buffer.from(f.png.split(",")[1], "base64"))
  );
  let score = 0;
  for (let t = 1; t < a.length; t++) {
    let change = 0,
      gradient = 0,
      n = 0;
    const l = (p, x, y) => {
      const i = (y * p.width + x) * 4;
      return (
        (0.2126 * p.data[i] + 0.7152 * p.data[i + 1] + 0.0722 * p.data[i + 2]) /
        255
      );
    };
    for (let y = 0; y < a[t].height - 1; y++)
      for (let x = 0; x < a[t].width - 1; x++) {
        const v = l(a[t], x, y),
          u = l(a[t - 1], x, y);
        change += Math.abs(v - u);
        gradient +=
          Math.abs(l(a[t], x + 1, y) - v - (l(a[t - 1], x + 1, y) - u)) +
          Math.abs(l(a[t], x, y + 1) - v - (l(a[t - 1], x, y + 1) - u));
        n++;
      }
    score += gradient / n / (change / n + 1 / 255);
  }
  return score / (a.length - 1);
}
async function calibrate() {
  assert(
    (await judge(ROOT, "Return exactly READY. No tools.", "")).trim() ===
      "READY"
  );
  const sequences = (fluid, seed) =>
    [0.5, 1, 2, 4].map((seconds) => {
      const p = new PNG({ width: 256, height: 160 });
      for (let y = 0; y < p.height; y++)
        for (let x = 0; x < p.width; x++) {
          const dx = x - 128,
            dy = y - 80,
            r = Math.hypot(dx, dy),
            angle =
              Math.atan2(dy, dx) +
              (fluid
                ? (4 - seconds) * Math.exp((-r * r) / 8000) * (1 + seed / 10)
                : 0);
          const xx = Math.cos(angle) * r + 128,
            yy = Math.sin(angle) * r + 80,
            cell = (Math.floor(xx / 20) + Math.floor(yy / 20)) % 2;
          const color = cell ? [40, 90, 190] : [230, 180, 35],
            amount = fluid ? 1 : seconds / 4;
          const i = (y * p.width + x) * 4;
          p.data.set(
            [...color.map((c) => Math.round(128 + amount * (c - 128))), 255],
            i
          );
        }
      return {
        seconds,
        png: `data:image/png;base64,${PNG.sync.write(p).toString("base64")}`,
      };
    });
  const controls = [];
  for (const kind of ["identical", "crossfade"])
    for (let seed = 0; seed < 5; seed++) {
      const a = sequences(true, seed),
        b = kind === "identical" ? a : sequences(false, seed),
        trials = [];
      for (const referenceLeft of randomSides()) {
        const dir = `${ROOT}/calibration-${kind}-${seed}-${trials.length}`;
        await mkdir(dir);
        await writeFile(`${dir}/pair.png`, composite(a, b, !referenceLeft));
        try {
          const p = parseJudge(await judge(dir));
          trials.push({ ...p, unblinded: unblind(p.verdict, referenceLeft) });
        } finally {
          await rm(dir, { recursive: true });
        }
      }
      controls.push({
        kind,
        seed,
        verdict: pairVerdict(trials.map((t) => t.unblinded)),
        trials,
      });
      await writeFile(
        `${ROOT}/calibration.json`,
        JSON.stringify({ controls, complete: false })
      );
    }
  const passed =
    controls.filter((r) => r.kind === "identical" && r.verdict === "tie")
      .length >= 4 &&
    controls.filter((r) => r.kind === "crossfade" && r.verdict === "reference")
      .length >= 4;
  await writeFile(
    `${ROOT}/calibration.json`,
    JSON.stringify({ controls, complete: true, passed })
  );
  console.log({ passed });
}
if (import.meta.main && process.argv[2] === "calibrate") await calibrate();
else if (import.meta.main) {
  const calibration = JSON.parse(
    await readFile(`${ROOT}/calibration.json`, "utf8")
  );
  assert(
    calibration.complete && calibration.passed,
    "E5 fluid-emergence calibration required"
  );
  const variant = Number(process.argv[2]),
    split = process.argv[3] ?? "train";
  const baseline = JSON.parse(
      await readFile(`${ROOT}/v0-${split}.json`, "utf8")
    ),
    candidate = JSON.parse(
      await readFile(`${ROOT}/v${variant}-${split}.json`, "utf8")
    );
  const usable =
    (await judge(ROOT, "Return exactly READY. No tools.", "")).trim() ===
    "READY";
  assert(
    usable,
    "Judge alias unavailable; run registered fallback explicitly, no silent scorer change"
  );
  const verdicts = [],
    path = `${ROOT}/judge-v${variant}-${split}.json`;
  try {
    verdicts.push(...JSON.parse(await readFile(path, "utf8")));
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  for (let i = 0; i < candidate.length; i++) {
    const c = candidate[i],
      b = baseline.find((r) => r.image === c.image && r.seed === c.seed);
    assert(b);
    if (verdicts.some((r) => r.image === c.image && r.seed === c.seed))
      continue;
    const trials = [];
    for (const referenceLeft of randomSides()) {
      const dir = `${ROOT}/blind-${variant}-${i}-${trials.length}`;
      await mkdir(dir);
      await writeFile(
        `${dir}/pair.png`,
        composite(b.initial.frames, c.initial.frames, !referenceLeft)
      );
      try {
        const parsed = parseJudge(await judge(dir));
        trials.push({
          ...parsed,
          unblinded: unblind(parsed.verdict, referenceLeft),
        });
      } finally {
        await rm(dir, { recursive: true });
      }
    }
    const verdict = pairVerdict(trials.map((t) => t.unblinded));
    verdicts.push({
      image: c.image,
      seed: c.seed,
      verdict,
      score: verdict === "candidate" ? 1 : verdict === "reference" ? 0 : 0.5,
      trials,
      baselineTransport: transportScore(b.initial.frames),
      candidateTransport: transportScore(c.initial.frames),
    });
    await writeFile(path, JSON.stringify(verdicts));
    console.log(c.image, c.seed, verdict);
  }
}
