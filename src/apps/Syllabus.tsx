import { useRef, useState } from 'react';
import { create, patch, remove, useRows, type ID, type Subject, type Topic, type TopicStatus } from '../db';
import { TOPIC_STATUS, topicRank, topicStatus } from '../lib/labels';
import { Btn, Empty, LazyInput, Modal } from '../os/ui';
import { useWM } from '../os/wm';
import { pdfToText } from '../lib/pdf';
import { AiBadge, AiButton, useAiAction } from '../os/Ai';
import { structureSyllabus } from '../lib/aiFeatures';
import { addReference } from './Bibliography';
import { splitReferences } from '../lib/biblio';

interface Draft {
  title: string;
  depth: number;
  include: boolean;
  flag?: string;
  biblio?: boolean;
  /** Original line, kept so references can be rebuilt exactly. */
  raw?: string;
}

/** Turns pasted syllabus text into a draft hierarchy. Uncertain lines are flagged, never silently dropped. */
export function parseSyllabus(text: string): Draft[] {
  const out: Draft[] = [];
  let inBiblio = false;
  let prevDepth = 0;
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim()) continue;
    const indent = (raw.match(/^[\t ]*/)?.[0] ?? '').replace(/\t/g, '  ').length;
    let line = raw.trim().replace(/^[-•*·▪◦‣]\s*/, '');
    let depth: number;
    let m: RegExpMatchArray | null;

    if (/^(bibliograf[ií]a|referencias|lecturas|fuentes)\b/i.test(line)) {
      inBiblio = true;
      continue;
    }
    if (/^(objetivos?|competencias?|evaluaci[oó]n|criterios|metodolog[ií]a|temario|contenidos?|programa)\b[^.]{0,30}:?$/i.test(line)) {
      inBiblio = false;
      continue;
    }

    if ((m = line.match(/^(unidad|tema|m[oó]dulo|bloque|cap[ií]tulo|parte)\s+([\divxlc]+)\s*[.:)\-–]?\s*(.*)$/i))) {
      depth = 0;
      line = `${m[1][0].toUpperCase()}${m[1].slice(1).toLowerCase()} ${m[2]}${m[3] ? `. ${m[3]}` : ''}`;
    } else if ((m = line.match(/^(\d+(?:\.\d+)*)\.?\)?\s+(.+)$/))) {
      depth = m[1].split('.').filter(Boolean).length - 1;
      line = `${m[1]} ${m[2]}`;
    } else if ((m = line.match(/^([a-z])[.)]\s+(.+)$/i))) {
      depth = prevDepth + 1;
      line = m[2];
    } else {
      depth = Math.floor(indent / 2);
    }
    depth = Math.min(depth, 3);

    const looksBiblio = inBiblio || (/\b(19|20)\d{2}\b/.test(line) && /(,|ed\.|editorial|isbn|doi|pp\.)/i.test(line));
    let flag: string | undefined;
    if (looksBiblio) flag = 'Parece una referencia bibliográfica';
    else if (line.length > 140) flag = 'Línea muy larga: ¿es un tema o una descripción?';
    else if (/\b\d{1,2}[/-]\d{1,2}([/-]\d{2,4})?\b|\bsemana\s+\d+/i.test(line)) flag = 'Contiene una fecha o semana';

    out.push({ title: line, depth, include: !looksBiblio, flag, biblio: looksBiblio, raw: raw.trim() });
    prevDepth = depth;
  }
  return out;
}

