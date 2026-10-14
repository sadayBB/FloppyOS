import type { Reference, RefVerify } from '../db';
import { norm } from './parse';

/** Best-effort split of a citation line. Missing parts stay empty — nothing is invented. */
export function parseReference(raw: string): Partial<Reference> {
  const line = raw.trim().replace(/^[-•*\d.)\s]+(?=\D)/, '');
  const out: Partial<Reference> = { raw: line };
  const isbn = line.match(/ISBN(?:-1[03])?[:\s]*([\dXx][\dXx\s-]{8,16}[\dXx])/i);
  if (isbn) out.isbn = isbn[1].replace(/[\s-]/g, '').toUpperCase();
  const doi = line.match(/\b(10\.\d{4,9}\/[^\s"<>]+[^\s"<>.,;])/);
  if (doi) out.doi = doi[1];
  const url = line.match(/https?:\/\/\S+/);
  if (url && !doi) out.url = url[0];
  let rest = line.replace(/ISBN(?:-1[03])?[:\s]*[\dXx][\dXx\s-]{8,16}[\dXx]/i, '').replace(/https?:\/\/\S+/, '').replace(/doi:\s*\S+/i, '').trim();

  // APA-like: Autor, A. (2011). Título. Editorial.
  const apa = rest.match(/^(.+?)\s*\((\d{4})[a-z]?\)\.?\s*(.+)$/);
  if (apa) {
    out.authors = apa[1].replace(/[.,\s]+$/, '');
    out.year = apa[2];
    rest = apa[3];
  } else {
    const year = rest.match(/\b(1[89]\d{2}|20\d{2})\b/);
    if (year) out.year = year[1];
    // Autor. Título. Editorial, año.
    const m = rest.match(/^([^.]+(?:\b[A-Z]\.\s?)*[^.]*?)\.\s+(.+)$/);
    if (m && /,|\by\b|&/.test(m[1]) && m[1].length < 90) {
      out.authors = m[1].trim();
      rest = m[2];
    }
  }
  const ed = rest.match(/,?\s*\(?(\d+\s*[ªºa]?\.?\s*(?:ed\.?|edici[oó]n))\)?/i);
  if (ed) {
    out.edition = ed[1].trim();
    rest = rest.replace(ed[0], '');
  }
  const parts = rest.split(/\.\s+/).map((p) => p.trim().replace(/\.$/, '')).filter(Boolean);
  if (parts.length) out.title = parts[0].replace(/[,:;]\s*$/, '');
  if (parts.length > 1) out.publisher = parts[parts.length - 1].replace(/,?\s*\b(1[89]\d{2}|20\d{2})\b/, '').replace(/[,.\s]+$/, '') || undefined;
  if (!out.title) out.title = line.slice(0, 160);
  return out;
}

