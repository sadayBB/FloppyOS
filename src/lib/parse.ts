import type { ID, InboxKind, Priority, Subject } from '../db';
import { addDays, pad, startOfWeek, today, toISO, weekday } from './dates';

export interface Parsed {
  text: string;
  kind: InboxKind;
  subjectId?: ID;
  subjectGuessed?: boolean;
  tags: string[];
  due?: string;
  dueTime?: string;
  estimateMin?: number;
  priority?: Priority;
}

export const norm = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const NUMS: Record<string, number> = {
  un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
  quince: 15, veinte: 20, treinta: 30, cuarenta: 40, media: 0.5,
};
const WEEKDAYS: Record<string, number> = {
  domingo: 0, lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6,
};

export function matchSubject(token: string, subjects: Subject[]) {
  const n = norm(token);
  return (
    subjects.find((s) => s.code && norm(s.code) === n) ??
    subjects.find((s) => norm(s.name).startsWith(n)) ??
    subjects.find((s) => norm(s.name).split(/\s+/).some((w) => w.startsWith(n)))
  );
}

/**
 * Rule-based reading of a quick capture line. Recognises:
 *   @materia  #etiqueta  ! / !!  hoy / mañana / pasado mañana / jueves / 15/10 / en 3 días
 *   a las 10 / 14:30   2h / 30min / dos horas
 * Nothing here is final: the inbox shows the result and the user can change any field.
 */
export function parseCapture(raw: string, subjects: Subject[]): Parsed {
  let text = ` ${raw.trim()} `;
  const tags: string[] = [];
  let subjectId: ID | undefined;
  let subjectGuessed = false;
  let due: string | undefined;
  let dueTime: string | undefined;
  let estimateMin: number | undefined;
  let priority: Priority | undefined;
  const t0 = today();

  text = text.replace(/\s#([\p{L}\d_-]+)/gu, (_, t: string) => {
    tags.push(t.toLowerCase());
    return ' ';
  });
  text = text.replace(/\s@([\p{L}\d_-]+)/gu, (m, s: string) => {
    const sub = matchSubject(s, subjects);
    if (!sub) return m;
    subjectId = sub.id;
    return ' ';
  });
  text = text.replace(/\s(!{1,3})(?=\s)/g, (_, b: string) => {
    priority = b.length === 1 ? 3 : 4;
    return ' ';
  });
  if (/\burgente\b/i.test(text)) priority = 4;

  // Durations: "2h", "1.5 horas", "30 min", "dos horas", "me faltan dos horas"
  const durNum = /[,;]?\s*(?:me\s+faltan?|faltan?|llevar[aá]|toma(?:r[aá])?|unas?|aprox\.?|como)?\s*(\d+(?:[.,]\d+)?)\s*(h|hr|hrs|horas?|m|min|mins|minutos?)(?=[\s.,;]|$)/i;
  const durWord = /[,;]?\s*(?:me\s+faltan?|faltan?|llevar[aá]|toma(?:r[aá])?|unas?|aprox\.?|como)?\s*\b(un|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|quince|veinte|treinta|cuarenta|media)\s+(horas?|minutos?)\b/i;
  let m = text.match(durNum);
  if (m) {
    const n = parseFloat(m[1].replace(',', '.'));
    estimateMin = Math.round(/^h/i.test(m[2]) ? n * 60 : n);
    text = text.replace(m[0], ' ');
  } else if ((m = text.match(durWord))) {
    const n = NUMS[norm(m[1])];
    estimateMin = Math.round(/^h/i.test(m[2]) ? n * 60 : n);
    text = text.replace(m[0], ' ');
  }
  if (/\by\s+media\b/i.test(text) && estimateMin && estimateMin % 60 === 0) {
    estimateMin += 30;
    text = text.replace(/\by\s+media\b/i, ' ');
  }

  // Time of day
  if ((m = text.match(/\s(?:a\s+las\s+)?(\d{1,2}):(\d{2})\b/i))) {
    dueTime = `${pad(+m[1])}:${m[2]}`;
    text = text.replace(m[0], ' ');
  } else if ((m = text.match(/\sa\s+las?\s+(\d{1,2})(?:\s*(am|pm|hrs?))?\b/i))) {
    let h = +m[1];
    if (m[2]?.toLowerCase() === 'pm' && h < 12) h += 12;
    dueTime = `${pad(h)}:00`;
    text = text.replace(m[0], ' ');
  }

  // Dates
  const pre = String.raw`(?:para\s+|antes\s+del?\s+|el\s+|este\s+)*`;
  const rules: [RegExp, (m: RegExpMatchArray) => string | undefined][] = [
    [new RegExp(String.raw`\s${pre}pasado\s+ma[ñn]ana\b`, 'i'), () => addDays(t0, 2)],
    [new RegExp(String.raw`\s${pre}hoy\b`, 'i'), () => t0],
    [new RegExp(String.raw`\s${pre}ma[ñn]ana\b(?!\s+(?:por|en)\s+la)`, 'i'), () => addDays(t0, 1)],
    [new RegExp(String.raw`\s${pre}en\s+(\d+)\s+d[ií]as?\b`, 'i'), (m) => addDays(t0, +m[1])],
    [new RegExp(String.raw`\s${pre}(?:la\s+)?(?:pr[óo]xima\s+semana|semana\s+que\s+viene)\b`, 'i'), () => addDays(startOfWeek(t0), 7)],
    [
      new RegExp(String.raw`\s${pre}(?:pr[óo]ximo\s+)?(lunes|martes|mi[ée]rcoles|jueves|viernes|s[áa]bado|domingo)(?:\s+que\s+viene)?\b`, 'i'),
      (m) => {
        const target = WEEKDAYS[norm(m[1])];
        let d = (target - weekday(t0) + 7) % 7;
        if (d === 0) d = 7;
        return addDays(t0, d);
      },
    ],
    [
      new RegExp(String.raw`\s${pre}(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b`, 'i'),
      (m) => {
        const now = new Date();
        let y = m[3] ? +m[3] : now.getFullYear();
        if (y < 100) y += 2000;
        const d = new Date(y, +m[2] - 1, +m[1]);
        if (isNaN(d.getTime()) || +m[2] > 12) return undefined;
        if (!m[3] && toISO(d) < t0) d.setFullYear(y + 1);
        return toISO(d);
      },
    ],
  ];
  for (const [re, fn] of rules) {
    const mm = text.match(re);
    if (mm) {
      const d = fn(mm);
      if (d) {
        due = d;
        text = text.replace(mm[0], ' ');
        break;
      }
    }
  }

  // Guess the subject from words in the text when no @ was given.
  if (!subjectId) {
    const words = new Set(norm(text).split(/[^a-z0-9]+/));
    const sub = subjects.find(
      (s) =>
        (s.code && words.has(norm(s.code))) ||
        norm(s.name).split(/\s+/).some((w) => w.length >= 4 && words.has(w)),
    );
    if (sub) {
      subjectId = sub.id;
      subjectGuessed = true;
    }
  }

  text = text.replace(/\s+/g, ' ').replace(/^[\s,;:.-]+|[\s,;:-]+$/g, '').trim();
  if (text) text = text[0].toUpperCase() + text.slice(1);

  return { text, kind: guessKind(text, !!due), subjectId, subjectGuessed, tags, due, dueTime, estimateMin, priority };
}