export function Syllabus({ subject }: { subject: Subject }) {
  const all = useRows('topics').filter((t) => t.subjectId === subject.id);
  const notes = useRows('notes').filter((n) => n.subjectId === subject.id);
  const sessions = useRows('sessions');
  const wm = useWM();
  const [importing, setImporting] = useState(false);
  const [filter, setFilter] = useState<'all' | 'unreviewed'>('all');

  const children = (pid?: ID) => all.filter((t) => t.parentId === pid).sort((a, b) => a.order - b.order);
  const leaves = all.filter((t) => !all.some((c) => c.parentId === t.id));
  const base = leaves.length ? leaves : all;
  const seen = base.filter((t) => topicRank(t.status) >= topicRank('introducido')).length;
  const studied = base.filter((t) => topicRank(t.status) >= topicRank('estudiado')).length;

  const addTopic = (parentId?: ID) => create('topics', { subjectId: subject.id, parentId, title: parentId ? 'Nuevo subtema' : 'Nueva unidad', order: Date.now(), status: 'no_iniciado' });
  const removeTree = async (t: Topic) => {
    for (const c of all.filter((x) => x.parentId === t.id)) await removeTree(c);
    await remove('topics', t.id);
  };
  const move = (t: Topic, dir: -1 | 1) => {
    const sib = children(t.parentId);
    const i = sib.findIndex((x) => x.id === t.id);
    const other = sib[i + dir];
    if (!other) return;
    void patch('topics', t.id, { order: other.order });
    void patch('topics', other.id, { order: t.order });
  };
  const setStatus = (t: Topic, status: TopicStatus) => void patch('topics', t.id, { status, statusChangedAt: Date.now() });

  const unreviewed = (t: Topic) => ['introducido', 'parcial', 'cubierto'].includes(t.status);

  const renderTree = (pid: ID | undefined, depth: number): JSX.Element[] =>
    children(pid).flatMap((t) => {
      const kids = renderTree(t.id, depth + 1);
      const show = filter === 'all' || unreviewed(t) || kids.length > 0;
      if (!show) return [];
      const nNotes = notes.filter((n) => n.topicId === t.id).length;
      const nSessions = sessions.filter((s) => s.topicId === t.id).length;
      const st = topicStatus(t.status);
      return [
        <li key={t.id} className="topic" style={{ paddingLeft: depth * 18 }}>
          <select className="status-select" value={t.status} style={{ background: st.color }} onChange={(e) => setStatus(t, e.target.value as TopicStatus)} aria-label="Estado del tema">
            {TOPIC_STATUS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          <div className="topic-title"><LazyInput value={t.title} onCommit={(v) => void patch('topics', t.id, { title: v })} /></div>
          <span className="topic-badges">
            {nNotes > 0 && <span title="Apuntes vinculados">✎{nNotes}</span>}
            {nSessions > 0 && <span title="Sesiones de estudio">⏱{nSessions}</span>}
            {unreviewed(t) && nSessions === 0 && <span className="late" title="Visto en clase pero sin sesiones de estudio">sin repasar</span>}
          </span>
          <span className="topic-actions">
            <button className="icon-btn" title="Estudiar este tema" onClick={() => wm.open('timer', { subjectId: subject.id, topicId: t.id })}>▶</button>
            <button className="icon-btn" title="Agregar subtema" onClick={() => void addTopic(t.id)}>+</button>
            <button className="icon-btn" title="Subir" onClick={() => move(t, -1)}>↑</button>
            <button className="icon-btn" title="Bajar" onClick={() => move(t, 1)}>↓</button>
            <button className="icon-btn" title="Eliminar" onClick={() => { if (confirm(`¿Eliminar «${t.title}» y sus subtemas?`)) void removeTree(t); }}>×</button>
          </span>
        </li>,
        ...kids,
      ];
    });

  return (
    <div className="syllabus">
      <div className="syl-stats">
        <div className="stackbar" aria-label="Distribución de estados">
          {TOPIC_STATUS.map((s) => {
            const n = base.filter((t) => t.status === s.id).length;
            return n ? <div key={s.id} style={{ flex: n, background: s.color }} title={`${s.label}: ${n}`} /> : null;
          })}
        </div>
        <span>{base.length} temas · {seen} vistos · {studied} estudiados o más</span>
      </div>
      <div className="toolbar">
        <Btn small onClick={() => void addTopic()}>+ Unidad</Btn>
        <Btn small onClick={() => setImporting(true)}>Importar texto…</Btn>
        <span className="grow" />
        <label className="check"><input type="checkbox" checked={filter === 'unreviewed'} onChange={(e) => setFilter(e.target.checked ? 'unreviewed' : 'all')} /> Solo vistos sin repasar</label>
      </div>
      {all.length === 0 ? (
        <Empty>Sin temario. Pega el programa de la materia con «Importar texto…» o crea las unidades a mano.</Empty>
      ) : (
        <ul className="topics">{renderTree(undefined, 0)}</ul>
      )}
      {importing && <ImportModal subject={subject} onClose={() => setImporting(false)} />}
    </div>
  );
}

function ImportModal({ subject, onClose }: { subject: Subject; onClose: () => void }) {
  const [text, setText] = useState('');
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [saveBiblio, setSaveBiblio] = useState(true);
  const pdfInput = useRef<HTMLInputElement>(null);
  const ai = useAiAction<boolean>();
  const [fromAi, setFromAi] = useState(false);
  const [pdfBusy, setPdfBusy] = useState<string | null>(null);
  const [pdfWarn, setPdfWarn] = useState<string | null>(null);

  const loadFile = async (f: File) => {
    setPdfWarn(null);
    if (f.size > 25 * 1024 * 1024) return setPdfWarn('El archivo pesa más de 25 MB.');
    if (!/pdf$/i.test(f.type) && !/\.pdf$/i.test(f.name)) return setText(await f.text());
    setPdfBusy('Leyendo PDF…');
    try {
      const r = await pdfToText(f, (p, n) => setPdfBusy(`Leyendo página ${p} de ${n}…`));
      if (r.scanned) setPdfWarn('Este PDF parece escaneado (son imágenes, no texto), así que no puedo leerlo. Copia el temario a mano o usa un PDF con texto seleccionable.');
      else {
        if (r.emptyPages) setPdfWarn(`${r.emptyPages} de ${r.pages} páginas no tenían texto legible (¿escaneadas?). Revisa que no falte nada.`);
        setText(r.text.trim());
      }
    } catch (e) {
      setPdfWarn(`No pude abrir el PDF: ${(e as Error).message}`);
    }
    setPdfBusy(null);
  };
  const upd = (i: number, c: Partial<Draft>) => setDrafts((d) => d!.map((x, j) => (j === i ? { ...x, ...c } : x)));

  const confirmImport = async () => {
    if (!drafts) return;
    const stack: ID[] = [];
    let order = Date.now();
    for (const d of drafts.filter((x) => x.include)) {
      const parentId = d.depth > 0 ? stack[Math.min(d.depth, stack.length) - 1] : undefined;
      const t = await create('topics', { subjectId: subject.id, parentId, title: d.title, order: order++, status: 'no_iniciado' });
      stack.length = Math.min(d.depth, stack.length);
      stack.push(t.id);
    }
    const refs = drafts.filter((x) => x.biblio && !x.include);
    // Wrapped lines and «Básica / Consulta» headers are rebuilt into whole references.
    if (saveBiblio) for (const r of splitReferences(refs.map((x) => x.raw ?? x.title).join('\n'))) await addReference(subject.id, r.raw, 'temario', r.kind);
    onClose();
  };

  return (
    <Modal
      title={`Importar temario — ${subject.name}`}
      onClose={onClose}
      footer={drafts ? (
        <>
          <Btn onClick={() => setDrafts(null)}>← Editar texto</Btn>
          <Btn primary onClick={confirmImport}>Confirmar ({drafts.filter((d) => d.include).length} temas)</Btn>
        </>
      ) : (
        <>
          <Btn onClick={onClose}>Cancelar</Btn>
          <AiButton busy={ai.busy} disabled={!text.trim()} title="Para temarios desordenados o PDFs difíciles" onClick={() => void ai.run(async () => {
            const r = await structureSyllabus(text);
            setDrafts(r.items.map((it) => ({
              title: it.titulo,
              depth: Math.max(0, Math.min(3, Math.round(it.nivel))),
              include: it.tipo === 'tema',
              biblio: it.tipo === 'bibliografia',
              flag: it.tipo === 'bibliografia' ? 'Referencia bibliográfica' : it.tipo === 'otro' ? 'No parece un tema' : it.confianza === 'baja' ? 'La IA no está segura del nivel' : undefined,
            })));
            setFromAi(true);
            return true;
          })}>Estructurar con IA</AiButton>
          <Btn primary disabled={!text.trim()} onClick={() => { setFromAi(false); setDrafts(parseSyllabus(text)); }}>Analizar</Btn>
        </>
      )}
    >
      {!drafts ? (
        <>
          <p className="hint">Sube el PDF del programa o pega el texto. Reconozco «Unidad 1», «1.2 Tema», viñetas y sangrías. Antes de guardar podrás revisar todo.</p>
          <div className="toolbar">
            <Btn small onClick={() => pdfInput.current?.click()} disabled={!!pdfBusy}>📄 Subir PDF…</Btn>
            {pdfBusy && <span className="hint">{pdfBusy}</span>}
            <input ref={pdfInput} type="file" accept="application/pdf,.pdf,.txt,.md" hidden onChange={(e) => e.target.files?.[0] && void loadFile(e.target.files[0])} />
          </div>
          {pdfWarn && <div className="warn">⚠ {pdfWarn}</div>}
          {ai.error && <div className="warn">⚠ {ai.error}</div>}
          <textarea className="input mono" rows={14} value={text} onChange={(e) => setText(e.target.value)} placeholder={'Unidad 1. Introducción a redes\n1.1 Modelo OSI\n1.2 TCP/IP\nUnidad 2. Capa de enlace\n2.1 Ethernet\n2.2 VLAN\n\nBibliografía\nTanenbaum, A. (2011). Redes de computadoras, 5ª ed. Pearson.'} />
        </>
      ) : (
        <>
          <p className="hint">{fromAi && <><AiBadge label="Estructura sugerida por IA" />{' '}</>}Revisa la estructura. Usa ← → para cambiar el nivel. Las líneas con ⚠ son las que no se pudieron interpretar con seguridad.</p>
          <ul className="draft-list">
            {drafts.map((d, i) => (
              <li key={i} className={d.include ? '' : 'excluded'} style={{ paddingLeft: d.depth * 18 }}>
                <input type="checkbox" checked={d.include} onChange={(e) => upd(i, { include: e.target.checked })} aria-label="Incluir" />
                <button className="icon-btn" onClick={() => upd(i, { depth: Math.max(0, d.depth - 1) })}>←</button>
                <button className="icon-btn" onClick={() => upd(i, { depth: Math.min(3, d.depth + 1) })}>→</button>
                <input className="input" value={d.title} onChange={(e) => upd(i, { title: e.target.value })} />
                {d.flag && <span className="warn-inline" title={d.flag}>⚠ {d.flag}</span>}
              </li>
            ))}
          </ul>
          {drafts.some((d) => d.biblio) && (
            <label className="check"><input type="checkbox" checked={saveBiblio} onChange={(e) => setSaveBiblio(e.target.checked)} /> Agregar las referencias detectadas (no incluidas como temas) a la Bibliografía de la materia, marcadas como «sin verificar»</label>
          )}
        </>
      )}
    </Modal>
  );
}
