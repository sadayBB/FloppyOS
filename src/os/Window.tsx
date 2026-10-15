import { useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from 'react';
import { StatusCtx } from './status';
import { APPS } from '../apps/meta';
import { useSetting } from '../db';
import { Pixel } from '../pixel/Pixel';
import { isCompact, TASKBAR_H, useWM, type Win } from './wm';

export function Window({ win, children }: { win: Win; children: ReactNode }) {
  const wm = useWM();
  const meta = APPS[win.appId];
  const drag = useRef<{ dx: number; dy: number; mode: 'move' | 'resize'; w: number; h: number; sx: number; sy: number } | null>(null);
  const active = wm.topId === win.id;
  const [colorTitles] = useSetting('colorTitles', true);
  const max = win.maximized || isCompact();
  const [status, setStatus] = useState<string[] | null>(null);

  const onDown = (mode: 'move' | 'resize') => (e: RPointerEvent) => {
    if (max || (e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { mode, dx: e.clientX - win.x, dy: e.clientY - win.y, w: win.w, h: win.h, sx: e.clientX, sy: e.clientY };
    wm.focus(win.id);
  };
  const onMove = (e: RPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight - TASKBAR_H;
    if (d.mode === 'move') {
      wm.move(win.id, {
        x: Math.min(Math.max(e.clientX - d.dx, 60 - win.w), vw - 60),
        y: Math.min(Math.max(e.clientY - d.dy, 0), vh - 30),
      });
    } else {
      wm.move(win.id, {
        w: Math.max(320, Math.min(d.w + e.clientX - d.sx, vw - win.x)),
        h: Math.max(220, Math.min(d.h + e.clientY - d.sy, vh - win.y)),
      });
    }
  };
  const onUp = () => (drag.current = null);

  const style = max
    ? { left: 0, top: 0, width: '100%', height: `calc(100% - ${TASKBAR_H}px)`, zIndex: win.z }
    : { left: win.x, top: win.y, width: win.w, height: win.h, zIndex: win.z };

  return (
    <section
      className={`window ${active ? 'active' : ''} ${max ? 'max' : ''}`}
      data-win={win.id}
      style={{
        ...style,
        display: win.minimized ? 'none' : undefined,
        ...(colorTitles ? ({ '--tint-a': meta.tint[0], '--tint-b': meta.tint[1] } as Record<string, string>) : {}),
      }}
      onPointerDown={() => !active && wm.focus(win.id)}
      aria-label={meta.title}
    >
      <header
        className="titlebar"
        onPointerDown={onDown('move')}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onDoubleClick={() => wm.toggleMax(win.id)}
      >
        <Pixel sprite={meta.icon} scale={1} />
        <span className="title">{meta.title}</span>
        <button className="tb-btn" aria-label="Minimizar" onClick={() => wm.minimize(win.id)}>
          <span className="glyph-min" />
        </button>
        {!isCompact() && (
          <button className="tb-btn" aria-label="Maximizar" onClick={() => wm.toggleMax(win.id)}>
            <span className="glyph-max" />
          </button>
        )}
        <button className="tb-btn" aria-label="Cerrar" onClick={() => wm.close(win.id)}>
          <span className="glyph-x">×</span>
        </button>
      </header>
      <div className="window-body">
        <StatusCtx.Provider value={setStatus}>{children}</StatusCtx.Provider>
      </div>
      {status && status.length > 0 && (
        <footer className="statusbar">
          {status.map((p, i) => <span key={i}>{p}</span>)}
        </footer>
      )}
      {!max && <div className="resize" onPointerDown={onDown('resize')} onPointerMove={onMove} onPointerUp={onUp} />}
    </section>
  );
}
