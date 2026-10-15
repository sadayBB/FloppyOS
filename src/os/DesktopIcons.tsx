import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import type { AppId, AppMeta } from '../apps/meta';
import { useLocal } from '../db';
import { Pixel } from '../pixel/Pixel';
import type { SpriteName } from '../pixel/sprites';

type Cell = { c: number; r: number };
const CELL_W = 96;
const CELL_H = 92;
const ORIGIN = { x: 8, y: 10 };
const NO_CELLS: Record<string, Cell> = {};

/** Rows that fit above the taskbar. */
const rowsFit = () => Math.max(3, Math.floor((window.innerHeight - 50 - ORIGIN.y) / CELL_H));

/**
 * Desktop icons on an invisible grid ("Align to grid"): drag to move, drop snaps to the nearest
 * free cell. Positions are per device. Tap/double-click still opens the app.
 */
export function DesktopIcons({ apps, iconFor, selected, onSelect, onOpen }: { apps: AppMeta[]; iconFor: (a: AppMeta) => SpriteName; selected: AppId | null; onSelect: (id: AppId | null) => void; onOpen: (id: AppId) => void }) {
  const [saved, setSaved] = useLocal<Record<string, Cell>>('iconCells', NO_CELLS);
  const [drag, setDrag] = useState<{ id: AppId; x: number; y: number } | null>(null);
  const start = useRef<{ id: AppId; px: number; py: number; ox: number; oy: number; moved: boolean; touch: boolean } | null>(null);
  const [, force] = useState(0);
  useEffect(() => {
    const r = () => force((n) => n + 1);
    window.addEventListener('resize', r);
    return () => window.removeEventListener('resize', r);
  }, []);

  // Saved cells first; the rest fill the first free cells column by column.
  const rows = rowsFit();
  const maxCols = Math.max(1, Math.floor((window.innerWidth - ORIGIN.x) / CELL_W));
  const cells: Record<string, Cell> = {};
  const used = new Set<string>();
  const key = (c: Cell) => `${c.c}:${c.r}`;
  for (const a of apps) {
    const s = saved[a.id];
    if (s && s.r < rows && s.c < maxCols && !used.has(key(s))) {
      cells[a.id] = s;
      used.add(key(s));
    }
  }
  let i = 0;
  for (const a of apps) {
    if (cells[a.id]) continue;
    let c: Cell;
    do {
      c = { c: Math.floor(i / rows), r: i % rows };
      i++;
    } while (used.has(key(c)));
    cells[a.id] = c;
    used.add(key(c));
  }
  const pos = (c: Cell) => ({ x: ORIGIN.x + c.c * CELL_W, y: ORIGIN.y + c.r * CELL_H });

  const nearestFree = (x: number, y: number, self: AppId): Cell => {
    const want = { c: Math.max(0, Math.min(maxCols - 1, Math.round((x - ORIGIN.x) / CELL_W))), r: Math.max(0, Math.min(rows - 1, Math.round((y - ORIGIN.y) / CELL_H))) };
    const taken = new Set(Object.entries(cells).filter(([id]) => id !== self).map(([, c]) => key(c)));
    if (!taken.has(key(want))) return want;
    for (let d = 1; d < Math.max(rows, maxCols); d++)
      for (let dc = -d; dc <= d; dc++)
        for (let dr = -d; dr <= d; dr++) {
          const c = { c: want.c + dc, r: want.r + dr };
          if (c.c >= 0 && c.r >= 0 && c.c < maxCols && c.r < rows && !taken.has(key(c))) return c;
        }
    return cells[self];
  };

  const down = (a: AppMeta) => (e: RPointerEvent) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const p = pos(cells[a.id]);
    start.current = { id: a.id, px: e.clientX, py: e.clientY, ox: e.clientX - p.x, oy: e.clientY - p.y, moved: false, touch: e.pointerType !== 'mouse' };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    onSelect(a.id);
  };
  const move = (e: RPointerEvent) => {
    const s = start.current;
    if (!s) return;
    if (!s.moved && Math.hypot(e.clientX - s.px, e.clientY - s.py) < (s.touch ? 10 : 4)) return;
    s.moved = true;
    setDrag({ id: s.id, x: e.clientX - s.ox, y: e.clientY - s.oy });
  };
  const up = (e: RPointerEvent) => {
    const s = start.current;
    start.current = null;
    if (!s) return;
    if (s.moved) {
      const c = nearestFree(e.clientX - s.ox, e.clientY - s.oy, s.id);
      void setSaved({ ...cells, [s.id]: c });
      setDrag(null);
    } else if (s.touch) onOpen(s.id); // a tap opens on tablets
  };

  return (
    <div className="icons">
      {apps.map((a) => {
        const p = drag?.id === a.id ? { x: drag.x, y: drag.y } : pos(cells[a.id]);
        return (
          <button
            key={a.id}
            className={`desk-icon ${selected === a.id ? 'sel' : ''} ${drag?.id === a.id ? 'dragging' : ''}`}
            style={{ left: p.x, top: p.y }}
            aria-label={a.title}
            onPointerDown={down(a)}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={() => { start.current = null; setDrag(null); }}
            onDoubleClick={() => onOpen(a.id)}
            onKeyDown={(e) => e.key === 'Enter' && onOpen(a.id)}
          >
            <Pixel sprite={iconFor(a)} scale={3} />
            <span>{a.title}</span>
          </button>
        );
      })}
    </div>
  );
}
