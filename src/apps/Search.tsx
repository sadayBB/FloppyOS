import { useState } from 'react';
import { useRows } from '../db';
import { relDay } from '../lib/dates';
import { KIND_LABEL, norm } from '../lib/parse';
import { Empty, Input } from '../os/ui';
import { useWM } from '../os/wm';
import type { AppId } from './meta';

interface Hit {
  key: string;
  type: string;
  title: string;
  meta?: string;
  app: AppId;
  props?: Record<string, unknown>;
}

/** Global search across every semester, archived ones included (RF-06). */
export default function Search() {
  const [q, setQ] = useState('');
  const wm = useWM();
  const subjects = useRows('subjects');
  const semesters = useRows('semesters');
  const tasks = useRows('tasks');
  const notes = useRows('notes');
  const topics = useRows('topics');
  const inbox = useRows('inbox');
  const events = useRows('events');

  const n = norm(q.trim());
  const has = (...s: (string | undefined)[]) => norm(s.filter(Boolean).join(' ')).includes(n);
  const subName = (id?: string) => {
    const s = subjects.find((x) => x.id === id);
    if (!s) return undefined;
    const sem = semesters.find((x) => x.id === s.semesterId);
    return sem?.status === 'archivado' ? `${s.name} (${sem.name})` : s.name;
  };

  const hits: Hit[] = n.length < 2 ? [] : [
    ...subjects.filter((s) => has(s.name, s.code, s.professor)).map((s) => ({ key: s.id, type: 'Materia', title: s.name, meta: s.professor, app: 'subjects' as AppId, props: { subjectId: s.id, tab: 'info' } })),
    ...topics.filter((t) => has(t.title)).map((t) => ({ key: t.id, type: 'Tema', title: t.title, meta: subName(t.subjectId), app: 'subjects' as AppId, props: { subjectId: t.subjectId, tab: 'temario' } })),
    ...tasks.filter((t) => has(t.title, t.description, t.tags.join(' '))).map((t) => ({ key: t.id, type: 'Tarea', title: t.title, meta: [subName(t.subjectId), t.due && relDay(t.due)].filter(Boolean).join(' · '), app: 'tasks' as AppId, props: { taskId: t.id, filter: 'open' } })),
    ...notes.filter((x) => has(x.title, x.body, x.tags.join(' '))).map((x) => ({ key: x.id, type: 'Apunte', title: x.title || x.body.slice(0, 50), meta: subName(x.subjectId), app: 'notes' as AppId, props: { noteId: x.id } })),
    ...inbox.filter((i) => has(i.text, i.tags.join(' '))).map((i) => ({ key: i.id, type: KIND_LABEL[i.kind], title: i.text, meta: subName(i.subjectId), app: 'inbox' as AppId })),
    ...events.filter((e) => has(e.title, e.notes)).map((e) => ({ key: e.id, type: 'Evento', title: e.title, meta: relDay(e.date), app: 'calendar' as AppId })),
  ];

  return (
    <div className="app">
      <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Busca tareas, temas, apuntes, palabras clave…" className="input big" />
      <div className="scroll">
        {n.length >= 2 && hits.length === 0 && <Empty>No encontré nada con «{q}».</Empty>}
        <ul className="rows">
          {hits.slice(0, 100).map((h) => (
            <li key={h.key} className="row clickable" onClick={() => wm.open(h.app, h.props)}>
              <span className="type-tag">{h.type}</span>
              <div className="row-main"><div className="row-title">{h.title}</div>{h.meta && <div className="row-meta">{h.meta}</div>}</div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
