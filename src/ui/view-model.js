// Pure helpers for the "show one part vs full assembly" preview selector. No DOM.

const drawable = (parts) => parts.filter((p) => p.loops.length);

const optionFor = (p) => ({ id: p.id, label: p.qty > 1 ? `${p.name} (×${p.qty})` : p.name });

export function partOptions(parts) {
  return drawable(parts).map(optionFor);
}

const TIER_GROUP = { bottom: 'Bottom tier', middle: 'Middle tier', top: 'Top tier', sides: 'Walnut sides' };

export function groupedPartOptions(parts) {
  return Object.entries(TIER_GROUP)
    .map(([tier, group]) => ({ group, options: drawable(parts).filter((p) => p.tier === tier).map(optionFor) }))
    .filter((g) => g.options.length);
}

export function selectParts(parts, id) {
  const solid = drawable(parts);
  if (!id) return solid;
  const one = solid.filter((p) => p.id === id);
  return one.length ? one : solid;
}
