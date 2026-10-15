import { useEffect, useState } from 'react';
import { create, patch, remove, SUBJECT_COLORS, useActiveSemester, useRows, useSubjects, type ID, type SemesterStatus, type Slot, type SlotKind, type Subject } from '../db';
import { addMonths, DAYS, fmtDate, relDay, today, toISO, WEEK_ORDER } from '../lib/dates';
import { isOpen, SLOT_KIND, topicRank } from '../lib/labels';
import { KIND_COLOR, KIND_LABEL } from '../lib/parse';
import { Btn, Chip, Dot, Empty, Field, Input, LazyInput, Modal, Select, Tabs } from '../os/ui';
import { useWM } from '../os/wm';
import { ContextMenu } from '../os/ContextMenu';
import { Pixel } from '../pixel/Pixel';
import { STICKERS, stickerById } from '../pixel/stickers';
import { StickerView, useCustom, useUnlocked } from '../lib/stickers';
import { Syllabus } from './Syllabus';
import { toggleDone } from './Tasks';
import { stickerToIcon, SubjectIcon } from './SubjectIcon';
import { GradesTab } from './Grades';
import { Bibliography } from './Bibliography';
import { askConfirm } from '../os/dialogs';
import { useWindowStatus } from '../os/status';

type Tab = 'info' | 'horario' | 'temario' | 'tareas' | 'clases' | 'notas' | 'calif' | 'biblio';

export default function Subjects({ subjectId, tab: initTab }: { subjectId?: ID; tab?: Tab }) {
  const { semesters, active, setActiveId } = useActiveSemester();
  const { subjects } = useSubjects();
  const [selId, setSelId] = useState<ID | undefined>(subjectId);
  const [tab, setTab] = useState<Tab>(initTab ?? 'temario');
  const [semModal, setSemModal] = useState<'new' | 'edit' | null>(null);

  useEffect(() => { if (subjectId) setSelId(subjectId); }, [subjectId]);
  const [props, setProps] = useState<{ id: ID; tab: 'general' | 'horario' } | null>(null);
  const [ctx, setCtx] = useState<{ x: number; y: number; id: ID } | null>(null);
  useEffect(() => {
    if (!initTab) return;
    // «Datos» and «Horario» now live in the Properties dialog.
    if ((initTab === 'info' || initTab === 'horario') && subjectId) {
      setProps({ id: subjectId, tab: initTab === 'info' ? 'general' : 'horario' });
      setTab('temario');
    } else setTab(initTab);
  }, [initTab, subjectId]);

  const sel = subjects.find((s) => s.id === selId);
  const allTopics = useRows('topics');
  const selTopics = sel ? allTopics.filter((t) => t.subjectId === sel.id) : [];
  useWindowStatus([`${subjects.length} materia${subjects.length === 1 ? '' : 's'}`, sel ? `${selTopics.length} temas` : null, sel && selTopics.length ? `${Math.round((selTopics.filter((t) => topicRank(t.status) >= topicRank('estudiado')).length / selTopics.length) * 100)}% estudiado` : null]);

  const addSubject = async () => {
    if (!active) return setSemModal('new');
    const s = await create('subjects', { semesterId: active.id, name: 'Nueva materia', color: SUBJECT_COLORS[subjects.length % SUBJECT_COLORS.length] });
    setSelId(s.id);
    setProps({ id: s.id, tab: 'general' });
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
          <button key={s.id} className={`side-item ${s.id === selId ? 'on' : ''}`} onClick={() => setSelId(s.id)} onContextMenu={(e) => { e.preventDefault(); setCtx({ x: e.clientX, y: e.clientY, id: s.id }); }}>
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
              {sel.professor ? <span className="prof">👩‍🏫 {sel.professor}</span> : <button className="link muted" onClick={() => setProps({ id: sel.id, tab: 'general' })}>+ profesor/a</button>}
              <span className="grow" />
              <Btn small onClick={() => setProps({ id: sel.id, tab: 'general' })}>Propiedades…</Btn>
            </div>
            <Tabs<Tab>
              value={tab}
              onChange={setTab}
              tabs={[
                { id: 'temario', label: 'Temario' },
                { id: 'calif', label: 'Calificación' },
                { id: 'biblio', label: 'Bibliografía' },
                { id: 'clases', label: 'Clase' },
                { id: 'tareas', label: 'Tareas' },
                { id: 'notas', label: 'Apuntes' },
              ]}
            />
            <div className="scroll tab-body">
              {tab === 'temario' && <Syllabus subject={sel} />}
              {tab === 'tareas' && <SubjectTasks s={sel} />}
              {tab === 'clases' && <ClassLog s={sel} />}
              {tab === 'notas' && <SubjectNotes s={sel} />}
              {tab === 'calif' && <GradesTab s={sel} />}
              {tab === 'biblio' && <Bibliography subject={sel} />}
            </div>
          </>
        )}
      </div>
      {semModal && <SemesterModal mode={semModal} onClose={() => setSemModal(null)} onCreated={(id) => setActiveId(id)} />}
      {props && subjects.find((x) => x.id === props.id) && (
        <SubjectProperties s={subjects.find((x) => x.id === props.id)!} tab={props.tab} onTab={(t) => setProps({ ...props, tab: t })} onClose={() => setProps(null)} onDeleted={() => { setProps(null); setSelId(undefined); }} />
      )}
      {ctx && (
        <ContextMenu x={ctx.x} y={ctx.y} onClose={() => setCtx(null)} items={[
          { label: 'Abrir', onClick: () => setSelId(ctx.id) },
          { label: 'Horario…', onClick: () => setProps({ id: ctx.id, tab: 'horario' }) },
          { label: '', separator: true },
          { label: 'Propiedades', onClick: () => setProps({ id: ctx.id, tab: 'general' }) },
        ]} />
      )}
    </div>
  );
}

