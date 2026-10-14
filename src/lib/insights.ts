import { useLiveQuery } from 'dexie-react-hooks';
import { db, useRows, useSetting, useSubjects } from '../db';
import type { AppId } from '../apps/meta';
import { addDays, diffDays, nowHHMM, today, toMin, weekday } from './dates';
import { isOpen } from './labels';
import { fmtG, summarize } from './grades';

export interface Insight {
  id: string;
  text: string;
  tone: 'alert' | 'info' | 'tip';
  action?: { label: string; app: AppId; props?: Record<string, unknown> };
}

const TIPS: Insight[] = [
  { id: 'tip-capture', tone: 'tip', text: 'Puedes escribir cosas como «el jueves entregar práctica @redes 2h !» y yo separo la fecha, la materia, la duración y la prioridad.' },
  { id: 'tip-class', tone: 'tip', text: 'Si te dicen algo en clase, apúntalo en la Bandeja sin pensar dónde va. Ya lo organizarás después.' },
  { id: 'tip-review', tone: 'tip', text: 'Un tema visto en clase y repasado ese mismo día se recuerda mucho mejor. ¿Le das 15 minutos?' },
  { id: 'tip-backup', tone: 'tip', text: '¿Sabías que puedes cambiar el tema, el fondo y pegar stickers en el escritorio? Mira el Panel de control.', action: { label: 'Apariencia', app: 'settings', props: { tab: 'look' } } },
  { id: 'tip-temario', tone: 'tip', text: 'Pega el temario de una materia en Materias → Temario → Importar y lo convierto en unidades y temas.' },
  { id: 'tip-rest', tone: 'tip', text: 'Descansar también es parte del plan. Aquí no se pierden rachas.' },
];

