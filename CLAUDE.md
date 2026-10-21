# Fusion — Claude Box Template Generator

Offline generator for the carved box templates (cut list, SVG/DXF/PDF export). Plain JS in `src/`, UI in `src/ui/`, tests in `test/`. Uses `clipper-lib`, `jspdf`, `pdfjs-dist`; bundled with `esbuild`.

## Commands
- `npm test` — `node --test "test/*.test.mjs"`
- `npm run build` — `tools/build.mjs`; writes `dist/claude-box-generator.html` and `docs/index.html`
- `npm run serve` — local server

## Rules
- Metric only: mm everywhere, no inch options, A4 default page size.
- `docs/index.html` is served on GitHub Pages (repo `wave-box`); pushing a rebuilt `docs/index.html` publishes it. Do not commit or push unless asked.
- Run `npm test` before finishing any change to `src/`.
- Dowel lengths match the real hardware, not computed spans.
