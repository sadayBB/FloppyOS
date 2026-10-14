import { newId, type GradeItem, type GradeUnit, type GradingScheme } from '../db';

/*
 * Grade maths, kept explicit so every number shown can be explained (RNF-12).
 * Final = unitsWeight% × (average of unit grades) + ordinaryWeight% × (ordinary grade).
 * Each unit grade and the ordinary grade are weighted averages of their activities.
 * An activity "vale" (share of the final) = group share × activity weight / sum of weights in its group.
 */

export const item = (name: string, weight: number): GradeItem => ({ id: newId(), name, weight });
export const unit = (name: string, items: GradeItem[] = [item('Examen', 100)]): GradeUnit => ({ id: newId(), name, items });

export function unistmoScheme(): GradingScheme {
  return {
    scale: 10,
    pass: 6,
    unitsWeight: 50,
    ordinaryWeight: 50,
    units: [unit('Unidad 1'), unit('Unidad 2'), unit('Unidad 3')],
    ordinary: [item('Proyecto final', 100)],
  };
}

export const TEMPLATES: { name: string; items: [string, number][] }[] = [
  { name: 'Solo examen', items: [['Examen', 100]] },
  { name: 'Examen 60 · Tareas 20 · Prácticas 20', items: [['Examen', 60], ['Tareas', 20], ['Prácticas', 20]] },
  { name: 'Examen 50 · Proyecto 50', items: [['Examen', 50], ['Proyecto', 50]] },
  { name: 'Examen 70 · Participación 10 · Tareas 20', items: [['Examen', 70], ['Participación', 10], ['Tareas', 20]] },
];

/** Score converted to the scheme scale (e.g. 34/40 → 8.5 on a 10 scale). */
export const norm = (it: GradeItem, scale: number) => (it.score === undefined ? undefined : (it.score / (it.max ?? scale)) * scale);
export const isGraded = (it: GradeItem) => it.score !== undefined && !Number.isNaN(it.score);

export interface GroupCalc {
  totalW: number;
  gradedW: number;
  /** Weighted grade over graded activities only. */
  current?: number;
  /** Grade once everything is graded. */
  final?: number;
  complete: boolean;
}

export function calcGroup(items: GradeItem[], scale: number): GroupCalc {
  const totalW = items.reduce((a, i) => a + (i.weight || 0), 0);
  const graded = items.filter(isGraded);
  const gradedW = graded.reduce((a, i) => a + (i.weight || 0), 0);
  const sum = graded.reduce((a, i) => a + (i.weight || 0) * norm(i, scale)!, 0);
  const complete = items.length > 0 && graded.length === items.length && totalW > 0;
  return {
    totalW,
    gradedW,
    current: gradedW > 0 ? sum / gradedW : undefined,
    final: complete ? sum / totalW : undefined,
    complete,
  };
}

/** Fraction of the final grade that each unit represents. */
export function unitShares(s: GradingScheme): number[] {
  const n = s.units.length;
  if (!n) return [];
  const custom = s.units.some((u) => u.weight !== undefined && u.weight > 0);
  const ws = s.units.map((u) => (custom ? u.weight || 0 : 1));
  const tot = ws.reduce((a, b) => a + b, 0) || 1;
  return ws.map((w) => (s.unitsWeight / 100) * (w / tot));
}

export interface Contribution {
  item: GradeItem;
  group: string;
  /** Share of the final grade, 0..1. */
  share: number;
  /** Points of the final already earned by this activity (scale units). */
  earned?: number;
}

export function contributions(s: GradingScheme): Contribution[] {
  const out: Contribution[] = [];
  const shares = unitShares(s);
  s.units.forEach((u, k) => {
    const tot = u.items.reduce((a, i) => a + (i.weight || 0), 0) || 1;
    for (const it of u.items) {
      const share = shares[k] * ((it.weight || 0) / tot);
      out.push({ item: it, group: u.name, share, earned: isGraded(it) ? share * norm(it, s.scale)! : undefined });
    }
  });
  const totO = s.ordinary.reduce((a, i) => a + (i.weight || 0), 0) || 1;
  for (const it of s.ordinary) {
    const share = (s.ordinaryWeight / 100) * ((it.weight || 0) / totO);
    out.push({ item: it, group: 'Ordinario', share, earned: isGraded(it) ? share * norm(it, s.scale)! : undefined });
  }
  return out;
}

