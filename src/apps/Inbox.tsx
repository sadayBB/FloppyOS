import { useMemo, useState } from 'react';
import { create, patch, remove, useRows, useSubjects, type ID, type InboxItem, type InboxKind } from '../db';
import { fmtDur, relDay } from '../lib/dates';
import { KIND_COLOR, KIND_LABEL, parseCapture } from '../lib/parse';
import { PRIORITY } from '../lib/labels';
import { Btn, Chip, Empty, Select, SubjectSelect, Tabs } from '../os/ui';
import { useWM } from '../os/wm';

type Filter = 'pending' | 'duda' | 'palabra' | 'all' | 'done';
const KINDS = Object.keys(KIND_LABEL) as InboxKind[];

/** Converts an inbox item into an organised record, keeping the original text and a back-link. */
export async function convert(item: InboxItem, to: 'task' | 'note' | 'topic' | 'event') {
  let ref: InboxItem['convertedTo'];
  if (to === 'task') {
    const t = await create('tasks', { title: item.text, subjectId: item.subjectId, status: item.due ? 'programada' : 'pendiente', priority: item.priority ?? 2, due: item.due, dueTime: item.dueTime, estimateMin: item.estimateMin, tags: item.tags, subtasks: [], sourceInboxId: item.id });
    ref = { table: 'tasks', id: t.id };
  } else if (to === 'note') {
    const n = await create('notes', { title: item.text.slice(0, 60), body: item.text, subjectId: item.subjectId, tags: item.tags });
    ref = { table: 'notes', id: n.id };
  } else if (to === 'topic') {
    if (!item.subjectId) throw new Error('Asigna una materia antes de convertirlo en tema.');
    const t = await create('topics', { subjectId: item.subjectId, title: item.text, order: Date.now(), status: item.kind === 'palabra' ? 'introducido' : 'no_iniciado' });
    ref = { table: 'topics', id: t.id };
  } else {
    if (!item.due) throw new Error('Ponle una fecha antes de convertirlo en evento.');
    const e = await create('events', { title: item.text, kind: 'otro', date: item.due, start: item.dueTime, subjectId: item.subjectId });
    ref = { table: 'events', id: e.id };
  }
  await patch('inbox', item.id, { processed: true, convertedTo: ref });
}

