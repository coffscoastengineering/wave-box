# Box Template Generator — Design

Date: 2026-09-27
Status: approved (design sections 1–5 approved in chat)

## Goal

Let anyone build Kobi's "Claude Box" (three-tier carved timber box: lid + two
drawers, walnut wave-shaped sides) at any size, without Fusion 360. A single
standalone HTML page takes size + timber thickness inputs and produces:

- 1:1 tiled printable PDF templates (A4 / Letter) for bandsaw / scroll saw
- SVG + DXF vector files for CNC / laser
- a cut list and a short assembly sheet

Success: a maker picks a size, prints, checks the scale square with a ruler,
glues templates to timber, cuts, and the parts fit.

## Facts from the Fusion model (design size)

- Every one of the 27 bodies is prismatic along the width axis (x). The whole
  box is therefore a set of 2D side profiles (z = depth, y = height) each with
  a length along x.
- Design size: height 300, depth 375, carcass width 300 (±150), walnut sides
  at ±160..170 (10 mm stand-off gap each side).
- Tiers (y): bottom 0–90, middle 100–190, top 200–300. 10 mm gaps between.
- Front of box = −z (drawers open toward −z).
- Timber: walnut sides 10 mm; carcass 6 mm; drawers and lid 5 mm.
  Drawer/lid width 285 (1.5 mm clearance each side inside carcass ±144).
- Master sketch has 3 × Ø20 circles (dowels) not yet cut into any part.
- Reference data: `reference/fusion-sections.json` (all 27 part sections as
  polylines, 0.02 mm chord tolerance, assembly coordinates),
  `reference/fusion-master.json` (dowel circles, tier lines, in sketch space;
  part space = sketch space with y + 149.9, z mapping resolved in code).

## Parts

Per tier, envelope `E` = the carcass end-panel profile.

| Tier | Parts |
|---|---|
| Bottom | 2 carcass ends, base, shelf, curved back wall; drawer: curved front, curved back, 2 sides, bottom |
| Middle | 2 carcass ends, floor, top, curved back wall; drawer: as bottom |
| Top | 2 carcass ends, floor, curved back wall (curl), curved lid |
| Sides | 2 walnut wave sides; 3 dowels |

Curved parts are carved from a solid block (bandsaw along the block length).

## 1. Geometry and scaling

- Master shapes stored as polylines: walnut wave outline and the three tier
  envelopes, taken from the reference sections.
- User inputs H, D scale master shapes non-uniformly: `sH = H/300`,
  `sD = D/375`. Tier heights and inter-tier gaps scale with them.
- Never scaled: timber thicknesses, drawer/lid clearance (1.5 mm per side),
  dowel diameter (20 mm), stand-off gap (parameter, default 10 mm).
- Width W changes only part lengths along x and drawer/lid widths.
  Overall width = carcass width + 2 × (gap + walnut thickness). Input W is
  the carcass width (default 300).

## 2. Part rules

Implemented as polygon operations (Clipper, integer micrometre coordinates,
round-join offsets) on the scaled envelope `E`:

- Carcass ends = `E`.
- Floor / base board = `E` ∩ bottom band of carcass thickness.
- Top / shelf board = `E` ∩ top band of carcass thickness (bottom and middle
  tiers).
- Curved back wall = back-side part of ring(`E`, carcass thickness) between
  floor and top boards. ring(P, t) = P − offset(P, −t).
- Drawer (bottom, middle): the carcass interior; front = front-side ring band
  of drawer thickness; back = band parallel to the back wall inner face with
  clearance; sides = drawer outline; bottom = bottom band of drawer thickness.
- Lid (top): front/top ring band of lid thickness.
- Walnut sides = scaled wave outline, with dowel holes.
- Dowels: 3 × Ø20 at master-sketch centres (scaled). Holes through walnut and
  carcass ends. Dowel length = walnut + gap + carcass thickness.

Exact band boundaries (insets, which part overlaps which at corners) are tuned
until the design-size output matches the Fusion reference sections.

Warnings (shown in UI, printed on PDF page 1):
- any wall thinner than 3 mm or any part narrower than 2 × its thickness
- drawer interior height < 20 mm
- dowel hole closer than 5 mm to a part edge
- inputs outside limits: H 150–600, D 190–750, W 120–600, thicknesses 3–25

## 3. Outputs

- Tiled PDF, true 1:1, A4 or Letter. Parts laid out on a virtual sheet,
  split into pages with 10 mm overlap, crosshair alignment marks, page grid
  labels (A1, A2…), a 100 mm (or 4 in) scale-check square on page 1.
  Every part labelled: name, qty, timber, thickness, grain arrow, length
  along x ("carve from block T × W × L" for curved parts), bevel angles at
  trimmed ends.
- Page 1: cut list + warnings + print instructions (print at 100 % /
  "actual size").
- Assembly sheet: numbered steps + small side-view diagram.
- SVG and DXF: one file per timber thickness, parts row-packed, mm units,
  dowel holes as circles, labels on a separate layer (DXF) / group (SVG).

## 4. UI

Single standalone HTML file (all JS/CSS/libraries inlined, works offline).
Inputs left: H, D, W, walnut / carcass / drawer thickness, gap, units
(mm / in), paper (A4 / Letter). Right: live side-view preview coloured by
timber, overall dimensions. Buttons: Download PDF, SVG, DXF. Warnings panel.

## 5. Testing

- Node test (no browser): kernel at design size vs each of the 27 reference
  sections, symmetric Hausdorff distance ≤ 0.5 mm.
- Fit tests at several sizes / thicknesses (0.6×, 1.5×, non-uniform, 4 mm and
  12 mm timber): no overlaps between parts of a tier; walls equal the chosen
  thickness; drawer clearance holds.
- PDF test: scale square is exactly 100 mm in PDF units; page count sane.
- DXF test: parses, closed polylines, units mm. Manual: import in Fusion.
- Manual: user print test with a ruler.

## Out of scope

Drawer count changes, other box shapes, optimal nesting, joinery beyond glue
and dowels, inch-fraction timber presets.
