import { useEffect, useRef, useState } from 'react';
import { create, patch, remove, useRows, useSubjects, type ID, type Note } from '../db';
import { norm } from '../lib/parse';
import { Btn, Dot, Empty, Field, Input, Select, SubjectSelect } from '../os/ui';
import { AiBadge, AiButton, useAiAction, useAiEnabled } from '../os/Ai';
import { CopyForClaude, parseCardLines } from '../os/CopyForClaude';
import { formatCards } from '../lib/formatCards';
import { cardsFromNote, summarizeNote } from '../lib/aiFeatures';
import { newCard } from './Cards';
import { askConfirm } from '../os/dialogs';
import { useWindowStatus } from '../os/status';

export default function Notes({ noteId }: { noteId?: ID }) {
  const notes = useRows('notes');
  const { subjects } = useSubjects();
  const [selId, setSelId] = useState<ID | undefined>(noteId);
  const [q, setQ] = useState('');
  const [subject, setSubject] = useState<ID | undefined>();

  useEffect(() => { if (noteId) setSelId(noteId); }, [noteId]);

  const list = notes
    .filter((n) => (!subject || n.subjectId === subject) && (!q || norm(`${n.title} ${n.body} ${n.tags.join(' ')}`).includes(norm(q))))
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const sel = notes.find((n) => n.id === selId);
  useWindowStatus([`${list.length} apunte${list.length === 1 ? '' : 's'}${q || subject ? ' (filtrados)' : ''}`, sel ? `${sel.body.trim() ? sel.body.trim().split(/\s+/).length : 0} palabras` : null]);

  return (
    <div className={`app split ${sel ? 'has-detail' : ''}`}>
      <aside className="sidebar wide-side">
        <Btn primary onClick={async () => setSelId((await create('notes', { title: '', body: '', subjectId: subject, tags: [] })).id)}>+ Nuevo apunte</Btn>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar en apuntes…" />
        <SubjectSelect subjects={subjects} value={subject} onChange={setSubject} none="Todas las materias" />
        <ul className="note-list">
          {list.map((n) => (
            <li key={n.id}>
              <button className={`side-item ${n.id === selId ? 'on' : ''}`} onClick={() => setSelId(n.id)}>
                {n.subjectId && <Dot color={subjects.find((s) => s.id === n.subjectId)?.color ?? '#999'} />}
                <span className="ellipsis">{n.title || n.body.slice(0, 40) || 'Sin título'}</span>
              </button>
            </li>
          ))}
        </ul>
      </aside>
      <div className="pane detail">
        {sel ? <Editor key={sel.id} note={sel} onClose={() => setSelId(undefined)} /> : <Empty>Elige o crea un apunte.</Empty>}
      </div>
    </div>
  );
}

