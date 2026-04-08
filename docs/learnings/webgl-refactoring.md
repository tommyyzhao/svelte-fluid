# Learnings — WebGL refactoring

## Original IIFE patterns hide ownership

**Symptom:** `script.js`'s `blit` is an IIFE (lines 915–942) that creates
two GL buffers as a side effect, captures `gl` in closure, and exposes
only the inner draw function. Reading the code, it's not obvious who
owns the buffers — they're never assigned to anything.

**Cause:** The original assumes a single global GL context per page, so
"who owns the buffers" doesn't matter; they live until tab close.

**Fix:** In the refactor, `createBlit(gl, vertexBuffer, indexBuffer)`
takes the buffers as parameters. The engine creates them in its
constructor (`this.vertexBuffer`, `this.indexBuffer`) and deletes them
in `dispose()`. The blit closure no longer owns anything.

**Why this matters:** When you refactor a global-state script into a
disposable class, *every* `gl.create*()` call needs an obvious owner.
IIFEs that create resources as a side effect are a smell — extract the
allocation and pass the result in.

## Single-buffer FBOs need explicit disposal in `initFramebuffers`

**Symptom:** `setConfig({ simResolution: 256 })` would silently leak
three FBOs (`divergence`, `curlFBO`, `pressure`) every call.

**Cause:** The original `initFramebuffers` (script.js:982–1010)
unconditionally reassigns these single-buffer FBOs:

```js
divergence = createFBO(...)
curl       = createFBO(...)
pressure   = createDoubleFBO(...)
```

with no check for an existing instance. For a long-lived single-page
app, that's a one-time tiny leak. For a library where consumers might
hot-update resolution dozens of times, it adds up to OOM in minutes.

**Fix:** In `FluidEngine.initFramebuffers`:

```ts
disposeFBO(gl, this.divergence);
disposeFBO(gl, this.curlFBO);
disposeDoubleFBO(gl, this.pressure);
this.divergence = createFBO(...)
// ...
```

`disposeFBO`/`disposeDoubleFBO` are no-ops on `undefined`, so first-time
init still works.

**Why this matters:** Any time you refactor allocation code into a
class with hot-update support, audit *every* `createFBO` site for an
implicit "previous instance leak". The double-buffered ones (`dye`,
`velocity`, `pressure`) are handled by `resizeDoubleFBO` which already
deletes the old textures, but the single-buffered ones don't go through
that path.

## RAF callbacks need bound `this`

**Symptom:** Initially considered `requestAnimationFrame(this.update)`
in the engine. Would have lost `this` and crashed on the first frame.

**Cause:** `requestAnimationFrame` invokes the callback as a free
function, not a method. `this.update` becomes detached.

**Fix:** Use a bound class field arrow:

```ts
private tick = () => this.update();
// ...
this.rafId = requestAnimationFrame(this.tick);
```

The arrow captures `this` lexically; the field is created once per
instance, so `this.tick` is reference-stable across frames.

**Why this matters:** Any time you pass an instance method as a
callback, bind it as a class field. Don't `.bind(this)` ad hoc — that
creates a new function on every call site and breaks
`removeEventListener`. Class fields are a better default.

## `dispose()` order matters: cancel RAF *first*

**Symptom:** None observed, but a real concern. If `dispose()` deletes
GL resources before canceling the RAF, the next scheduled frame runs
`update()` against deleted FBOs and throws.

**Fix:** The dispose order is:

1. Set `this.disposed = true`
2. `cancelAnimationFrame(this.rafId)`
3. Remove DOM listeners
4. Delete framebuffers / textures
5. Delete programs / materials
6. Delete shaders
7. Delete vertex/index buffers
8. `WEBGL_lose_context.loseContext()`

The `update()` method also early-returns on `this.disposed` as a
defensive guard against the inevitable race.

**Why this matters:** When tearing down stateful resources that have
scheduled callbacks pointing back at them, always cancel the schedule
first, then teardown the state. And add a guard inside the callback as
defense-in-depth.

## `mouseup`/`touchend` belong on `window`, not the canvas

**Symptom:** None — copied from the original on purpose.

