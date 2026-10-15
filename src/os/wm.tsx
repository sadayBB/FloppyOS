import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { APPS, type AppId } from '../apps/meta';
import { animateMinimize, animateRestore, clearWindowAnim } from './winAnim';

export interface Win {
  id: string;
  appId: AppId;
  props?: Record<string, unknown>;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  minimized: boolean;
  maximized: boolean;
}

interface WM {
  wins: Win[];
  open: (appId: AppId, props?: Record<string, unknown>) => void;
  close: (id: string) => void;
  focus: (id: string) => void;
  minimize: (id: string) => void;
  toggleMax: (id: string) => void;
  move: (id: string, r: Partial<Pick<Win, 'x' | 'y' | 'w' | 'h'>>) => void;
  topId?: string;
}

const Ctx = createContext<WM | null>(null);
export const TASKBAR_H = 40;
export const isCompact = () => window.innerWidth < 820;

export function WMProvider({ children }: { children: ReactNode }) {
  const [wins, setWins] = useState<Win[]>([]);
  const z = useRef(10);

  const open = useCallback((appId: AppId, props?: Record<string, unknown>) => {
    setWins((ws) => {
      const ex = ws.find((w) => w.appId === appId);
      if (ex) {
        if (ex.minimized) animateRestore(ex.id);
        return ws.map((w) =>
          w.id === ex.id ? { ...w, props: props ?? w.props, minimized: false, z: ++z.current } : w,
        );
      }
      const meta = APPS[appId];
      const vw = window.innerWidth;
      const vh = window.innerHeight - TASKBAR_H;
      const w = Math.min(meta.size.w, vw - 16);
      const h = Math.min(meta.size.h, vh - 16);
      const n = ws.filter((x) => !x.minimized).length;
      return [
        ...ws,
        {
          id: `${appId}-${Date.now()}`,
          appId,
          props,
          w,
          h,
          x: Math.max(8, Math.min(110 + n * 28, vw - w - 8)),
          y: Math.max(8, Math.min(16 + n * 26, vh - h - 8)),
          z: ++z.current,
          minimized: false,
          maximized: isCompact(),
        },
      ];
    });
  }, []);

  const update = (id: string, fn: (w: Win) => Partial<Win>) =>
    setWins((ws) => ws.map((w) => (w.id === id ? { ...w, ...fn(w) } : w)));

  const value = useMemo<WM>(() => {
    const visible = wins.filter((w) => !w.minimized);
    const top = visible.reduce<Win | undefined>((a, b) => (!a || b.z > a.z ? b : a), undefined);
    return {
      wins,
      open,
      topId: top?.id,
      close: (id) => setWins((ws) => ws.filter((w) => w.id !== id)),
      focus: (id) => {
        const w = wins.find((x) => x.id === id);
        update(id, (cur) => (cur.z === z.current && !cur.minimized ? {} : { z: ++z.current, minimized: false }));
        if (w?.minimized) animateRestore(id);
      },
      minimize: (id) =>
        void animateMinimize(id).then(() => {
          update(id, () => ({ minimized: true }));
          // Clear the held last frame only after React has hidden the window.
          setTimeout(() => clearWindowAnim(id), 80);
        }),
      toggleMax: (id) => update(id, (w) => ({ maximized: !w.maximized })),
      move: (id, r) => update(id, () => r),
    };
  }, [wins, open]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWM() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useWM outside WMProvider');
  return c;
}
