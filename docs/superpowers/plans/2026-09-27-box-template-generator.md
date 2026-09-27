# Claude Box Template Generator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Single standalone HTML page that generates 1:1 tiled PDF, SVG and DXF templates plus a cut list for the Claude Box at any height / depth / width / timber thickness.

**Architecture:** Pure-JS geometry kernel (ES modules) scales master outlines taken from the Fusion model and rebuilds every part with Clipper polygon offsets/booleans at the chosen timber thickness. Exporters turn the part list into PDF (jsPDF), SVG and DXF strings. esbuild bundles kernel + UI + libraries into one inlined HTML file.

**Tech Stack:** Node 24, `clipper-lib` 6.4.2, `jspdf` 4.x, `esbuild` (build only), `node:test`.

**Spec:** `docs/superpowers/specs/2026-09-27-box-template-generator-design.md`

## Global Constraints

- All geometry in millimetres; z = depth (front of box at z = 0 after normalisation), y = height (floor y = 0), x = width.
- Design reference size: H 299.8, D 375.0, carcass width W 300.
- Default thickness: walnut 10, carcass 6, drawer/lid 5, stand-off gap 10, clearance 1.5 per side (fixed), dowel Ø20 (fixed).
- Input limits: H 150–600, D 190–750, W 120–600, thicknesses 3–25, gap 0–30.
- Output file must work offline: no runtime network requests.
- Clipper coordinates: integer micrometres (`S = 1000`).

## Review Focus

1. Extreme non-uniform size (H 150 with D 750, or reverse) → parts may thin out or split; expect warnings listing affected parts, never a crash or NaN output. Test in Task 3.
2. Thickness too large for the tier (e.g. carcass 25 on H 150) → drawer interior vanishes; expect a clear warning and the drawer parts omitted, exports still valid. Test in Task 3.
3. Empty / non-numeric / out-of-range inputs → value clamped or rejected with a message, last valid result stays on screen. Test in Task 2.
4. Printer "fit to page" scaling → PDF page 1 has the scale square and "print at 100 % / actual size" instruction; PDF page size exactly A4 / Letter. Test in Task 5.
5. Inch display → labels and cut list in inches (2 dp), geometry still exact 1:1 mm. Test in Task 5.

## File Structure

```
package.json                 scripts: test, build
tools/extract-master.mjs     reference JSON -> src/master-data.js (run once)
src/master-data.js           generated master outlines, tier bands, dowels
src/geom.js                  Clipper wrappers, transforms, measures
src/params.js                defaults, limits, validate()
src/parts.js                 buildBox(params) -> {parts, warnings, overall}
src/layout.js                row-pack parts onto a sheet
src/export-svg.js            toSVG(parts, opts)
src/export-dxf.js            toDXF(parts, opts)
src/cutlist.js               cutList(parts, units), assemblySteps()
src/export-pdf.js            toPDF(result, opts) -> jsPDF
src/ui/index.html, app.js, style.css
tools/build.mjs              esbuild bundle -> dist/claude-box-generator.html
test/*.test.mjs
```

### Data types (shared by all tasks)

```js
// Point: [z, y] in mm. Loop: Point[] (closed, no repeated end point).
// Part:
{
  id: 'bottom.base',            // unique
  name: 'Bottom tier base',
  tier: 'bottom' | 'middle' | 'top' | 'sides',
  timber: 'walnut' | 'carcass' | 'drawer',
  thickness: 6,                 // mm, along x for profile parts
  length: 288,                  // mm along x (for profile boards = thickness)
  qty: 1,
  kind: 'profile' | 'board' | 'curved',  // profile: cut the outline from a board of `thickness`
                                          // board: flat strip, rip + bevel from cut list
                                          // curved: carve from solid block, template on block end
  loops: [Loop, ...],            // first = outer, rest = holes, assembled position
  holes: [{ z, y, d }],          // dowel holes (also cut out of loops for display)
  bevels: [deg, deg],            // board end angles from square (board kind only)
  grain: 'z' | 'x',              // z: along profile depth; x: along length (into page)
  ref: 21                        // index into reference/fusion-sections.json at design size, or null
}
```

