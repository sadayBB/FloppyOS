/** Pixel-art mouse cursors (desktop only; touch screens have no cursor). */
const ARROW = [
  'k...........',
  'kk..........',
  'kwk.........',
  'kwwk........',
  'kwwwk.......',
  'kwwwwk......',
  'kwwwwwk.....',
  'kwwwwwwk....',
  'kwwwwwwwk...',
  'kwwwwwwwwk..',
  'kwwwwwwwwwk.',
  'kwwwwwwkkkkk',
  'kwwwkwwk....',
  'kwwk.kwwk...',
  'kwk..kwwk...',
  'kk....kwwk..',
  'k.....kwwk..',
  '.......kk...',
];
const HAND = [
  '.....kk.........',
  '....kwwk........',
  '....kwwk........',
  '....kwwk........',
  '....kwwkkk......',
  '....kwwkwwkkk...',
  '.kk.kwwkwwkwwk..',
  'kwwkkwwkwwkwwkk.',
  'kwwwkwwwwwwwwwwk',
  '.kwwwwwwwwwwwwwk',
  '..kwwwwwwwwwwwwk',
  '..kwwwwwwwwwwwk.',
  '...kwwwwwwwwwwk.',
  '....kwwwwwwwwk..',
  '.....kwwwwwwwk..',
  '.....kkkkkkkkk..',
];
const WAIT = [
  'kkkkkkkkkkk',
  'kyyyyyyyyyk',
  'kkkkkkkkkkk',
  '.kwyyyyywk.',
  '..kwyyywk..',
  '...kwywk...',
  '....kyk....',
  '...kwwwk...',
  '..kwwywwk..',
  '.kwwyyywwk.',
  'kkkkkkkkkkk',
  'kyyyyyyyyyk',
  'kkkkkkkkkkk',
];
const COLORS: Record<string, string> = { k: '#000000', w: '#ffffff', y: '#f2c94c' };

function cursor(rows: string[], hx: number, hy: number, scale = 2, fallback = 'auto') {
  let rects = '';
  rows.forEach((r, y) => [...r].forEach((ch, x) => {
    if (COLORS[ch]) rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="${COLORS[ch]}"/>`;
  }));
  const w = Math.max(...rows.map((r) => r.length));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w * scale}" height="${rows.length * scale}" viewBox="0 0 ${w} ${rows.length}" shape-rendering="crispEdges">${rects}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${hx * scale} ${hy * scale}, ${fallback}`;
}

export function applyPixelCursors(on: boolean) {
  const root = document.documentElement;
  root.classList.toggle('pixel-cursor', on);
  if (!on) return;
  root.style.setProperty('--cur-default', cursor(ARROW, 0, 0));
  root.style.setProperty('--cur-pointer', cursor(HAND, 5, 0, 2, 'pointer'));
  root.style.setProperty('--cur-wait', cursor(WAIT, 5, 6, 2, 'wait'));
}
