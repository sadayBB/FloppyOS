import { useEffect } from 'react';

export interface MenuItem {
  label: string;
  onClick?: () => void;
  separator?: boolean;
  disabled?: boolean;
}

/** Windows-2000 context menu at (x, y). Closes on outside click, Escape or after choosing. */
export function ContextMenu({ x, y, items, onClose }: { x: number; y: number; items: MenuItem[]; onClose: () => void }) {
  useEffect(() => {
    const off = (e: Event) => {
      if (!(e.target as HTMLElement).closest('.ctx-menu')) onClose();
    };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('pointerdown', off);
    window.addEventListener('keydown', key);
    window.addEventListener('resize', onClose);
    return () => {
      window.removeEventListener('pointerdown', off);
      window.removeEventListener('keydown', key);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose]);
  // Keep the menu inside the screen.
  const left = Math.min(x, window.innerWidth - 210);
  const top = Math.min(y, window.innerHeight - 40 - items.length * 28);
  return (
    <div className="ctx-menu" role="menu" style={{ left, top }}>
      {items.map((it, i) =>
        it.separator ? (
          <hr key={i} />
        ) : (
          <button key={i} role="menuitem" disabled={it.disabled} onClick={() => { onClose(); it.onClick?.(); }}>
            {it.label}
          </button>
        ),
      )}
    </div>
  );
}