const tokens = (s: string) => new Set(norm(s).replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 2));
export function similarity(a: string, b: string) {
  const A = tokens(a);
  const B = tokens(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  A.forEach((t) => B.has(t) && inter++);
  return inter / Math.min(A.size, B.size);
}
const surnames = (authors?: string) => [...tokens(authors ?? '')].filter((w) => w.length > 3);

export interface Candidate {
  origin: 'openlibrary' | 'crossref';
  title: string;
  authors?: string;
  year?: string;
  publisher?: string;
  isbn?: string;
  doi?: string;
  url: string;
  openAccess?: string;
  verdict: RefVerify;
  why: string;
}

function judge(ref: Partial<Reference>, c: Omit<Candidate, 'verdict' | 'why'>, exactId: boolean): Candidate {
  if (exactId) return { ...c, verdict: 'confirmada', why: ref.doi ? 'El DOI existe en Crossref.' : 'El ISBN existe en Open Library.' };
  const sim = similarity(ref.title ?? '', c.title);
  const sn = surnames(ref.authors);
  const authorOk = !sn.length || sn.some((s) => norm(c.authors ?? '').includes(s));
  const yearOk = !ref.year || !c.year || ref.year === c.year;
  if (sim >= 0.85 && authorOk && sn.length) return { ...c, verdict: 'confirmada', why: `Título y autor coinciden${yearOk ? '' : ' (el año difiere: puede ser otra edición)'}.` };
  if (sim >= 0.5) return { ...c, verdict: 'probable', why: `Título parecido (${Math.round(sim * 100)}%)${authorOk ? '' : ', pero el autor no coincide'}. Revísalo.` };
  return { ...c, verdict: 'no_encontrada', why: 'El resultado más cercano no se parece lo suficiente.' };
}

async function getJSON(url: string) {
  const r = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
}

async function openLibrary(ref: Partial<Reference>): Promise<Candidate | null> {
  const fields = 'key,title,author_name,first_publish_year,isbn,publisher,ebook_access,ia';
  const q = ref.isbn ? `isbn=${encodeURIComponent(ref.isbn)}` : `title=${encodeURIComponent(ref.title ?? '')}${ref.authors ? `&author=${encodeURIComponent(surnames(ref.authors)[0] ?? '')}` : ''}`;
  const data = await getJSON(`https://openlibrary.org/search.json?${q}&fields=${fields}&limit=3`);
  const d = data.docs?.[0];
  if (!d) return null;
  return judge(ref, {
    origin: 'openlibrary',
    title: d.title,
    authors: d.author_name?.join(', '),
    year: d.first_publish_year ? String(d.first_publish_year) : undefined,
    publisher: d.publisher?.[0],
    isbn: ref.isbn ?? d.isbn?.find((x: string) => x.length === 13) ?? d.isbn?.[0],
    url: `https://openlibrary.org${d.key}`,
    openAccess: d.ebook_access === 'public' && d.ia?.[0] ? `https://archive.org/details/${d.ia[0]}` : undefined,
  }, !!ref.isbn);
}

async function crossref(ref: Partial<Reference>): Promise<Candidate | null> {
  const fromItem = (m: { title?: string[]; author?: { given?: string; family?: string }[]; issued?: { 'date-parts'?: number[][] }; publisher?: string; DOI: string }) => ({
    origin: 'crossref' as const,
    title: m.title?.[0] ?? '',
    authors: m.author?.map((a) => [a.family, a.given].filter(Boolean).join(', ')).join('; '),
    year: m.issued?.['date-parts']?.[0]?.[0] ? String(m.issued['date-parts'][0][0]) : undefined,
    publisher: m.publisher,
    doi: m.DOI,
    url: `https://doi.org/${m.DOI}`,
  });
  if (ref.doi) {
    const data = await getJSON(`https://api.crossref.org/works/${encodeURIComponent(ref.doi)}`);
    return judge(ref, fromItem(data.message), true);
  }
  const q = [ref.title, ref.authors].filter(Boolean).join(' ');
  const data = await getJSON(`https://api.crossref.org/works?query.bibliographic=${encodeURIComponent(q)}&rows=1&select=DOI,title,author,issued,publisher`);
  const m = data.message?.items?.[0];
  return m ? judge(ref, fromItem(m), false) : null;
}

/** Looks the reference up in Open Library and Crossref; returns the best candidate or null. */
export async function verifyReference(ref: Partial<Reference>): Promise<Candidate | null> {
  if (!navigator.onLine) throw new Error('Necesitas internet para verificar referencias.');
  const order = ref.doi ? [crossref, openLibrary] : [openLibrary, crossref];
  const rank: Record<RefVerify, number> = { confirmada: 3, probable: 2, no_encontrada: 1, no_verificada: 0 };
  let best: Candidate | null = null;
  for (const fn of order) {
    try {
      const c = await fn(ref);
      if (c && (!best || rank[c.verdict] > rank[best.verdict])) best = c;
      if (best?.verdict === 'confirmada') break;
    } catch {
      /* try the next source */
    }
  }
  return best;
}

/** Where to find the work: catalogues, DOI, open-access copies (RF-13). */
export function referenceLinks(r: Partial<Reference>) {
  const q = encodeURIComponent([r.title, r.authors].filter(Boolean).join(' '));
  const links: { label: string; url: string }[] = [];
  if (r.doi) links.push({ label: 'DOI', url: `https://doi.org/${r.doi}` });
  if (r.url) links.push({ label: 'Enlace', url: r.url });
  for (const l of r.links ?? []) links.push(l);
  if (r.isbn) links.push({ label: 'Open Library (ISBN)', url: `https://openlibrary.org/isbn/${r.isbn}` });
  links.push({ label: 'WorldCat (bibliotecas)', url: r.isbn ? `https://search.worldcat.org/search?q=bn:${r.isbn}` : `https://search.worldcat.org/search?q=${q}` });
  links.push({ label: 'Google Libros', url: r.isbn ? `https://www.google.com/books/edition/_/?isbn=${r.isbn}` : `https://www.google.com/search?tbm=bks&q=${q}` });
  links.push({ label: 'Google Académico', url: `https://scholar.google.com/scholar?q=${q}` });
  return links;
}

export const VERIFY_LABEL: Record<RefVerify, { label: string; color: string }> = {
  confirmada: { label: '✓ Confirmada', color: '#2e9d5b' },
  probable: { label: '≈ Coincidencia probable', color: '#d9a24e' },
  no_encontrada: { label: '✗ No encontrada', color: '#cf6b5e' },
  no_verificada: { label: '? Sin verificar', color: '#8a7f9a' },
};
