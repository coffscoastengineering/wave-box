// Pure helpers for the tier-tabs + part-chips preview selector. No DOM.

const drawable = (parts) => parts.filter((p) => p.loops.length);

const optionFor = (p) => ({ id: p.id, label: p.qty > 1 ? `${p.name} (×${p.qty})` : p.name });

export function partOptions(parts) {
  return drawable(parts).map(optionFor);
}

const TIER_GROUP = { bottom: 'Bottom tier', middle: 'Middle tier', top: 'Top tier', sides: 'Walnut sides' };

export function groupedPartOptions(parts) {
  return Object.entries(TIER_GROUP)
    .map(([tier, group]) => ({ tier, group, options: drawable(parts).filter((p) => p.tier === tier).map(optionFor) }))
    .filter((g) => g.options.length);
}

export const TIERS = Object.entries(TIER_GROUP).map(([tier, label]) => ({ tier, label }));

// key: '' (full assembly) | 'tier:<tier>' (one tier) | '<part id>' (one part).
export function selectParts(parts, key) {
  const solid = drawable(parts);
  if (!key) return solid;
  if (key.startsWith('tier:')) {
    const sel = solid.filter((p) => p.tier === key.slice(5));
    return sel.length ? sel : solid;
  }
  const one = solid.filter((p) => p.id === key);
  return one.length ? one : solid;
}
