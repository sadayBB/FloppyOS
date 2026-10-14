import { useEffect, useState } from 'react';
import { create, newId, patch, remove, useRows, useSubjects, type ID, type Project, type ProjectLog, type Task, type TaskStatus } from '../db';
import { fmtDate, relDay, today } from '../lib/dates';
import { isOpen, TASK_STATUS } from '../lib/labels';
import { Btn, Chip, Empty, Field, Input, LazyInput, Progress, Select, SubjectSelect, Tabs } from '../os/ui';
import { useWM } from '../os/wm';
import { toggleDone } from './Tasks';
import { safeUrl } from '../lib/safeUrl';

type Tab = 'resumen' | 'tablero' | 'entrega' | 'bitacora';
const BOARD: TaskStatus[] = ['pendiente', 'en_progreso', 'bloqueada', 'completada'];
const LOG_KIND: Record<ProjectLog['kind'], string> = { avance: 'Avance', reunion: 'Reunión', decision: 'Decisión', incidencia: 'Problema' };

export function projectProgress(p: Project, tasks: Task[]) {
  const ts = tasks.filter((t) => t.projectId === p.id && t.status !== 'cancelada');
  const parts = [...ts.map((t) => t.status === 'completada'), ...p.milestones.map((m) => m.done), ...p.checklist.map((c) => c.done)];
  return { done: parts.filter(Boolean).length, total: parts.length, value: parts.length ? parts.filter(Boolean).length / parts.length : 0, tasks: ts };
}

/** Academic projects: phases, board, deliverables checklist, links and a log (RF-63..71). */
export default function Projects({ projectId }: { projectId?: ID }) {
  const projects = useRows('projects');
  const tasks = useRows('tasks');
  const { subjects } = useSubjects();
  const [selId, setSelId] = useState<ID | undefined>(projectId);
  const [showDone, setShowDone] = useState(false);
  useEffect(() => { if (projectId) setSelId(projectId); }, [projectId]);

  const list = projects.filter((p) => showDone || p.status === 'activo' || p.status === 'pausado').sort((a, b) => (a.due ?? '9').localeCompare(b.due ?? '9'));
  const sel = projects.find((p) => p.id === selId);

  const add = async () => {
    const p = await create('projects', { title: 'Nuevo proyecto', members: [], status: 'activo', milestones: [], checklist: [], links: [], log: [], start: today() });
    setSelId(p.id);
  };

  return (
    <div className={`app split ${sel ? 'has-detail' : ''}`}>
      <aside className="sidebar">
        <Btn primary onClick={() => void add()}>+ Proyecto</Btn>
        {list.map((p) => {
          const pr = projectProgress(p, tasks);
          return (
            <button key={p.id} className={`side-item proj-item ${p.id === selId ? 'on' : ''}`} onClick={() => setSelId(p.id)}>
              <span className="ellipsis">{p.title}</span>
              <span className="hint">{p.due ? relDay(p.due) : 'sin fecha'} · {Math.round(pr.value * 100)}%</span>
            </button>
          );
        })}
        {!list.length && <Empty>Sin proyectos activos.</Empty>}
        <label className="check"><input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /> Ver entregados</label>
      </aside>
      <div className="pane detail">
        {sel ? <ProjectView key={sel.id} p={sel} tasks={tasks} subjects={subjects} onBack={() => setSelId(undefined)} /> : <Empty>Elige o crea un proyecto.</Empty>}
      </div>
    </div>
  );
}