/** Editor with debounced autosave so nothing is lost if the tablet suspends the app. */
function Editor({ note, onClose }: { note: Note; onClose: () => void }) {
  const { subjects } = useSubjects();
  const topics = useRows('topics').filter((t) => t.subjectId === note.subjectId);
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body);
  const timer = useRef<number>();
  const cardsAi = useAiAction<{ pregunta: string; respuesta: string }[]>();
  const sumAi = useAiAction<string>();
  const [cardSource, setCardSource] = useState<'ia' | 'formato' | 'claude'>('ia');
  const aiOn = useAiEnabled();
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [saved, setSaved] = useState(true);

  const schedule = (t: string, b: string) => {
    setSaved(false);
    clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      await patch('notes', note.id, { title: t, body: b });
      setSaved(true);
    }, 600);
  };
  useEffect(() => () => {
    clearTimeout(timer.current);
  }, []);

  return (
    <>
      <div className="detail-head">
        <Btn small className="only-compact" onClick={onClose}>←</Btn>
        <input className="input title-input" value={title} placeholder="Título" onChange={(e) => { setTitle(e.target.value); schedule(e.target.value, body); }} onBlur={() => void patch('notes', note.id, { title, body })} />
        <span className="hint">{saved ? 'Guardado' : 'Guardando…'}</span>
        <Btn small onClick={async () => { if (await askConfirm('¿Eliminar este apunte?', { title: 'Confirmar eliminación', danger: true, ok: 'Sí', cancel: 'No' })) { void remove('notes', note.id); onClose(); } }}>Eliminar</Btn>
      </div>
      <div className="note-props">
        <Field label="Materia"><SubjectSelect subjects={subjects} value={note.subjectId} onChange={(id) => void patch('notes', note.id, { subjectId: id, topicId: undefined })} /></Field>
        <Field label="Tema">
          <Select value={note.topicId ?? ''} onChange={(e) => void patch('notes', note.id, { topicId: e.target.value || undefined })} disabled={!note.subjectId}>
            <option value="">—</option>
            {topics.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
          </Select>
        </Field>
        <Field label="Etiquetas">
          <Input defaultValue={note.tags.join(', ')} onBlur={(e) => void patch('notes', note.id, { tags: e.target.value.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean) })} />
        </Field>
      </div>
      <div className="toolbar">
        <AiButton busy={cardsAi.busy} disabled={body.trim().length < 40} title="Crear tarjetas de memoria con lo que escribiste" onClick={() => void cardsAi.run(async () => {
          setCardSource('ia');
          const r = await cardsFromNote(title, body);
          setPicked(new Set(r.tarjetas.map((_, i) => i)));
          return r.tarjetas;
        })}>Crear tarjetas</AiButton>
        <AiButton busy={sumAi.busy} disabled={body.trim().length < 40} onClick={() => void sumAi.run(() => summarizeNote(title, body))}>Resumir</AiButton>
        <Btn small disabled={!formatCards(body).length} title="Detecta líneas «Concepto: definición» en tu apunte" onClick={() => { const c = formatCards(body); setCardSource('formato'); setPicked(new Set(c.map((_, i) => i))); cardsAi.setResult(c); }}>
          🃏 Tarjetas del apunte{formatCards(body).length ? ` (${formatCards(body).length})` : ''}
        </Btn>
        {!aiOn && (
          <>
            <CopyForClaude
              label="Tarjetas con Claude"
              title="Crear tarjetas con Claude"
              disabled={body.trim().length < 40}
              buildPrompt={() => `Crea entre 3 y 12 tarjetas de memoria usando SOLO la información de este apunte (no agregues datos que no estén). Responde únicamente con una tarjeta por línea, en este formato exacto:
P: pregunta || R: respuesta corta

Apunte «${title || 'Sin título'}»:
${body}`}
              pasteHint="Ejemplo: P: ¿Qué es DNS? || R: El sistema que traduce nombres de dominio a direcciones IP."
              applyLabel="Revisar tarjetas"
              onApply={(answer) => {
                const c = parseCardLines(answer);
                if (!c.length) return 'No encontré líneas con el formato «P: … || R: …». Revisa que hayas pegado la respuesta completa.';
                setCardSource('claude');
                setPicked(new Set(c.map((_, i) => i)));
                cardsAi.setResult(c);
              }}
            />
            <CopyForClaude
              label="Resumen con Claude"
              title="Resumir con Claude"
              disabled={body.trim().length < 40}
              buildPrompt={() => `Resume este apunte de clase en secciones: «Conceptos clave», «Dudas», «Tareas mencionadas» y «Temas para estudiar». Usa viñetas cortas e incluye solo lo que está en el texto; si una sección queda vacía, escribe «—».

Apunte «${title || 'Sin título'}»:
${body}`}
              applyLabel="Agregar al apunte"
              pasteHint="Pega el resumen de Claude: se agregará al final del apunte."
              onApply={(answer) => {
                const b = `${body}

--- Resumen (Claude) ---
${answer}`;
                setBody(b);
                void patch('notes', note.id, { title, body: b });
              }}
            />
          </>
        )}
      </div>
      {(cardsAi.error || sumAi.error) && <div className="warn">⚠ {cardsAi.error ?? sumAi.error}</div>}
      {cardsAi.result && (
        <div className="ai-box">
          {cardSource === 'formato' ? <b>{cardsAi.result.length} tarjetas encontradas en tu apunte</b> : cardSource === 'claude' ? <b>{cardsAi.result.length} tarjetas de tu respuesta de Claude</b> : <AiBadge label={`${cardsAi.result.length} tarjetas sugeridas`} />}
          {cardsAi.result.length === 0 && <span className="hint">Este apunte no da para tarjetas todavía.</span>}
          {cardsAi.result.map((c, i) => (
            <label key={i} className="check">
              <input type="checkbox" checked={picked.has(i)} onChange={() => setPicked((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n; })} />
              <span><b>{c.pregunta}</b> → {c.respuesta}</span>
            </label>
          ))}
          <div className="row-btns">
            <Btn small primary disabled={!picked.size} onClick={async () => {
              for (const [i, c] of cardsAi.result!.entries()) if (picked.has(i)) await newCard(c.pregunta, c.respuesta, note.subjectId, note.topicId, cardSource === 'formato' ? 'Apunte' : cardSource === 'claude' ? 'Claude · apunte' : 'IA · apunte');
              cardsAi.setResult(null);
            }}>Agregar {picked.size} a Tarjetas</Btn>
            <Btn small onClick={() => cardsAi.setResult(null)}>Descartar</Btn>
          </div>
        </div>
      )}
      {sumAi.result && (
        <div className="ai-box">
          <AiBadge label="Resumen generado por IA" />
          <div className="ai-answer">{sumAi.result}</div>
          <div className="row-btns">
            <Btn small primary onClick={() => { const b = `${body}\n\n--- Resumen (IA) ---\n${sumAi.result}`; setBody(b); void patch('notes', note.id, { title, body: b }); sumAi.setResult(null); }}>Agregar al final del apunte</Btn>
            <Btn small onClick={() => sumAi.setResult(null)}>Cerrar</Btn>
          </div>
        </div>
      )}
      <textarea className="input note-body" value={body} placeholder="Escribe tus apuntes…" onChange={(e) => { setBody(e.target.value); schedule(title, e.target.value); }} onBlur={() => void patch('notes', note.id, { title, body })} />
    </>
  );
}

