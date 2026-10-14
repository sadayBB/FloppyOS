import { useMemo } from 'react';
import { PAL, SPRITES, type SpriteName } from './sprites';

interface Props {
  sprite: SpriteName | string[];
  scale?: number;
  className?: string;
  /** Extra or overriding colours, e.g. the cat's fur slots. */
  palette?: Record<string, string>;
}

/** Renders a character-grid sprite as a crisp SVG, merging horizontal runs into single rects. */
export function Pixel({ sprite, scale = 2, className, palette }: Props) {
  const rows = typeof sprite === 'string' ? SPRITES[sprite] : sprite;
  const { w, h, rects } = useMemo(() => {
    const w = Math.max(...rows.map((r) => r.length));
    const rects: { x: number; y: number; len: number; c: string }[] = [];
    rows.forEach((row, y) => {
      let x = 0;
      while (x < row.length) {
        const ch = row[x];
        let len = 1;
        while (row[x + len] === ch) len++;
        const c = palette?.[ch] ?? PAL[ch];
        if (ch !== '.' && c) rects.push({ x, y, len, c });
        x += len;
      }
    });
    return { w, h: rows.length, rects };
  }, [rows, palette]);

  return (
    <svg
      className={className}
      width={w * scale}
      height={h * scale}
      viewBox={`0 0 ${w} ${h}`}
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      {rects.map((r, i) => (
        <rect key={i} x={r.x} y={r.y} width={r.len} height={1} fill={r.c} />
      ))}
    </svg>
  );
}