/** Derived, explainable observations about the user's data. Used by Clippy and the dashboard. */
export function useInsights(): Insight[] {
  const tasks = useRows('tasks');
  const inbox = useRows('inbox');
  const slots = useRows('slots');
  const events = useRows('events');
  const topics = useRows('topics');
  const cards = useRows('cards');
  // undefined while loading, so onboarding doesn't flash before data arrives
  const semesterCount = useLiveQuery(() => db.semesters.count());
  const { subjects } = useSubjects();
  const [capacity] = useSetting('dailyCapacityMin', 240);

  const t = today();
  const now = nowHHMM();
  const out: Insight[] = [];
  const subjectIds = new Set(subjects.map((s) => s.id));

  if (semesterCount === 0)
    out.push({ id: 'onboard', tone: 'info', text: '¡Hola! Parece que estás empezando un semestre. ¿Quieres que lo configuremos? Primero crea el semestre y tus materias.', action: { label: 'Crear semestre', app: 'subjects' } });

  const soon = events.find((e) => e.date === t && e.start && toMin(e.start) - toMin(now) >= 0 && toMin(e.start) - toMin(now) <= 20);
  if (soon) out.push({ id: `soon-${soon.id}`, tone: 'alert', text: `«${soon.title}» empieza a las ${soon.start}.`, action: { label: 'Ver agenda', app: 'calendar' } });

  const nextClass = slots
    .filter((s) => s.weekday === weekday(t) && s.start >= now && (!s.subjectId || subjectIds.has(s.subjectId)))
    .sort((a, b) => a.start.localeCompare(b.start))[0];
  if (nextClass) {
    const sub = subjects.find((s) => s.id === nextClass.subjectId);
    const mins = toMin(nextClass.start) - toMin(now);
    if (mins <= 30)
      out.push({ id: `class-${nextClass.id}`, tone: 'alert', text: `En ${mins} min tienes ${sub?.name ?? nextClass.title ?? 'clase'}${nextClass.room ? ` en ${nextClass.room}` : ''}. ¿Preparaste la mochila?` });
  }

  const open = tasks.filter((x) => isOpen(x.status));
  const overdue = open.filter((x) => x.due && x.due < t);
  if (overdue.length)
    out.push({ id: 'overdue', tone: 'alert', text: `Tienes ${overdue.length} tarea${overdue.length > 1 ? 's' : ''} con fecha pasada. ¿Las reprogramamos?`, action: { label: 'Ver vencidas', app: 'tasks', props: { filter: 'overdue' } } });

  const dueToday = open.filter((x) => x.due === t);
  if (dueToday.length)
    out.push({ id: 'today', tone: 'info', text: `Hoy vence${dueToday.length > 1 ? 'n' : ''}: ${dueToday.slice(0, 3).map((x) => x.title).join(', ')}${dueToday.length > 3 ? '…' : ''}.`, action: { label: 'Ver tareas', app: 'tasks', props: { filter: 'today' } } });

  const pending = inbox.filter((x) => !x.processed);
  if (pending.length >= 3)
    out.push({ id: 'inbox', tone: 'info', text: `Hay ${pending.length} cosas sin organizar en tu Bandeja. Clasificarlas toma un par de minutos.`, action: { label: 'Abrir bandeja', app: 'inbox' } });

  const exams = events.filter((e) => e.kind === 'examen' && diffDays(e.date, t) >= 0 && diffDays(e.date, t) <= 7);
  for (const e of exams)
    out.push({ id: `exam-${e.id}`, tone: 'alert', text: `Examen «${e.title}» ${diffDays(e.date, t) === 0 ? 'hoy' : `en ${diffDays(e.date, t)} días`}. ¿Armamos un plan de repaso?`, action: { label: 'Ir a materias', app: 'subjects', props: { subjectId: e.subjectId, tab: 'temario' } } });

  for (const sub of subjects) {
    if (!sub.grading) continue;
    const g = summarize(sub.grading);
    const v = g.final ?? g.projected;
    if (v !== undefined && v < sub.grading.pass)
      out.push({ id: `risk-${sub.id}-${Math.round(v * 10)}`, tone: 'alert', text: `En ${sub.name} vas en ${fmtG(v)} (aprobatoria ${sub.grading.pass}). Todavía falta evaluar ${Math.round(g.remaining * 100)}% de la calificación: ¡se puede remontar!`, action: { label: 'Ver calificación', app: 'subjects', props: { subjectId: sub.id, tab: 'calif' } } });
  }
  const dueCards = cards.filter((c) => c.due <= t).length;
  if (dueCards >= 5) out.push({ id: `cards-${t}`, tone: 'info', text: `Tienes ${dueCards} tarjetas para repasar hoy. Son unos minutos y ayudan muchísimo a recordar.`, action: { label: 'Repasar', app: 'cards' } });

  const unreviewed = topics.filter((x) => subjectIds.has(x.subjectId) && ['introducido', 'parcial', 'cubierto'].includes(x.status));
  if (unreviewed.length)
    out.push({ id: 'unreviewed', tone: 'info', text: `${unreviewed.length} tema${unreviewed.length > 1 ? 's' : ''} visto${unreviewed.length > 1 ? 's' : ''} en clase todavía sin estudiar, por ejemplo «${unreviewed[0].title}».`, action: { label: 'Estudiar ahora', app: 'timer', props: { subjectId: unreviewed[0].subjectId, topicId: unreviewed[0].id } } });

  const week = open.filter((x) => x.due && x.due >= t && x.due <= addDays(t, 6)).reduce((s, x) => s + (x.estimateMin ?? 0), 0);
  if (week > capacity * 7 * 0.8)
    out.push({ id: 'heavy', tone: 'alert', text: `Esta semana tienes ~${Math.round(week / 60)} h de trabajo estimado y tu capacidad es ~${Math.round((capacity * 7) / 60)} h. Conviene adelantar algo o mover fechas.`, action: { label: 'Ver agenda', app: 'calendar' } });

  return [...out, ...TIPS];
}
