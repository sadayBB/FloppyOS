import { z } from 'zod';
import { db, type Subject } from '../db';
import { askJSON, askText } from './ai';
import { DAYS, today } from './dates';
import { summarize } from './grades';
import { isOpen } from './labels';

const dateContext = () => `Hoy es ${DAYS[new Date().getDay()]} ${today()}.`;

/* RF-111: free text → suggested record */
export const CaptureSchema = z.object({
  titulo: z.string().describe('Título breve y claro, sin la fecha ni la duración'),
  tipo: z.enum(['tarea', 'recordatorio', 'tema', 'palabra', 'duda', 'idea', 'recurso', 'nota']),
  materia: z.string().nullable().describe('Nombre EXACTO de una de las materias listadas, o null'),
  fecha: z.string().nullable().describe('YYYY-MM-DD o null'),
  hora: z.string().nullable().describe('HH:MM o null'),
  minutos: z.number().nullable().describe('Tiempo estimado en minutos, o null'),
  prioridad: z.number().nullable().describe('1 baja, 2 media, 3 alta, 4 urgente, o null'),
  etiquetas: z.array(z.string()),
  explicacion: z.string().describe('Una frase: qué interpretaste y por qué'),
});
export type CaptureSuggestion = z.infer<typeof CaptureSchema>;

export function interpretCapture(text: string, subjects: Subject[]) {
  return askJSON(
    CaptureSchema,
    `Convierte una nota rápida en un registro. ${dateContext()} Materias: ${subjects.map((s) => s.name).join('; ') || '(ninguna)'}. ` +
      'Resuelve fechas relativas («el jueves», «mañana») a fechas absolutas. Si algo no se menciona, usa null.',
    text,
  );
}

/* RF-113: break a task down */
export const StepsSchema = z.object({ pasos: z.array(z.string()), explicacion: z.string() });
export function suggestSubtasks(title: string, description: string | undefined, subject?: string) {
  return askJSON(
    StepsSchema,
    'Divide la tarea en 3 a 8 pasos concretos, cortos y accionables, en orden. No repitas pasos que ya existan.',
    `Tarea: ${title}${subject ? `\nMateria: ${subject}` : ''}${description ? `\nDescripción: ${description}` : ''}`,
  );
}

/* RF-90: flashcards from the user's own notes */
export const CardsSchema = z.object({ tarjetas: z.array(z.object({ pregunta: z.string(), respuesta: z.string() })) });
export function cardsFromNote(title: string, body: string) {
  return askJSON(
    CardsSchema,
    'Crea entre 3 y 12 tarjetas de memoria (pregunta → respuesta corta) SOLO con información que esté en el apunte. ' +
      'Si el apunte no da para tarjetas, devuelve una lista vacía.',
    `Apunte «${title}»:\n\n${body}`,
    'medium',
  );
}

/* RF-36: structured class summary, only from what was written */
export function summarizeNote(title: string, body: string) {
  return askText(
    'Resume el apunte en secciones: «Conceptos clave», «Dudas», «Tareas mencionadas», «Temas para estudiar». ' +
      'Usa viñetas cortas. Incluye solo lo que está en el texto; si una sección queda vacía, escribe «—».',
    [{ role: 'user', content: `Apunte «${title}»:\n\n${body}` }],
    'low',
  );
}

/* RF-08: structure a messy syllabus */
export const SyllabusSchema = z.object({
  items: z.array(
    z.object({
      titulo: z.string(),
      nivel: z.number().describe('0 unidad, 1 tema, 2 subtema, 3 sub-subtema'),
      tipo: z.enum(['tema', 'bibliografia', 'otro']),
      confianza: z.enum(['alta', 'media', 'baja']),
    }),
  ),
});
export function structureSyllabus(text: string) {
  return askJSON(
    SyllabusSchema,
    'Extrae la estructura del programa de asignatura: unidades, temas y subtemas en orden, y aparte las referencias bibliográficas (tipo «bibliografia», copiando el texto tal cual). ' +
      'Ignora encabezados administrativos (créditos, horas, perfil del profesor). Copia los títulos del texto, no los reescribas ni inventes temas. ' +
      'Marca confianza «baja» cuando no estés segura del nivel o de si es un tema.',
    text,
    'medium',
  );
}

/* RF-117: answer questions grounded in the user's own data */
export async function buildSnapshot() {
  const [semesters, subjects, topics, tasks, events, inbox, sessions, cards] = await Promise.all([
    db.semesters.toArray(), db.subjects.toArray(), db.topics.toArray(), db.tasks.toArray(), db.events.toArray(), db.inbox.toArray(), db.sessions.toArray(), db.cards.toArray(),
  ]);
  const alive = <T extends { deletedAt?: number }>(a: T[]) => a.filter((x) => !x.deletedAt);
  const sem = alive(semesters).find((s) => s.status === 'activo');
  const subs = alive(subjects).filter((s) => !sem || s.semesterId === sem.id);
  const name = (id?: string) => subs.find((s) => s.id === id)?.name;
  const t0 = today();
  return {
    hoy: `${DAYS[new Date().getDay()]} ${t0}`,
    semestre: sem?.name,
    materias: subs.map((s) => {
      const g = s.grading ? summarize(s.grading) : undefined;
      return {
        nombre: s.name,
        profesor: s.professor,
        calificacion: g ? { asegurado: +g.secured.toFixed(2), proyectada: g.projected && +g.projected.toFixed(2), final: g.final && +g.final.toFixed(2), falta_evaluar_pct: Math.round(g.remaining * 100) } : undefined,
        temas: alive(topics).filter((t) => t.subjectId === s.id).map((t) => `${t.title} [${t.status}]`),
      };
    }),
    tareas_pendientes: alive(tasks).filter((t) => isOpen(t.status)).map((t) => ({ titulo: t.title, materia: name(t.subjectId), vence: t.due, estado: t.status, prioridad: t.priority, minutos: t.estimateMin })),
    proximos_eventos: alive(events).filter((e) => e.date >= t0).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 40).map((e) => ({ titulo: e.title, tipo: e.kind, fecha: e.date, hora: e.start, materia: name(e.subjectId) })),
    dudas_abiertas: alive(inbox).filter((i) => i.kind === 'duda' && !i.resolved).map((i) => ({ duda: i.text, materia: name(i.subjectId) })),
    estudio_ultimos_14_dias_min: alive(sessions).filter((s) => s.startedAt > Date.now() - 14 * 86400000).reduce((a, s) => a + s.focusMin, 0),
    tarjetas_pendientes_hoy: alive(cards).filter((c) => c.due <= t0).length,
  };
}

export async function askAboutMyData(history: { role: 'user' | 'assistant'; content: string }[]) {
  const snap = await buildSnapshot();
  return askText(
    'Ayudas a la estudiante a organizarse usando SOLO los datos de abajo (JSON de su app). Si la respuesta no está en los datos, dilo claramente y sugiere qué registrar. ' +
      'Cuando recomiendes qué hacer o estudiar, explica el motivo (fecha cercana, tema sin repasar, calificación en riesgo…). Sé concreta y breve; usa viñetas si ayuda.\n\n' +
      `DATOS:\n${JSON.stringify(snap)}`,
    history,
    'medium',
  );
}