**Reasoning:** A user can press the mouse inside the canvas, drag
outside the canvas (or even outside the window), and release. If the
`mouseup` listener is on the canvas, it never fires and the pointer
stays "down" forever. Subsequent moves create a continuous splat trail
across the screen.

**Lesson:** Anywhere you handle drag-style input, mousedown/touchstart
go on the target, but mouseup/touchend go on `window`. This is also
why a canvas drag works even if the cursor leaves the browser entirely
on macOS.

## Touch listeners need `{ passive: false }` to call `preventDefault`

**Symptom:** None — also preserved from the original.

**Reasoning:** Modern browsers default touch listeners to passive mode,
which means `e.preventDefault()` does nothing and the page scrolls
under the user's finger while they're trying to paint. To stop scroll,
you must opt out of passive:

```ts
this.canvas.addEventListener('touchstart', this.onTouchStart, { passive: false });
this.canvas.addEventListener('touchmove',  this.onTouchMove,  { passive: false });
```

**Why this matters:** Any custom touch interaction on a `<canvas>`
needs `{ passive: false }`. Skipping it produces "the simulation feels
slippery on mobile" bug reports.

## `pageX`/`offsetX` both have failure modes; `getBoundingClientRect` is the answer

**Symptom (anticipated):** The previous Svelte 3 port (in
`./svelte-webgl-fluid-simulation/`) used `e.pageX`/`e.pageY` for
touch coordinates. That breaks the moment the canvas lives inside a
scrolled container — the touch lands meters away from where the user
tapped.

**Why the upstream got away with it:** The fluid sim is a fullscreen
canvas at `position: fixed`, so `pageX === clientX === offsetX` and
nothing breaks.

**Fix:**

```ts
const rect = this.canvas.getBoundingClientRect();
const x = scaleByPixelRatio(e.clientX - rect.left);
const y = scaleByPixelRatio(e.clientY - rect.top);
```

Works regardless of scroll position, CSS transforms (within reason),
and component nesting.

**Why this matters:** A library that ships into unknown DOM contexts
must use coordinate math that works in *every* DOM context.
`getBoundingClientRect()` is that math.

## Dispose `Material.programs` before deleting shaders

**Symptom:** None — but worth noting. `Material` caches multiple
programs (one per keyword set) in a `Map`. On dispose you must delete
each cached program *before* deleting the shaders they were linked
against. Otherwise the second `gl.deleteShader` is a no-op (the shader
is still attached to a live program) and the program leaks.

**Fix:** `Material.dispose()` iterates `this.programs.values()` and
calls `gl.deleteProgram` on each before clearing the map. The engine
calls `displayMaterial.dispose()` before deleting `baseVertexShader`.

**Why this matters:** GL resource lifetimes are reference-counted.
`gl.deleteShader` is queued until the last program using it is also
deleted. Always delete programs before their shaders.

## Probe textures in `supportRenderTextureFormat` were leaking

**Symptom:** None observed (the probe runs once per format at startup),
but the original `supportRenderTextureFormat` (script.js:191–206)
allocates a texture and a framebuffer just to call
`checkFramebufferStatus` and never deletes them. Three formats checked
× one engine instance = three leaked textures + framebuffers per page.

**Fix:** Added cleanup at the end of `gl-utils.ts:supportRenderTextureFormat`:

```ts
gl.bindFramebuffer(gl.FRAMEBUFFER, null);
gl.bindTexture(gl.TEXTURE_2D, null);
gl.deleteFramebuffer(fbo);
gl.deleteTexture(texture);
```

**Why this matters:** Format probes are by definition throwaway. Always
clean up probe artifacts. The amount of GPU memory is small; the
principle is large.

## `getResolution` reads `gl.drawingBufferWidth/Height`, not `canvas.width/height`

**Symptom:** None — the upstream did this right and we kept it.

**Reasoning:** On some drivers, `canvas.width` and
`gl.drawingBufferWidth` differ (the GL context may downsize for memory
reasons). Always read drawing buffer dimensions for resolution math
that affects FBO sizes; always read canvas dimensions for pointer math.

**Why this matters:** Mixing these up gives you off-by-DPR coordinate
bugs that only reproduce on specific GPUs.
