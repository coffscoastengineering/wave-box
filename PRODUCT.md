# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Two audiences, confirmed by the owner (Kobi, Coffs Coast Engineering, Australia):
- The owner, in the workshop: printing cutting templates and cutting timber at the bench.
- Public users of the hosted page (GitHub Pages, repo `wave-box`): people who make their own copy of the carved box.

## Product Purpose
Generates printable full-size templates, a cut list and assembly instructions for the "Claude Box", a three-tier carved box with drawers and a lid. The user enters box size and timber thicknesses; the tool outputs template PDFs (tiled across A4/A3/A2 sheets), an instructions PDF, and SVG/DXF cut files. Success is a template that prints true to scale and cuts a box that fits together.

## Capabilities and Constraints
- Runs offline as a single bundled HTML file (`dist/claude-box-generator.html`); the same build is published as `docs/index.html`.
- Metric only: mm everywhere, no inch options, A4 default page size.
- Dowel lengths match the real hardware, not computed spans (confirmed constraint).
- Templates are printed at 100 % ("Actual size"); the page must never invite "Fit to page".
- Open, undecided: how the middle tier is fixed; a physical print test of the templates has not yet been done.

## Brand Commitments
The owner wants the interface to read as a polished product, not only a workshop tool. No other visual direction is binding.

## Evidence on Hand
Reference geometry exported from the Fusion model lives in `reference/` and is baked into `src/master-data.js`. There are no testimonials, customer lists or usage data; do not invent any.

## Product Principles
- Accuracy over decoration: a wrong dimension or a scaled print is the worst failure.
- The printed sheet must be self-explanatory at the bench: each part carries its code, timber, quantity and grain.
- Warn before cutting: unsafe sizes are surfaced, not silently clamped.
- Works for a first-time maker and for the owner's repeat use alike.
