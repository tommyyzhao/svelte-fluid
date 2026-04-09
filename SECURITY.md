# Security Policy

## Reporting a Vulnerability

If you discover a security issue in svelte-fluid, please report it
responsibly.

**Do not open a public GitHub issue for security vulnerabilities.**

Instead, contact @tommyyzhao directly via GitHub:

1. Go to [https://github.com/tommyyzhao](https://github.com/tommyyzhao)
2. Use the "Report" or contact options, or open a private security advisory
   at [https://github.com/tommyyzhao/svelte-fluid/security/advisories/new](https://github.com/tommyyzhao/svelte-fluid/security/advisories/new)

## Scope

svelte-fluid is a client-side WebGL fluid simulation library. It:

- Runs entirely in the browser (no server-side component)
- Uses the WebGL API to render to a `<canvas>` element
- Does not make network requests, handle user data, or manage authentication
- Does not ship any runtime dependencies beyond Svelte 5

The attack surface is limited to:

- Shader compilation (controlled by the library, not user input)
- DOM manipulation (standard canvas/WebGL operations)
- Event listeners for pointer input (mouse/touch)

## Supported Versions

Security updates are applied to the latest release only.

| Version | Supported |
| ------- | --------- |
| 0.1.x   | ✅        |

## Non-Sensitive Issues

For non-security bugs (rendering glitches, performance issues, incorrect
behavior), please open a regular [GitHub issue](https://github.com/tommyyzhao/svelte-fluid/issues/new?template=bug_report.md).
