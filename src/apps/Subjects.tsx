import { useEffect, useState } from 'react';
import { create, patch, remove, SUBJECT_COLORS, useActiveSemester, useRows, useSubjects, type ID, type SemesterStatus, type Slot, type SlotKind, type Subject } from '../db';
import { addMonths, DAYS, fmtDate, relDay, today, WEEK_ORDER } from '../lib/dates';
import { isOpen, SLOT_KIND } from '../lib/labels';
import { KIND_COLOR, KIND_LABEL } from '../lib/parse';
import { Btn, Chip, Dot, Empty, Field, Input, LazyInput, Modal, Select, Tabs } from '../os/ui';
import { useWM } from '../os/wm';
import { Pixel } from '../pixel/Pixel';
import { STICKERS, stickerById } from '../pixel/stickers';
import { useUnlocked } from '../lib/stickers';
import { Syllabus } from './Syllabus';
import { toggleDone } from './Tasks';

type Tab = 'info' | 'horario' | 'temario' | 'tareas' | 'clases' | 'notas';

export default function Subjects({ subjectId, tab: initTab }: { subjectId?: ID; tab?: Tab }) {
  const { semesters, active, setActiveId } = useActiveSemester();
  const { subjects } = useSubjects();
  const [selId, setSelId] = useState<ID | undefined>(subjectId);
  const [tab, setTab] = useState<Tab>(initTab ?? 'temario');
  const [semModal, setSemModal] = useState<'new' | 'edit' | null>(null);

  useEffect(() => { if (subjectId) setSelId(subjectId); }, [subjectId]);
  useEffect(() => { if (initTab) setTab(initTab); }, [initTab]);

  const sel = subjects.find((s) => s.id === selId);

  const addSubject = async () => {
    if (!active) return setSemModal('new');
    const s = await create('subjects', { semesterId: active.id, name: 'Nueva materia', color: SUBJECT_COLORS[subjects.length % SUBJECT_COLORS.length] });
    setSelId(s.id);
    setTab('info');
  };

  if (semesters.length === 0)
    return (
      <div className="app center">
        <div className="welcome">
          <h2>¡Bienvenida/o a FloppyOS!</h2>
          <p>Empieza creando tu semestre actual. Después agrega tus materias, su horario y su temario.</p>
          <Btn primary onClick={() => setSemModal('new')}>Crear semestre</Btn>
        </div>
        {semModal && <SemesterModal mode="new" onClose={() => setSemModal(null)} onCreated={(id) => setActiveId(id)} />}
      </div>
    );

  return (
    <div className={`app split ${sel ? 'has-detail' : ''}`}>
      <aside className="sidebar">
        <Field label="Semestre">
          <Select value={active?.id ?? ''} onChange={(e) => setActiveId(e.target.value)}>
            {semesters.map((s) => <option key={s.id} value={s.id}>{s.name}{s.status === 'archivado' ? ' (archivado)' : ''}</option>)}
          </Select>
        </Field>
        <div className="row-btns">
          <Btn small onClick={() => setSemModal('new')}>Nuevo</Btn>
          <Btn small onClick={() => setSemModal('edit')}>Editar</Btn>
        </div>
        <hr />
        {subjects.map((s) => (
          <button key={s.id} className={`side-item ${s.id === selId ? 'on' : ''}`} onClick={() => setSelId(s.id)}>
            <SubjectIcon s={s} /> {s.name}
          </button>
        ))}
        <Btn onClick={addSubject} disabled={active?.status === 'archivado'}>+ Materia</Btn>
      </aside>

      <div className="pane detail">
        {!sel ? (
          <Empty>{subjects.length ? 'Elige una materia.' : 'Agrega tu primera materia con «+ Materia».'}</Empty>
        ) : (
          <>
            <div className="detail-head">
              <Btn small className="only-compact" onClick={() => setSelId(undefined)}>←</Btn>
              <SubjectIcon s={sel} big />
              <h2 className="subject-title">{sel.name}</h2>
              {sel.code && <Chip>{sel.code}</Chip>}
            </div>
            <Tabs<Tab>
              value={tab}
              onChange={setTab}
              tabs={[
                { id: 'temario', label: 'Temario' },
                { id: 'clases', label: 'Clase' },
                { id: 'tareas', label: 'Tareas' },
                { id: 'horario', label: 'Horario' },
                { id: 'notas', label: 'Apuntes' },
                { id: 'info', label: 'Datos' },
              ]}
            />
            <div className="scroll tab-body">
              {tab === 'info' && <SubjectInfo s={sel} onDeleted={() => setSelId(undefined)} />}
              {tab === 'horario' && <Schedule s={sel} />}
              {tab === 'temario' && <Syllabus subject={sel} />}
              {tab === 'tareas' && <SubjectTasks s={sel} />}
              {tab === 'clases' && <ClassLog s={sel} />}
              {tab === 'notas' && <SubjectNotes s={sel} />}
            </div>
          </>
        )}
      </div>
      {semModal && <SemesterModal mode={semModal} onClose={() => setSemModal(null)} onCreated={(id) => setActiveId(id)} />}
    </div>
  );
}