---

### Task 1: Master data + geometry helpers

**Files:**
- Create: `tools/extract-master.mjs`, `src/master-data.js`, `src/geom.js`
- Test: `test/geom.test.mjs`
- Modify: `package.json` (scripts)

**Interfaces:**
- Produces `src/master-data.js`:
  `export const MASTER = { design: { H: 299.8, D: 375, W: 300 }, zShift: 167.17, walnut: Loop, tiers: { bottom: { env: Loop, y0: 0, y1: 90 }, middle: { env, y0: 100, y1: 190 }, top: { env, y0: 200, y1: 299.8, wallTop: 283.51 } }, dowels: [{ z, y, d: 20 }] }` — all z already shifted so walnut min z = 0.
- Produces `src/geom.js`:
  `toPaths(loops) -> Paths`, `fromPaths(paths) -> Loop[]` (outer first, CCW outer),
  `union(a, b)`, `diff(a, b)`, `inter(a, b)` on Paths,
  `offset(paths, dmm)` (round joins), `rect(z0, y0, z1, y1) -> Paths`,
  `scaleLoop(loop, sz, sy) -> Loop`, `areaOf(paths) -> mm²`, `bboxOf(loops) -> {z0,z1,y0,y1}`,
  `hausdorff(loopA, loopB) -> mm` (symmetric, densified to 0.5 mm).

- [ ] Step 1: `tools/extract-master.mjs` reads `reference/fusion-sections.json` + `reference/fusion-master.json`; walnut = section 1 (`Sides:1+Side 1:1`), envelopes = sections 21 (bottom), 7 (middle), 23 (top); dowels = master circles mapped `z = cz + 20.33 + zShift`, `y = cy + 149.9`; wallTop = max y of section 26. Simplify loops with Douglas–Peucker 0.01 mm. Writes `src/master-data.js`.
- [ ] Step 2: write `test/geom.test.mjs`: rect area 100×50 = 5000 ±0.01; offset of 100×100 square by −10 has area 6400 ±1; `scaleLoop` of unit square by (2,3) → bbox 2×3; hausdorff of a square vs itself = 0 and vs square shifted 1 mm = 1 ±0.01; MASTER walnut bbox depth 375 ±0.1, height 299.8 ±0.1; every dowel lies inside walnut.
- [ ] Step 3: run `node --test` → FAIL (missing modules).
- [ ] Step 4: implement `src/geom.js` with `clipper-lib` (`ClipperOffset(2, 0.25*S/1000)` arc tolerance 0.02 mm), run extract script.
- [ ] Step 5: `node --test` → PASS. Commit `feat: master data and geometry helpers`.

### Task 2: Parameters

**Files:** Create `src/params.js`; Test `test/params.test.mjs`

**Interfaces:**
- `DEFAULTS = { H: 300, D: 375, W: 300, walnut: 10, carcass: 6, drawer: 5, gap: 10, units: 'mm', paper: 'A4' }`
- `LIMITS = { H: [150, 600], D: [190, 750], W: [120, 600], walnut: [3, 25], carcass: [3, 25], drawer: [3, 25], gap: [0, 30] }`
- `validate(raw) -> { params, errors: { field: message } }` — numbers parsed from strings; empty/NaN → error and default; out of range → error and clamped.

- [ ] Step 1: tests: defaults pass with no errors; `{ H: 'abc' }` → errors.H, params.H = 300; `{ H: 1000 }` → errors.H, params.H = 600; `{ carcass: '8' }` → 8; units other than mm/in → 'mm'; paper other than A4/Letter → 'A4'.
- [ ] Step 2: run → FAIL. Step 3: implement. Step 4: run → PASS. Commit `feat: parameter validation`.

### Task 3: Part kernel

**Files:** Create `src/parts.js`; Test `test/parts.test.mjs`

