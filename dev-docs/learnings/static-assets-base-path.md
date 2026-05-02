# Static asset paths on GitHub Pages

## Symptom
Images referenced as `/filename.jpg` load fine on `localhost:5173` but show
white/broken on the deployed demo site (`tommyyzhao.github.io/svelte-fluid`).

## Cause
The deploy workflow sets `BASE_PATH=/svelte-fluid` at build time. Absolute
paths like `/bosch-garden.jpg` resolve to the domain root, not to the
`/svelte-fluid/` sub-path where the static assets actually live.

## Fix
Import `base` from `$app/paths` and prepend it to every static asset reference:

```svelte
<script>
  import { base } from '$app/paths';
</script>

<FluidDistortion src="{base}/bosch-garden.jpg" />
```

In module-level `<script lang="ts" module>` blocks, import and use the same way:

```svelte
<script lang="ts" module>
  import { base } from '$app/paths';
  export const D = { distortionSrc: `${base}/bosch-garden.jpg` };
</script>
```

## What NOT to do
Do not use bare `/filename.jpg` for any `static/` asset in demo route code.
Do not put `{base}` into user-facing code snippet strings shown in the UI —
those are copy-paste examples for library consumers who deploy under their own
paths.
