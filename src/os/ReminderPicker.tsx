export const REMINDER_OPTIONS: { min: number; label: string }[] = [
  { min: 0, label: 'A la hora' },
  { min: 15, label: '15 min antes' },
  { min: 60, label: '1 h antes' },
  { min: 1440, label: '1 día antes' },
  { min: 2880, label: '2 días antes' },
  { min: 10080, label: '1 semana antes' },
];

/** Multi-choice of reminder offsets. `undefined` means "use the defaults from Panel de control". */
export function ReminderPicker({ value, onChange, disabled }: { value?: number[]; onChange: (v: number[] | undefined) => void; disabled?: boolean }) {
  return (
    <div className="reminder-picker">
      {REMINDER_OPTIONS.map((o) => {
        const on = value?.includes(o.min) ?? false;
        return (
          <label key={o.min} className={`chip-toggle ${on ? 'on' : ''}`}>
            <input type="checkbox" disabled={disabled} checked={on} onChange={() => onChange(on ? (value ?? []).filter((x) => x !== o.min) : [...(value ?? []), o.min].sort((a, b) => a - b))} />
            {o.label}
          </label>
        );
      })}
      {value === undefined ? <span className="hint">Usando los avisos predeterminados.</span> : <button className="link muted" type="button" onClick={() => onChange(undefined)}>Usar predeterminados</button>}
      {disabled && <span className="hint">Ponle fecha para poder avisarte.</span>}
    </div>
  );
}