export interface Summary {
  /** Points already secured (assuming 0 in what is missing). */
  secured: number;
  /** Best possible final if everything left is perfect. */
  maxPossible: number;
  /** Share of the final still not graded, 0..1. */
  remaining: number;
  /** Weighted average of graded work, on the scale. */
  performance?: number;
  /** Projection: what is left continues at the current performance. */
  projected?: number;
  /** Final grade when complete. */
  final?: number;
  unitsAvg?: number;
  ordinary?: number;
  warnings: string[];
}

export function summarize(s: GradingScheme): Summary {
  const cs = contributions(s);
  const secured = cs.reduce((a, c) => a + (c.earned ?? 0), 0);
  const gradedShare = cs.filter((c) => c.earned !== undefined).reduce((a, c) => a + c.share, 0);
  const totalShare = cs.reduce((a, c) => a + c.share, 0);
  const remaining = Math.max(0, totalShare - gradedShare);
  const performance = gradedShare > 0 ? secured / gradedShare : undefined;
  const warnings: string[] = [];
  if (Math.abs(s.unitsWeight + s.ordinaryWeight - 100) > 0.01) warnings.push(`Unidades (${s.unitsWeight}%) + ordinario (${s.ordinaryWeight}%) no suman 100%.`);
  s.units.forEach((u) => {
    const t = u.items.reduce((a, i) => a + (i.weight || 0), 0);
    if (u.items.length && Math.abs(t - 100) > 0.01) warnings.push(`Los pesos de ${u.name} suman ${t}% (deberían sumar 100%; se reparten en proporción).`);
  });
  const tO = s.ordinary.reduce((a, i) => a + (i.weight || 0), 0);
  if (s.ordinary.length && Math.abs(tO - 100) > 0.01) warnings.push(`Los pesos del ordinario suman ${tO}%.`);

  const unitCalcs = s.units.map((u) => calcGroup(u.items, s.scale));
  const shares = unitShares(s);
  const unitsAvg = unitCalcs.every((c) => c.complete) && s.units.length
    ? unitCalcs.reduce((a, c, k) => a + c.final! * shares[k], 0) / (s.unitsWeight / 100 || 1)
    : undefined;
  const ord = calcGroup(s.ordinary, s.scale);
  return {
    secured,
    maxPossible: secured + remaining * s.scale,
    remaining,
    performance,
    projected: performance !== undefined ? secured + remaining * performance : undefined,
    final: remaining < 1e-9 && cs.length ? secured : undefined,
    unitsAvg,
    ordinary: ord.final,
    warnings,
  };
}

/** Average needed on everything still ungraded to reach `target`. */
export function needed(s: GradingScheme, target: number): { value?: number; verdict: 'ok' | 'imposible' | 'asegurado' | 'sin_pendientes' } {
  const sum = summarize(s);
  if (sum.remaining < 1e-9) return { verdict: 'sin_pendientes' };
  const v = (target - sum.secured) / sum.remaining;
  if (v <= 0) return { value: 0, verdict: 'asegurado' };
  if (v > s.scale + 1e-9) return { value: v, verdict: 'imposible' };
  return { value: v, verdict: 'ok' };
}

export function round(v: number, mode: GradingScheme['rounding'] | undefined) {
  if (mode === 'entero') return Math.floor(v + 0.5);
  if (mode === 'decimal') return Math.round(v * 10) / 10;
  return Math.round(v * 100) / 100;
}

export const fmtG = (v?: number) => (v === undefined ? '—' : (Math.round(v * 100) / 100).toFixed(2).replace(/\.?0+$/, ''));
export const fmtPct = (f: number) => `${(Math.round(f * 1000) / 10).toString()}%`;
