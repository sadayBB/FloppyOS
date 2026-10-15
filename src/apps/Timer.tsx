import { useEffect, useState } from 'react';
import { create, patch, useRows, useSetting, useSubjects, type ID, type TopicStatus } from '../db';
import { fmtDur, startOfWeek, today, toISO } from '../lib/dates';
import { isOpen, topicRank } from '../lib/labels';
import { fmtClock, remainingMs, timer, totals, useTimer } from '../lib/timer';
import { Btn, Dot, Field, Input, Progress, Select, SubjectSelect } from '../os/ui';
import { askConfirm } from '../os/dialogs';

export default function Timer({ subjectId, topicId, taskId }: { subjectId?: ID; topicId?: ID; taskId?: ID }) {
  const s = useTimer();
  const { subjects } = useSubjects();
  const topics = useRows('topics');
  const tasks = useRows('tasks');
  const sessions = useRows('sessions');
  const [focusMin, setFocusMin] = useSetting('focusMin', 25);
  const [breakMin, setBreakMin] = useSetting('breakMin', 5);
  const [longBreakMin] = useSetting('longBreakMin', 15);
  const [weeklyGoal] = useSetting('weeklyGoalMin', 600);

  useEffect(() => timer.setConfig({ focusMin, breakMin, longBreakMin, longEvery: 4 }), [focusMin, breakMin, longBreakMin]);
  useEffect(() => {
    if (s.phase === 'idle' && (subjectId || topicId || taskId)) timer.setLinks({ subjectId, topicId, taskId });
  }, [subjectId, topicId, taskId]);

  const subTopics = topics.filter((t) => t.subjectId === s.subjectId);
  const subTasks = tasks.filter((t) => isOpen(t.status) && (!s.subjectId || t.subjectId === s.subjectId));
  const { focusMs, breakMs } = totals(s);
  const rem = remainingMs(s);
  const phaseLen = (s.phase === 'break' ? breakMin : focusMin) * 60000;

  const wkStart = startOfWeek(today());
  const weekSessions = sessions.filter((x) => toISO(new Date(x.startedAt)) >= wkStart);
  const weekMin = weekSessions.reduce((a, x) => a + x.focusMin, 0);
  const bySubject = subjects.map((sub) => ({ sub, min: weekSessions.filter((x) => x.subjectId === sub.id).reduce((a, x) => a + x.focusMin, 0) })).filter((x) => x.min > 0);

  // Picking up where you left off (RF-82)
  const last = [...sessions].filter((x) => (s.taskId && x.taskId === s.taskId) || (s.topicId && x.topicId === s.topicId)).sort((a, b) => b.endedAt - a.endedAt)[0];

  if (s.awaitingClose) return <CloseSession focusMin={Math.round(focusMs / 60000)} breakMin={Math.round(breakMs / 60000)} />;

  return (
    <div className="app timer-app scroll">
      <div className={`clock-face ${s.phase}`}>
        <div className="phase">{s.phase === 'idle' ? 'Listo para estudiar' : s.phase === 'focus' ? `Concentración · ciclo ${s.cycles + 1}` : 'Descanso'}{!s.running && s.phase !== 'idle' ? ' (pausa)' : ''}</div>
        <div className="digits">{fmtClock(s.phase === 'idle' ? focusMin * 60000 : rem)}</div>
        {s.phase !== 'idle' && <Progress value={1 - rem / phaseLen} color={s.phase === 'break' ? '#6fae9f' : '#8a5a8e'} />}
        {s.phase !== 'idle' && <div className="hint">Estudio efectivo: {fmtDur(focusMs / 60000)} · descanso: {fmtDur(breakMs / 60000)}</div>}
      </div>

      <div className="timer-controls">
        {s.phase === 'idle' && <Btn primary onClick={() => timer.start()}>▶ Empezar</Btn>}
        {s.phase !== 'idle' && s.running && <Btn onClick={() => timer.pause()}>❚❚ Pausa</Btn>}
        {s.phase !== 'idle' && !s.running && <Btn primary onClick={() => timer.resume()}>▶ Reanudar</Btn>}
        {s.phase !== 'idle' && <Btn onClick={() => timer.skip()}>{s.phase === 'focus' ? 'Ir a descanso' : 'Saltar descanso'}</Btn>}
        {s.phase !== 'idle' && <Btn onClick={() => timer.stop()}>■ Terminar</Btn>}
        {s.phase !== 'idle' && <Btn onClick={async () => { if (await askConfirm('¿Descartar esta sesión?', { danger: true, detail: 'No se guardará el tiempo estudiado.', ok: 'Descartar' })) timer.reset(); }}>Descartar</Btn>}
      </div>

      <div className="form">
        <Field label="Objetivo de la sesión" wide><Input value={s.goal} onChange={(e) => timer.setLinks({ goal: e.target.value })} placeholder="Ej. resolver 5 ejercicios de normalización" /></Field>
        <Field label="Materia"><SubjectSelect subjects={subjects} value={s.subjectId} onChange={(id) => timer.setLinks({ subjectId: id, topicId: undefined })} /></Field>
        <Field label="Tema">
          <Select value={s.topicId ?? ''} onChange={(e) => timer.setLinks({ topicId: e.target.value || undefined })} disabled={!s.subjectId}>
            <option value="">—</option>
            {subTopics.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
          </Select>
        </Field>
        <Field label="Tarea" wide>
          <Select value={s.taskId ?? ''} onChange={(e) => timer.setLinks({ taskId: e.target.value || undefined })}>
            <option value="">—</option>
            {subTasks.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
          </Select>
        </Field>
        {s.phase === 'idle' && (
          <>
            <Field label="Concentración (min)"><Input type="number" min={5} max={120} value={focusMin} onChange={(e) => setFocusMin(Math.max(1, +e.target.value || 25))} /></Field>
            <Field label="Descanso (min)"><Input type="number" min={1} max={60} value={breakMin} onChange={(e) => setBreakMin(Math.max(1, +e.target.value || 5))} /></Field>
          </>
        )}
        {last && (
          <div className="last-time wide">
            <b>La última vez</b> ({new Date(last.endedAt).toLocaleDateString()}): {last.outcome || 'sin notas'}
            {last.next && <><br /><b>Siguiente paso:</b> {last.next}</>}
          </div>
        )}
      </div>

      <div className="section-title">Esta semana: {fmtDur(weekMin)} de {fmtDur(weeklyGoal)}</div>
      <Progress value={weekMin / weeklyGoal} color="#6fae9f" />
      <ul className="mini-stats">
        {bySubject.map(({ sub, min }) => <li key={sub.id}><Dot color={sub.color} /> {sub.name}: {fmtDur(min)}</li>)}
      </ul>
      <div className="section-title">Sesiones recientes</div>
      <ul className="rows compact">
        {[...sessions].sort((a, b) => b.startedAt - a.startedAt).slice(0, 8).map((x) => (
          <li key={x.id} className="row">
            <div className="row-main">
              <div className="row-title">{x.goal || subjects.find((y) => y.id === x.subjectId)?.name || 'Sesión de estudio'}</div>
              <div className="row-meta">{new Date(x.startedAt).toLocaleString([], { weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} · {fmtDur(x.focusMin)}{x.outcome ? ` · ${x.outcome}` : ''}</div>
            </div>
          </li>
        ))}
      </ul>
      {sessions.length === 0 && <p className="hint">Aquí aparecerán tus sesiones. Empieza con una corta: 25 minutos bastan.</p>}
    </div>
  );
}

function CloseSession({ focusMin, breakMin }: { focusMin: number; breakMin: number }) {
  const s = useTimer();
  const topics = useRows('topics');
  const tasks = useRows('tasks');
  const topic = topics.find((t) => t.id === s.topicId);
  const task = tasks.find((t) => t.id === s.taskId);
  const [outcome, setOutcome] = useState('');
  const [next, setNext] = useState('');
  const [topicStatus, setTopicStatus] = useState<TopicStatus | ''>(topic && topicRank(topic.status) < topicRank('estudiado') ? 'estudiado' : '');
  const [taskDone, setTaskDone] = useState(false);

  const save = async () => {
    await create('sessions', { subjectId: s.subjectId, topicId: s.topicId, taskId: s.taskId, goal: s.goal || undefined, startedAt: s.startedAt ?? Date.now(), endedAt: Date.now(), focusMin, breakMin, outcome: outcome || undefined, next: next || undefined });
    if (topic && topicStatus) await patch('topics', topic.id, { status: topicStatus, statusChangedAt: Date.now() });
    if (task) await patch('tasks', task.id, { spentMin: (task.spentMin ?? 0) + focusMin, ...(taskDone ? { status: 'completada', completedAt: Date.now() } : task.status === 'pendiente' ? { status: 'en_progreso' } : {}) });
    timer.reset();
  };

  return (
    <div className="app scroll">
      <h2>Sesión terminada · {fmtDur(focusMin)} de estudio</h2>
      {s.goal && <p>Objetivo: <i>{s.goal}</i></p>}
      <div className="form">
        <Field label="¿Qué completaste o aprendiste?" wide><textarea className="input" rows={3} value={outcome} onChange={(e) => setOutcome(e.target.value)} /></Field>
        <Field label="¿Qué sigue? (te lo recordaré la próxima vez)" wide><Input value={next} onChange={(e) => setNext(e.target.value)} /></Field>
        {topic && (
          <Field label={`Estado de «${topic.title}»`} wide>
            <Select value={topicStatus} onChange={(e) => setTopicStatus(e.target.value as TopicStatus)}>
              <option value="">Sin cambios</option>
              <option value="estudiado">Estudiado</option>
              <option value="repasado">Repasado</option>
              <option value="dominado">Dominado</option>
            </Select>
          </Field>
        )}
        {task && <label className="check wide"><input type="checkbox" checked={taskDone} onChange={(e) => setTaskDone(e.target.checked)} /> Marcar «{task.title}» como completada</label>}
      </div>
      <div className="timer-controls">
        <Btn onClick={() => timer.reset()}>Descartar</Btn>
        <Btn primary onClick={save}>Guardar sesión</Btn>
      </div>
    </div>
  );
}
