export const pad = (n: number) => String(n).padStart(2, '0');
export const toISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => toISO(new Date());
export const fromISO = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
export const addDays = (s: string, n: number) => {
  const d = fromISO(s);
  d.setDate(d.getDate() + n);
  return toISO(d);
};
export const addMonths = (s: string, n: number) => {
  const d = fromISO(s);
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  return toISO(d);
};
export const diffDays = (a: string, b: string) => Math.round((fromISO(a).getTime() - fromISO(b).getTime()) / 86400000);
/** Monday of the week containing s. */
export const startOfWeek = (s: string) => addDays(s, -((fromISO(s).getDay() + 6) % 7));
export const weekday = (s: string) => fromISO(s).getDay();

export const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
export const DAYS_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
export const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const MONTHS_SHORT = MONTHS.map((m) => m.slice(0, 3));
/** Monday-first weekday order. */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

export const fmtDate = (s: string) => {
  const d = fromISO(s);
  return `${DAYS_SHORT[d.getDay()]} ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
};
export const fmtLong = (s: string) => {
  const d = fromISO(s);
  return `${DAYS[d.getDay()]} ${d.getDate()} de ${MONTHS[d.getMonth()]}`;
};
export const relDay = (s: string) => {
  const d = diffDays(s, today());
  if (d === 0) return 'Hoy';
  if (d === 1) return 'Mañana';
  if (d === -1) return 'Ayer';
  if (d < 0) return `hace ${-d} d`;
  if (d < 7) return DAYS[weekday(s)];
  return fmtDate(s);
};

export const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
};
export const fromMin = (min: number) => `${pad(Math.floor(min / 60) % 24)}:${pad(min % 60)}`;
export const fmtDur = (min: number) => {
  min = Math.round(min);
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
};
export const nowHHMM = () => {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
