import { bboxOf } from './geom.js';
import { fmt, dims, blockDims, TIMBER_NAME } from './labels.js';

export function cutList(parts) {
  return parts.map((p) => {
    const row = { id: p.id, name: p.name, qty: p.qty, timber: TIMBER_NAME[p.timber], block: null, notes: '' };
    if (p.kind === 'dowel') {
      row.finished = `Ø${fmt(p.thickness)} × ${fmt(p.length)}`;
      row.notes = 'Hardwood dowel';
      return row;
    }
    if (p.kind === 'plan') {
      row.finished = '—';
      row.notes = `Drilling guide, not a cut piece — print, align on the board and drill ${p.holes.length}× Ø${p.holes[0]?.d ?? ''}`;
      return row;
    }
    const b = bboxOf(p.loops);
    const depth = b.z1 - b.z0, height = b.y1 - b.y0;
    if (p.kind === 'profile') {
      row.finished = dims([depth, height, p.thickness]);
      row.notes = 'Cut profile from board';
    } else if (p.kind === 'board') {
      row.finished = dims([p.length, depth, p.thickness]);
      row.notes = `Rip to width, end bevels ${p.bevels[0]}° / ${p.bevels[1]}°`;
    } else {
      row.finished = dims([p.length, depth, height]);
      row.block = dims(blockDims(p));
      row.notes = `Carve from block; bandsaw needs ${fmt(p.length)} depth of cut`;
    }
    return row;
  });
}

export function assemblySteps(params) {
  const g = fmt(params.gap);
  return [
    'Print the template PDF at 100 % ("Actual size", never "Fit to page"). Measure the scale square on page 1 — it must be exactly 100 mm.',
    'Trim the template pages and tape them together, matching the letter/number labels and the crosshair marks in the 10 mm overlap strips.',
    'Cut out each template and glue it to the timber with spray adhesive or a glue stick. Line the grain arrow up with the grain.',
    'Profiles (sides, carcass ends, drawer sides): bandsaw or scroll-saw just outside the line, then sand to the line. Drill the Ø20 dowel holes where marked.',
    'Curved parts (back walls, drawer fronts and backs, lid): plane a solid block to the block size in the cut list, glue the template to the block end and bandsaw the curve along the full length. Sand to the line.',
    'Flat boards (floors, tops, drawer bottoms): rip to width with the listed end bevels and cut to length.',
    'Glue up each tier: floor, top/shelf and back wall between its two carcass ends. Check it is square.',
    'Before gluing the bottom and middle tiers together, use the drilling guides (not cut from timber) to drill the inter-tier dowel holes in the bottom tier\'s top and the middle tier\'s floor. Do the same with the middle tier\'s top and top tier\'s floor. Align each guide against the board\'s own edges — the two boards at a seam use the same guide shape, so the holes line up.',
    'Assemble each drawer: sides onto front, back and bottom. It should slide with about 1.5 mm clearance each side.',
    'Fit the lid to the top tier; it rests on the front edge of the top floor.',
    `Stack the tiers with the gaps shown on the side view. Fit the side pieces ${g} out from the carcass ends on all three tiers: the dowels pass through the sides, across the ${g} stand-off and into the carcass ends. Glue short dowels into the inter-tier holes to pin each tier to the next.`,
    'Sand, round over the edges and finish with oil or wax.',
  ];
}
