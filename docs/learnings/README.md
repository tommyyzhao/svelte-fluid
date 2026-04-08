# Learnings

Notes captured during the initial port. Each file gathers a topic's worth
of "I tried X, it broke, I learned Y" observations so the next person
doesn't have to rediscover them.

| File | Topic |
| --- | --- |
| [`tooling.md`](./tooling.md) | bun + sv scaffolding, package.json fixes, base64 generation |
| [`typescript-and-svelte5.md`](./typescript-and-svelte5.md) | TS node16 module resolution, Svelte 5 runes pitfalls |
| [`webgl-refactoring.md`](./webgl-refactoring.md) | Refactoring a global-state WebGL script into a class |
| [`verification.md`](./verification.md) | What worked for catching bugs early |
| [`presets.md`](./presets.md) | Timing race in post-mount splat injection, HDR splat colors |

## How to add a new learning

When you hit a snag and figure it out, add a short entry to whichever
file fits best. Format suggestion:

```markdown
### Title (one line)

**Symptom:** what you saw

**Cause:** what was actually happening

**Fix:** what you did

**Why this matters:** the durable lesson
```

Keep entries small. If a topic grows past ~10 entries, split it.
