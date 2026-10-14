import { useState } from 'react';
import { create, patch, remove, useActiveSemester, useRows, useSetting, useSubjects, type CalEvent, type EventKind, type ID } from '../db';
import { addDays, addMonths, DAYS_SHORT, fmtDate, fmtDur, fromISO, fromMin, MONTHS, startOfWeek, today, toMin, weekday } from '../lib/dates';
import { EVENT_KIND, isOpen } from '../lib/labels';
import { Btn, Field, Input, LazyInput, Modal, Select, SubjectSelect, Tabs } from '../os/ui';
import { isCompact, useWM } from '../os/wm';

type View = 'day' | 'week' | 'month';
const H0 = 7;
const H1 = 23;
const PX = 44; // pixels per hour

interface Item {
  key: string;
  title: string;
  start: number;
  end: number;
  color: string;
  kind: 'slot' | 'event' | 'session';
  sub?: string;
  event?: CalEvent;
  conflict?: boolean;
}

/** Builds the timed items and all-day chips for one date. */
function useDayData() {
  const { active } = useActiveSemester();
  const { subjects } = useSubjects();
  const slots = useRows('slots');
  const events = useRows('events');
  const tasks = useRows('tasks');
  const sessions = useRows('sessions');
  const subjectIds = new Set(subjects.map((s) => s.id));
  const color = (id?: ID) => subjects.find((s) => s.id === id)?.color;
  const name = (id?: ID) => subjects.find((s) => s.id === id)?.name;

  return (date: string, filter?: ID) => {
    const inSemester = !active || (date >= active.start && date <= active.end);
    const items: Item[] = [];
    if (inSemester)
      for (const s of slots)
        if (s.weekday === weekday(date) && (!s.subjectId || subjectIds.has(s.subjectId)) && (!filter || s.subjectId === filter))
          items.push({ key: `s${s.id}${date}`, title: name(s.subjectId) ?? s.title ?? 'Clase', sub: s.room, start: toMin(s.start), end: toMin(s.end), color: color(s.subjectId) ?? '#a89c8e', kind: 'slot' });
    for (const e of events)
      if (e.date === date && e.start && (!filter || e.subjectId === filter))
        items.push({ key: `e${e.id}`, title: e.title, sub: EVENT_KIND[e.kind].label, start: toMin(e.start), end: e.end ? toMin(e.end) : toMin(e.start) + 60, color: EVENT_KIND[e.kind].color, kind: 'event', event: e });
    for (const s of sessions) {
      const d = new Date(s.startedAt);
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (iso === date && (!filter || s.subjectId === filter)) {
        const st = d.getHours() * 60 + d.getMinutes();
        items.push({ key: `x${s.id}`, title: `Estudio${name(s.subjectId) ? `: ${name(s.subjectId)}` : ''}`, sub: fmtDur(s.focusMin), start: st, end: Math.max(st + 15, st + s.focusMin + s.breakMin), color: '#6fae9f', kind: 'session' });
      }
    }
    items.sort((a, b) => a.start - b.start);
    // Conflict detection between planned items (sessions are history, not plans).
    for (let i = 0; i < items.length; i++)
      for (let j = i + 1; j < items.length; j++)
        if (items[j].start < items[i].end && items[i].kind !== 'session' && items[j].kind !== 'session') items[i].conflict = items[j].conflict = true;

    const allDay = [
      ...events.filter((e) => e.date === date && !e.start && (!filter || e.subjectId === filter)).map((e) => ({ key: e.id, title: e.title, color: EVENT_KIND[e.kind].color, event: e, task: undefined })),
      ...tasks.filter((t) => t.due === date && isOpen(t.status) && (!filter || t.subjectId === filter)).map((t) => ({ key: t.id, title: `☐ ${t.title}`, color: color(t.subjectId) ?? '#8a7f73', event: undefined, task: t })),
    ];
    const load = tasks.filter((t) => t.due === date && isOpen(t.status)).reduce((s, t) => s + (t.estimateMin ?? 30), 0) + events.filter((e) => e.date === date && (e.kind === 'examen' || e.kind === 'entrega')).length * 120;
    return { items, allDay, load };
  };
}

