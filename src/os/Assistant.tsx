import { useEffect, useState } from 'react';
import { create, useLocal, useSubjects } from '../db';
import { useInsights, type Insight } from '../lib/insights';
import { KIND_LABEL, parseCapture } from '../lib/parse';
import { useUnlocked } from '../lib/stickers';
import { Pixel } from '../pixel/Pixel';
import { stickerById } from '../pixel/stickers';
import { CatSprite, useCat } from '../pixel/cat';
import { useWM } from './wm';

export type AssistantId = 'clippy' | 'cat';

/** Desktop assistant: explainable insights from the user's data, sticker news, and quick capture. */
export function Assistant({ who: rawWho, onHide }: { who: AssistantId | 'rover'; onHide: () => void }) {
  const who: AssistantId = rawWho === 'rover' ? 'cat' : rawWho; // Rover was retired; old settings become the cat
  const cat = useCat();
  const ch =
    who === 'cat'
      ? { name: cat.name || 'Michi', placeholder: '¡Miau! ¿Qué anoto?', hello: 'Miau~ Aquí estoy si necesitas anotar algo.' }
      : { name: 'Clippy', placeholder: '¿Algo que no quieras olvidar?', hello: 'Parece que estás estudiando. ¿Necesitas ayuda?' };
  const [tailUp, setTailUp] = useState(false);
  const base = useInsights();
  const unlocked = useUnlocked();
  const [seen, setSeen] = useLocal<string[] | null>('seenStickers', null);
  const { subjects } = useSubjects();
  const wm = useWM();
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);
  const [blink, setBlink] = useState(false);
  const [text, setText] = useState('');
  const [saved, setSaved] = useState<string | null>(null);
  const [seenAlert, setSeenAlert] = useState<string | null>(null);

  // First run: everything already unlocked counts as seen, so only genuinely new stickers are announced.
  useEffect(() => {
    if (seen === null && unlocked.size) void setSeen([...unlocked]);
  }, [seen, unlocked.size]);
  const fresh = seen ? [...unlocked].filter((id) => !seen.includes(id)) : [];
  const stickerNews: Insight[] = fresh.map((id) => ({
    id: `sticker-${id}`,
    tone: 'alert',
    text: `¡Desbloqueaste el sticker «${stickerById(id)?.name}»! Pégalo en tu escritorio.`,
    action: { label: 'Ver álbum', app: 'stickers' },
  }));
  const insights = [...stickerNews, ...base];

  useEffect(() => {
    const id = setInterval(() => {
      setBlink(true);
      setTimeout(() => setBlink(false), 160);
    }, 4200);
    const wag = setInterval(() => setTailUp((t) => !t), 900);
    return () => {
      clearInterval(id);
      clearInterval(wag);
    };
  }, []);

  const firstAlert = insights.find((i) => i.tone === 'alert' || i.id === 'onboard');
  useEffect(() => {
    if (firstAlert && firstAlert.id !== seenAlert) {
      setSeenAlert(firstAlert.id);
      setIdx(0);
      setOpen(true);
    }
  }, [firstAlert?.id]);

  const msg = insights[idx % insights.length];

  const next = () => {
    if (msg?.id.startsWith('sticker-') && seen) void setSeen([...seen, msg.id.slice(8)]);
    setIdx((i) => i + 1);
  };

  const capture = async () => {
    if (!text.trim()) return;
    const p = parseCapture(text, subjects);
    setText('');
    await create('inbox', { text: p.text, kind: p.kind, subjectId: p.subjectId, tags: p.tags, due: p.due, dueTime: p.dueTime, estimateMin: p.estimateMin, priority: p.priority, processed: false });
    setSaved(`${who === 'cat' ? '¡Miau! ' : ''}Guardado en la Bandeja como «${KIND_LABEL[p.kind]}».`);
    setTimeout(() => setSaved(null), 2500);
  };

  return (
    <div className={`assistant ${who}`}>
      {open && msg && (
        <div className="bubble" role="status">
          <button className="bubble-x" aria-label="Cerrar globo" onClick={() => setOpen(false)}>×</button>
          <div className="bubble-name">{ch.name}</div>
          <p className={msg.tone === 'alert' ? 'alert' : ''}>{saved ?? msg.text}</p>
          <div className="bubble-actions">
            {msg.action && (
              <button className="link" onClick={() => { wm.open(msg.action!.app, msg.action!.props); next(); }}>
                {msg.action.label}
              </button>
            )}
            <button className="link muted" onClick={next}>Otro consejo</button>
          </div>
          <form className="bubble-capture" onSubmit={(e) => { e.preventDefault(); void capture(); }}>
            <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder={ch.placeholder} aria-label="Captura rápida" />
          </form>
          <button className="link muted tiny" onClick={onHide}>Ocultar a {ch.name}</button>
        </div>
      )}
      <button className="assistant-sprite" aria-label={`${ch.name}, tu asistente`} title={ch.hello} onClick={() => setOpen((o) => !o)}>
        {who === 'cat' ? (
          <CatSprite frame={blink ? 'catBlink' : tailUp ? 'catTail' : 'cat'} scale={3} palette={cat.palette} />
        ) : (
          <Pixel sprite={blink ? 'clippyBlink' : 'clippy'} scale={4} />
        )}
      </button>
    </div>
  );
}
