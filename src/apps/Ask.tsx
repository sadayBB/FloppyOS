import { useEffect, useRef, useState } from 'react';
import { askAboutMyData } from '../lib/aiFeatures';
import { AiBadge, useAiReady } from '../os/Ai';
import { Btn } from '../os/ui';
import { useWM } from '../os/wm';
import { CatSprite, useCat } from '../pixel/cat';

const IDEAS = [
  '¿Qué debería estudiar hoy?',
  '¿Qué temas me falta repasar?',
  '¿Cómo voy en mis calificaciones?',
  '¿Qué entregas tengo esta semana?',
  'Arma un plan de repaso para mi próximo examen',
];

type Msg = { role: 'user' | 'assistant'; content: string };

/** Chat grounded in the student's own data (RF-115, RF-117, RF-118). */
export default function Ask() {
  const ready = useAiReady();
  const wm = useWM();
  const cat = useCat();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => end.current?.scrollIntoView({ behavior: 'smooth' }), [msgs.length, busy]);

  const send = async (text: string) => {
    if (!text.trim() || busy) return;
    const history: Msg[] = [...msgs, { role: 'user', content: text.trim() }];
    setMsgs(history);
    setQ('');
    setBusy(true);
    setErr(null);
    try {
      setMsgs([...history, { role: 'assistant', content: await askAboutMyData(history) }]);
    } catch (e) {
      setErr((e as Error).message);
      setMsgs(msgs); // drop the unanswered question so it can be retried
      setQ(text);
    }
    setBusy(false);
  };

  if (!ready)
    return (
      <div className="app center">
        <div className="welcome">
          <CatSprite scale={4} palette={cat.palette} />
          <h3>Pregúntale a {cat.name || 'Michi'}</h3>
          <p>Para usar la IA necesitas una clave de API de Claude. Se guarda solo en este dispositivo.</p>
          <Btn primary onClick={() => wm.open('settings', { tab: 'ai' })}>Configurar IA</Btn>
        </div>
      </div>
    );

  return (
    <div className="app">
      <div className="scroll ai-chat">
        {msgs.length === 0 && (
          <div className="welcome left">
            <h3>Pregúntale a {cat.name || 'Michi'} sobre tu semestre</h3>
            <p className="hint">Respondo con lo que tienes registrado en FloppyOS (materias, temario, tareas, agenda, calificaciones). Si algo no está registrado, te lo digo.</p>
            <div className="chips-wrap">
              {IDEAS.map((i) => <button key={i} className="chip-toggle" onClick={() => void send(i)}>{i}</button>)}
            </div>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={`ai-msg ${m.role === 'user' ? 'me' : ''}`}>
            {m.role === 'assistant' && <AiBadge label={cat.name || 'Michi'} />}
            <div>{m.content}</div>
          </div>
        ))}
        {busy && <div className="ai-msg hint">Pensando… 🐾</div>}
        {err && <div className="warn">⚠ {err}</div>}
        <div ref={end} />
      </div>
      <form className="capture" onSubmit={(e) => { e.preventDefault(); void send(q); }}>
        <input className="input big" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Escribe tu pregunta…" aria-label="Pregunta" />
        <Btn primary type="submit" disabled={busy || !q.trim()}>Enviar</Btn>
      </form>
      <p className="hint">Al enviar, un resumen de tus datos académicos se manda a Claude (Anthropic) para responder.</p>
    </div>
  );
}
