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
      row.notes = [`Carve from block; bandsaw needs ${fmt(p.length)} depth of cut`, p.note].filter(Boolean).join('. ');
    }
    if (p.holes.length) row.notes += `. Drill ${p.holes.length}× Ø${p.holes[0].d} × ${p.holes[0].depth} mm deep`;
    return row;
  });
}

export function assemblySteps(params) {
  const g = fmt(params.gap);
  return [
    'Print the template PDF at 100 % ("Actual size", never "Fit to page"). Check scale with a ruler: the outer crosshair marks sit 5 mm in from each page edge, so they should be the page width minus 10 mm apart (200 mm on A4 portrait).',
    'Trim the template pages and tape them together, matching the letter/number labels and the crosshair marks in the 5 mm overlap strips.',
    'Cut out each template and glue it to the timber with spray adhesive or a glue stick.',
    'Profiles (sides, carcass ends, drawer sides): bandsaw or scroll-saw just outside the line, then sand to the line. Drill the Ø20 dowel holes where marked: 4 mm deep in the side timber, 2 mm deep in each carcass end (from its outer face).',
    'Curved parts (back walls, drawer fronts and backs, lid): plane a solid block to the block size in the cut list, glue the template to the block end and bandsaw the curve along the full length. Sand to the line.',
    'Flat boards (floors, tops, drawer bottoms): rip to width with the listed end bevels and cut to length.',
    'Glue up each tier: floor, top/shelf and back wall between its two carcass ends. Check it is square.',
    'Before gluing the tiers together, drill the Ø20 inter-tier dowel holes, 2 mm deep, marked on the bottom tier shelf, middle tier floor, middle tier top and top tier floor templates. These marks are labelled INTER-TIER on the board templates.',
    'Assemble each drawer: sides onto front, back and bottom. It should slide with about 1.5 mm clearance each side.',
    'Fit the lid to the top tier; it rests on the front edge of the top floor.',
    `Stack the tiers with the gaps shown on the side view. Fit the side pieces ${g} out from the carcass ends on all three tiers: the dowels pass through the sides, across the ${g} stand-off and into the carcass ends. Glue short dowels into the inter-tier holes to pin each tier to the next.`,
    'Sand, round over the edges and finish with oil or wax.',
  ];
}
