import { useEffect, useRef, useState, type ReactNode } from 'react';
import { create, newId, patch, remove, useRows, useSubjects, type ID, type Priority, type Recurrence, type Task, type TaskStatus } from '../db';
import { addDays, fmtDur, relDay, today, toISO } from '../lib/dates';
import { isOpen, PRIORITY, TASK_STATUS } from '../lib/labels';
import { parseCapture } from '../lib/parse';
import { Btn, Chip, Dot, Empty, Field, Input, LazyInput, Progress, Select, SubjectSelect } from '../os/ui';
import { useWM } from '../os/wm';
import { REMINDER_OPTIONS, ReminderPicker } from '../os/ReminderPicker';
import { AiBadge, AiButton, useAiAction, useAiEnabled } from '../os/Ai';
import { CopyForClaude, parseListLines } from '../os/CopyForClaude';
import { TASK_TEMPLATES } from '../lib/taskTemplates';
import { suggestSubtasks } from '../lib/aiFeatures';
import { useWindowStatus } from '../os/status';

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

export function nextDue(from: string, r: Recurrence) {
  const n = Math.max(1, r.interval || 1);
  return r.freq === 'daily' ? addDays(from, n) : r.freq === 'weekly' ? addDays(from, 7 * n) : addMonthsKeepDay(from, n);
}
function addMonthsKeepDay(s: string, n: number) {
  const [y, m, d] = s.split('-').map(Number);
  const last = new Date(y, m - 1 + n + 1, 0).getDate();
  const dt = new Date(y, m - 1 + n, Math.min(d, last));
  return toISO(dt);
}

