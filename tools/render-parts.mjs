// Debug: node tools/render-parts.mjs H D out.json  -> writes parts JSON for render.py-style preview
import fs from 'node:fs';
import { buildBox } from '../src/parts.js';
import { validate } from '../src/params.js';
const [H = 300, D = 375, out = 'parts.json', carcass = 6, drawer = 5] = process.argv.slice(2);
const r = buildBox(validate({ H, D, carcass, drawer }).params);
console.log('warnings:', r.warnings);
console.log('overall:', r.overall);
for (const p of r.parts.filter((q) => q.kind === 'board')) console.log('bevels', p.id, p.bevels);
fs.writeFileSync(out, JSON.stringify(r.parts.filter((p) => p.loops.length).map((p) => ({ id: p.id, timber: p.timber, loops: p.loops }))));
