import { useState } from 'react';
import { create, patch, remove, useRows, type ID, type Reference, type RefKind, type RefStatus, type Subject } from '../db';
import { parseReference, referenceLinks, verifyReference, VERIFY_LABEL, type Candidate } from '../lib/biblio';
import { Btn, Chip, Empty, Field, LazyInput, Modal } from '../os/ui';

const KIND: Record<RefKind, string> = { obligatoria: 'Obligatoria', complementaria: 'Complementaria', recomendada: 'Recomendada por el profe' };
const STATUS: Record<RefStatus, string> = { por_conseguir: 'Por conseguir', disponible: 'Ya la tengo', leyendo: 'Leyendo', terminada: 'Terminada' };

export async function addReference(subjectId: ID | undefined, raw: string, origin: Reference['source']['origin'] = 'manual') {
  const p = parseReference(raw);
  return create('refs', {
    subjectId,
    topicIds: [],
    title: p.title ?? raw,
    authors: p.authors,
    year: p.year,
    edition: p.edition,
    publisher: p.publisher,
    isbn: p.isbn,
    doi: p.doi,
    url: p.url,
    raw,
    kind: 'obligatoria',
    status: 'por_conseguir',
    verify: 'no_verificada',
    source: { origin, detail: origin === 'temario' ? 'Detectada al importar el temario' : 'Escrita por ti' },
  });
}

