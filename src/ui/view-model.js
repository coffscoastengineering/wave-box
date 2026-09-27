// Pure helpers for the "show one part vs full assembly" preview selector. No DOM.

const drawable = (parts) => parts.filter((p) => p.loops.length);

export function partOptions(parts) {
  return drawable(parts).map((p) => ({ id: p.id, label: p.qty > 1 ? `${p.name} (×${p.qty})` : p.name }));
}

export function selectParts(parts, id) {
  const solid = drawable(parts);
  if (!id) return solid;
  const one = solid.filter((p) => p.id === id);
  return one.length ? one : solid;
}
