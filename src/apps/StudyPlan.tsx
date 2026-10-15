import { useMemo, useState } from 'react';
import { create, useRows, useSetting, type CalEvent, type ID } from '../db';
import { addDays, diffDays, fmtDate, fromMin, today, toMin } from '../lib/dates';
import { topicRank } from '../lib/labels';
import { Btn, Field, Input, Modal } from '../os/ui';

interface Planned {
  date: string;
  start: string;
  end: string;
  title: string;
  topicId?: ID;
}

/**
 * Spreads study blocks for an exam (RF-99): one first pass per topic, weakest first, then a
 * review block per topic in the last days. Avoids days already over the daily capacity.
 */
export function planExam(opts: { examDate: string; topics: { id: ID; title: string }[]; minutes: number; startAt: string; perDay: number; busy: (date: string) => number; capacity: number }): Planned[] {
  const first = addDays(today(), 1);
  const lastDay = addDays(opts.examDate, -1);
  const days: string[] = [];
  for (let d = first; d <= lastDay; d = addDays(d, 1)) days.push(d);
  if (!days.length) return [];
  const load = new Map<string, number>();
  const count = new Map<string, number>();
  const place = (preferIdx: number, title: string, topicId?: ID): Planned | null => {
    for (let k = 0; k < days.length; k++) {
      const d = days[(preferIdx + k) % days.length];
      const n = count.get(d) ?? 0;
      if (n >= opts.perDay || opts.busy(d) + (load.get(d) ?? 0) + opts.minutes > opts.capacity) continue;
      const startMin = toMin(opts.startAt) + n * (opts.minutes + 15);
      load.set(d, (load.get(d) ?? 0) + opts.minutes);
      count.set(d, n + 1);
      return { date: d, start: fromMin(startMin), end: fromMin(startMin + opts.minutes), title, topicId };
    }
    return null;
  };
  const out: Planned[] = [];
  // First pass spread across the first ~70% of the days.
  const span = Math.max(1, Math.floor(days.length * 0.7));
  opts.topics.forEach((t, i) => {
    const p = place(Math.floor((i * span) / Math.max(1, opts.topics.length)), `Estudiar: ${t.title}`, t.id);
    if (p) out.push(p);
  });
  // Review pass packed into the final days.
  const reviewStart = Math.max(0, days.length - Math.max(1, Math.ceil(days.length * 0.3)));
  opts.topics.forEach((t, i) => {
    const p = place(reviewStart + (i % Math.max(1, days.length - reviewStart)), `Repaso: ${t.title}`, t.id);
    if (p) out.push(p);
  });
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
}

export function StudyPlanModal({ exam, onClose }: { exam: CalEvent; onClose: () => void }) {
  const topics = useRows('topics').filter((t) => t.subjectId === exam.subjectId);
  const tasks = useRows('tasks');
  const events = useRows('events');
  const [capacity] = useSetting('dailyCapacityMin', 240);
  const weak = topics.filter((t) => topicRank(t.status) < topicRank('dominado')).sort((a, b) => topicRank(a.status) - topicRank(b.status));
  const [sel, setSel] = useState<Set<ID>>(new Set(weak.filter((t) => !topics.some((c) => c.parentId === t.id)).map((t) => t.id)));
  const [minutes, setMinutes] = useState(45);
  const [startAt, setStartAt] = useState('18:00');
  const [perDay, setPerDay] = useState(2);
  const [done, setDone] = useState<number | null>(null);
  const daysLeft = diffDays(exam.date, today());

  const busy = (d: string) =>
    tasks.filter((t) => t.due === d && t.status !== 'completada').reduce((a, t) => a + (t.estimateMin ?? 30), 0) +
    events.filter((e) => e.date === d && e.kind === 'estudio' && e.start && e.end).reduce((a, e) => a + toMin(e.end!) - toMin(e.start!), 0);

  const chosen = weak.filter((t) => sel.has(t.id));
  const plan = useMemo(() => planExam({ examDate: exam.date, topics: chosen, minutes, startAt, perDay, busy, capacity }), [chosen.length, minutes, startAt, perDay, capacity, exam.date]);
  const missing = chosen.length * 2 - plan.length;

  const apply = async () => {
    for (const p of plan) await create('events', { title: p.title, kind: 'estudio', date: p.date, start: p.start, end: p.end, subjectId: exam.subjectId, notes: `Plan de repaso para «${exam.title}» (${fmtDate(exam.date)})` });
    setDone(plan.length);
  };

  return (
    <Modal title={`Plan de repaso — ${exam.title}`} onClose={onClose} footer={done !== null ? <Btn primary onClick={onClose}>Listo</Btn> : <><Btn onClick={onClose}>Cancelar</Btn><Btn primary disabled={!plan.length} onClick={() => void apply()}>Agregar {plan.length} sesiones a la Agenda</Btn></>}>
      {done !== null ? (
        <p className="notice">✓ Agregué {done} sesiones de estudio a tu Agenda. Puedes moverlas o borrarlas como cualquier evento.</p>
      ) : daysLeft < 2 ? (
        <p className="warn">El examen es {daysLeft <= 0 ? 'hoy' : 'mañana'}: ya no da tiempo de repartir sesiones. Repasa primero los temas marcados como débiles.</p>
      ) : (
        <>
          <p className="hint">Faltan {daysLeft} días. Primero estudias cada tema (los más flojos antes) y en los últimos días haces un repaso de cada uno.</p>
          <div className="form">
            <Field label="Minutos por sesión"><Input type="number" min={15} max={180} step={15} value={minutes} onChange={(e) => setMinutes(Math.max(15, +e.target.value || 45))} /></Field>
            <Field label="Hora de inicio"><Input type="time" value={startAt} onChange={(e) => setStartAt(e.target.value || '18:00')} /></Field>
            <Field label="Máximo de sesiones por día"><Input type="number" min={1} max={6} value={perDay} onChange={(e) => setPerDay(Math.max(1, +e.target.value || 2))} /></Field>
          </div>
          <div className="section-title">Temas que entran ({sel.size})</div>
          {!topics.length && <p className="hint">Esta materia no tiene temario: agrégalo en Materias → Temario para poder planear.</p>}
          <div className="topic-checks">
            {weak.map((t) => (
              <label key={t.id} className="check">
                <input type="checkbox" checked={sel.has(t.id)} onChange={() => setSel((s) => { const n = new Set(s); if (n.has(t.id)) n.delete(t.id); else n.add(t.id); return n; })} />
                {t.title}
              </label>
            ))}
          </div>
          {plan.length > 0 && (
            <>
              <div className="section-title">Vista previa</div>
              <ul className="plain plan-preview">
                {plan.map((p, i) => <li key={i}><b>{fmtDate(p.date)}</b> {p.start}–{p.end} · {p.title}</li>)}
              </ul>
            </>
          )}
          {missing > 0 && chosen.length > 0 && <p className="warn">No cupieron {missing} sesiones con tu capacidad diaria. Sube el máximo por día, acorta las sesiones o quita temas.</p>}
        </>
      )}
    </Modal>
  );
}
