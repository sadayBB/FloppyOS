import { useEffect, useState } from 'react';
import { create, newId, patch, remove, useRows, useSubjects, type ID, type Priority, type Task, type TaskStatus } from '../db';
import { addDays, fmtDur, relDay, today } from '../lib/dates';
import { isOpen, PRIORITY, TASK_STATUS } from '../lib/labels';
import { parseCapture } from '../lib/parse';
import { Btn, Chip, Dot, Empty, Field, Input, LazyInput, Progress, Select, SubjectSelect } from '../os/ui';
import { useWM } from '../os/wm';

type Filter = 'today' | 'week' | 'overdue' | 'nodate' | 'open' | 'done';
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'today', label: 'Hoy' },
  { id: 'week', label: 'Próximos 7 días' },
  { id: 'overdue', label: 'Vencidas' },
  { id: 'nodate', label: 'Sin fecha' },
  { id: 'open', label: 'Todas pendientes' },
  { id: 'done', label: 'Completadas' },
];

export function matchFilter(t: Task, f: Filter) {
  const d = today();
  const open = isOpen(t.status);
  switch (f) {
    case 'today': return open && !!t.due && t.due <= d;
    case 'week': return open && !!t.due && t.due >= d && t.due <= addDays(d, 6);
    case 'overdue': return open && !!t.due && t.due < d;
    case 'nodate': return open && !t.due;
    case 'open': return open;
    case 'done': return !open;
  }
}

export async function toggleDone(t: Task) {
  const done = t.status !== 'completada';
  await patch('tasks', t.id, { status: done ? 'completada' : 'pendiente', completedAt: done ? Date.now() : undefined });
  // Recurring tasks would spawn the next occurrence here (RF-45) once recurrence is added.
}

