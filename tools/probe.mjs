import fs from 'node:fs';
import ClipperLib from 'clipper-lib';
const S = 1000;
const parts = JSON.parse(fs.readFileSync('reference/fusion-sections.json'));
const C = (i) => [parts[i].loops[0].pts.map(([z, y]) => ({ X: Math.round(z * S), Y: Math.round(y * S) }))];
function clip(a, b, t) { const c = new ClipperLib.Clipper(); const o = new ClipperLib.Paths(); c.AddPaths(a, 0, true); c.AddPaths(b, 1, true); c.Execute(t, o, 1, 1); return o; }
const show = (label, paths) => paths.forEach(p => { const zs = p.map(q => q.X / S), ys = p.map(q => q.Y / S); console.log(label, 'z', Math.min(...zs).toFixed(1), Math.max(...zs).toFixed(1), 'y', Math.min(...ys).toFixed(1), Math.max(...ys).toFixed(1), 'area', (Math.abs(ClipperLib.Clipper.Area(p)) / S / S).toFixed(1)); });
show('mid drawer front outside E7:', clip(C(6), C(7), 2));
show('lid outside E23:', clip(C(22), C(23), 2));
show('lid ∩ floor25:', clip(C(22), C(25), 0));
show('walnut ∖ union(ends):', clip(C(1), [...C(21), ...C(7), ...C(23)], 2));
show('ends ∖ walnut:', clip([...C(21), ...C(7), ...C(23)], C(1), 2));
