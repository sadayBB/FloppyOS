import { useActiveSemester, useRows, useSetting, useSubjects } from '../db';
import { addDays, DAYS_SHORT, diffDays, fmtDur, fmtLong, nowHHMM, relDay, startOfWeek, today, toISO, weekday } from '../lib/dates';
import { useInsights } from '../lib/insights';
import { EVENT_KIND, isOpen, PRIORITY } from '../lib/labels';
import { Btn, Chip, Dot, Empty, Progress } from '../os/ui';
import { useWM } from '../os/wm';
import { toggleDone } from './Tasks';
import { useState } from 'react';
import { suggestNext } from '../lib/nextAction';
import { topicRank } from '../lib/labels';
import { SubjectIcon } from './SubjectIcon';
import { Pixel } from '../pixel/Pixel';

/** Daily dashboard (RF-102, RF-48, RF-60, RF-103). */
export default function Today() {
  const wm = useWM();
  const t = today();
  const { active } = useActiveSemester();
  const { subjects } = useSubjects();
  const slots = useRows('slots');
  const tasks = useRows('tasks');
  const events = useRows('events');
  const inbox = useRows('inbox');
  const sessions = useRows('sessions');
  const [capacity] = useSetting('dailyCapacityMin', 240);
  const [weeklyGoal] = useSetting('weeklyGoalMin', 600);
  const insights = useInsights().filter((i) => i.tone !== 'tip');

  const sub = (id?: string) => subjects.find((s) => s.id === id);
  const subjectIds = new Set(subjects.map((s) => s.id));
  const now = nowHHMM();
  const inSem = !active || (t >= active.start && t <= active.end);
  const classes = inSem ? slots.filter((s) => s.weekday === weekday(t) && (!s.subjectId || subjectIds.has(s.subjectId))).sort((a, b) => a.start.localeCompare(b.start)) : [];
  const open = tasks.filter((x) => isOpen(x.status));
  const focus = open.filter((x) => x.due && x.due <= t).sort((a, b) => b.priority - a.priority);
  const upcoming = [
    ...events.filter((e) => e.date > t && diffDays(e.date, t) <= 14 && (e.kind === 'examen' || e.kind === 'entrega')).map((e) => ({ key: e.id, date: e.date, title: e.title, color: EVENT_KIND[e.kind].color, label: EVENT_KIND[e.kind].label })),
    ...open.filter((x) => x.due && x.due > t && diffDays(x.due, t) <= 14).map((x) => ({ key: x.id, date: x.due!, title: x.title, color: sub(x.subjectId)?.color ?? '#a89c8e', label: 'Tarea' })),
  ].sort((a, b) => a.date.localeCompare(b.date));
  const pending = inbox.filter((i) => !i.processed).length;
  const wk = startOfWeek(t);
  const weekMin = sessions.filter((s) => toISO(new Date(s.startedAt)) >= wk).reduce((a, s) => a + s.focusMin, 0);
  const weekDone = tasks.filter((x) => x.completedAt && toISO(new Date(x.completedAt)) >= wk).length;

  const days = Array.from({ length: 14 }, (_, i) => addDays(t, i));
  const load = days.map((d) => open.filter((x) => x.due === d).reduce((a, x) => a + (x.estimateMin ?? 30), 0) + events.filter((e) => e.date === d && (e.kind === 'examen' || e.kind === 'entrega')).length * 120);
  const maxLoad = Math.max(capacity, ...load);

  return (
    <div className="app today scroll">
      <div className="today-head">
        <div>
          <h2>{fmtLong(t)}</h2>
          <span className="hint">{active ? `Semestre ${active.name}` : 'Sin semestre configurado'}</span>
        </div>
        <Btn onClick={() => wm.open('inbox')}>Bandeja{pending ? ` (${pending})` : ''}</Btn>
      </div>

      {insights.length > 0 && (
        <ul className="insights">
          {insights.slice(0, 4).map((i) => (
            <li key={i.id} className={i.tone}>
              {i.text}
              {i.action && <button className="link" onClick={() => wm.open(i.action!.app, i.action!.props)}>{i.action.label}</button>}
            </li>
          ))}
        </ul>
      )}

      <NextUp />
      <Drives />

      <div className="cards">
        <section className="card">
          <h3>Clases de hoy</h3>
          {classes.length === 0 ? <Empty>Hoy no hay clases.</Empty> : (
            <ul className="plain">
              {classes.map((c) => (
                <li key={c.id} className={c.end < now ? 'past' : ''}>
                  <Dot color={sub(c.subjectId)?.color ?? '#999'} /> <b>{c.start}</b>–{c.end} {sub(c.subjectId)?.name ?? c.title}
                  {c.room && <span className="hint"> · {c.room}</span>}
                  {sub(c.subjectId) && <button className="link" onClick={() => wm.open('subjects', { subjectId: c.subjectId, tab: 'clases' })}>modo clase</button>}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <h3>Para hoy</h3>
          {focus.length === 0 ? <Empty>Nada vence hoy. 🌱</Empty> : (
            <ul className="plain">
              {focus.slice(0, 8).map((x) => (
                <li key={x.id}>
                  <input type="checkbox" checked={false} onChange={() => void toggleDone(x)} aria-label="Completar" />
                  <span style={{ color: PRIORITY[x.priority].color }}>{PRIORITY[x.priority].mark}</span>{' '}
                  <button className="link plain-link" onClick={() => wm.open('tasks', { taskId: x.id })}>{x.title}</button>
                  {x.due! < t && <span className="late"> · {relDay(x.due!)}</span>}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <h3>Próximas 2 semanas</h3>
          {upcoming.length === 0 ? <Empty>Sin entregas ni exámenes a la vista.</Empty> : (
            <ul className="plain">
              {upcoming.slice(0, 8).map((u) => (
                <li key={u.key}><Chip color={u.color}>{u.label}</Chip> {u.title} <span className="hint">· {relDay(u.date)}</span></li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <h3>Esta semana</h3>
          <p>{fmtDur(weekMin)} de estudio · meta {fmtDur(weeklyGoal)}</p>
          <Progress value={weekMin / weeklyGoal} color="#6fae9f" />
          <p>{weekDone} tarea{weekDone === 1 ? '' : 's'} completada{weekDone === 1 ? '' : 's'}</p>
          <Btn small onClick={() => wm.open('timer')}>▶ Sesión de estudio</Btn>
        </section>
      </div>

      <section className="card">
        <h3>Carga estimada · 14 días</h3>
        <div className="loadchart" role="img" aria-label="Minutos de trabajo estimado por día">
          {days.map((d, i) => (
            <div key={d} className="lc-col" title={`${relDay(d)}: ~${fmtDur(load[i])}`}>
              <div className="lc-bar-wrap">
                <div className="lc-cap" style={{ bottom: `${(capacity / maxLoad) * 100}%` }} />
                <div className={`lc-bar ${load[i] > capacity ? 'over' : ''}`} style={{ height: `${(load[i] / maxLoad) * 100}%` }} />
              </div>
              <span className={d === t ? 'today' : ''}>{DAYS_SHORT[weekday(d)][0]}{new Date(d + 'T00:00').getDate()}</span>
            </div>
          ))}
        </div>
        <p className="hint">Tareas pendientes según su estimado (30 min si no tiene) + 2 h por cada examen o entrega. La línea punteada es tu capacidad diaria ({fmtDur(capacity)}).</p>
      </section>
    </div>
  );
}

/** «¿Qué hago ahora?»: top suggestions with their reasons, no AI involved. */
function NextUp() {
  const wm = useWM();
  const { subjects } = useSubjects();
  const data = { tasks: useRows('tasks'), events: useRows('events'), topics: useRows('topics'), cards: useRows('cards'), slots: useRows('slots'), subjects };
  const [open, setOpen] = useState(false);
  const list = suggestNext(data);
  return (
    <section className="card nextup">
      <h3>¿Qué hago ahora?</h3>
      {!open ? (
        <div className="nextup-cta">
          <Btn primary onClick={() => setOpen(true)} disabled={!list.length}>▶ Sugiéreme qué hacer</Btn>
          <span className="hint">{list.length ? 'Según tus fechas, temas pendientes y calificaciones.' : 'No hay nada urgente. ¡Buen momento para adelantar o descansar!'}</span>
        </div>
      ) : (
        <ol className="nextup-list">
          {list.slice(0, 3).map((s, i) => (
            <li key={s.id} className={i === 0 ? 'top' : ''}>
              <div className="grow">
                <b>{s.title}</b>
                <div className="hint">{s.why}</div>
              </div>
              <Btn small primary={i === 0} onClick={() => wm.open(s.action.app, s.action.props)}>{s.action.label}</Btn>
            </li>
          ))}
          <li className="nextup-foot"><button className="link muted" onClick={() => setOpen(false)}>Ocultar</button></li>
        </ol>
      )}
    </section>
  );
}

const LETTERS = 'CDEFGHIJKLMNOPQRSTUVWXYZ';

/** «Mi PC»: each subject as a drive whose "used space" is syllabus progress. */
function Drives() {
  const wm = useWM();
  const { subjects } = useSubjects();
  const topics = useRows('topics');
  if (!subjects.length) return null;
  return (
    <section className="card drives">
      <h3>Mi PC</h3>
      <div className="drive-grid">
        {subjects.map((s, i) => {
          const ts = topics.filter((t) => t.subjectId === s.id);
          const leaves = ts.filter((t) => !ts.some((c) => c.parentId === t.id));
          const base = leaves.length ? leaves : ts;
          const done = base.filter((t) => topicRank(t.status) >= topicRank('estudiado')).length;
          const pct = base.length ? done / base.length : 0;
          return (
            <button key={s.id} className="drive" onClick={() => wm.open('subjects', { subjectId: s.id, tab: 'temario' })} title={`${done} de ${base.length} temas estudiados`}>
              <span className="drive-icon">{s.icon || s.iconImage ? <SubjectIcon s={s} big /> : <Pixel sprite="floppy" scale={2} />}</span>
              <span className="drive-info">
                <b className="ellipsis">{s.name} ({LETTERS[i] ?? '?'}:)</b>
                <span className="drive-bar"><i style={{ width: `${Math.round(pct * 100)}%`, background: s.color }} /></span>
                <span className="hint">{base.length ? `${done} de ${base.length} temas estudiados` : 'Sin temario'}</span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