**Interfaces:**
- Consumes MASTER, geom helpers, validated params.
- `buildBox(params) -> { parts: Part[], warnings: string[], overall: { H, D, Wtotal } }`

Rules (tc = carcass, td = drawer, clr = 1.5, all bands in scaled y):
- Scale: `sz = D / 375`, `sy = H / 299.8`; env, walnut, dowels, tier y0/y1, wallTop scaled.
- For each tier `E`: ends = E (profile, carcass, qty 2, holes = dowels inside E).
  `ring(t) = diff(E, offset(E, -t))`; `zc` = z of E centroid; `front = rect(-inf, .., zc, ..)`, `back = rect(zc, .., +inf, ..)`.
- bottom/middle: `base = inter(E, rect(y0, y0+tc))`, `top = inter(E, rect(y1-tc, y1))`, `wall = inter(ring(tc), back ∩ rect(y0+tc, y1-tc))`.
  Drawer outline `Dout = inter(diff(E, union(base, top, wall)) inset:` offset(…, −clr) then union with the front strip so the drawer front stays flush with E front edge: `Dout = union(offset(interior, -clr), inter(interior, front) ∩ rect(y0+tc+clr, y1-tc-clr))`.
  `dFront = inter(diff(Dout, offset(E, -td)), front)`; `dSide = diff(Dout, dFront)` (qty 2); `dBottom = inter(dSide, rect(Dout.y0, Dout.y0+td))`; `dBack = inter(diff(dSide, offset(dSide, -td)), back) minus dBottom`.
- top: `floor = inter(E, rect(y0, y0+tc))`; `wall = inter(ring(tc), back ∩ rect(y0+tc, wallTop))`; `lid = inter(ring(td), rect(y0+tc, +inf)) minus (back ∩ rect(-inf, wallTop+clr))`.
- walnut: profile, walnut thickness, qty 2, holes = all dowels.
- Kinds: ends/walnut/drawer sides = 'profile'; flat bands (base/top/floor/dBottom) = 'board' with bevels from end edges; walls/fronts/backs/lid = 'curved'.
- Lengths: carcass boards/walls `W - 2tc`; dFront and lid `W - 2tc - 2clr`; dBack, dBottom `W - 2tc - 2clr - 2td`; profile parts length = thickness.
- Dowels: part `tier: 'sides'`, id `dowel`, length `walnut + gap + tc`, qty 3 (cut-list only, no loops).
- Warnings: any rule result empty → drop part(s), warn "<tier> drawer/lid does not fit — reduce thickness or increase size"; any part splitting into >1 outer loop → warn; drawer interior height < 20 → warn; dowel closer than 5 mm to walnut or end edge → warn.

- [ ] Step 1: tests: at design size (H 299.8, D 375, W 300, defaults) every part with `ref` has hausdorff to reference ≤ 0.5 mm, except `middle.drawerFront` and `top.lid` ≤ 2.0 mm (documented model flaws); no two carcass/drawer parts of the same tier overlap by > 1 mm²; lengths 288 / 285 / 275.
- [ ] Step 2: fit tests at (H 180, D 225), (H 450, D 560), (H 300, D 600), (H 450, D 250) with thickness sets {4, 4, 3} and {12, 12, 8}: no NaN coordinates; no overlaps; every carcass wall measured thickness = tc ±0.1 (area / mid-length); warnings array is an array of strings.
- [ ] Step 3: Review Focus tests: `buildBox({H:150, D:750, carcass:25, drawer:25 ...})` → does not throw, warnings non-empty, drawer parts absent.
- [ ] Step 4: run → FAIL; implement; iterate rules until design-size overlay passes. Commit `feat: part kernel`.

### Task 4: Layout, SVG, DXF

**Files:** Create `src/layout.js`, `src/export-svg.js`, `src/export-dxf.js`; Test `test/export.test.mjs`

