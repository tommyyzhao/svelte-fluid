---
name: Bug report
about: Report a bug in svelte-fluid
title: ''
labels: bug
assignees: ''
---

## Environment

- **Browser + version**: <!-- e.g., Chrome 120.0.6099.130 -->
- **OS**: <!-- e.g., macOS 14.2, Windows 11 -->
- **svelte-fluid version**: <!-- e.g., 0.1.0 -->
- **Svelte version**: <!-- e.g., 5.2.0 -->

## WebGL Support

Paste the result of running this in your browser's DevTools console:

```js
const canvas = document.createElement('canvas');
const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
console.log('Linear filtering:', gl?.getExtension('OES_texture_float_linear'));
```

## Instance Count

How many `<Fluid />` or preset instances are on the page when the bug occurs?

## Reproduction

**Steps to reproduce:**

1. <!-- First step -->
2. <!-- Second step -->
3. <!-- ... -->

**Minimal reproduction** (if possible, link to a repo or paste the relevant Svelte component code):

```svelte
<!-- Your minimal reproduction code here -->
```

## Expected Behavior

<!-- What should happen? -->

## Actual Behavior

<!-- What actually happens? Include any error messages, console output, or screenshots. -->

## Additional Context

<!-- Any other information that might help diagnose the issue (e.g., does it only happen with specific props, on specific devices, with `lazy={true}`, etc.) -->
