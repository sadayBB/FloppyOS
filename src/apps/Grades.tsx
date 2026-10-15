import { useState } from 'react';
import { patch, useActiveSemester, useRows, useSubjects, type GradeItem, type GradingScheme, type Subject } from '../db';
import { calcGroup, contributions, fmtG, fmtPct, item, needed, round, summarize, TEMPLATES, unistmoScheme, unit } from '../lib/grades';
import { Btn, Chip, Empty, Field, Input, Select } from '../os/ui';
import { useWM } from '../os/wm';
import { SubjectIcon } from './SubjectIcon';
import { askConfirm } from '../os/dialogs';

const status = (s: GradingScheme, v?: number) => (v === undefined ? 'neutral' : v >= s.pass ? 'ok' : 'risk');

/** Semester overview of every subject's grade (RF-96, RF-98). */
export default function Grades() {
  const { subjects } = useSubjects();
  const { semesters } = useActiveSemester();
  const all = useRows('subjects');
  const wm = useWM();
  const graded = subjects.filter((s) => s.grading);
  const finals = graded.map((s) => summarize(s.grading!)).map((x) => x.final ?? x.projected).filter((v): v is number => v !== undefined);

  return (
    <div className="app scroll">
      <h2>Calificaciones del semestre</h2>
      <p className="hint">Configura en cada materia cómo pondera el profe (pestaña «Calificación»). Aquí ves cómo vas en todas.</p>
      {subjects.length === 0 && <Empty>Primero agrega tus materias.</Empty>}
      <div className="grade-cards">
        {subjects.map((s) => {
          const sum = s.grading ? summarize(s.grading) : undefined;
          const v = sum?.final ?? sum?.projected;
          return (
            <button key={s.id} className={`grade-card ${s.grading ? status(s.grading, v) : 'neutral'}`} onClick={() => wm.open('subjects', { subjectId: s.id, tab: 'calif' })}>
              <span className="gc-title"><SubjectIcon s={s} /> {s.name}</span>
              {s.professor && <span className="hint">{s.professor}</span>}
              {sum ? (
                <>
                  <span className="gc-big">{fmtG(v)}</span>
                  <span className="hint">{sum.final !== undefined ? 'calificación final' : v !== undefined ? 'proyectada si sigues así' : 'sin calificaciones aún'}</span>
                  <span className="hint">asegurado: {fmtG(sum.secured)} · falta evaluar {fmtPct(sum.remaining)}</span>
                </>
              ) : (
                <span className="hint">Sin configurar · toca para definir ponderaciones</span>
              )}
            </button>
          );
        })}
      </div>
      {finals.length > 0 && (
        <p className="notice">Promedio estimado del semestre: <b>{fmtG(finals.reduce((a, b) => a + b, 0) / finals.length)}</b> ({finals.length} materia{finals.length > 1 ? 's' : ''} con datos).</p>
      )}
      <History semesters={semesters} subjects={all} />
    </div>
  );
}

function History({ semesters, subjects }: { semesters: { id: string; name: string; status: string }[]; subjects: Subject[] }) {
  const past = semesters.filter((s) => s.status === 'archivado');
  if (!past.length) return null;
  return (
    <>
      <div className="section-title">Semestres anteriores</div>
      {past.map((sem) => {
        const list = subjects.filter((s) => s.semesterId === sem.id && s.grading);
        const vals = list.map((s) => summarize(s.grading!).final).filter((v): v is number => v !== undefined);
        return (
          <div key={sem.id} className="hist-row">
            <b>{sem.name}</b>: {vals.length ? `promedio ${fmtG(vals.reduce((a, b) => a + b, 0) / vals.length)}` : 'sin calificaciones finales'}
            <span className="hint"> · {list.map((s) => `${s.name} ${fmtG(summarize(s.grading!).final)}`).join(' · ')}</span>
          </div>
        );
      })}
    </>
  );
}

