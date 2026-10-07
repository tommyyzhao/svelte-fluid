# 1.0 release-candidate package size

Date: 2026-10-07. Source SHA: `ed15b7df2dab6c0618f96873e5885d953580d8b6`.
Environment: macOS arm64, Bun 1.3.11, package version still 0.8.0 (versioning deferred to CI).

## Method

```sh
bun run prepack
bun scripts/bundle-size.mjs
```

The script packs to an owned temporary directory using `bun pm pack --ignore-scripts
--filename /tmp/…/package.tgz`, stats the actual compressed tarball, then deletes
it. This measures the publish file selection without running prepack twice.
Unpacked dist is the sum of emitted file bytes, not filesystem allocation.
`node:zlib` `gzipSync` uses its default settings; the all-JS number sums each
`dist/**/*.js` file compressed separately, including engine modules. `index.js`
is the export barrel, not a self-contained or tree-shaken consumer bundle.
Svelte source, declarations and other shipped files contribute to tarball/dist
size but not the JS-only gzip totals. No new dependency or CI gate.

| Measurement | Bytes |
| --- | ---: |
| Packed tarball | 289,913 |
| Unpacked `dist/` | 1,950,353 |
| All 144 `dist/**/*.js` files, gzip sum | 409,614 |
| `dist/index.js`, gzip | 737 |

Prepack regenerated the current WebGL/GLSL engine from `src/lib`; this is not
WebGPU output. These are package inventory measurements, not a runtime memory
budget or an application's download size. Re-run after versioning or source
changes; package metadata and README changes can alter the tarball.

## Release-gate refresh

| Date | Source SHA | Packed tarball bytes | Unpacked `dist/` bytes | JS files | All-JS gzip bytes | `index.js` gzip bytes |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| 2026-10-07 | `0f89f75713701ab1c028fba4fd11d90bb0a5f6fb` | 290,839 | 2,053,130 | 145 | 413,735 | 737 |

Measured after `bun run build` completed prepack, publint and strict public-declaration checks.
The subsequent hardware-test harness fix does not change shipped package files.
