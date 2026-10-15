import { useMemo, useState } from 'react';
import { create, patch, remove, useRows, useSubjects, type Flashcard, type ID } from '../db';
import { addDays, relDay, today } from '../lib/dates';
import { topicRank } from '../lib/labels';
import { Btn, Chip, Empty, Field, LazyInput, Select, SubjectSelect, Tabs } from '../os/ui';
import { useWindowStatus } from '../os/status';

type Grade = 0 | 1 | 2 | 3;
const GRADES: { g: Grade; label: string; cls: string }[] = [
  { g: 0, label: 'Otra vez', cls: 'again' },
  { g: 1, label: 'Difícil', cls: 'hard' },
  { g: 2, label: 'Bien', cls: 'good' },
  { g: 3, label: 'Fácil', cls: 'easy' },
];

/** SM-2 style scheduling (RF-91). Returns the fields to update. */
export function schedule(c: Pick<Flashcard, 'interval' | 'ease' | 'reps' | 'lapses'>, g: Grade) {
  let { interval, ease, reps, lapses } = c;
  if (g === 0) {
    lapses++;
    reps = 0;
    interval = 0;
    ease = Math.max(1.3, ease - 0.2);
  } else {
    if (g === 1) {
      interval = Math.max(1, Math.round(interval * 1.2));
      ease = Math.max(1.3, ease - 0.15);
    } else if (g === 2) {
      interval = reps === 0 ? 1 : reps === 1 ? 3 : Math.round(interval * ease);
    } else {
      interval = reps === 0 ? 4 : Math.round(Math.max(interval, 1) * ease * 1.3);
      ease += 0.15;
    }
    reps++;
  }
  return { interval, ease: Math.round(ease * 100) / 100, reps, lapses, due: addDays(today(), interval), lastReviewed: Date.now() };
}
const preview = (c: Flashcard, g: Grade) => {
  const n = schedule(c, g).interval;
  return n === 0 ? 'hoy' : n === 1 ? '1 día' : n < 30 ? `${n} días` : `${Math.round(n / 30)} mes${n >= 60 ? 'es' : ''}`;
};

export const newCard = (front: string, back: string, subjectId?: ID, topicId?: ID, source?: string) =>
  create('cards', { front, back, subjectId, topicId, source, due: today(), interval: 0, ease: 2.5, reps: 0, lapses: 0 });

/** Flashcards with spaced repetition, linked to subjects and syllabus topics (RF-89..91, RF-100). */
export default function Cards({ subjectId: initSubject }: { subjectId?: ID }) {
  const cards = useRows('cards');
  const topics = useRows('topics');
  const { subjects } = useSubjects();
  const [tab, setTab] = useState<'review' | 'list' | 'weak'>('review');
  const [subject, setSubject] = useState<ID | undefined>(initSubject);
  const pool = cards.filter((c) => !subject || c.subjectId === subject);
  const due = pool.filter((c) => c.due <= today());
  useWindowStatus([`${pool.length} tarjetas`, `${due.length} para repasar hoy`]);

  return (
    <div className="app">
      <div className="toolbar">
        <Tabs value={tab} onChange={setTab} tabs={[{ id: 'review', label: 'Repasar', count: due.length }, { id: 'list', label: 'Mis tarjetas' }, { id: 'weak', label: 'Temas débiles' }]} />
        <span className="grow" />
        <SubjectSelect subjects={subjects} value={subject} onChange={setSubject} none="Todas las materias" />
      </div>
      <div className="scroll tab-body">
        {tab === 'review' && <Review due={due} topics={topics} />}
        {tab === 'list' && <CardList cards={pool} subject={subject} />}
        {tab === 'weak' && <Weak cards={cards} />}
      </div>
    </div>
  );
}