**Interfaces:**
- `layout(parts, { gap = 15, maxWidth = 600 }) -> { items: [{ part, dz, dy }], width, height }` — parts with loops only, each translated so bbox min is at (dz + x, dy + y); rows by descending height; y increases downward on sheet (flip handled in exporters).
- `toSVG(parts, { title }) -> string` — `width/height` in mm, viewBox mm, `<g id="cut">` closed paths (stroke black 0.2), `<g id="holes">` circles, `<g id="labels">` text.
- `toDXF(parts) -> string` — AC1009 (R12), `$INSUNITS 4`, layers CUT, HOLES, LABELS; closed POLYLINE per loop, CIRCLE per hole, TEXT label.
- `byTimber(parts) -> { walnut: Part[], carcass: Part[], drawer: Part[] }`

- [ ] Step 1: tests: layout items don't overlap (bbox check); SVG contains one `<path` per loop and `width="…mm"`; DXF starts with `0\nSECTION`, ends with `0\nEOF`, count of `POLYLINE` equals loops, every POLYLINE has flag 1 (closed).
- [ ] Step 2: FAIL → implement → PASS. Commit `feat: svg and dxf export`.

### Task 5: Cut list, assembly, PDF

**Files:** Create `src/cutlist.js`, `src/export-pdf.js`; Test `test/pdf.test.mjs`

**Interfaces:**
- `cutList(parts, units) -> [{ name, qty, timber, finished: 'L × W × T', block: string|null, notes }]` — finished = length × profile depth × thickness; curved parts get `block` (bbox + 5 mm allowance each way) and note "carve from block"; boards get bevel note; units 'in' → values /25.4, 2 dp, suffix `"`.
- `assemblySteps(params) -> string[]`.
- `toPDF(result, { paper, units }) -> jsPDF` — page 1: title, overall size, cut list, warnings, print instructions, 100 mm (or 4 in) scale square drawn at exact size; page 2: assembly steps + side-view diagram; then tiles: sheet from `layout(parts, { maxWidth: 3 × printable width })`, printable = page − 2 × 10 mm margin, overlap 10 mm, only tiles with geometry, each tile clipped, page label "A1", crosshair marks at the four corners of the printable area, part labels (name, qty, timber, thickness, grain arrow, length / block note).

- [ ] Step 1: tests: A4 doc page size 210 × 297 (±0.01) and Letter 215.9 × 279.4; output contains the scale square rect with width 100 (inspect `doc.output()` text for `100` rect op or record via a wrapper); inch units → cut list strings contain `"`; page count ≥ 3; cut list rows include every part id with qty.
- [ ] Step 2: FAIL → implement → PASS. Commit `feat: cut list and pdf export`.

### Task 6: UI + single-file build

**Files:** Create `src/ui/index.html`, `src/ui/app.js`, `src/ui/style.css`, `tools/build.mjs`

- Inputs (left): H, D, W, walnut, carcass, drawer, gap, units, paper. Live preview (right): inline SVG side view, walnut semi-transparent over carcass/drawer parts coloured by timber, overall dimensions text. Warnings panel. Buttons: PDF, SVG (zip-free: one download per timber, three buttons in a menu), DXF (same), Reset.
- Recompute on input (debounced 150 ms); on validation errors keep the last good result and show field message.
- Downloads via Blob + `a.download`.
- `tools/build.mjs`: esbuild bundle `src/ui/app.js` (format iife, minify) and inline JS + CSS into `dist/claude-box-generator.html`.
- [ ] Step 1: build; open in Playwright; check preview renders, change H → preview updates, downloads fire (PDF/SVG/DXF). Accessibility: labels bound to inputs, contrast ≥ 4.5:1, 44 px touch targets, `prefers-reduced-motion`. Commit `feat: generator UI and single-file build`.

### Task 7: Verify in Fusion + publish

- [ ] Step 1: generate design-size DXF, import into Fusion via MCP script onto a sketch, screenshot overlay against Sketch1 / parts.
- [ ] Step 2: whole-branch review (fresh reviewer). Fix findings.
- [ ] Step 3: commit dist file; report location and hosting options.
