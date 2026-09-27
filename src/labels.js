export const TIMBER_NAME = { walnut: 'Walnut', carcass: 'Carcass timber', drawer: 'Drawer timber', dowel: 'Dowel' };

const trim = (v, dp) => String(Number(v.toFixed(dp)));

export function fmt(mm, units) {
  return units === 'in' ? `${(mm / 25.4).toFixed(2)}"` : `${trim(mm, 1)} mm`;
}

export function labelLines(part, units) {
  const lines = [`${part.name} — cut ${part.qty}`];
  const t = `${TIMBER_NAME[part.timber]} ${fmt(part.thickness, units)}`;
  if (part.kind === 'profile') {
    lines.push(`${t} thick`);
  } else if (part.kind === 'curved') {
    lines.push(`${t} wall, ${fmt(part.length, units)} long`);
    lines.push('Carve from solid block — glue template on block end, grain runs along length');
  } else if (part.kind === 'board') {
    lines.push(`${t} board, ${fmt(part.length, units)} long`);
    lines.push(`End bevels ${part.bevels[0]}° / ${part.bevels[1]}° from square`);
  }
  return lines;
}
