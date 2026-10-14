import { useMemo } from 'react';
import { PAL, SPRITES, type SpriteName } from './sprites';

interface Props {
  sprite: SpriteName | string[];
  scale?: number;
  className?: string;
}

/** Renders a character-grid sprite as a crisp SVG, merging horizontal runs into single rects. */
export function Pixel({ sprite, scale = 2, className }: Props) {
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
        if (ch !== '.' && PAL[ch]) rects.push({ x, y, len, c: PAL[ch] });
        x += len;
      }
    });
    return { w, h: rows.length, rects };
  }, [rows]);

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