/** Windows-style Properties dialog: general data and weekly schedule. Changes save as you type. */
function SubjectProperties({ s, tab, onTab, onClose, onDeleted }: { s: Subject; tab: 'general' | 'horario'; onTab: (t: 'general' | 'horario') => void; onClose: () => void; onDeleted: () => void }) {
  return (
    <Modal title={`Propiedades de ${s.name}`} onClose={onClose} footer={<Btn primary onClick={onClose}>Aceptar</Btn>}>
      <Tabs<'general' | 'horario'> value={tab} onChange={onTab} tabs={[{ id: 'general', label: 'General' }, { id: 'horario', label: 'Horario' }]} />
      <div className="tab-body props-body">
        {tab === 'general' ? <SubjectInfo s={s} onDeleted={onDeleted} /> : <Schedule s={s} />}
      </div>
    </Modal>
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
        <StickerPicker s={s} onChange={set} />
      </Field>
      <Field label="Descripción" wide><LazyInput multiline value={s.description ?? ''} onCommit={(v) => set({ description: v })} /></Field>
      <div className="wide">
        <Btn onClick={async () => { if (await askConfirm(`¿Eliminar «${s.name}»?`, { ...{ title: 'Confirmar eliminación', danger: true, ok: 'Sí', cancel: 'No' }, detail: 'Sus tareas y apuntes se conservan sin materia.' })) { void remove('subjects', s.id); onDeleted(); } }}>Eliminar materia</Btn>
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
  const [summaryDay, setSummaryDay] = useState<string | null>(null);
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
          <div className="section-title day-head">{fmtDate(day)} <button className="link" onClick={() => setSummaryDay(day)}>📄 Resumen</button></div>
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
      {summaryDay && <ClassSummary s={s} day={summaryDay} onClose={() => setSummaryDay(null)} />}
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

function StickerPicker({ s, onChange }: { s: Subject; onChange: (c: Partial<Subject>) => void }) {
  const unlocked = useUnlocked();
  const [custom] = useCustom();
  const [busy, setBusy] = useState(false);
  const none = !s.icon && !s.iconImage;
  const pickCustom = async (blob: Blob) => {
    setBusy(true);
    try {
      onChange({ icon: undefined, iconImage: await stickerToIcon(blob) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="sticker-picker">
      <button className={`swatch-sticker ${none ? 'on' : ''}`} onClick={() => onChange({ icon: undefined, iconImage: undefined })} aria-label="Sin sticker">∅</button>
      {STICKERS.filter((x) => unlocked.has(x.id)).map((x) => (
        <button key={x.id} className={`swatch-sticker ${s.icon === x.id && !s.iconImage ? 'on' : ''}`} onClick={() => onChange({ icon: x.id, iconImage: undefined })} title={x.name}>
          <Pixel sprite={x.rows} scale={2} />
        </button>
      ))}
      {custom.map((c) => (
        <button key={c.id} className="swatch-sticker" disabled={busy} onClick={() => void pickCustom(c.blob)} title={`${c.name} (tuyo)`}>
          <StickerView sid={`custom:${c.id}`} size={34} custom={custom} />
        </button>
      ))}
      {s.iconImage && <span className="swatch-sticker on" title="Sticker propio elegido"><img src={s.iconImage} alt="" width={34} height={34} style={{ imageRendering: 'pixelated' }} /></span>}
      <span className="hint">{custom.length ? 'Incluye tus stickers subidos.' : 'Sube tus propios stickers en el álbum de Stickers.'}</span>
    </div>
  );
}

/** Day summary built from what was registered (RF-36), no AI: concepts, questions, notes, tasks, topics. */
function ClassSummary({ s, day, onClose }: { s: Subject; day: string; onClose: () => void }) {
  const inbox = useRows('inbox').filter((i) => i.subjectId === s.id && toISO(new Date(i.createdAt)) === day);
  const tasks = useRows('tasks').filter((t) => t.subjectId === s.id && toISO(new Date(t.createdAt)) === day);
  const topics = useRows('topics').filter((t) => t.subjectId === s.id && t.statusChangedAt && toISO(new Date(t.statusChangedAt)) === day);
  const [saved, setSaved] = useState(false);
  const sections: [string, string[]][] = [
    ['Temas vistos', topics.map((t) => t.title)],
    ['Conceptos clave', inbox.filter((i) => i.kind === 'palabra').map((i) => i.text)],
    ['Dudas', inbox.filter((i) => i.kind === 'duda').map((i) => `${i.text}${i.resolved ? ' (resuelta)' : ''}`)],
    ['Notas', inbox.filter((i) => i.kind === 'nota' || i.kind === 'idea').map((i) => i.text)],
    ['Tareas que surgieron', tasks.map((t) => `${t.title}${t.due ? ` (para ${fmtDate(t.due)})` : ''}`)],
  ];
  const text = `Clase de ${s.name} — ${fmtDate(day)}\n\n` + sections.map(([h, xs]) => `${h}:\n${xs.length ? xs.map((x) => `• ${x}`).join('\n') : '—'}`).join('\n\n');
  return (
    <Modal title={`Resumen de la clase · ${fmtDate(day)}`} onClose={onClose} footer={<><Btn onClick={onClose}>Cerrar</Btn><Btn primary disabled={saved} onClick={async () => { await create('notes', { title: `Clase ${fmtDate(day)} — ${s.name}`, body: text, subjectId: s.id, tags: ['clase'] }); setSaved(true); }}>{saved ? '✓ Guardado en Apuntes' : 'Guardar como apunte'}</Btn></>}>
      {sections.map(([h, xs]) => (
        <div key={h} className="sum-section">
          <div className="section-title">{h}</div>
          {xs.length ? <ul className="plain">{xs.map((x, i) => <li key={i}>• {x}</li>)}</ul> : <p className="hint">—</p>}
        </div>
      ))}
      <p className="hint">Armado con lo que registraste ese día (palabras clave, dudas, notas, tareas y temas que cambiaron de estado).</p>
    </Modal>
  );
}