function ProjectView({ p, tasks, subjects, onBack }: { p: Project; tasks: Task[]; subjects: ReturnType<typeof useSubjects>['subjects']; onBack: () => void }) {
  const [tab, setTab] = useState<Tab>('resumen');
  const wm = useWM();
  const set = (c: Partial<Project>) => void patch('projects', p.id, c);
  const pr = projectProgress(p, tasks);
  const [newTask, setNewTask] = useState('');
  const [text, setText] = useState('');

  const addTask = async (status: TaskStatus = 'pendiente') => {
    if (!newTask.trim()) return;
    const title = newTask.trim();
    setNewTask('');
    await create('tasks', { title, projectId: p.id, subjectId: p.subjectId, status, priority: 2, tags: [], subtasks: [] });
  };

  return (
    <>
      <div className="detail-head">
        <Btn small className="only-compact" onClick={onBack}>←</Btn>
        <input className="input title-input" value={p.title} onChange={(e) => set({ title: e.target.value })} aria-label="Nombre del proyecto" />
        <Select value={p.status} onChange={(e) => set({ status: e.target.value as Project['status'] })} aria-label="Estado">
          <option value="activo">Activo</option>
          <option value="pausado">Pausado</option>
          <option value="entregado">Entregado</option>
          <option value="cancelado">Cancelado</option>
        </Select>
      </div>
      <div className="proj-progress">
        <Progress value={pr.value} />
        <span className="hint">{pr.done}/{pr.total} (tareas, hitos y entregables) · {p.due ? `entrega ${fmtDate(p.due)} (${relDay(p.due)})` : 'sin fecha de entrega'}</span>
      </div>
      <Tabs<Tab> value={tab} onChange={setTab} tabs={[{ id: 'resumen', label: 'Resumen' }, { id: 'tablero', label: 'Tareas', count: pr.tasks.filter((t) => isOpen(t.status)).length }, { id: 'entrega', label: 'Entregables' }, { id: 'bitacora', label: 'Bitácora' }]} />
      <div className="scroll tab-body">
        {tab === 'resumen' && (
          <div className="form">
            <Field label="Materia"><SubjectSelect subjects={subjects} value={p.subjectId} onChange={(id) => set({ subjectId: id })} none="Independiente" /></Field>
            <Field label="Inicio"><Input type="date" value={p.start ?? ''} onChange={(e) => set({ start: e.target.value || undefined })} /></Field>
            <Field label="Entrega"><Input type="date" value={p.due ?? ''} onChange={(e) => set({ due: e.target.value || undefined })} /></Field>
            <Field label="Integrantes (separados por coma)"><LazyInput value={p.members.join(', ')} onCommit={(v) => set({ members: v.split(',').map((x) => x.trim()).filter(Boolean) })} /></Field>
            <Field label="Objetivo" wide><LazyInput value={p.objective ?? ''} onCommit={(v) => set({ objective: v })} /></Field>
            <Field label="Descripción" wide><LazyInput multiline value={p.description ?? ''} onCommit={(v) => set({ description: v })} /></Field>
            <div className="wide">
              <div className="section-title">Fases e hitos</div>
              <ul className="subtasks">
                {p.milestones.map((m) => (
                  <li key={m.id}>
                    <input type="checkbox" checked={m.done} onChange={() => set({ milestones: p.milestones.map((x) => (x.id === m.id ? { ...x, done: !x.done } : x)) })} />
                    <span className={m.done ? 'strike' : ''}>{m.title}</span>
                    <Input type="date" className="input mini-date" value={m.date ?? ''} onChange={(e) => set({ milestones: p.milestones.map((x) => (x.id === m.id ? { ...x, date: e.target.value || undefined } : x)) })} />
                    <button className="link muted" onClick={() => set({ milestones: p.milestones.filter((x) => x.id !== m.id) })} aria-label="Quitar">×</button>
                  </li>
                ))}
              </ul>
              <InlineAdd placeholder="Agregar hito (ej. Diseño terminado)…" onAdd={(t) => set({ milestones: [...p.milestones, { id: newId(), title: t, done: false }] })} />
            </div>
            <div className="wide">
              <div className="section-title">Recursos y enlaces</div>
              <ul className="plain">
                {p.links.map((l) => (
                  <li key={l.id}>{safeUrl(l.url) ? <a href={safeUrl(l.url)} target="_blank" rel="noreferrer noopener">{l.label || l.url}</a> : <span>{l.label || l.url}</span>} <button className="link muted" onClick={() => set({ links: p.links.filter((x) => x.id !== l.id) })}>×</button></li>
                ))}
              </ul>
              <InlineAdd placeholder="Pega un enlace (repo, Drive, Figma…)" onAdd={(t) => set({ links: [...p.links, { id: newId(), label: t.replace(/^https?:\/\/(www\.)?/, '').slice(0, 50), url: /^https?:\/\//.test(t) ? t : `https://${t}` }] })} />
            </div>
            <div className="wide"><Btn small onClick={() => confirm('¿Eliminar el proyecto? Sus tareas se conservan.') && void remove('projects', p.id).then(onBack)}>Eliminar proyecto</Btn></div>
          </div>
        )}

        {tab === 'tablero' && (
          <>
            <form className="capture" onSubmit={(e) => { e.preventDefault(); void addTask(); }}>
              <input className="input" value={newTask} onChange={(e) => setNewTask(e.target.value)} placeholder="Nueva tarea del proyecto…" />
              <Btn type="submit">+</Btn>
            </form>
            <div className="board">
              {BOARD.map((st) => (
                <div key={st} className={`board-col st-${st}`} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { const id = e.dataTransfer.getData('text/plain'); if (id) void patch('tasks', id, { status: st, completedAt: st === 'completada' ? Date.now() : undefined }); }}>
                  <div className="board-head">{TASK_STATUS.find((x) => x.id === st)?.label} <span className="count">{pr.tasks.filter((t) => t.status === st || (st === 'pendiente' && t.status === 'programada')).length}</span></div>
                  {pr.tasks.filter((t) => t.status === st || (st === 'pendiente' && t.status === 'programada')).map((t) => (
                    <div key={t.id} className="board-card" draggable onDragStart={(e) => e.dataTransfer.setData('text/plain', t.id)}>
                      <div className="bc-title" onClick={() => wm.open('tasks', { taskId: t.id })}>{t.title}</div>
                      <div className="row-meta">
                        {t.due && <span className={isOpen(t.status) && t.due < today() ? 'late' : ''}>{relDay(t.due)}</span>}
                        {t.assignee && <Chip>{t.assignee}</Chip>}
                      </div>
                      <div className="bc-actions">
                        <select className="kind-select" value={t.status} onChange={(e) => void patch('tasks', t.id, { status: e.target.value as TaskStatus, completedAt: e.target.value === 'completada' ? Date.now() : undefined })} aria-label="Mover a">
                          {TASK_STATUS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                        </select>
                        {p.members.length > 0 && (
                          <select className="kind-select" value={t.assignee ?? ''} onChange={(e) => void patch('tasks', t.id, { assignee: e.target.value || undefined })} aria-label="Responsable">
                            <option value="">Responsable…</option>
                            {p.members.map((m) => <option key={m} value={m}>{m}</option>)}
                          </select>
                        )}
                        {t.status !== 'completada' && <button className="link" onClick={() => void toggleDone(t)}>✓</button>}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
            <p className="hint">Arrastra las tarjetas entre columnas (en tablet usa el selector).</p>
          </>
        )}

        {tab === 'entrega' && (
          <>
            <p className="hint">Convierte las instrucciones o la rúbrica en una lista. Marca cada punto cuando tengas evidencia de que se cumple.</p>
            <ul className="checklist">
              {p.checklist.map((c) => (
                <li key={c.id}>
                  <input type="checkbox" checked={c.done} onChange={() => set({ checklist: p.checklist.map((x) => (x.id === c.id ? { ...x, done: !x.done } : x)) })} />
                  <div className="grow">
                    <div className={c.done ? 'strike' : ''}>{c.text}</div>
                    <LazyInput value={c.evidence ?? ''} placeholder="Evidencia (sección, archivo, enlace…)" onCommit={(v) => set({ checklist: p.checklist.map((x) => (x.id === c.id ? { ...x, evidence: v } : x)) })} />
                  </div>
                  <button className="link muted" onClick={() => set({ checklist: p.checklist.filter((x) => x.id !== c.id) })}>×</button>
                </li>
              ))}
            </ul>
            <InlineAdd placeholder="Requisito (ej. Incluir diagrama de clases)…" onAdd={(t) => set({ checklist: [...p.checklist, { id: newId(), text: t, done: false }] })} />
            <details>
              <summary>Pegar rúbrica completa</summary>
              <textarea className="input" rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder="Un requisito por línea" />
              <Btn small onClick={() => { const lines = text.split('\n').map((l) => l.replace(/^[-•*\d.)\s]+/, '').trim()).filter(Boolean); set({ checklist: [...p.checklist, ...lines.map((l) => ({ id: newId(), text: l, done: false }))] }); setText(''); }}>Convertir en lista</Btn>
            </details>
          </>
        )}

        {tab === 'bitacora' && <ProjectLogView p={p} />}
      </div>
    </>
  );
}

function ProjectLogView({ p }: { p: Project }) {
  const [kind, setKind] = useState<ProjectLog['kind']>('avance');
  const [text, setText] = useState('');
  const [who, setWho] = useState('');
  const add = () => {
    if (!text.trim()) return;
    void patch('projects', p.id, { log: [{ id: newId(), date: today(), kind, text: text.trim(), participants: who || undefined }, ...p.log] });
    setText('');
    setWho('');
  };
  return (
    <>
      <div className="form">
        <Field label="Tipo"><Select value={kind} onChange={(e) => setKind(e.target.value as ProjectLog['kind'])}>{Object.entries(LOG_KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
        {kind === 'reunion' && <Field label="Participantes"><Input value={who} onChange={(e) => setWho(e.target.value)} /></Field>}
        <Field label={kind === 'reunion' ? 'Acuerdos y tareas que salieron' : 'Qué pasó'} wide><textarea className="input" rows={3} value={text} onChange={(e) => setText(e.target.value)} /></Field>
        <div className="wide"><Btn primary onClick={add} disabled={!text.trim()}>Registrar</Btn></div>
      </div>
      <ul className="log">
        {p.log.map((l) => (
          <li key={l.id}>
            <span className={`log-kind ${l.kind}`}>{LOG_KIND[l.kind]}</span>
            <span className="hint">{fmtDate(l.date)}{l.participants ? ` · ${l.participants}` : ''}</span>
            <div>{l.text}</div>
          </li>
        ))}
      </ul>
      {!p.log.length && <Empty>La bitácora te ayudará a escribir el informe final.</Empty>}
    </>
  );
}

function InlineAdd({ placeholder, onAdd }: { placeholder: string; onAdd: (text: string) => void }) {
  const [v, setV] = useState('');
  return (
    <form className="capture" onSubmit={(e) => { e.preventDefault(); if (v.trim()) { onAdd(v.trim()); setV(''); } }}>
      <input className="input" value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder} />
      <Btn small type="submit">+</Btn>
    </form>
  );
}