export default function Calendar() {
  const [view, setView] = useState<View>(isCompact() ? 'day' : 'week');
  const [cursor, setCursor] = useState(today());
  const [filter, setFilter] = useState<ID | undefined>();
  const [editing, setEditing] = useState<Partial<CalEvent> | null>(null);
  const { subjects } = useSubjects();
  const dayData = useDayData();
  const wm = useWM();
  const [capacity] = useSetting('dailyCapacityMin', 240);

  const step = (dir: number) => setCursor((c) => (view === 'month' ? addMonths(c, dir) : addDays(c, dir * (view === 'week' ? 7 : 1))));
  const days = view === 'day' ? [cursor] : Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(cursor), i));
  const title =
    view === 'month' ? `${MONTHS[fromISO(cursor).getMonth()]} ${fromISO(cursor).getFullYear()}`
    : view === 'week' ? `${fmtDate(days[0])} – ${fmtDate(days[6])}`
    : fmtDate(cursor);

  return (
    <div className="app calendar">
      <div className="toolbar">
        <Btn small onClick={() => step(-1)} aria-label="Anterior">◀</Btn>
        <Btn small onClick={() => setCursor(today())}>Hoy</Btn>
        <Btn small onClick={() => step(1)} aria-label="Siguiente">▶</Btn>
        <b className="cal-title">{title}</b>
        <span className="grow" />
        <SubjectSelect subjects={subjects} value={filter} onChange={setFilter} none="Todo" />
        <Tabs<View> value={view} onChange={setView} tabs={[{ id: 'day', label: 'Día' }, { id: 'week', label: 'Semana' }, { id: 'month', label: 'Mes' }]} />
        <Btn small primary onClick={() => setEditing({ date: cursor, kind: 'entrega', title: '' })}>+ Evento</Btn>
      </div>

      {view === 'month' ? (
        <MonthGrid cursor={cursor} dayData={dayData} filter={filter} capacity={capacity} onPick={(d) => { setCursor(d); setView('day'); }} />
      ) : (
        <div className="scroll">
          <div className="week" style={{ gridTemplateColumns: `48px repeat(${days.length}, 1fr)` }}>
            <div className="wk-corner" />
            {days.map((d) => {
              const { load } = dayData(d, filter);
              return (
                <div key={d} className={`wk-head ${d === today() ? 'today' : ''}`}>
                  {DAYS_SHORT[weekday(d)]} {fromISO(d).getDate()}
                  {load > capacity && <span className="late" title={`~${fmtDur(load)} de trabajo estimado, más que tu capacidad diaria`}> ⚠</span>}
                </div>
              );
            })}
            <div className="wk-allday-label">todo el día</div>
            {days.map((d) => (
              <div key={d} className="wk-allday">
                {dayData(d, filter).allDay.map((a) => (
                  <button key={a.key} className="ev-chip" style={{ background: a.color }} onClick={() => (a.event ? setEditing(a.event) : wm.open('tasks', { taskId: a.task!.id }))}>
                    {a.title}
                  </button>
                ))}
              </div>
            ))}
            <div className="wk-hours" style={{ height: (H1 - H0) * PX }}>
              {Array.from({ length: H1 - H0 }, (_, i) => <div key={i} style={{ height: PX }}>{H0 + i}:00</div>)}
            </div>
            {days.map((d) => (
              <div
                key={d}
                className="wk-col"
                style={{ height: (H1 - H0) * PX }}
                onClick={(e) => {
                  if (e.target !== e.currentTarget) return;
                  const y = e.nativeEvent.offsetY;
                  const min = Math.floor((H0 * 60 + (y / PX) * 60) / 30) * 30;
                  setEditing({ date: d, start: fromMin(min), end: fromMin(min + 60), kind: 'estudio', title: '' });
                }}
              >
                {d === today() && <NowLine />}
                {dayData(d, filter).items.map((it) => (
                  <div
                    key={it.key}
                    className={`ev ${it.kind} ${it.conflict ? 'conflict' : ''}`}
                    style={{ top: ((it.start - H0 * 60) / 60) * PX, height: Math.max(18, ((it.end - it.start) / 60) * PX - 2), background: it.color }}
                    onClick={() => it.event && setEditing(it.event)}
                    title={`${fromMin(it.start)}–${fromMin(it.end)} ${it.title}${it.conflict ? ' (se superpone con otro evento)' : ''}`}
                  >
                    <b>{it.conflict ? '⚠ ' : ''}{it.title}</b>
                    <span>{fromMin(it.start)}{it.sub ? ` · ${it.sub}` : ''}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
      {editing && <EventModal ev={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function NowLine() {
  const d = new Date();
  const min = d.getHours() * 60 + d.getMinutes();
  if (min < H0 * 60 || min > H1 * 60) return null;
  return <div className="now-line" style={{ top: ((min - H0 * 60) / 60) * PX }} />;
}

function MonthGrid({ cursor, dayData, filter, capacity, onPick }: { cursor: string; dayData: ReturnType<typeof useDayData>; filter?: ID; capacity: number; onPick: (d: string) => void }) {
  const first = cursor.slice(0, 8) + '01';
  const start = startOfWeek(first);
  const month = fromISO(cursor).getMonth();
  const cells = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  return (
    <div className="month">
      {[1, 2, 3, 4, 5, 6, 0].map((d) => <div key={d} className="m-head">{DAYS_SHORT[d]}</div>)}
      {cells.map((d) => {
        const { items, allDay, load } = dayData(d, filter);
        const marks = [...allDay, ...items.filter((i) => i.kind === 'event')];
        const heat = Math.min(1, load / Math.max(60, capacity));
        return (
          <button key={d} className={`m-cell ${fromISO(d).getMonth() !== month ? 'other' : ''} ${d === today() ? 'today' : ''}`} onClick={() => onPick(d)} style={{ boxShadow: heat > 0.05 ? `inset 0 -4px 0 rgba(207,107,94,${heat})` : undefined }}>
            <span className="m-num">{fromISO(d).getDate()}</span>
            {marks.slice(0, 3).map((m) => <span key={m.key} className="m-chip" style={{ background: m.color }}>{m.title}</span>)}
            {marks.length > 3 && <span className="m-more">+{marks.length - 3}</span>}
          </button>
        );
      })}
    </div>
  );
}

function EventModal({ ev, onClose }: { ev: Partial<CalEvent>; onClose: () => void }) {
  const { subjects } = useSubjects();
  const [e, setE] = useState<Partial<CalEvent>>(ev);
  const set = (c: Partial<CalEvent>) => setE((x) => ({ ...x, ...c }));
  const save = async () => {
    if (!e.title?.trim() || !e.date) return;
    const data = { title: e.title.trim(), kind: e.kind ?? 'otro', date: e.date, start: e.start || undefined, end: e.end || undefined, subjectId: e.subjectId, notes: e.notes };
    if (e.id) await patch('events', e.id, data);
    else await create('events', data);
    onClose();
  };
  return (
    <Modal
      title={e.id ? 'Editar evento' : 'Nuevo evento'}
      onClose={onClose}
      footer={<>
        {e.id && <Btn onClick={() => { void remove('events', e.id!); onClose(); }}>Eliminar</Btn>}
        <span className="grow" />
        <Btn onClick={onClose}>Cancelar</Btn>
        <Btn primary onClick={save} disabled={!e.title?.trim()}>Guardar</Btn>
      </>}
    >
      <div className="form">
        <Field label="Título" wide><Input autoFocus value={e.title ?? ''} onChange={(x) => set({ title: x.target.value })} onKeyDown={(x) => x.key === 'Enter' && void save()} /></Field>
        <Field label="Tipo">
          <Select value={e.kind} onChange={(x) => set({ kind: x.target.value as EventKind })}>
            {Object.entries(EVENT_KIND).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </Select>
        </Field>
        <Field label="Materia"><SubjectSelect subjects={subjects} value={e.subjectId} onChange={(id) => set({ subjectId: id })} /></Field>
        <Field label="Fecha"><Input type="date" value={e.date ?? ''} onChange={(x) => set({ date: x.target.value })} /></Field>
        <Field label="Inicio (vacío = todo el día)"><Input type="time" value={e.start ?? ''} onChange={(x) => set({ start: x.target.value })} /></Field>
        <Field label="Fin"><Input type="time" value={e.end ?? ''} onChange={(x) => set({ end: x.target.value })} /></Field>
        <Field label="Notas" wide><LazyInput multiline value={e.notes ?? ''} onCommit={(v) => set({ notes: v })} /></Field>
      </div>
    </Modal>
  );
}