export default function Tasks({ filter: initFilter, taskId }: { filter?: Filter; taskId?: ID }) {
  const tasks = useRows('tasks');
  const { subjects } = useSubjects();
  const [filter, setFilter] = useState<Filter>(initFilter ?? 'open');
  const [subject, setSubject] = useState<ID | undefined>();
  const [selId, setSelId] = useState<ID | undefined>(taskId);
  const [quick, setQuick] = useState('');

  useEffect(() => { if (initFilter) setFilter(initFilter); }, [initFilter]);
  useEffect(() => { if (taskId) setSelId(taskId); }, [taskId]);

  const list = tasks
    .filter((t) => matchFilter(t, filter) && (!subject || t.subjectId === subject))
    .sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999') || b.priority - a.priority);
  const sel = tasks.find((t) => t.id === selId);
  const subOf = (id?: ID) => subjects.find((s) => s.id === id);

  const addQuick = async () => {
    if (!quick.trim()) return;
    const p = parseCapture(quick, subjects);
    setQuick('');
    const t = await create('tasks', { title: p.text, subjectId: p.subjectId ?? subject, status: p.due ? 'programada' : 'pendiente', priority: p.priority ?? 2, due: p.due, dueTime: p.dueTime, estimateMin: p.estimateMin, tags: p.tags, subtasks: [] });
    setSelId(t.id);
  };

  return (
    <div className={`app split ${sel ? 'has-detail' : ''}`}>
      <aside className="sidebar">
        {FILTERS.map((f) => (
          <button key={f.id} className={`side-item ${filter === f.id ? 'on' : ''}`} onClick={() => setFilter(f.id)}>
            {f.label}
            <span className="count">{tasks.filter((t) => matchFilter(t, f.id)).length || ''}</span>
          </button>
        ))}
        <hr />
        <SubjectSelect subjects={subjects} value={subject} onChange={setSubject} none="Todas las materias" />
      </aside>

      <div className="pane list-pane">
        <form className="capture" onSubmit={(e) => { e.preventDefault(); void addQuick(); }}>
          <input className="input" value={quick} onChange={(e) => setQuick(e.target.value)} placeholder="Nueva tarea… (acepta @materia, fechas y duración)" aria-label="Nueva tarea" />
          <Btn type="submit">Agregar</Btn>
        </form>
        <div className="scroll">
          {list.length === 0 ? <Empty>No hay tareas en esta vista.</Empty> : (
            <ul className="rows">
              {list.map((t) => {
                const s = subOf(t.subjectId);
                const done = t.subtasks.filter((x) => x.done).length;
                const late = isOpen(t.status) && t.due && t.due < today();
                return (
                  <li key={t.id} className={`row clickable ${t.id === selId ? 'sel' : ''} ${!isOpen(t.status) ? 'done' : ''}`} onClick={() => setSelId(t.id)}>
                    <input type="checkbox" checked={t.status === 'completada'} onClick={(e) => e.stopPropagation()} onChange={() => void toggleDone(t)} aria-label="Completar" />
                    <div className="row-main">
                      <div className="row-title">
                        <span style={{ color: PRIORITY[t.priority].color }} className="prio">{PRIORITY[t.priority].mark}</span> {t.title}
                      </div>
                      <div className="row-meta">
                        {s && <Chip color={s.color}>{s.name}</Chip>}
                        {t.due && <span className={late ? 'late' : ''}>{relDay(t.due)}{t.dueTime ? ` ${t.dueTime}` : ''}</span>}
                        {t.estimateMin ? <span>⏱ {fmtDur(t.estimateMin)}</span> : null}
                        {t.subtasks.length > 0 && <span>{done}/{t.subtasks.length} pasos</span>}
                        {t.status === 'bloqueada' && <Chip color="#cf6b5e">bloqueada</Chip>}
                        {t.status === 'en_progreso' && <Chip color="#6fae9f">en progreso</Chip>}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {sel && <TaskDetail key={sel.id} task={sel} tasks={tasks} onClose={() => setSelId(undefined)} />}
    </div>
  );
}

function TaskDetail({ task: t, tasks, onClose }: { task: Task; tasks: Task[]; onClose: () => void }) {
  const { subjects } = useSubjects();
  const wm = useWM();
  const [step, setStep] = useState('');
  const set = (c: Partial<Task>) => void patch('tasks', t.id, c);
  const dep = tasks.find((x) => x.id === t.dependsOn);
  const doneSteps = t.subtasks.filter((s) => s.done).length;

  return (
    <div className="pane detail">
      <div className="detail-head">
        <Btn small onClick={onClose}>← Volver</Btn>
        <span className="grow" />
        <Btn small onClick={() => wm.open('timer', { taskId: t.id, subjectId: t.subjectId })}>▶ Estudiar</Btn>
        <Btn small onClick={async () => {
          const { id: _i, createdAt: _c, updatedAt: _u, ...rest } = t;
          await create('tasks', { ...rest, title: `${t.title} (copia)`, status: 'pendiente', completedAt: undefined, subtasks: t.subtasks.map((s) => ({ ...s, id: newId(), done: false })) });
        }}>Duplicar</Btn>
        <Btn small onClick={() => { void remove('tasks', t.id); onClose(); }}>Eliminar</Btn>
      </div>
      <div className="scroll form">
        <Field label="Título" wide><LazyInput value={t.title} onCommit={(v) => set({ title: v })} /></Field>
        <Field label="Materia"><SubjectSelect subjects={subjects} value={t.subjectId} onChange={(id) => set({ subjectId: id })} /></Field>
        <Field label="Estado">
          <Select value={t.status} onChange={(e) => set({ status: e.target.value as TaskStatus, completedAt: e.target.value === 'completada' ? Date.now() : undefined })}>
            {TASK_STATUS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </Select>
        </Field>
        <Field label="Fecha límite"><Input type="date" value={t.due ?? ''} onChange={(e) => set({ due: e.target.value || undefined })} /></Field>
        <Field label="Hora"><Input type="time" value={t.dueTime ?? ''} onChange={(e) => set({ dueTime: e.target.value || undefined })} /></Field>
        <Field label="Prioridad">
          <Select value={t.priority} onChange={(e) => set({ priority: +e.target.value as Priority })}>
            {([1, 2, 3, 4] as Priority[]).map((p) => <option key={p} value={p}>{PRIORITY[p].label}</option>)}
          </Select>
        </Field>
        <Field label="Estimado (min)"><LazyInput type="number" min={0} value={String(t.estimateMin ?? '')} onCommit={(v) => set({ estimateMin: v ? +v : undefined })} /></Field>
        <Field label="Tiempo real">
          <span className="static">{t.spentMin ? fmtDur(t.spentMin) : '—'}{t.estimateMin && t.spentMin ? ` (${Math.round((t.spentMin / t.estimateMin) * 100)}% del estimado)` : ''}</span>
        </Field>
        <Field label="Depende de">
          <Select value={t.dependsOn ?? ''} onChange={(e) => set({ dependsOn: e.target.value || undefined })}>
            <option value="">Ninguna</option>
            {tasks.filter((x) => x.id !== t.id && isOpen(x.status)).map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
          </Select>
        </Field>
        {dep && isOpen(dep.status) && <div className="warn wide">⚠ Requiere terminar antes «{dep.title}».</div>}
        <Field label="Etiquetas" wide>
          <LazyInput value={t.tags.join(', ')} placeholder="examen, práctica…" onCommit={(v) => set({ tags: v.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean) })} />
        </Field>
        <Field label="Descripción" wide><LazyInput multiline value={t.description ?? ''} onCommit={(v) => set({ description: v })} /></Field>

        <div className="wide">
          <div className="section-title">Pasos {t.subtasks.length > 0 && `(${doneSteps}/${t.subtasks.length})`}</div>
          {t.subtasks.length > 0 && <Progress value={doneSteps / t.subtasks.length} />}
          <ul className="subtasks">
            {t.subtasks.map((s) => (
              <li key={s.id}>
                <input type="checkbox" checked={s.done} onChange={() => set({ subtasks: t.subtasks.map((x) => (x.id === s.id ? { ...x, done: !x.done } : x)) })} />
                <span className={s.done ? 'strike' : ''}>{s.title}</span>
                <button className="link muted" aria-label="Quitar paso" onClick={() => set({ subtasks: t.subtasks.filter((x) => x.id !== s.id) })}>×</button>
              </li>
            ))}
          </ul>
          <form className="capture" onSubmit={(e) => { e.preventDefault(); if (step.trim()) { set({ subtasks: [...t.subtasks, { id: newId(), title: step.trim(), done: false }] }); setStep(''); } }}>
            <input className="input" value={step} onChange={(e) => setStep(e.target.value)} placeholder="Agregar paso…" />
            <Btn small type="submit">+</Btn>
          </form>
        </div>
        {t.subjectId && <div className="wide"><Dot color={subjects.find((s) => s.id === t.subjectId)?.color ?? '#999'} /> Creada {new Date(t.createdAt).toLocaleDateString()}</div>}
      </div>
    </div>
  );
}