export default function Inbox() {
  const items = useRows('inbox');
  const { subjects } = useSubjects();
  const wm = useWM();
  const [text, setText] = useState('');
  const [filter, setFilter] = useState<Filter>('pending');
  const [sel, setSel] = useState<Set<ID>>(new Set());
  const [err, setErr] = useState<string | null>(null);

  const preview = useMemo(() => (text.trim() ? parseCapture(text, subjects) : null), [text, subjects]);
  const subName = (id?: ID) => subjects.find((s) => s.id === id)?.name;

  const list = items
    .filter((i) =>
      filter === 'pending' ? !i.processed
      : filter === 'done' ? i.processed
      : filter === 'all' ? true
      : i.kind === filter && !i.resolved,
    )
    .sort((a, b) => b.createdAt - a.createdAt);

  const add = async (asTask = false) => {
    if (!preview?.text) return;
    setText('');
    const row = await create('inbox', { text: preview.text, kind: asTask ? 'tarea' : preview.kind, subjectId: preview.subjectId, tags: preview.tags, due: preview.due, dueTime: preview.dueTime, estimateMin: preview.estimateMin, priority: preview.priority, processed: false });
    if (asTask) await convert(row, 'task');
  };

  const run = async (fn: () => Promise<unknown>) => {
    setErr(null);
    try {
      await fn();
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  const batch = (fn: (i: InboxItem) => Promise<unknown>) =>
    run(async () => {
      for (const i of items.filter((x) => sel.has(x.id))) await fn(i);
      setSel(new Set());
    });

  const toggle = (id: ID) =>
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const count = (f: Filter) => items.filter((i) => (f === 'pending' ? !i.processed : i.kind === f && !i.resolved)).length;

  return (
    <div className="app inbox">
      <form
        className="capture"
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <input
          className="input big"
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Escribe lo que sea…  ej. «mañana entregar práctica @redes 2h !»"
          aria-label="Nueva entrada"
        />
        <Btn primary type="submit" disabled={!preview?.text}>Guardar</Btn>
      </form>
      {preview?.text && (
        <div className="parse-preview">
          <Chip color={KIND_COLOR[preview.kind]}>{KIND_LABEL[preview.kind]}</Chip>
          <span className="pv-text">{preview.text}</span>
          {preview.subjectId && <Chip>{subName(preview.subjectId)}{preview.subjectGuessed ? ' ?' : ''}</Chip>}
          {preview.due && <Chip>📅 {relDay(preview.due)}{preview.dueTime ? ` ${preview.dueTime}` : ''}</Chip>}
          {preview.estimateMin && <Chip>⏱ {fmtDur(preview.estimateMin)}</Chip>}
          {preview.priority && <Chip color={PRIORITY[preview.priority].color}>{PRIORITY[preview.priority].label}</Chip>}
          {preview.tags.map((t) => <Chip key={t}>#{t}</Chip>)}
          <button type="button" className="link" onClick={() => void add(true)}>Crear como tarea directamente</button>
        </div>
      )}
      <p className="hint">
        Usa <b>@materia</b>, <b>#etiqueta</b>, <b>!</b> o <b>!!</b> para la prioridad, y fechas como <i>hoy</i>, <i>mañana</i>, <i>jueves</i> o <i>15/11</i>. Puedes cambiarlo todo después.
      </p>

      <Tabs<Filter>
        value={filter}
        onChange={(f) => {
          setFilter(f);
          setSel(new Set());
        }}
        tabs={[
          { id: 'pending', label: 'Sin organizar', count: count('pending') },
          { id: 'duda', label: 'Dudas', count: count('duda') },
          { id: 'palabra', label: 'Palabras clave', count: count('palabra') },
          { id: 'all', label: 'Todo' },
          { id: 'done', label: 'Procesados' },
        ]}
      />

      {sel.size > 0 && (
        <div className="batchbar">
          <span>{sel.size} seleccionados:</span>
          <Select value="" onChange={(e) => e.target.value && void batch((i) => patch('inbox', i.id, { kind: e.target.value as InboxKind }))}>
            <option value="">Tipo…</option>
            {KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
          </Select>
          <SubjectSelect subjects={subjects} none="Materia…" onChange={(id) => id && void batch((i) => patch('inbox', i.id, { subjectId: id }))} />
          <Btn small onClick={() => void batch((i) => convert(i, 'task'))}>→ Tareas</Btn>
          <Btn small onClick={() => void batch((i) => convert(i, 'topic'))}>→ Temas</Btn>
          <Btn small onClick={() => void batch((i) => patch('inbox', i.id, { processed: true }))}>Archivar</Btn>
          <Btn small onClick={() => void batch((i) => remove('inbox', i.id))}>Eliminar</Btn>
        </div>
      )}
      {err && <div className="error">⚠ {err}</div>}

      <div className="scroll">
        {list.length === 0 ? (
          <Empty>{filter === 'pending' ? '¡Bandeja vacía! Todo está en su sitio.' : 'Nada por aquí.'}</Empty>
        ) : (
          <ul className="rows">
            {list.map((i) => (
              <li key={i.id} className={`row ${i.processed ? 'done' : ''}`}>
                <input type="checkbox" checked={sel.has(i.id)} onChange={() => toggle(i.id)} aria-label="Seleccionar" />
                <div className="row-main">
                  <div className="row-title">{i.text}</div>
                  <div className="row-meta">
                    <select className="kind-select" style={{ borderColor: KIND_COLOR[i.kind] }} value={i.kind} onChange={(e) => void patch('inbox', i.id, { kind: e.target.value as InboxKind })} aria-label="Tipo">
                      {KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
                    </select>
                    <SubjectSelect subjects={subjects} value={i.subjectId} onChange={(id) => void patch('inbox', i.id, { subjectId: id })} />
                    {i.due && <Chip>📅 {relDay(i.due)}</Chip>}
                    {i.estimateMin && <Chip>⏱ {fmtDur(i.estimateMin)}</Chip>}
                    {i.tags.map((t) => <Chip key={t}>#{t}</Chip>)}
                    {i.convertedTo && (
                      <button className="link" onClick={() => wm.open(i.convertedTo!.table === 'tasks' ? 'tasks' : i.convertedTo!.table === 'notes' ? 'notes' : i.convertedTo!.table === 'events' ? 'calendar' : 'subjects', { taskId: i.convertedTo!.id, noteId: i.convertedTo!.id, subjectId: i.subjectId, tab: 'temario' })}>
                        → abrir {i.convertedTo.table === 'tasks' ? 'tarea' : i.convertedTo.table === 'notes' ? 'nota' : i.convertedTo.table === 'events' ? 'evento' : 'tema'}
                      </button>
                    )}
                  </div>
                </div>
                {!i.processed ? (
                  <div className="row-actions">
                    <Btn small title="Convertir en tarea" onClick={() => void run(() => convert(i, 'task'))}>Tarea</Btn>
                    <Btn small title="Agregar al temario de la materia" onClick={() => void run(() => convert(i, 'topic'))}>Tema</Btn>
                    <Btn small title="Convertir en apunte" onClick={() => void run(() => convert(i, 'note'))}>Nota</Btn>
                    {i.due && <Btn small title="Agregar a la agenda" onClick={() => void run(() => convert(i, 'event'))}>Evento</Btn>}
                    {i.kind === 'duda' && <Btn small title="Marcar duda como resuelta" onClick={() => void patch('inbox', i.id, { resolved: true, processed: true })}>Resuelta</Btn>}
                    <Btn small title="Archivar sin convertir" onClick={() => void patch('inbox', i.id, { processed: true })}>✓</Btn>
                  </div>
                ) : (
                  <div className="row-actions">
                    <Btn small onClick={() => void patch('inbox', i.id, { processed: false, resolved: false })}>Devolver</Btn>
                    <Btn small aria-label="Eliminar" onClick={() => void remove('inbox', i.id)}>🗑</Btn>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
