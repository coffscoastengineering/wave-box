import { bboxOf } from './geom.js';
import { fmt, TIMBER_NAME } from './labels.js';

const ALLOW = 5;

const dims = (vals, units) => {
  const f = (mm) => (units === 'in' ? (mm / 25.4).toFixed(2) : String(Number(mm.toFixed(1))));
  return `${vals.map(f).join(' × ')}${units === 'in' ? '"' : ' mm'}`;
};

export function cutList(parts, units = 'mm') {
  return parts.map((p) => {
    const row = { id: p.id, name: p.name, qty: p.qty, timber: TIMBER_NAME[p.timber], block: null, notes: '' };
    if (p.kind === 'dowel') {
      row.finished = `Ø${fmt(p.thickness, units)} × ${fmt(p.length, units)}`;
      row.notes = 'Hardwood dowel';
      return row;
    }
    const b = bboxOf(p.loops);
    const depth = b.z1 - b.z0, height = b.y1 - b.y0;
    if (p.kind === 'profile') {
      row.finished = dims([depth, height, p.thickness], units);
      row.notes = 'Cut profile from board';
    } else if (p.kind === 'board') {
      row.finished = dims([p.length, depth, p.thickness], units);
      row.notes = `Rip to width, end bevels ${p.bevels[0]}° / ${p.bevels[1]}°`;
    } else {
      row.finished = dims([p.length, depth, height], units);
      row.block = dims([p.length, depth + 2 * ALLOW, height + 2 * ALLOW], units);
      row.notes = `Carve from block; bandsaw needs ${fmt(p.length, units)} depth of cut`;
    }
    return row;
  });
}

export function assemblySteps(params) {
  const g = fmt(params.gap, params.units);
  return [
    'Print the template PDF at 100 % ("Actual size", never "Fit to page"). Measure the scale square on page 1 — it must be exactly 100 mm (4 in).',
    'Trim the template pages and tape them together, matching the letter/number labels and the crosshair marks in the 10 mm overlap strips.',
    'Cut out each template and glue it to the timber with spray adhesive or a glue stick. Line the grain arrow up with the grain.',
    'Profiles (walnut sides, carcass ends, drawer sides): bandsaw or scroll-saw just outside the line, then sand to the line. Drill the Ø20 dowel holes where marked.',
    'Curved parts (back walls, drawer fronts and backs, lid): plane a solid block to the block size in the cut list, glue the template to the block end and bandsaw the curve along the full length. Sand to the line.',
    'Flat boards (floors, tops, drawer bottoms): rip to width with the listed end bevels and cut to length.',
    'Glue up each tier: floor, top/shelf and back wall between its two carcass ends. Check it is square.',
    'Assemble each drawer: sides onto front, back and bottom. It should slide with about 1.5 mm clearance each side.',
    'Fit the lid to the top tier; it rests on the front edge of the top floor.',
    `Stack the tiers with the gaps shown on the side view. Fit the walnut sides ${g} out from the carcass ends: the dowels pass through the walnut, across the ${g} stand-off and into the carcass ends. Use ${g} spacer blocks glued between each carcass end and the walnut (the middle tier has no dowel of its own).`,
    'Sand, round over the edges and finish with oil or wax.',
  ];
}
