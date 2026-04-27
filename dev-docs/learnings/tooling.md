# Learnings — tooling

## `bunx sv create` scaffolds an `npm`-flavored `build` script

**Symptom:** The freshly scaffolded `package.json` had
`"build": "vite build && npm run prepack"`.

**Cause:** `sv create --install bun` installs deps with bun but the
script template still hard-codes `npm run`.

**Fix:** Manually edit `package.json` after scaffolding —
`build` should be `vite build && bun run prepack`. Also added a
dedicated `package` script that runs only `svelte-kit sync && svelte-package`
for fast library-only iteration.

**Why this matters:** "bun-only" is an explicit project constraint. Any
`npm`/`npx` references in scripts would silently break the constraint
the moment a developer runs `bun run build`.

## Generating the base64 dithering string by hand is brittle

**Symptom:** First attempt to inline `LDR_LLL1_0.png` as base64 in
`dithering.ts` had a typo at index 3238 (`R` → `T`) **and** was truncated
from 9488 to 5248 characters. Both of these came from a manual
copy-paste from a `bun -e` capture file.

**Cause:** The base64 string is ~9.5 KB on a single line. Any
copy-buffer pagination, soft-wrap, or terminal scrollback dropping
chars produces silent corruption.

**Fix:** Wrote `dithering.ts` programmatically with a `bun -e` script
that read the original PNG, base64-encoded it, and templated the entire
TS file in one shot. Then verified the round-trip by re-reading the
file and comparing against the freshly encoded source — caught both the
typo and the truncation.

```bash
bun -e "
const orig = await Bun.file('./WebGL-Fluid-Simulation/LDR_LLL1_0.png').arrayBuffer();
const expected = Buffer.from(orig).toString('base64');
const file = await Bun.file('./svelte-fluid/src/lib/engine/dithering.ts').text();
const m = file.match(/'(iVBOR[A-Za-z0-9+\/=]+)'/);
console.log('equal?', m && expected === m[1]);
"
```

**Why this matters:** Any time a file embeds binary-encoded data,
write it programmatically and verify it round-trips. Don't trust
clipboards for >1 KB strings.

## `bunx sv create` ignores the path argument's nesting

**Symptom:** Ran `bunx sv create svelte-fluid` from inside
`fluid-project/`. Expected it to either nest into `fluid-project/svelte-fluid/`
or barf because the directory existed.

**Cause:** sv treats the positional argument as the directory name,
relative to cwd. It worked correctly here but if cwd had been
`fluid-project/svelte-fluid/` and we passed `svelte-fluid` we'd have
gotten `svelte-fluid/svelte-fluid/`. Always run from the parent
directory.

**Why this matters:** Run scaffolders from the *parent* of the target
directory. Verify with `ls` immediately after.

## Bun-installed dev servers can survive process kills

**Symptom:** After running the dev server in the background with
`run_in_background: true`, then trying `kill %1`, the process kept
running. Took multiple `pkill -f "vite dev"` and `pkill -9 -f svelte-kit`
calls to actually clean up.

**Cause:** `bun run dev` spawns child processes (vite + svelte-kit
sync). Killing the parent shell doesn't necessarily kill the children.

**Fix:** Use `pkill -9 -f "vite dev"` and `pkill -9 -f "svelte-kit"`
together when cleaning up. Better: when spawning servers in CI/dev,
capture the PID and kill the whole process group.

**Why this matters:** Long-running background commands need explicit
cleanup. Never assume `kill %1` will reap a Vite tree.