function SemesterModal({ mode, onClose, onCreated }: { mode: 'new' | 'edit'; onClose: () => void; onCreated: (id: ID) => void }) {
  const { active } = useActiveSemester();
  const cur = mode === 'edit' ? active : undefined;
  const y = new Date().getFullYear();
  const [name, setName] = useState(cur?.name ?? `${y}-${new Date().getMonth() < 6 ? 1 : 2}`);
  const [start, setStart] = useState(cur?.start ?? today());
  const [end, setEnd] = useState(cur?.end ?? addMonths(today(), 4));
  const [status, setStatus] = useState<SemesterStatus>(cur?.status ?? 'activo');

  const save = async () => {
    if (cur) await patch('semesters', cur.id, { name, start, end, status });
    else onCreated((await create('semesters', { name, start, end, status })).id);
    onClose();
  };
  return (
    <Modal title={cur ? 'Editar semestre' : 'Nuevo semestre'} onClose={onClose} footer={<><Btn onClick={onClose}>Cancelar</Btn><Btn primary onClick={save}>Aceptar</Btn></>}>
      <div className="form">
        <Field label="Nombre" wide><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Inicio"><Input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
        <Field label="Fin"><Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
        <Field label="Estado">
          <Select value={status} onChange={(e) => setStatus(e.target.value as SemesterStatus)}>
            <option value="planeado">Planeado</option>
            <option value="activo">Activo</option>
            <option value="archivado">Archivado</option>
          </Select>
        </Field>
        {status === 'archivado' && <p className="hint wide">Archivar no borra nada: materias, apuntes, tareas e historial siguen consultables.</p>}
      </div>
    </Modal>
  );
}

function SubjectInfo({ s, onDeleted }: { s: Subject; onDeleted: () => void }) {
  const set = (c: Partial<Subject>) => void patch('subjects', s.id, c);
  return (
    <div className="form">
      <Field label="Nombre" wide><LazyInput value={s.name} onCommit={(v) => set({ name: v })} /></Field>
      <Field label="Código"><LazyInput value={s.code ?? ''} onCommit={(v) => set({ code: v })} /></Field>
      <Field label="Grupo"><LazyInput value={s.group ?? ''} onCommit={(v) => set({ group: v })} /></Field>
      <Field label="Profesor/a"><LazyInput value={s.professor ?? ''} onCommit={(v) => set({ professor: v })} /></Field>
      <Field label="Aula"><LazyInput value={s.room ?? ''} onCommit={(v) => set({ room: v })} /></Field>
      <Field label="Créditos"><LazyInput type="number" value={String(s.credits ?? '')} onCommit={(v) => set({ credits: v ? +v : undefined })} /></Field>
      <Field label="Color">
        <div className="swatches">
          {SUBJECT_COLORS.map((c) => (
            <button key={c} className={`swatch ${c === s.color ? 'on' : ''}`} style={{ background: c }} onClick={() => set({ color: c })} aria-label={`Color ${c}`} />
          ))}
        </div>
      </Field>
      <Field label="Sticker de la materia" wide>
        <StickerPicker value={s.icon} onChange={(icon) => set({ icon })} />
      </Field>
      <Field label="Descripción" wide><LazyInput multiline value={s.description ?? ''} onCommit={(v) => set({ description: v })} /></Field>
      <div className="wide">
        <Btn onClick={() => { if (confirm(`¿Eliminar «${s.name}»? Sus tareas y apuntes se conservan sin materia.`)) { void remove('subjects', s.id); onDeleted(); } }}>Eliminar materia</Btn>
      </div>
    </div>
  );
}