/** Bibliography of a subject: references, verification, links and coverage of the syllabus (RF-11..18). */
export function Bibliography({ subject }: { subject: Subject }) {
  const refs = useRows('refs').filter((r) => r.subjectId === subject.id).sort((a, b) => a.kind.localeCompare(b.kind) || a.title.localeCompare(b.title));
  const topics = useRows('topics').filter((t) => t.subjectId === subject.id);
  const notes = useRows('notes').filter((n) => n.subjectId === subject.id);
  const [raw, setRaw] = useState('');
  const [editing, setEditing] = useState<ID | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [review, setReview] = useState<{ ref: Reference; cand: Candidate | null } | null>(null);

  const verifyAll = async () => {
    setMsg(null);
    const todo = refs.filter((r) => r.verify === 'no_verificada' || r.verify === 'no_encontrada');
    let n = 0;
    for (const r of todo) {
      setBusy(`Verificando ${++n}/${todo.length}…`);
      try {
        const c = await verifyReference(r);
        await patch('refs', r.id, { verify: c?.verdict ?? 'no_encontrada', source: { ...r.source, checkedAt: Date.now() } });
      } catch (e) {
        setMsg((e as Error).message);
        break;
      }
      await new Promise((res) => setTimeout(res, 350)); // be polite with free APIs
    }
    setBusy(null);
  };

  const verifyOne = async (r: Reference) => {
    setMsg(null);
    setBusy(r.id);
    try {
      setReview({ ref: r, cand: await verifyReference(r) });
    } catch (e) {
      setMsg((e as Error).message);
    }
    setBusy(null);
  };

  // Coverage: leaf topics (or all) with references / notes (RF-16)
  const leaves = topics.filter((t) => !topics.some((c) => c.parentId === t.id));
  const covered = (id: ID) => ({ refs: refs.filter((r) => r.topicIds.includes(id)).length, notes: notes.filter((n) => n.topicId === id).length });
  const bare = leaves.filter((t) => { const c = covered(t.id); return !c.refs && !c.notes; });

  return (
    <div className="biblio">
      <form className="capture" onSubmit={(e) => { e.preventDefault(); if (raw.trim()) { void addReference(subject.id, raw.trim()); setRaw(''); } }}>
        <input className="input" value={raw} onChange={(e) => setRaw(e.target.value)} placeholder="Pega una referencia: Tanenbaum, A. (2011). Redes de computadoras, 5ª ed. Pearson." aria-label="Nueva referencia" />
        <Btn type="submit">Agregar</Btn>
      </form>
      <div className="toolbar">
        <Btn small disabled={!!busy || !refs.length} onClick={() => void verifyAll()}>Verificar pendientes</Btn>
        {busy && busy.startsWith('Verif') && <span className="hint">{busy}</span>}
        <span className="grow" />
        <span className="hint">Fuentes: Open Library y Crossref (requiere internet)</span>
      </div>
      {msg && <div className="warn">⚠ {msg}</div>}
      {!refs.length && <Empty>Sin bibliografía. Pégala aquí o impórtala junto con el temario.</Empty>}

      <ul className="rows">
        {refs.map((r) => (
          <li key={r.id} className="row ref-row">
            <div className="row-main">
              <div className="row-title"><b>{r.title}</b>{r.edition ? `, ${r.edition}` : ''}</div>
              <div className="row-meta">
                {r.authors && <span>{r.authors}</span>}
                {r.year && <span>({r.year})</span>}
                {r.publisher && <span>· {r.publisher}</span>}
                {r.isbn && <span>· ISBN {r.isbn}</span>}
              </div>
              <div className="row-meta">
                <Chip color={VERIFY_LABEL[r.verify].color} title={r.source.checkedAt ? `Verificada ${new Date(r.source.checkedAt).toLocaleDateString()}` : undefined}>{VERIFY_LABEL[r.verify].label}</Chip>
                <select className="kind-select" value={r.kind} onChange={(e) => void patch('refs', r.id, { kind: e.target.value as RefKind })} aria-label="Tipo">
                  {Object.entries(KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
                <select className="kind-select" value={r.status} onChange={(e) => void patch('refs', r.id, { status: e.target.value as RefStatus })} aria-label="Estado">
                  {Object.entries(STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
                {r.topicIds.length > 0 && <span>📌 {r.topicIds.map((id) => topics.find((t) => t.id === id)?.title).filter(Boolean).join(', ')}</span>}
              </div>
              <div className="row-meta links">
                {referenceLinks(r).map((l) => <a key={l.url} href={l.url} target="_blank" rel="noreferrer">{l.label}</a>)}
              </div>
              <div className="hint">Origen: {r.source.detail ?? r.source.origin}</div>
            </div>
            <div className="row-actions">
              <Btn small disabled={!!busy} onClick={() => void verifyOne(r)}>{busy === r.id ? '…' : 'Verificar'}</Btn>
              <Btn small onClick={() => setEditing(r.id)}>Editar</Btn>
              <Btn small aria-label="Eliminar" onClick={() => confirm('¿Eliminar esta referencia?') && void remove('refs', r.id)}>🗑</Btn>
            </div>
          </li>
        ))}
      </ul>

      {leaves.length > 0 && (
        <>
          <div className="section-title">Cobertura del temario</div>
          <p className="hint">{leaves.length - bare.length} de {leaves.length} temas tienen bibliografía o apuntes.{bare.length ? ' Sin recursos todavía:' : ' ¡Todo cubierto!'}</p>
          <div className="chips-wrap">{bare.slice(0, 30).map((t) => <Chip key={t.id} color="#cf6b5e">{t.title}</Chip>)}</div>
        </>
      )}

      {editing && <RefEditor refId={editing} topics={topics} onClose={() => setEditing(null)} />}
      {review && <ReviewModal review={review} onClose={() => setReview(null)} />}
    </div>
  );
}

function RefEditor({ refId, topics, onClose }: { refId: ID; topics: { id: ID; title: string }[]; onClose: () => void }) {
  const r = useRows('refs').find((x) => x.id === refId);
  if (!r) return null;
  const set = (c: Partial<Reference>) => void patch('refs', r.id, c);
  const field = (k: keyof Reference, label: string, wide = false) => (
    <Field label={label} wide={wide}><LazyInput value={String(r[k] ?? '')} onCommit={(v) => set({ [k]: v || undefined } as Partial<Reference>)} /></Field>
  );
  return (
    <Modal title="Editar referencia" onClose={onClose} footer={<Btn primary onClick={onClose}>Listo</Btn>}>
      <div className="form">
        {field('title', 'Título', true)}
        {field('authors', 'Autores', true)}
        {field('year', 'Año')}
        {field('edition', 'Edición')}
        {field('publisher', 'Editorial')}
        {field('isbn', 'ISBN')}
        {field('doi', 'DOI')}
        {field('url', 'Enlace')}
        <Field label="Temas para los que sirve" wide>
          <div className="topic-checks">
            {topics.map((t) => (
              <label key={t.id} className="check">
                <input type="checkbox" checked={r.topicIds.includes(t.id)} onChange={(e) => set({ topicIds: e.target.checked ? [...r.topicIds, t.id] : r.topicIds.filter((x) => x !== t.id) })} />
                {t.title}
              </label>
            ))}
            {!topics.length && <span className="hint">Esta materia aún no tiene temario.</span>}
          </div>
        </Field>
        <Field label="Notas" wide><LazyInput multiline value={r.notes ?? ''} onCommit={(v) => set({ notes: v })} /></Field>
        {r.raw && <p className="hint wide">Texto original: «{r.raw}»</p>}
      </div>
    </Modal>
  );
}

function ReviewModal({ review: { ref, cand }, onClose }: { review: { ref: Reference; cand: Candidate | null }; onClose: () => void }) {
  const apply = async (fillOnly: boolean) => {
    if (!cand) return;
    const pick = <T,>(mine: T | undefined, theirs: T | undefined) => (fillOnly ? mine || theirs : theirs || mine);
    await patch('refs', ref.id, {
      title: fillOnly ? ref.title : cand.title || ref.title,
      authors: pick(ref.authors, cand.authors),
      year: pick(ref.year, cand.year),
      publisher: pick(ref.publisher, cand.publisher),
      isbn: pick(ref.isbn, cand.isbn),
      doi: pick(ref.doi, cand.doi),
      verify: cand.verdict,
      links: [...(ref.links ?? []).filter((l) => l.url !== cand.url && l.url !== cand.openAccess), { label: cand.origin === 'openlibrary' ? 'Open Library' : 'Crossref', url: cand.url }, ...(cand.openAccess ? [{ label: '📖 Leer gratis (Internet Archive)', url: cand.openAccess }] : [])],
      source: { origin: cand.origin, detail: `Datos completados desde ${cand.origin === 'openlibrary' ? 'Open Library' : 'Crossref'} (${cand.why})`, checkedAt: Date.now() },
    });
    onClose();
  };
  return (
    <Modal
      title="Resultado de la verificación"
      onClose={onClose}
      footer={cand && cand.verdict !== 'no_encontrada' ? (
        <>
          <Btn onClick={async () => { await patch('refs', ref.id, { verify: 'no_encontrada', source: { ...ref.source, checkedAt: Date.now() } }); onClose(); }}>No es esta</Btn>
          <Btn onClick={() => void apply(true)}>Solo completar lo que falta</Btn>
          <Btn primary onClick={() => void apply(false)}>Usar estos datos</Btn>
        </>
      ) : (
        <Btn onClick={async () => { await patch('refs', ref.id, { verify: 'no_encontrada', source: { ...ref.source, checkedAt: Date.now() } }); onClose(); }}>Entendido</Btn>
      )}
    >
      {!cand ? (
        <p>No encontré esta obra en Open Library ni en Crossref. Puede que el título esté incompleto o que sea material local (apuntes, manual interno). La dejo como <b>no encontrada</b>; no voy a inventar datos.</p>
      ) : (
        <div className="compare">
          <p><Chip color={VERIFY_LABEL[cand.verdict].color}>{VERIFY_LABEL[cand.verdict].label}</Chip> {cand.why}</p>
          <table className="grid-table">
            <thead><tr><th /><th>Tu referencia</th><th>Encontrado</th></tr></thead>
            <tbody>
              {([['Título', ref.title, cand.title], ['Autores', ref.authors, cand.authors], ['Año', ref.year, cand.year], ['Editorial', ref.publisher, cand.publisher], ['ISBN', ref.isbn, cand.isbn], ['DOI', ref.doi, cand.doi]] as const).map(([l, a, b]) => (
                <tr key={l}><th>{l}</th><td>{a || '—'}</td><td className={a && b && a !== b ? 'diff' : ''}>{b || '—'}</td></tr>
              ))}
            </tbody>
          </table>
          <p className="hint">Fuente: <a href={cand.url} target="_blank" rel="noreferrer">{cand.url}</a>{cand.openAccess && <> · <a href={cand.openAccess} target="_blank" rel="noreferrer">copia de acceso abierto</a></>}</p>
        </div>
      )}
    </Modal>
  );
}