/** Per-subject grading: professor weights per unit + ordinary, scores, and what each one is worth. */
export function GradesTab({ s }: { s: Subject }) {
  const g = s.grading;
  const [target, setTarget] = useState(8);
  const [whatIf, setWhatIf] = useState<number | ''>('');
  const save = (next: GradingScheme) => void patch('subjects', s.id, { grading: next });

  if (!g)
    return (
      <div className="welcome left">
        <h3>Calificación de {s.name}</h3>
        <p>Usa el esquema de la UNISTMO: <b>50%</b> el promedio de las 3 unidades y <b>50%</b> el ordinario. Después ajustas cómo pondera {s.professor || 'el profe'} cada unidad (examen, tareas, prácticas…) y el ordinario.</p>
        <Btn primary onClick={() => save(unistmoScheme())}>Configurar esquema UNISTMO</Btn>
      </div>
    );

  const sum = summarize(g);
  const cs = contributions(g);
  const share = (it: GradeItem) => cs.find((c) => c.item.id === it.id);
  const need = needed(g, target);
  const shown = sum.final ?? sum.projected;
  const sim = whatIf === '' ? undefined : sum.secured + sum.remaining * Number(whatIf);

  const setUnits = (units: GradingScheme['units']) => save({ ...g, units });
  const updItem = (list: GradeItem[], id: string, c: Partial<GradeItem>) => list.map((i) => (i.id === id ? { ...i, ...c } : i));

  const itemsTable = (items: GradeItem[], onChange: (items: GradeItem[]) => void) => (
    <table className="grid-table grades-table">
      <thead>
        <tr><th>Actividad</th><th>Peso</th><th>Calificación</th><th title="Porcentaje de tu calificación final">Vale de la final</th><th title="Puntos que ya suma a tu final">Aporta</th><th /></tr>
      </thead>
      <tbody>
        {items.map((it) => {
          const c = share(it);
          return (
            <tr key={it.id}>
              <td><Input value={it.name} onChange={(e) => onChange(updItem(items, it.id, { name: e.target.value }))} aria-label="Actividad" /></td>
              <td className="num"><Input type="number" min={0} max={100} value={it.weight} onChange={(e) => onChange(updItem(items, it.id, { weight: +e.target.value || 0 }))} aria-label="Peso %" />%</td>
              <td className="num score">
                <Input type="number" min={0} step="0.1" value={it.score ?? ''} placeholder="—" onChange={(e) => onChange(updItem(items, it.id, { score: e.target.value === '' ? undefined : +e.target.value }))} aria-label="Calificación" />
                <span>/</span>
                <Input type="number" min={1} value={it.max ?? g.scale} onChange={(e) => onChange(updItem(items, it.id, { max: +e.target.value || g.scale }))} aria-label="Sobre" />
              </td>
              <td className="num"><b>{c ? fmtPct(c.share) : '—'}</b></td>
              <td className="num">{c?.earned !== undefined ? `+${fmtG(c.earned)}` : '—'}</td>
              <td><Btn small aria-label="Quitar actividad" onClick={() => onChange(items.filter((x) => x.id !== it.id))}>×</Btn></td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  const groupFoot = (items: GradeItem[], label: string) => {
    const c = calcGroup(items, g.scale);
    return (
      <div className="group-foot">
        <span className={Math.abs(c.totalW - 100) > 0.01 ? 'late' : ''}>Pesos: {c.totalW}%</span>
        <span>{label}: <b>{fmtG(c.final ?? c.current)}</b>{c.final === undefined && c.current !== undefined ? ' (parcial, con lo calificado)' : ''}</span>
      </div>
    );
  };

  return (
    <div className="grades">
      <div className={`grade-summary ${status(g, shown)}`}>
        <div className="gs-main">
          <span className="gs-big">{fmtG(shown === undefined ? undefined : round(shown, g.rounding))}</span>
          <span>{sum.final !== undefined ? 'Calificación final' : shown !== undefined ? 'Final proyectada (si sigues con tu promedio actual)' : 'Aún no hay calificaciones'}</span>
        </div>
        <div className="gs-facts">
          <span>Asegurado: <b>{fmtG(sum.secured)}</b> de {g.scale}</span>
          <span>Máximo posible: <b>{fmtG(sum.maxPossible)}</b></span>
          <span>Falta evaluar: <b>{fmtPct(sum.remaining)}</b> de la final</span>
          {sum.performance !== undefined && <span>Tu promedio en lo evaluado: <b>{fmtG(sum.performance)}</b></span>}
        </div>
      </div>
      <p className="formula">
        Final = {g.unitsWeight}% × promedio de unidades ({fmtG(sum.unitsAvg)}) + {g.ordinaryWeight}% × ordinario ({fmtG(sum.ordinary)}). Aprobatoria: {g.pass}.
      </p>
      {sum.warnings.map((w) => <div key={w} className="warn">⚠ {w}</div>)}

      <div className="goal-box">
        <label>Quiero sacar <Input type="number" min={0} max={g.scale} step="0.1" value={target} onChange={(e) => setTarget(+e.target.value)} className="input mini" /></label>
        <span>
          {need.verdict === 'sin_pendientes' && 'Ya no queda nada por evaluar.'}
          {need.verdict === 'asegurado' && <>¡Ya lo tienes asegurado! 🎉</>}
          {need.verdict === 'ok' && <>Necesitas promediar <b>{fmtG(need.value)}</b> en todo lo que falta.</>}
          {need.verdict === 'imposible' && <>Necesitarías {fmtG(need.value)} en lo que falta: ya no se alcanza con lo que queda.</>}
        </span>
        <label>¿Y si en lo que falta saco <Input type="number" min={0} max={g.scale} step="0.1" value={whatIf} placeholder="?" onChange={(e) => setWhatIf(e.target.value === '' ? '' : +e.target.value)} className="input mini" />?</label>
        {sim !== undefined && <span>Final: <b>{fmtG(round(sim, g.rounding))}</b></span>}
      </div>

      {g.units.map((u) => (
        <section key={u.id} className="grade-group">
          <header>
            <Input className="input group-name" value={u.name} onChange={(e) => setUnits(g.units.map((x) => (x.id === u.id ? { ...x, name: e.target.value } : x)))} aria-label="Nombre de la unidad" />
            <Chip>vale {fmtPct(cs.filter((c) => u.items.some((i) => i.id === c.item.id)).reduce((a, c) => a + c.share, 0))} de la final</Chip>
            <span className="grow" />
            <Select value="" onChange={(e) => { const t = TEMPLATES[+e.target.value]; if (t) setUnits(g.units.map((x) => (x.id === u.id ? { ...x, items: t.items.map(([n, w]) => item(n, w)) } : x))); }} aria-label="Plantilla">
              <option value="">Plantilla…</option>
              {TEMPLATES.map((t, i) => <option key={t.name} value={i}>{t.name}</option>)}
            </Select>
            <Btn small onClick={async () => { if (await askConfirm(`¿Quitar ${u.name} y sus calificaciones?`, { title: 'Confirmar eliminación', danger: true, ok: 'Sí', cancel: 'No' })) setUnits(g.units.filter((x) => x.id !== u.id)); }}>Quitar</Btn>
          </header>
          {itemsTable(u.items, (items) => setUnits(g.units.map((x) => (x.id === u.id ? { ...x, items } : x))))}
          <div className="row-btns">
            <Btn small onClick={() => setUnits(g.units.map((x) => (x.id === u.id ? { ...x, items: [...x.items, item('Actividad', 0)] } : x)))}>+ Actividad</Btn>
          </div>
          {groupFoot(u.items, `Calificación ${u.name}`)}
        </section>
      ))}
      <Btn small onClick={() => setUnits([...g.units, unit(`Unidad ${g.units.length + 1}`)])}>+ Unidad</Btn>

      <section className="grade-group ordinary">
        <header>
          <b>Ordinario</b>
          <Chip>vale {g.ordinaryWeight}% de la final</Chip>
          <span className="grow" />
          <Select value="" onChange={(e) => { const t = TEMPLATES[+e.target.value]; if (t) save({ ...g, ordinary: t.items.map(([n, w]) => item(n, w)) }); }} aria-label="Plantilla">
            <option value="">Plantilla…</option>
            {TEMPLATES.map((t, i) => <option key={t.name} value={i}>{t.name}</option>)}
          </Select>
        </header>
        {itemsTable(g.ordinary, (ordinary) => save({ ...g, ordinary }))}
        <div className="row-btns">
          <Btn small onClick={() => save({ ...g, ordinary: [...g.ordinary, item('Actividad', 0)] })}>+ Actividad</Btn>
          <Btn small onClick={() => save({ ...g, ordinary: [item('Proyecto final', 100)] })}>100% proyecto</Btn>
          <Btn small onClick={() => save({ ...g, ordinary: [item('Examen ordinario', 50), item('Proyecto', 50)] })}>50% examen · 50% proyecto</Btn>
        </div>
        {groupFoot(g.ordinary, 'Calificación del ordinario')}
        <Field label="¿Qué dijo el profe que tratará el ordinario/proyecto?" wide>
          <textarea className="input" rows={2} value={g.ordinaryNote ?? ''} onChange={(e) => save({ ...g, ordinaryNote: e.target.value })} />
        </Field>
      </section>

      <details className="grade-config">
        <summary>Ajustes del esquema</summary>
        <div className="form">
          <Field label="Peso de las unidades (%)"><Input type="number" value={g.unitsWeight} onChange={(e) => save({ ...g, unitsWeight: +e.target.value || 0 })} /></Field>
          <Field label="Peso del ordinario (%)"><Input type="number" value={g.ordinaryWeight} onChange={(e) => save({ ...g, ordinaryWeight: +e.target.value || 0 })} /></Field>
          <Field label="Calificación aprobatoria"><Input type="number" step="0.1" value={g.pass} onChange={(e) => save({ ...g, pass: +e.target.value || 0 })} /></Field>
          <Field label="Escala"><Select value={g.scale} onChange={(e) => save({ ...g, scale: +e.target.value })}><option value={10}>0 – 10</option><option value={100}>0 – 100</option></Select></Field>
          <Field label="Redondeo de la final">
            <Select value={g.rounding ?? 'ninguno'} onChange={(e) => save({ ...g, rounding: e.target.value as GradingScheme['rounding'] })}>
              <option value="ninguno">Sin redondear (2 decimales)</option>
              <option value="decimal">A un decimal</option>
              <option value="entero">A entero (.5 sube)</option>
            </Select>
          </Field>
          <Field label="Unidades con peso distinto">
            <span className="hint">Normalmente las 3 valen lo mismo. Si no, escribe el peso de cada una:</span>
          </Field>
          {g.units.map((u) => (
            <Field key={u.id} label={`Peso de ${u.name}`}>
              <Input type="number" placeholder="igual" value={u.weight ?? ''} onChange={(e) => setUnits(g.units.map((x) => (x.id === u.id ? { ...x, weight: e.target.value === '' ? undefined : +e.target.value } : x)))} />
            </Field>
          ))}
          <div className="wide"><Btn small onClick={async () => { if (await askConfirm('¿Borrar todo el esquema de calificación de esta materia?', { ...{ title: 'Confirmar eliminación', danger: true, ok: 'Sí', cancel: 'No' }, detail: 'Se perderán las ponderaciones y calificaciones registradas.' })) void patch('subjects', s.id, { grading: undefined }); }}>Borrar esquema</Btn></div>
        </div>
      </details>
      <p className="hint">Cómo se calcula: cada actividad vale (peso del grupo) × (su peso ÷ suma de pesos del grupo). «Asegurado» suma solo lo ya calificado; «proyectada» supone que lo que falta lo sacas con tu promedio actual.</p>
    </div>
  );
}
