import { useEffect, useSyncExternalStore } from 'react';
import { playSound } from '../lib/sounds';

/** Windows-style notification balloons that pop out of the system tray. */
export interface BalloonMsg {
  id: number;
  title: string;
  text: string;
  icon?: string;
  onClick?: () => void;
}

let current: BalloonMsg | null = null;
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function showBalloon(title: string, text: string, opts: { icon?: string; onClick?: () => void; sound?: boolean } = {}) {
  current = { id: ++seq, title, text, icon: opts.icon, onClick: opts.onClick };
  if (opts.sound !== false) playSound('notify');
  emit();
}

const close = () => {
  current = null;
  emit();
};

export function Balloon() {
  const b = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
  );
  useEffect(() => {
    if (!b) return;
    const id = setTimeout(close, 6000);
    return () => clearTimeout(id);
  }, [b?.id]);
  if (!b) return null;
  return (
    <div className={`tray-balloon ${b.onClick ? 'clickable' : ''}`} role="status" onClick={() => { b.onClick?.(); close(); }}>
      <button className="bubble-x" aria-label="Cerrar aviso" onClick={(e) => { e.stopPropagation(); close(); }}>×</button>
      <b>{b.icon ? `${b.icon} ` : ''}{b.title}</b>
      <p>{b.text}</p>
    </div>
  );
}
