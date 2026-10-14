import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { StickerView, useCustom, usePlaced, type PlacedSticker } from '../lib/stickers';

/** Stickers stuck on the desktop: drag to move, tap to select, then resize, rotate or remove. */
export function DesktopStickers() {
  const [placed, setPlaced] = usePlaced();
  const [custom] = useCustom();
  const [local, setLocal] = useState<PlacedSticker[]>(placed);
  const [sel, setSel] = useState<string | null>(null);
  const drag = useRef<{ uid: string; dx: number; dy: number; moved: boolean } | null>(null);

  useEffect(() => {
    if (!drag.current) setLocal(placed);
  }, [placed]);
  useEffect(() => {
    if (!sel) return;
    const off = (e: PointerEvent) => !(e.target as HTMLElement).closest('.dsticker') && setSel(null);
    window.addEventListener('pointerdown', off);
    return () => window.removeEventListener('pointerdown', off);
  }, [sel]);

  const save = (next: PlacedSticker[]) => {
    setLocal(next);
    void setPlaced(next);
  };
  const update = (uid: string, c: Partial<PlacedSticker>) => save(local.map((s) => (s.uid === uid ? { ...s, ...c } : s)));

  const down = (s: PlacedSticker) => (e: RPointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const W = window.innerWidth;
    const H = window.innerHeight;
    drag.current = { uid: s.uid, dx: e.clientX - (s.x / 100) * W, dy: e.clientY - (s.y / 100) * H, moved: false };
  };
  const move = (e: RPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    d.moved = true;
    const x = Math.min(96, Math.max(0, ((e.clientX - d.dx) / window.innerWidth) * 100));
    const y = Math.min(92, Math.max(0, ((e.clientY - d.dy) / window.innerHeight) * 100));
    setLocal((l) => l.map((s) => (s.uid === d.uid ? { ...s, x, y } : s)));
  };
  const up = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.moved) void setPlaced(local);
    else setSel((cur) => (cur === d.uid ? null : d.uid));
  };

  return (
    <>
      {local.map((s) => (
        <div
          key={s.uid}
          className={`dsticker ${sel === s.uid ? 'sel' : ''}`}
          style={{ left: `${s.x}%`, top: `${s.y}%`, transform: `rotate(${s.rot}deg)` }}
          onPointerDown={down(s)}
          onPointerMove={move}
          onPointerUp={up}
        >
          <StickerView sid={s.sid} size={s.size} custom={custom} />
          {sel === s.uid && (
            <div className="dsticker-tools">
              <button aria-label="Más pequeño" onClick={() => update(s.uid, { size: Math.max(32, s.size - 16) })}>−</button>
              <button aria-label="Más grande" onClick={() => update(s.uid, { size: Math.min(240, s.size + 16) })}>+</button>
              <button aria-label="Girar" onClick={() => update(s.uid, { rot: ((s.rot + 15 + 180) % 360) - 180 })}>↻</button>
              <button aria-label="Quitar sticker" onClick={() => { save(local.filter((x) => x.uid !== s.uid)); setSel(null); }}>×</button>
            </div>
          )}
        </div>
      ))}
    </>
  );
}