function Review({ due, topics }: { due: Flashcard[]; topics: { id: ID; title: string; status: string }[] }) {
  const [shown, setShown] = useState(false);
  const [done, setDone] = useState(0);
  const queue = useMemo(() => [...due].sort((a, b) => a.due.localeCompare(b.due) || a.reps - b.reps), [due.length]);
  const card = due.find((c) => c.id === queue[0]?.id) ?? due[0];

  if (!card)
    return (
      <div className="welcome">
        <h3>{done ? `¡Listo! Repasaste ${done} tarjeta${done > 1 ? 's' : ''} 🎉` : 'No hay tarjetas pendientes hoy'}</h3>
        <p className="hint">Crea tarjetas en «Mis tarjetas», desde una palabra clave de la Bandeja o con la IA desde tus apuntes.</p>
      </div>
    );

  const grade = async (g: Grade) => {
    await patch('cards', card.id, schedule(card, g));
    // A good answer counts as reviewing its topic (RF-34): bump to «repasado» if it was lower.
    const t = topics.find((x) => x.id === card.topicId) as { id: ID; status: Parameters<typeof topicRank>[0] } | undefined;
    if (t && g >= 2 && topicRank(t.status) < topicRank('repasado')) await patch('topics', t.id, { status: 'repasado', statusChangedAt: Date.now() });
    setShown(false);
    setDone((d) => d + 1);
  };

  return (
    <div className="review">
      <p className="hint">Quedan {due.length} · repasadas hoy: {done}</p>
      <div className={`flash ${shown ? 'flipped' : ''}`} onClick={() => setShown(true)}>
        <div className="flash-front">{card.front}</div>
        {shown ? <div className="flash-back">{card.back || <i className="hint">(sin respuesta escrita)</i>}</div> : <div className="hint">Toca para ver la respuesta</div>}
      </div>
      {topics.find((t) => t.id === card.topicId) && <p className="hint">Tema: {topics.find((t) => t.id === card.topicId)!.title}</p>}
      {shown ? (
        <div className="grade-btns">
          {GRADES.map((x) => (
            <button key={x.g} className={`btn grade ${x.cls}`} onClick={() => void grade(x.g)}>
              {x.label}
              <small>{preview(card, x.g)}</small>
            </button>
          ))}
        </div>
      ) : (
        <Btn primary onClick={() => setShown(true)}>Mostrar respuesta</Btn>
      )}
    </div>
  );
}

function CardList({ cards, subject }: { cards: Flashcard[]; subject?: ID }) {
  const { subjects } = useSubjects();
  const topics = useRows('topics');
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [sub, setSub] = useState<ID | undefined>(subject);
  const [topic, setTopic] = useState<ID | undefined>();
  const add = async () => {
    if (!front.trim()) return;
    await newCard(front.trim(), back.trim(), sub, topic);
    setFront('');
    setBack('');
  };
  return (
    <>
      <div className="form card-form">
        <Field label="Pregunta / concepto" wide><textarea className="input" rows={2} value={front} onChange={(e) => setFront(e.target.value)} /></Field>
        <Field label="Respuesta" wide><textarea className="input" rows={2} value={back} onChange={(e) => setBack(e.target.value)} /></Field>
        <Field label="Materia"><SubjectSelect subjects={subjects} value={sub} onChange={(id) => { setSub(id); setTopic(undefined); }} /></Field>
        <Field label="Tema">
          <Select value={topic ?? ''} onChange={(e) => setTopic(e.target.value || undefined)} disabled={!sub}>
            <option value="">—</option>
            {topics.filter((t) => t.subjectId === sub).map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
          </Select>
        </Field>
        <div className="wide"><Btn primary onClick={() => void add()} disabled={!front.trim()}>+ Agregar tarjeta</Btn></div>
      </div>
      {!cards.length && <Empty>Sin tarjetas todavía.</Empty>}
      <ul className="rows">
        {[...cards].sort((a, b) => b.createdAt - a.createdAt).map((c) => (
          <li key={c.id} className="row">
            <div className="row-main">
              <LazyInput value={c.front} onCommit={(v) => void patch('cards', c.id, { front: v })} />
              <LazyInput value={c.back} placeholder="Respuesta…" onCommit={(v) => void patch('cards', c.id, { back: v })} />
              <div className="row-meta">
                <span>Próximo repaso: {relDay(c.due)}</span>
                {c.lapses > 0 && <Chip color="#cf6b5e">{c.lapses} fallo{c.lapses > 1 ? 's' : ''}</Chip>}
                {c.source && <Chip>{c.source}</Chip>}
              </div>
            </div>
            <Btn small aria-label="Eliminar tarjeta" onClick={() => void remove('cards', c.id)}>🗑</Btn>
          </li>
        ))}
      </ul>
    </>
  );
}

/** Topics where cards fail often (RF-100). */
function Weak({ cards }: { cards: Flashcard[] }) {
  const topics = useRows('topics');
  const { subjects } = useSubjects();
  const byTopic = topics
    .map((t) => {
      const cs = cards.filter((c) => c.topicId === t.id);
      const lapses = cs.reduce((a, c) => a + c.lapses, 0);
      const reviews = cs.reduce((a, c) => a + c.reps + c.lapses, 0);
      return { t, cs: cs.length, lapses, rate: reviews ? lapses / reviews : 0 };
    })
    .filter((x) => x.lapses > 0)
    .sort((a, b) => b.rate - a.rate);
  if (!byTopic.length) return <Empty>Aún no hay suficientes repasos para detectar temas difíciles.</Empty>;
  return (
    <ul className="rows">
      {byTopic.map(({ t, cs, lapses, rate }) => (
        <li key={t.id} className="row">
          <div className="row-main">
            <div className="row-title">{t.title}</div>
            <div className="row-meta">
              <span>{subjects.find((s) => s.id === t.subjectId)?.name}</span>
              <span>{cs} tarjetas · {lapses} fallos ({Math.round(rate * 100)}% de los repasos)</span>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