export function guessKind(text: string, hasDue: boolean): InboxKind {
  const n = norm(text).trim();
  if (/^(idea)\b[:\s]/.test(n)) return 'idea';
  if (/^(duda|pregunta)\b/.test(n) || /[¿?]/.test(text) || /^(preguntar|por que|como funciona|que es|cual es)\b/.test(n))
    return 'duda';
  if (/^(recordar|recuerda|acordarme|no olvidar|ojo)\b/.test(n)) return 'recordatorio';
  if (/^(concepto|palabra|keyword|kw)\b[:\s]/.test(n)) return 'palabra';
  if (/^(estudiar|repasar|practicar|aprender|reforzar|investigar|entender)\b/.test(n)) return 'tema';
  if (/^(buscar|conseguir|encontrar)\b/.test(n)) return 'recurso';
  if (hasDue || /^(entregar|hacer|terminar|instalar|configurar|enviar|imprimir|preparar|completar|revisar|leer|resolver|subir|llevar|pagar|inscribir|mandar|escribir|crear|disenar)\b/.test(n))
    return 'tarea';
  // Short label without a verb-looking first word → probably a concept heard in class.
  const words = n.split(/\s+/).filter(Boolean);
  if (words.length > 0 && words.length <= 3 && !/(ar|er|ir)$/.test(words[0])) return 'palabra';
  return 'nota';
}

export const KIND_LABEL: Record<InboxKind, string> = {
  tarea: 'Tarea',
  recordatorio: 'Recordatorio',
  tema: 'Tema por estudiar',
  palabra: 'Palabra clave',
  duda: 'Duda',
  idea: 'Idea',
  recurso: 'Recurso por buscar',
  nota: 'Nota libre',
};
export const KIND_COLOR: Record<InboxKind, string> = {
  tarea: '#7f9fc6',
  recordatorio: '#d9a24e',
  tema: '#6fae9f',
  palabra: '#c9b13f',
  duda: '#cf6b5e',
  idea: '#e2a3b4',
  recurso: '#8a5a8e',
  nota: '#a89c8e',
};
