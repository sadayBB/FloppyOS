import { useEffect, useState, type ReactNode, type InputHTMLAttributes, type SelectHTMLAttributes, type ButtonHTMLAttributes } from 'react';
import type { ID, Subject } from '../db';

export function Btn({ className = '', primary, small, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { primary?: boolean; small?: boolean }) {
  return <button className={`btn ${primary ? 'primary' : ''} ${small ? 'small' : ''} ${className}`} {...p} />;
}

export function MenuBar({ items }: { items: { label: string; onClick: () => void; disabled?: boolean }[] }) {
  return (
    <nav className="menubar">
      {items.map((it) => (
        <button key={it.label} onClick={it.onClick} disabled={it.disabled}>
          <u>{it.label[0]}</u>
          {it.label.slice(1)}
        </button>
      ))}
    </nav>
  );
}

export function Field({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <label className={`field ${wide ? 'wide' : ''}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}

export function Input(p: InputHTMLAttributes<HTMLInputElement>) {
  return <input className="input" {...p} />;
}

/** Text input that commits on blur/Enter, so typing doesn't write to the DB on every key. */
export function LazyInput({ value, onCommit, multiline, ...p }: { value: string; onCommit: (v: string) => void; multiline?: boolean } & Omit<InputHTMLAttributes<HTMLInputElement>, 'value'>) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const commit = () => v !== value && onCommit(v);
  if (multiline)
    return <textarea className="input" value={v} onChange={(e) => setV(e.target.value)} onBlur={commit} placeholder={p.placeholder} rows={4} />;
  return (
    <input
      className="input"
      {...p}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  );
}

export function Select(p: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className="input" {...p} />;
}

export function SubjectSelect({ subjects, value, onChange, none = 'Sin materia' }: { subjects: Subject[]; value?: ID; onChange: (id: ID | undefined) => void; none?: string }) {
  return (
    <Select value={value ?? ''} onChange={(e) => onChange(e.target.value || undefined)}>
      <option value="">{none}</option>
      {subjects.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </Select>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string; count?: number }[]; value: T; onChange: (t: T) => void }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={t.id === value} className={t.id === value ? 'on' : ''} onClick={() => onChange(t.id)}>
          {t.label}
          {t.count ? <span className="count">{t.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function Dot({ color, size = 10 }: { color: string; size?: number }) {
  return <span className="dot" style={{ background: color, width: size, height: size }} />;
}

export function Chip({ color, children, title }: { color?: string; children: ReactNode; title?: string }) {
  return (
    <span className="chip" style={color ? { borderColor: color, background: `${color}33` } : undefined} title={title}>
      {children}
    </span>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function Progress({ value, color }: { value: number; color?: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(value * 100)));
  return (
    <div className="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

export function Modal({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-label={title}>
        <header className="titlebar">
          <span className="title">{title}</span>
          <button className="tb-btn" aria-label="Cerrar" onClick={onClose}>
            <span className="glyph-x">×</span>
          </button>
        </header>
        <div className="dialog-body">{children}</div>
        {footer && <footer className="dialog-footer">{footer}</footer>}
      </div>
    </div>
  );
}

export { askConfirm as confirmBox } from './dialogs';