export async function toggleDone(t: Task) {
  const done = t.status !== 'completada';
  await patch('tasks', t.id, { status: done ? 'completada' : 'pendiente', completedAt: done ? Date.now() : undefined });
  // Recurring: completing spawns the next occurrence, once (RF-45).
  if (done && t.recurrence && !t.nextSpawned) {
    const due = nextDue(t.due && t.due > today() ? t.due : t.due ?? today(), t.recurrence);
    const { id: _i, createdAt: _c, updatedAt: _u, completedAt: _d, deletedAt: _x, spentMin: _s, ...rest } = t;
    await create('tasks', { ...rest, status: 'programada', due, subtasks: t.subtasks.map((st) => ({ ...st, id: newId(), done: false })) });
    await patch('tasks', t.id, { nextSpawned: true });
  }
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
  const openCount = tasks.filter((t) => isOpen(t.status)).length;
  const lateCount = tasks.filter((t) => matchFilter(t, 'overdue')).length;
  useWindowStatus([`${list.length} en esta vista`, `${openCount} pendientes`, lateCount > 0 && `${lateCount} vencida${lateCount > 1 ? 's' : ''}`]);
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
  const projects = useRows('projects');
  const wm = useWM();
  const [step, setStep] = useState('');
  const ai = useAiAction<{ pasos: string[]; explicacion: string }>();
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const aiOn = useAiEnabled();
  const set = (c: Partial<Task>) => void patch('tasks', t.id, c);
  const dep = tasks.find((x) => x.id === t.dependsOn);
  const doneSteps = t.subtasks.filter((s) => s.done).length;

  const subject = subjects.find((s) => s.id === t.subjectId);
  const project = projects.find((p) => p.id === t.projectId);
  const statusLabel = TASK_STATUS.find((s) => s.id === t.status)?.label;
  const reminderText = !t.due ? 'sin fecha' : t.reminders === undefined ? 'predeterminados' : t.reminders.length ? t.reminders.map((m) => REMINDER_OPTIONS.find((o) => o.min === m)?.label ?? `${m} min`).join(', ') : 'ninguno';
  const repeatText = t.recurrence ? `${t.recurrence.interval > 1 ? `cada ${t.recurrence.interval} ` : ''}${t.recurrence.freq === 'daily' ? (t.recurrence.interval > 1 ? 'días' : 'diario') : t.recurrence.freq === 'weekly' ? (t.recurrence.interval > 1 ? 'semanas' : 'semanal') : t.recurrence.interval > 1 ? 'meses' : 'mensual'}` : null;

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
      <div className="scroll task-sheet">
        <div className="task-title-row">
          <input type="checkbox" className="big-check" checked={t.status === 'completada'} onChange={() => void toggleDone(t)} aria-label="Completar tarea" />
          <LazyInput className="input task-title-input" value={t.title} onCommit={(v) => set({ title: v || t.title })} aria-label="Título" />
        </div>

        <DescriptionBox value={t.description ?? ''} onSave={(description) => set({ description })} />

        <div className="task-essentials">
          <Field label="Materia"><SubjectSelect subjects={subjects} value={t.subjectId} onChange={(id) => set({ subjectId: id })} /></Field>
          <Field label="Fecha límite">
            <div className="date-time">
              <Input type="date" value={t.due ?? ''} onChange={(e) => set({ due: e.target.value || undefined })} />
              {t.due && <Input type="time" value={t.dueTime ?? ''} onChange={(e) => set({ dueTime: e.target.value || undefined })} aria-label="Hora" />}
            </div>
          </Field>
          <Field label="Prioridad">
            <div className="prio-pick" role="radiogroup" aria-label="Prioridad">
              {([1, 2, 3, 4] as Priority[]).map((p) => (
                <button key={p} role="radio" aria-checked={t.priority === p} className={t.priority === p ? 'on' : ''} style={{ ['--pc' as string]: PRIORITY[p].color }} onClick={() => set({ priority: p })}>{PRIORITY[p].label}</button>
              ))}
            </div>
          </Field>
        </div>
        {dep && isOpen(dep.status) && <div className="warn">⚠ Requiere terminar antes «{dep.title}».</div>}

        <Section id="steps" title={`Pasos${t.subtasks.length ? ` (${doneSteps}/${t.subtasks.length})` : ''}`} summary={t.subtasks.length ? null : 'divide la tarea en partes'} defaultOpen>
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
            <input className="input" value={step} onChange={(e) => setStep(e.target.value)} placeholder="Agregar paso y pulsar Enter…" />
            <Btn small type="submit">+</Btn>
          </form>
          <div className="toolbar">
            <Select value="" aria-label="Plantilla de pasos" onChange={(e) => {
              const tpl = TASK_TEMPLATES.find((x) => x.id === e.target.value);
              if (!tpl) return;
              setPicked(new Set(tpl.steps.map((_, i) => i)));
              ai.setResult({ pasos: tpl.steps, explicacion: `Pasos típicos de «${tpl.name}». Quita los que no apliquen.` });
            }}>
              <option value="">Usar plantilla…</option>
              {TASK_TEMPLATES.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </Select>
            <AiButton busy={ai.busy} type="button" onClick={() => void ai.run(async () => {
              const r = await suggestSubtasks(t.title, [t.description, t.subtasks.length ? `Pasos que ya tiene: ${t.subtasks.map((x) => x.title).join('; ')}` : ''].filter(Boolean).join('\n'), subject?.name);
              setPicked(new Set(r.pasos.map((_, i) => i)));
              return r;
            })}>Sugerir pasos</AiButton>
            {!aiOn && (
              <CopyForClaude
                label="Pasos con Claude"
                title="Dividir la tarea con Claude"
                buildPrompt={() => `Divide esta tarea universitaria en 3 a 8 pasos concretos, cortos y accionables, en orden. Responde solo con la lista, un paso por línea.\nTarea: ${t.title}${subject ? `\nMateria: ${subject.name}` : ''}${t.description ? `\nDescripción: ${t.description}` : ''}${t.subtasks.length ? `\nPasos que ya tiene (no los repitas): ${t.subtasks.map((x) => x.title).join('; ')}` : ''}`}
                applyLabel="Revisar pasos"
                pasteHint="Pega la lista de pasos que te dio Claude."
                onApply={(answer) => {
                  const pasos = parseListLines(answer).slice(0, 15);
                  if (!pasos.length) return 'No encontré pasos en la respuesta.';
                  setPicked(new Set(pasos.map((_, i) => i)));
                  ai.setResult({ pasos, explicacion: 'Pasos de tu respuesta de Claude.' });
                }}
              />
            )}
          </div>
          {ai.error && <div className="warn">⚠ {ai.error}</div>}
          {ai.result && (
            <div className="ai-box">
              <div>{ai.result.explicacion.startsWith('Pasos') ? null : <AiBadge />} <span className="hint">{ai.result.explicacion}</span></div>
              {ai.result.pasos.map((p, i) => (
                <label key={i} className="check">
                  <input type="checkbox" checked={picked.has(i)} onChange={() => setPicked((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n; })} />
                  {p}
                </label>
              ))}
              <div className="row-btns">
                <Btn small primary onClick={() => { set({ subtasks: [...t.subtasks, ...ai.result!.pasos.filter((_, i) => picked.has(i)).map((title) => ({ id: newId(), title, done: false }))] }); ai.setResult(null); }}>Agregar seleccionados</Btn>
                <Btn small onClick={() => ai.setResult(null)}>Descartar</Btn>
              </div>
            </div>
          )}
        </Section>

        <Section id="reminders" title="Avisos y repetición" summary={[`avisos: ${reminderText}`, repeatText && `se repite ${repeatText}`].filter(Boolean).join(' · ')}>
          <Field label="Recordatorios" wide><ReminderPicker value={t.reminders} onChange={(reminders) => set({ reminders })} disabled={!t.due} /></Field>
          <div className="form">
            <Field label="Repetir">
              <Select value={t.recurrence?.freq ?? ''} onChange={(e) => set({ recurrence: e.target.value ? { freq: e.target.value as Recurrence['freq'], interval: t.recurrence?.interval ?? 1 } : undefined, nextSpawned: false })}>
                <option value="">No se repite</option>
                <option value="daily">Diario</option>
                <option value="weekly">Semanal</option>
                <option value="monthly">Mensual</option>
              </Select>
            </Field>
            {t.recurrence && (
              <Field label={`Cada cuántos ${t.recurrence.freq === 'daily' ? 'días' : t.recurrence.freq === 'weekly' ? 'semanas' : 'meses'}`}>
                <Input type="number" min={1} value={t.recurrence.interval} onChange={(e) => set({ recurrence: { ...t.recurrence!, interval: Math.max(1, +e.target.value || 1) } })} />
              </Field>
            )}
          </div>
        </Section>

        <Section id="time" title="Tiempo" summary={[t.estimateMin ? `estimado ${fmtDur(t.estimateMin)}` : 'sin estimado', t.spentMin ? `llevas ${fmtDur(t.spentMin)}` : null].filter(Boolean).join(' · ')}>
          <div className="form">
            <Field label="Estimado (min)"><LazyInput type="number" min={0} value={String(t.estimateMin ?? '')} onCommit={(v) => set({ estimateMin: v ? +v : undefined })} /></Field>
            <Field label="Tiempo real">
              <span className="static">{t.spentMin ? fmtDur(t.spentMin) : '—'}{t.estimateMin && t.spentMin ? ` (${Math.round((t.spentMin / t.estimateMin) * 100)}% del estimado)` : ''}</span>
            </Field>
          </div>
        </Section>

        <Section id="org" title="Organización" summary={[t.status !== 'pendiente' && statusLabel, project && `proyecto: ${project.title}`, dep && `depende de: ${dep.title}`, t.tags.length > 0 && t.tags.map((x) => `#${x}`).join(' ')].filter(Boolean).join(' · ') || 'estado, proyecto, dependencias, etiquetas'}>
          <div className="form">
            <Field label="Estado">
              <Select value={t.status} onChange={(e) => set({ status: e.target.value as TaskStatus, completedAt: e.target.value === 'completada' ? Date.now() : undefined })}>
                {TASK_STATUS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </Select>
            </Field>
            <Field label="Proyecto">
              <Select value={t.projectId ?? ''} onChange={(e) => set({ projectId: e.target.value || undefined })}>
                <option value="">Ninguno</option>
                {projects.filter((p) => p.status === 'activo' || p.id === t.projectId).map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
              </Select>
            </Field>
            <Field label="Depende de">
              <Select value={t.dependsOn ?? ''} onChange={(e) => set({ dependsOn: e.target.value || undefined })}>
                <option value="">Ninguna</option>
                {tasks.filter((x) => x.id !== t.id && isOpen(x.status)).map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
              </Select>
            </Field>
            <Field label="Etiquetas">
              <LazyInput value={t.tags.join(', ')} placeholder="examen, práctica…" onCommit={(v) => set({ tags: v.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean) })} />
            </Field>
          </div>
        </Section>
        <p className="hint">Creada el {new Date(t.createdAt).toLocaleDateString()}</p>
      </div>
    </div>
  );
}

/** Collapsible group of optional fields; closed it shows what is already set. Remembers its state. */
function Section({ id, title, summary, defaultOpen, children }: { id: string; title: string; summary?: string | null; defaultOpen?: boolean; children: ReactNode }) {
  const key = `floppyos.taskSection.${id}`;
  const [open, setOpen] = useState(() => {
    try {
      const v = localStorage.getItem(key);
      return v === null ? !!defaultOpen : v === '1';
    } catch {
      return !!defaultOpen;
    }
  });
  const toggle = () => {
    setOpen(!open);
    try {
      localStorage.setItem(key, open ? '0' : '1');
    } catch {
      /* ignore */
    }
  };
  return (
    <section className={`task-section ${open ? 'open' : ''}`}>
      <button className="task-section-head" aria-expanded={open} onClick={toggle}>
        <span className="caret">{open ? '▾' : '▸'}</span>
        <b>{title}</b>
        {!open && summary && <span className="hint ellipsis">{summary}</span>}
      </button>
      {open && <div className="task-section-body">{children}</div>}
    </section>
  );
}

/** Big description area, saved while typing (debounced) and on blur. */
function DescriptionBox({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(value);
  const timer = useRef<number>();
  useEffect(() => setV(value), [value]);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <textarea
      className="input task-description"
      value={v}
      aria-label="Descripción"
      placeholder="¿Qué hay que hacer? Instrucciones del profe, enlaces, criterios de entrega…"
      onChange={(e) => {
        setV(e.target.value);
        clearTimeout(timer.current);
        const next = e.target.value;
        timer.current = window.setTimeout(() => onSave(next), 700);
      }}
      onBlur={() => {
        clearTimeout(timer.current);
        if (v !== value) onSave(v);
      }}
    />
  );
}
