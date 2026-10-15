import type { CalEvent, Flashcard, Slot, Subject, Task, Topic } from '../db';
import type { AppId } from '../apps/meta';
import { diffDays, fmtDur, nowHHMM, relDay, today, toMin, weekday } from './dates';
import { summarize } from './grades';
import { isOpen, topicRank } from './labels';

export interface Suggestion {
  id: string;
  title: string;
  why: string;
  score: number;
  action: { label: string; app: AppId; props?: Record<string, unknown> };
}

/**
 * Rule-based "what should I do now?" (RF-115, RF-118): every suggestion carries its reason.
 * Scores favour what is urgent, important and fits in the time available.
 */
export function suggestNext(d: { tasks: Task[]; events: CalEvent[]; topics: Topic[]; cards: Flashcard[]; slots: Slot[]; subjects: Subject[] }): Suggestion[] {
  const t0 = today();
  const now = toMin(nowHHMM());
  const out: Suggestion[] = [];
  const subName = (id?: string) => d.subjects.find((s) => s.id === id)?.name;
  const ids = new Set(d.subjects.map((s) => s.id));

  // A class starting soon beats everything: get ready.
  const nextClass = d.slots
    .filter((s) => s.weekday === weekday(t0) && (!s.subjectId || ids.has(s.subjectId)) && toMin(s.start) - now >= 0 && toMin(s.start) - now <= 45)
    .sort((a, b) => a.start.localeCompare(b.start))[0];
  if (nextClass) {
    const mins = toMin(nextClass.start) - now;
    out.push({ id: `class-${nextClass.id}`, score: 100, title: `Prepárate para ${subName(nextClass.subjectId) ?? nextClass.title ?? 'tu clase'}`, why: `Empieza en ${mins} min${nextClass.room ? ` en ${nextClass.room}` : ''}. Revisa tus apuntes y dudas pendientes.`, action: { label: 'Modo clase', app: 'subjects', props: { subjectId: nextClass.subjectId, tab: 'clases' } } });
  }

  for (const t of d.tasks.filter((x) => isOpen(x.status) && x.status !== 'bloqueada')) {
    const blocked = t.dependsOn && d.tasks.some((x) => x.id === t.dependsOn && isOpen(x.status));
    if (blocked) continue;
    const days = t.due ? diffDays(t.due, t0) : null;
    let score = t.priority * 6;
    let why: string;
    if (days === null) {
      score += 2;
      why = 'No tiene fecha, pero sigue pendiente.';
    } else if (days < 0) {
      score += 60 + Math.min(20, -days * 2);
      why = `Venció ${relDay(t.due!)}.`;
    } else if (days === 0) {
      score += 55;
      why = `Vence hoy${t.dueTime ? ` a las ${t.dueTime}` : ''}.`;
    } else if (days <= 2) {
      score += 40 - days * 5;
      why = `Vence ${relDay(t.due!).toLowerCase()}.`;
    } else if (days <= 7) {
      score += 20 - days;
      why = `Vence en ${days} días.`;
    } else continue;
    if (t.estimateMin && t.estimateMin >= 90 && days !== null && days <= 3) {
      score += 8;
      why += ` Lleva ~${fmtDur(t.estimateMin)}: conviene empezar ya.`;
    }
    if (t.status === 'en_progreso') {
      score += 5;
      why += ' Ya la tienes empezada.';
    }
    out.push({ id: `task-${t.id}`, score, title: t.title, why: `${subName(t.subjectId) ? `${subName(t.subjectId)} · ` : ''}${why}`, action: { label: 'Abrir tarea', app: 'tasks', props: { taskId: t.id } } });
  }

  // Exams in the next 7 days: study the weakest topics of that subject.
  for (const e of d.events.filter((x) => x.kind === 'examen' && diffDays(x.date, t0) >= 0 && diffDays(x.date, t0) <= 7)) {
    const weak = d.topics.filter((x) => x.subjectId === e.subjectId && topicRank(x.status) < topicRank('repasado')).sort((a, b) => topicRank(a.status) - topicRank(b.status));
    const days = diffDays(e.date, t0);
    if (weak.length)
      out.push({ id: `exam-${e.id}`, score: 70 - days * 5, title: `Repasa «${weak[0].title}»`, why: `Tienes examen de ${subName(e.subjectId) ?? e.title} ${days === 0 ? 'hoy' : `en ${days} día${days > 1 ? 's' : ''}`} y te faltan ${weak.length} tema${weak.length > 1 ? 's' : ''} por repasar.`, action: { label: 'Estudiar', app: 'timer', props: { subjectId: e.subjectId, topicId: weak[0].id } } });
  }

  // Seen in class but never studied.
  const unreviewed = d.topics.filter((x) => ids.has(x.subjectId) && ['introducido', 'parcial', 'cubierto'].includes(x.status)).sort((a, b) => (a.statusChangedAt ?? 0) - (b.statusChangedAt ?? 0));
  if (unreviewed[0]) {
    const tp = unreviewed[0];
    out.push({ id: `topic-${tp.id}`, score: 30, title: `Estudia «${tp.title}»`, why: `Lo viste en ${subName(tp.subjectId)} y aún no lo repasas. Repasarlo pronto ayuda a que no se olvide.${unreviewed.length > 1 ? ` (Hay ${unreviewed.length} así.)` : ''}`, action: { label: 'Estudiar', app: 'timer', props: { subjectId: tp.subjectId, topicId: tp.id } } });
  }

  // Grades at risk.
  for (const s of d.subjects) {
    if (!s.grading) continue;
    const g = summarize(s.grading);
    const v = g.final ?? g.projected;
    if (v !== undefined && v < s.grading.pass && g.remaining > 0)
      out.push({ id: `risk-${s.id}`, score: 45, title: `Refuerza ${s.name}`, why: `Vas en ${v.toFixed(1)} (aprobatoria ${s.grading.pass}) y falta evaluar ${Math.round(g.remaining * 100)}% de la calificación.`, action: { label: 'Ver calificación', app: 'subjects', props: { subjectId: s.id, tab: 'calif' } } });
  }

  const due = d.cards.filter((c) => c.due <= t0).length;
  if (due) out.push({ id: 'cards', score: 15 + Math.min(20, due), title: `Repasa ${due} tarjeta${due > 1 ? 's' : ''}`, why: 'Les toca repaso hoy. Son pocos minutos y fijan lo aprendido.', action: { label: 'Repasar', app: 'cards' } });

  return out.sort((a, b) => b.score - a.score);
}
