import { useState } from 'react';
import { Btn, Modal } from './ui';

/*
 * Free alternative to the API: builds a ready-to-paste prompt for claude.ai (the user's own
 * subscription), then turns the pasted answer back into app data. Nothing is sent automatically.
 */

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

export function CopyForClaude({
  label,
  title,
  buildPrompt,
  onApply,
  applyLabel = 'Usar respuesta',
  pasteHint = 'Pega aquí lo que respondió Claude.',
  disabled,
}: {
  label: string;
  title: string;
  buildPrompt: () => string;
  onApply?: (answer: string) => Promise<string | void> | string | void;
  applyLabel?: string;
  pasteHint?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [copied, setCopied] = useState<boolean | null>(null);
  const [answer, setAnswer] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  const start = () => {
    setPrompt(buildPrompt());
    setCopied(null);
    setAnswer('');
    setMsg(null);
    setOpen(true);
  };
  const copyAndOpen = async () => {
    setCopied(await copyText(prompt));
    window.open('https://claude.ai/new', '_blank', 'noopener,noreferrer');
  };
  const apply = async () => {
    if (!onApply) return;
    try {
      const r = await onApply(answer.trim());
      if (typeof r === 'string') setMsg(r);
      else setOpen(false);
    } catch (e) {
      setMsg(`⚠ ${(e as Error).message}`);
    }
  };

  return (
    <>
      <Btn small disabled={disabled} onClick={start} title="Usa tu suscripción de claude.ai, sin costo extra">📋 {label}</Btn>
      {open && (
        <Modal
          title={title}
          onClose={() => setOpen(false)}
          footer={
            <>
              <Btn onClick={() => setOpen(false)}>Cerrar</Btn>
              {onApply && <Btn primary disabled={!answer.trim()} onClick={() => void apply()}>{applyLabel}</Btn>}
            </>
          }
        >
          <ol className="steps">
            <li>
              <Btn primary onClick={() => void copyAndOpen()}>Copiar y abrir claude.ai</Btn>{' '}
              {copied === true && <span className="hint">✓ Copiado</span>}
              {copied === false && <span className="hint late">No se pudo copiar solo: selecciona el texto de abajo y cópialo.</span>}
            </li>
            <li>En claude.ai pega el texto (Ctrl+V o mantener presionado → Pegar) y envíalo.</li>
            {onApply ? <li>Copia la respuesta completa de Claude y pégala aquí abajo.</li> : <li>Copia la respuesta y pégala donde la quieras guardar.</li>}
          </ol>
          {onApply && <textarea className="input" rows={7} value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder={pasteHint} />}
          {msg && <p className="notice">{msg}</p>}
          <details>
            <summary className="hint">Ver el texto que se copia</summary>
            <textarea className="input mono" rows={8} readOnly value={prompt} onFocus={(e) => e.target.select()} />
          </details>
        </Modal>
      )}
    </>
  );
}

/** Parses lines like «P: … || R: …» (also «Pregunta: … | Respuesta: …»). */
export function parseCardLines(text: string) {
  const out: { pregunta: string; respuesta: string }[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const m = raw.replace(/^\s*(?:\d+[.)]|[-•*])\s*/, '').match(/^\**\s*P(?:regunta)?\s*:\s*(.+?)\s*\|{1,2}\s*R(?:espuesta)?\s*:\s*(.+?)\**\s*$/i);
    if (m) out.push({ pregunta: m[1].trim(), respuesta: m[2].trim() });
  }
  return out;
}

/** Lines of a list answer, without bullets or numbering. */
export function parseListLines(text: string) {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:\d+[.)]|[-•*]|\[\s?\])\s*/, '').replace(/\*\*/g, '').trim())
    .filter((l) => l.length > 2 && !/:$/.test(l));
}
