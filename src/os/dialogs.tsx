import { useEffect, useRef, useSyncExternalStore } from 'react';
import { Pixel } from '../pixel/Pixel';
import { playSound } from '../lib/sounds';

/*
 * Windows-2000-style message boxes that replace the browser's confirm()/alert().
 * askConfirm() and showAlert() return promises, so callers just `await` them.
 */

export type DialogKind = 'warning' | 'error' | 'question' | 'info';

interface DialogReq {
  id: number;
  kind: DialogKind;
  title: string;
  message: string;
  detail?: string;
  ok: string;
  cancel?: string;
  /** Destructive action: focus starts on Cancel so Enter doesn't delete by accident. */
  danger?: boolean;
  resolve: (ok: boolean) => void;
}

let queue: DialogReq[] = [];
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function open(req: Omit<DialogReq, 'id' | 'resolve'>) {
  return new Promise<boolean>((resolve) => {
    queue = [...queue, { ...req, id: ++seq, resolve }];
    playSound(req.kind === 'error' ? 'error' : 'ding');
    emit();
  });
}

export interface ConfirmOptions {
  title?: string;
  kind?: DialogKind;
  detail?: string;
  ok?: string;
  cancel?: string;
  danger?: boolean;
}

export const askConfirm = (message: string, o: ConfirmOptions = {}) =>
  open({ kind: o.kind ?? (o.danger ? 'warning' : 'question'), title: o.title ?? 'FloppyOS', message, detail: o.detail, ok: o.ok ?? 'Aceptar', cancel: o.cancel ?? 'Cancelar', danger: o.danger });

export const showAlert = (message: string, o: Omit<ConfirmOptions, 'cancel' | 'danger'> = {}) =>
  open({ kind: o.kind ?? 'info', title: o.title ?? 'FloppyOS', message, detail: o.detail, ok: o.ok ?? 'Aceptar' }).then(() => undefined);

const ICONS: Record<DialogKind, string[]> = {
  warning: [
    '.......kk.......',
    '......kyyk......',
    '......kyyk......',
    '.....kyyyyk.....',
    '.....kykkyk.....',
    '....kyykkyyk....',
    '....kyykkyyk....',
    '...kyyykkyyyk...',
    '...kyyykkyyyk...',
    '..kyyyykkyyyyk..',
    '..kyyyyyyyyyyk..',
    '.kyyyyykkyyyyyk.',
    '.kyyyyykkyyyyyk.',
    'kyyyyyyyyyyyyyyk',
    'kkkkkkkkkkkkkkkk',
  ],
  error: [
    '.....kkkkkk.....',
    '...kkrrrrrrkk...',
    '..krrrrrrrrrrk..',
    '.krrwrrrrrrwrrk.',
    '.krwwwrrrrwwwrk.',
    'krrrwwwrrwwwrrrk',
    'krrrrwwwwwwrrrrk',
    'krrrrrwwwwrrrrrk',
    'krrrrrwwwwrrrrrk',
    'krrrrwwwwwwrrrrk',
    'krrrwwwrrwwwrrrk',
    '.krwwwrrrrwwwrk.',
    '.krrwrrrrrrwrrk.',
    '..krrrrrrrrrrk..',
    '...kkrrrrrrkk...',
    '.....kkkkkk.....',
  ],
  question: [
    '.....kkkkkk.....',
    '...kkbbbbbbkk...',
    '..kbbbwwwwbbbk..',
    '.kbbbwwbbwwbbbk.',
    '.kbbbbbbbwwbbbk.',
    'kbbbbbbbwwbbbbbk',
    'kbbbbbbwwbbbbbbk',
    'kbbbbbbwwbbbbbbk',
    'kbbbbbbbbbbbbbbk',
    'kbbbbbbwwbbbbbbk',
    'kbbbbbbwwbbbbbbk',
    '.kbbbbbbbbbbbbk.',
    '.kbbbbbbbbbbbbk.',
    '..kbbbbbbbbbbk..',
    '...kkbbbbbbkk...',
    '.....kkkkkk.....',
  ],
  info: [
    '.....kkkkkk.....',
    '...kkbbbbbbkk...',
    '..kbbbbbbbbbbk..',
    '.kbbbbbwwbbbbbk.',
    '.kbbbbbwwbbbbbk.',
    'kbbbbbbbbbbbbbbk',
    'kbbbbbwwwbbbbbbk',
    'kbbbbbbwwbbbbbbk',
    'kbbbbbbwwbbbbbbk',
    'kbbbbbbwwbbbbbbk',
    'kbbbbbbwwbbbbbbk',
    '.kbbbbwwwwbbbbk.',
    '.kbbbbbbbbbbbbk.',
    '..kbbbbbbbbbbk..',
    '...kkbbbbbbkk...',
    '.....kkkkkk.....',
  ],
};
// Classic system-icon colours, brighter than the app's pastel palette.
const ICON_PAL = { y: '#ffd400', r: '#e0262b', b: '#2459c9', w: '#ffffff', k: '#1b1b1b' };

/** Renders the front dialog of the queue. Mounted once at the app root. */
export function DialogHost() {
  const items = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => queue,
  );
  const d = items[0];
  const okBtn = useRef<HTMLButtonElement>(null);
  const cancelBtn = useRef<HTMLButtonElement>(null);

  const close = (ok: boolean) => {
    if (!d) return;
    queue = queue.slice(1);
    emit();
    d.resolve(ok);
  };

  useEffect(() => {
    if (!d) return;
    (d.danger && cancelBtn.current ? cancelBtn.current : okBtn.current)?.focus();
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close(false);
      }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [d?.id]);

  if (!d) return null;
  return (
    <div className="modal-backdrop msgbox-backdrop">
      <div className="dialog msgbox" role="alertdialog" aria-modal="true" aria-labelledby={`msg-${d.id}`}>
        <header className="titlebar">
          <span className="title">{d.title}</span>
          <button className="tb-btn" aria-label="Cerrar" onClick={() => close(false)}>
            <span className="glyph-x">×</span>
          </button>
        </header>
        <div className="msgbox-body">
          <Pixel sprite={ICONS[d.kind]} scale={2} palette={ICON_PAL} />
          <div>
            <p id={`msg-${d.id}`}>{d.message}</p>
            {d.detail && <p className="hint">{d.detail}</p>}
          </div>
        </div>
        <footer className="msgbox-buttons">
          <button ref={okBtn} className="btn msgbox-btn" onClick={() => close(true)}>{d.ok}</button>
          {d.cancel && <button ref={cancelBtn} className="btn msgbox-btn" onClick={() => close(false)}>{d.cancel}</button>}
        </footer>
      </div>
    </div>
  );
}
