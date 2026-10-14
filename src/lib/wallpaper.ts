import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, useLocal } from '../db';

export type Fit = 'cover' | 'contain' | 'tile' | 'center';
export type Wallpaper = { kind: 'theme' } | { kind: 'preset'; id: string } | { kind: 'image'; fit: Fit; pixelated: boolean };

/** Builds a tiling SVG background from tiny pixel sprites placed at given offsets. */
function tile(w: number, h: number, scale: number, items: { rows: string[]; x: number; y: number; color: string }[]) {
  let rects = '';
  for (const it of items)
    it.rows.forEach((row, y) =>
      [...row].forEach((ch, x) => {
        if (ch !== '.') rects += `<rect x="${(it.x + x) * scale}" y="${(it.y + y) * scale}" width="${scale}" height="${scale}" fill="${it.color}"/>`;
      }),
    );
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w * scale}" height="${h * scale}" shape-rendering="crispEdges">${rects}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

const HEART = ['.x.x.', 'xxxxx', 'xxxxx', '.xxx.', '..x..'];
const STAR = ['..x..', '.xxx.', 'xxxxx', '.x.x.'];
const SPARK = ['.x.', 'xxx', '.x.'];
const CLOUD = ['....xxxx......', '..xxxxxxxx.xx.', '.xxxxxxxxxxxxx', 'xxxxxxxxxxxxxx', '.xxxxxxxxxxxx.'];

export const PRESETS: { id: string; name: string; css: string }[] = [
  {
    id: 'nubes',
    name: 'Nubes',
    css: `${tile(60, 40, 4, [{ rows: CLOUD, x: 4, y: 6, color: 'rgba(255,255,255,0.75)' }, { rows: CLOUD, x: 36, y: 26, color: 'rgba(255,255,255,0.55)' }])}, linear-gradient(180deg, #7f9cf5 0%, #b9a7f0 60%, #f6b6d8 100%)`,
  },
  {
    id: 'atardecer',
    name: 'Atardecer',
    css: `${tile(40, 40, 3, [{ rows: SPARK, x: 6, y: 5, color: 'rgba(255,240,200,0.8)' }, { rows: SPARK, x: 27, y: 19, color: 'rgba(255,240,200,0.5)' }])} 0 0 / 120px 120px, linear-gradient(180deg, #2b2d6e 0%, #6d4bb0 38%, #e77fb0 70%, #ffc48a 100%)`,
  },
  {
    id: 'corazones',
    name: 'Corazones',
    css: `${tile(28, 28, 3, [{ rows: HEART, x: 4, y: 4, color: '#ff8fc0' }, { rows: HEART, x: 18, y: 18, color: '#ffffff' }])}, #ffd3e8`,
  },
  {
    id: 'estrellas',
    name: 'Noche',
    css: `${tile(36, 36, 3, [{ rows: STAR, x: 5, y: 6, color: '#fff3a8' }, { rows: SPARK, x: 24, y: 22, color: '#ffb3e6' }, { rows: SPARK, x: 28, y: 4, color: 'rgba(255,255,255,0.6)' }])}, linear-gradient(180deg, #120f2e 0%, #3a2068 60%, #6f2f7f 100%)`,
  },
  { id: 'cuadros', name: 'Cuadritos', css: 'repeating-conic-gradient(#e7dcff 0 25%, #ffe1f1 0 50%) 0 0 / 48px 48px' },
  { id: 'menta', name: 'Menta', css: `${tile(30, 30, 3, [{ rows: SPARK, x: 6, y: 6, color: '#ffffff' }, { rows: SPARK, x: 21, y: 20, color: 'rgba(255,255,255,0.6)' }])}, linear-gradient(160deg, #8fe3cf 0%, #a9c4ff 100%)` },
  { id: 'teal', name: 'Clásico 98', css: '#008080' },
];

/** Resolves the current wallpaper to a CSS background (object URL for uploaded images). */
export function useWallpaperCss(): { background?: string; imageRendering?: 'pixelated' } {
  const [wp] = useLocal<Wallpaper>('wallpaper', { kind: 'theme' });
  const blob = useLiveQuery(async () => (wp.kind === 'image' ? ((await db.local.get('wallpaperImage'))?.value as Blob | undefined) : undefined), [wp.kind]);
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!blob) return setUrl(undefined);
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);

  if (wp.kind === 'preset') return { background: PRESETS.find((p) => p.id === wp.id)?.css };
  if (wp.kind === 'image' && url) {
    const pos =
      wp.fit === 'tile' ? `url("${url}") repeat top left / auto`
      : wp.fit === 'center' ? `url("${url}") no-repeat center / auto`
      : `url("${url}") no-repeat center / ${wp.fit}`;
    return { background: `${pos}, var(--dk)`, imageRendering: wp.pixelated ? 'pixelated' : undefined };
  }
  return {};
}

export const MAX_UPLOAD = 15 * 1024 * 1024;