function Schedule({ s }: { s: Subject }) {
  const slots = useRows('slots').filter((x) => x.subjectId === s.id).sort((a, b) => WEEK_ORDER.indexOf(a.weekday) - WEEK_ORDER.indexOf(b.weekday) || a.start.localeCompare(b.start));
  const set = (sl: Slot, c: Partial<Slot>) => void patch('slots', sl.id, c);
  return (
    <div>
      <p className="hint">Clases recurrentes cada semana. Si cambia el horario, edítalo aquí: la materia no se toca.</p>
      <table className="grid-table">
        <thead><tr><th>Día</th><th>Inicio</th><th>Fin</th><th>Tipo</th><th>Aula</th><th /></tr></thead>
        <tbody>
          {slots.map((sl) => (
            <tr key={sl.id}>
              <td><Select value={sl.weekday} onChange={(e) => set(sl, { weekday: +e.target.value })}>{WEEK_ORDER.map((d) => <option key={d} value={d}>{DAYS[d]}</option>)}</Select></td>
              <td><Input type="time" value={sl.start} onChange={(e) => set(sl, { start: e.target.value })} /></td>
              <td><Input type="time" value={sl.end} onChange={(e) => set(sl, { end: e.target.value })} /></td>
              <td><Select value={sl.kind} onChange={(e) => set(sl, { kind: e.target.value as SlotKind })}>{Object.entries(SLOT_KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></td>
              <td><LazyInput value={sl.room ?? ''} onCommit={(v) => set(sl, { room: v })} placeholder={s.room} /></td>
              <td><Btn small aria-label="Quitar" onClick={() => void remove('slots', sl.id)}>×</Btn></td>
            </tr>
          ))}
        </tbody>
      </table>
      <Btn onClick={() => void create('slots', { subjectId: s.id, kind: 'clase', weekday: 1, start: '08:00', end: '10:00', room: s.room })}>+ Agregar clase</Btn>
    </div>
  );
}

function SubjectTasks({ s }: { s: Subject }) {
  const tasks = useRows('tasks').filter((t) => t.subjectId === s.id).sort((a, b) => (a.due ?? '9').localeCompare(b.due ?? '9'));
  const wm = useWM();
  const open = tasks.filter((t) => isOpen(t.status));
  const done = tasks.filter((t) => !isOpen(t.status));
  return (
    <div>
      {open.length === 0 && <Empty>Sin tareas pendientes en esta materia.</Empty>}
      <ul className="rows">
        {[...open, ...done].map((t) => (
          <li key={t.id} className={`row clickable ${isOpen(t.status) ? '' : 'done'}`} onClick={() => wm.open('tasks', { taskId: t.id })}>
            <input type="checkbox" checked={t.status === 'completada'} onClick={(e) => e.stopPropagation()} onChange={() => void toggleDone(t)} />
            <div className="row-main"><div className="row-title">{t.title}</div><div className="row-meta">{t.due && relDay(t.due)}</div></div>
          </li>
        ))}
      </ul>
      <Btn onClick={async () => { const t = await create('tasks', { title: 'Nueva tarea', subjectId: s.id, status: 'pendiente', priority: 2, tags: [], subtasks: [] }); wm.open('tasks', { taskId: t.id }); }}>+ Tarea</Btn>
    </div>
  );
}

/** Keywords and questions captured for this subject (RF-21, RF-22, RF-30). */
function ClassLog({ s }: { s: Subject }) {
  const items = useRows('inbox').filter((i) => i.subjectId === s.id && ['palabra', 'duda', 'nota', 'idea'].includes(i.kind));
  const [text, setText] = useState('');
  const [kind, setKind] = useState<'palabra' | 'duda' | 'nota'>('palabra');
  const byDay = new Map<string, typeof items>();
  for (const i of items.sort((a, b) => b.createdAt - a.createdAt)) {
    const d = new Date(i.createdAt);
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    byDay.set(k, [...(byDay.get(k) ?? []), i]);
  }
  const add = async () => {
    if (!text.trim()) return;
    setText('');
    await create('inbox', { text: text.trim(), kind, subjectId: s.id, tags: [], processed: kind === 'nota' });
  };
  return (
    <div>
      <p className="hint">Modo clase: apunta conceptos y dudas sin salir de esta pantalla. Pulsa Enter después de cada uno.</p>
      <form className="capture" onSubmit={(e) => { e.preventDefault(); void add(); }}>
        <Select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} aria-label="Tipo">
          <option value="palabra">Palabra clave</option>
          <option value="duda">Duda</option>
          <option value="nota">Nota</option>
        </Select>
        <input className="input" autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder={kind === 'palabra' ? 'DNS, VLAN, normalización…' : kind === 'duda' ? '¿Cómo funciona…?' : 'Lo que dijo el profe…'} />
        <Btn type="submit">+</Btn>
      </form>
      {byDay.size === 0 && <Empty>Todavía no has registrado nada de esta materia.</Empty>}
      {[...byDay.entries()].map(([day, list]) => (
        <div key={day} className="day-group">
          <div className="section-title">{fmtDate(day)}</div>
          <div className="chips-wrap">
            {list.map((i) => (
              <span key={i.id} className={`chip ${i.resolved ? 'strike' : ''}`} style={{ borderColor: KIND_COLOR[i.kind], background: `${KIND_COLOR[i.kind]}33` }} title={KIND_LABEL[i.kind]}>
                {i.kind === 'duda' ? '¿ ' : ''}{i.text}
                {i.kind === 'duda' && !i.resolved && <button className="link" onClick={() => void patch('inbox', i.id, { resolved: true, processed: true })}>✓</button>}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function SubjectNotes({ s }: { s: Subject }) {
  const notes = useRows('notes').filter((n) => n.subjectId === s.id).sort((a, b) => b.updatedAt - a.updatedAt);
  const wm = useWM();
  return (
    <div>
      {notes.length === 0 && <Empty>Sin apuntes todavía.</Empty>}
      <ul className="rows">
        {notes.map((n) => (
          <li key={n.id} className="row clickable" onClick={() => wm.open('notes', { noteId: n.id })}>
            <div className="row-main"><div className="row-title">{n.title || 'Sin título'}</div><div className="row-meta">{n.body.slice(0, 90)}</div></div>
          </li>
        ))}
      </ul>
      <Btn onClick={async () => { const n = await create('notes', { title: '', body: '', subjectId: s.id, tags: [] }); wm.open('notes', { noteId: n.id }); }}>+ Apunte</Btn>
    </div>
  );
}

export function SubjectIcon({ s, big }: { s: Subject; big?: boolean }) {
  const def = s.icon ? stickerById(s.icon) : undefined;
  if (!def) return <Dot color={s.color} size={big ? 14 : 10} />;
  return <span className="subject-icon" style={{ background: s.color }}><Pixel sprite={def.rows} scale={big ? 2 : 1} /></span>;
}

function StickerPicker({ value, onChange }: { value?: string; onChange: (id: string | undefined) => void }) {
  const unlocked = useUnlocked();
  return (
    <div className="sticker-picker">
      <button className={`swatch-sticker ${!value ? 'on' : ''}`} onClick={() => onChange(undefined)} aria-label="Sin sticker">∅</button>
      {STICKERS.filter((x) => unlocked.has(x.id)).map((x) => (
        <button key={x.id} className={`swatch-sticker ${value === x.id ? 'on' : ''}`} onClick={() => onChange(x.id)} title={x.name}>
          <Pixel sprite={x.rows} scale={2} />
        </button>
      ))}
      <span className="hint">Desbloquea más en el álbum de Stickers.</span>
    </div>
  );
}
