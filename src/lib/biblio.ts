import { db, type Reference, type RefVerify } from '../db';
import { norm } from './parse';

const EDITION = /\(?\s*(\d+\s*(?:ª|º|a|st|nd|rd|th)?\.?\s*(?:ed\.?|edici[oó]n|edition))\s*\)?/i;
// "Apellido, I." / "Apellido, I. J." / "De la Cruz, M." — the way syllabi list authors.
const AUTHOR = /[A-ZÁÉÍÓÚÜÑÄÖ][\p{L}'’-]+(?:\s(?:de|del|la|van|von|der)\s[\p{L}'’-]+)*(?:\s[A-ZÁÉÍÓÚÜÑÄÖ][\p{L}'’-]+)?,\s(?:[A-ZÁÉÍÓÚÜÑÄÖ]\.\s?){1,3}/uy;
const AUTHOR_SEP = /,?\s*(?:&|y|and|e)?\s*/y;

/**
 * "Título (2nd ed.), Apellido, I., Apellido2, J., & Apellido3, K., Editorial, Año."
 * The common format in Mexican university syllabi (TIPO, TÍTULO, AUTOR, EDITORIAL Y AÑO).
 */
function parseTitleFirst(rest: string): Partial<Reference> | null {
  for (let start = rest.indexOf(', '); start !== -1; start = rest.indexOf(', ', start + 1)) {
    let pos = start + 2;
    AUTHOR.lastIndex = pos;
    const first = AUTHOR.exec(rest);
    if (!first) continue;
    const names = [first[0].trim()];
    pos = AUTHOR.lastIndex;
    for (;;) {
      AUTHOR_SEP.lastIndex = pos;
      const sep = AUTHOR_SEP.exec(rest);
      const next = sep ? sep.index + sep[0].length : pos;
      AUTHOR.lastIndex = next;
      const m = AUTHOR.exec(rest);
      if (!m) break;
      names.push(m[0].trim());
      pos = AUTHOR.lastIndex;
    }
    const title = rest.slice(0, start).trim();
    if (title.length < 3) return null;
    const publisher = rest.slice(pos).replace(/^[\s,;:&]+/, '').replace(/[\s,.;]+$/, '');
    return { title, authors: names.map((n) => n.replace(/[\s,]+$/, '')).join('; '), publisher: publisher || undefined };
  }
  return null;
}

/** Best-effort split of a citation line. Missing parts stay empty — nothing is invented. */
export function parseReference(raw: string): Partial<Reference> {
  const line = raw.replace(/\s+/g, ' ').trim().replace(/^(?:\d+[.)]|[-•*·])\s*/, '');
  const ref = parseIds(line);
  let rest = ref.rest;
  const out: Partial<Reference> = { raw: line, isbn: ref.isbn, doi: ref.doi, url: ref.url };

  const year = rest.match(/,?\s*\(?\b(1[89]\d{2}|20\d{2})\b\)?\.?\s*$/);
  const tf = parseTitleFirst(year ? rest.slice(0, year.index) : rest);
  if (tf) {
    const ed = tf.title!.match(EDITION);
    return {
      ...out,
      ...tf,
      title: ed ? tf.title!.replace(ed[0], '').replace(/\s{2,}/g, ' ').replace(/[\s,]+$/, '') : tf.title,
      edition: ed?.[1].trim(),
      year: year?.[1],
    };
  }
  return parseClassic(rest, out, line);
}

function parseIds(line: string) {
  const isbn = line.match(/ISBN(?:-1[03])?[:\s]*([\dXx][\dXx\s-]{8,16}[\dXx])/i);
  const doi = line.match(/\b(10\.\d{4,9}\/[^\s"<>]+[^\s"<>.,;])/);
  const url = line.match(/https?:\/\/\S+/);
  const rest = line.replace(/ISBN(?:-1[03])?[:\s]*[\dXx][\dXx\s-]{8,16}[\dXx]/i, '').replace(/https?:\/\/\S+/, '').replace(/doi:\s*\S+/i, '').replace(/\s{2,}/g, ' ').trim();
  return { isbn: isbn?.[1].replace(/[\s-]/g, '').toUpperCase(), doi: doi?.[1], url: url && !doi ? url[0] : undefined, rest };
}

/**
 * Splits a pasted bibliography block into references: numbered/bulleted items start a new one,
 * wrapped lines are joined back, and «Básica / Consulta» headers set the kind.
 */
export function splitReferences(text: string): { raw: string; kind: Reference['kind'] }[] {
  type Item = { raw: string; kind: Reference['kind']; closed?: boolean };
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const numbered = lines.some((l) => /^(\d+[.)]|[-•*·])\s+/.test(l));
  let kind: Reference['kind'] = 'obligatoria';
  const out: Item[] = [];
  for (const l of lines) {
    const header = l.match(/^(b[aá]sica|obligatoria|principal|consulta|complementaria|recomendada|adicional)s?\s*:?$/i);
    if (header) {
      if (out.length) out[out.length - 1].closed = true;
      kind = /^(b[aá]sica|obligatoria|principal)/i.test(header[1]) ? 'obligatoria' : /recomendada/i.test(header[1]) ? 'recomendada' : 'complementaria';
      continue;
    }
    if (/^bibliograf[ií]a/i.test(l)) continue;
    const prev = out[out.length - 1];
    // Without numbering, a reference ends at its year («…, MIT Press, 2002.»); until then, lines are continuations.
    const prevOpen = !!prev && !prev.closed && !/\b(1[89]\d{2}|20\d{2})\b[)\].]*\s*$/.test(prev.raw);
    const startsNew = numbered ? /^(\d+[.)]|[-•*·])\s+/.test(l) : !prevOpen;
    if (startsNew || !prev) out.push({ raw: l, kind });
    else {
      // A word cut with a hyphen at the end of a PDF line is joined back ("Addison-" + "Wesley").
      prev.raw = /[A-Za-zÀ-ÿ]-$/.test(prev.raw) ? prev.raw + l : `${prev.raw} ${l}`;
    }
  }
  return out.map(({ raw, kind }) => ({ raw, kind }));
}

function parseClassic(rest: string, out: Partial<Reference>, line: string): Partial<Reference> {
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
  const ed = rest.match(new RegExp(`,?\s*${EDITION.source}`, 'i'));
  if (ed) {
    out.edition = ed[1].trim();
    rest = rest.replace(ed[0], '. ');
  }
  const parts = rest.split(/\.\s+/).map((p) => p.trim().replace(/\.$/, '')).filter(Boolean);
  if (parts.length) out.title = parts[0].replace(/[,:;]\s*$/, '');
  if (parts.length > 1) out.publisher = parts[parts.length - 1].replace(/,?\s*\b(1[89]\d{2}|20\d{2})\b/, '').replace(/[,.\s]+$/, '') || undefined;
  if (!out.title) out.title = line.slice(0, 160);
  return out;
}

const tokens = (s: string) => new Set(norm(s).replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 2));
const STOP = new Set(['the', 'and', 'for', 'with', 'from', 'del', 'las', 'los', 'una', 'por', 'con', 'its', 'into']);
/** One-letter typo distance (insert/delete/substitute), enough for «programing» vs «programming». */
function oneEdit(a: string, b: string) {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}
/** Words match if equal, plural/singular, one a prefix of the other (program/programming), or one typo apart. */
function wordsMatch(x: string, y: string) {
  if (x === y) return true;
  const sx = x.replace(/(es|s)$/, '');
  const sy = y.replace(/(es|s)$/, '');
  if (sx === sy) return true;
  if (Math.min(x.length, y.length) >= 5 && (x.startsWith(y) || y.startsWith(x))) return true;
  return Math.min(x.length, y.length) >= 6 && oneEdit(x, y);
}
export function similarity(a: string, b: string) {
  const A = [...tokens(a)].filter((t) => !STOP.has(t));
  const B = [...tokens(b)].filter((t) => !STOP.has(t));
  if (!A.length || !B.length) return 0;
  const inter = A.filter((t) => B.some((u) => wordsMatch(t, u))).length;
  return inter / Math.min(A.length, B.length);
}
const surnames = (authors?: string) => [...tokens(authors ?? '')].filter((w) => w.length > 3);

export interface Candidate {
  origin: 'openlibrary' | 'crossref' | 'googlebooks';
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
  const found = [...tokens(c.authors ?? '')];
  const authorOk = !sn.length || sn.some((s) => found.some((f) => wordsMatch(s, f)));
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
  const author = surnames(ref.authors)[0];
  const title = ref.title ?? '';
  const short = title.split(/[:;(]/)[0].split(/\s+/).slice(0, 8).join(' ');
  const enc = encodeURIComponent;
  // Most precise first; syllabi often abbreviate or reorder titles, so fall back to looser queries.
  const queries = ref.isbn
    ? [`isbn=${enc(ref.isbn)}`]
    : [
        `title=${enc(title)}${author ? `&author=${enc(author)}` : ''}`,
        ...(short !== title ? [`title=${enc(short)}${author ? `&author=${enc(author)}` : ''}`] : []),
        // The author may be misspelled in the syllabus («Mitchel»): try the title alone.
        ...(author ? [`title=${enc(short)}`] : []),
        `q=${enc(short)}`,
      ];
  let docs: { title: string; author_name?: string[]; first_publish_year?: number; publisher?: string[]; isbn?: string[]; key: string; ebook_access?: string; ia?: string[] }[] = [];
  for (const q of queries) {
    const data = await getJSON(`https://openlibrary.org/search.json?${q}&fields=${fields}&limit=5`);
    docs = data.docs ?? [];
    if (docs.length) break;
  }
  if (!docs.length) return null;
  // Prefer the result whose title and author best match the reference.
  const score = (x: (typeof docs)[number]) => similarity(title, x.title) + (author && [...tokens(x.author_name?.join(' ') ?? '')].some((t) => wordsMatch(author, t)) ? 0.5 : 0);
  const d = [...docs].sort((a, b) => score(b) - score(a))[0];
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

interface GVolume {
  volumeInfo: { title: string; subtitle?: string; authors?: string[]; publisher?: string; publishedDate?: string; industryIdentifiers?: { type: string; identifier: string }[]; infoLink?: string };
  accessInfo?: { viewability?: string; publicDomain?: boolean; webReaderLink?: string };
}
async function googleBooks(ref: Partial<Reference>): Promise<Candidate | null> {
  const author = surnames(ref.authors)[0];
  const title = (ref.title ?? '').split(/[:;(]/)[0].split(/\s+/).slice(0, 10).join(' ');
  const qs = ref.isbn ? [`isbn:${ref.isbn}`] : [`intitle:${title}${author ? ` inauthor:${author}` : ''}`, `${title} ${author ?? ''}`.trim()];
  let items: GVolume[] = [];
  for (const q of qs) {
    // Without a key Google shares a small global daily quota (429 when exhausted); an optional free key avoids it.
    const key = (await db.settings.get('googleBooksKey'))?.value as string | undefined;
    const data = await getJSON(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=5&printType=books${key ? `&key=${encodeURIComponent(key)}` : ''}`);
    items = data.items ?? [];
    if (items.length) break;
  }
  if (!items.length) return null;
  const full = (v: GVolume) => [v.volumeInfo.title, v.volumeInfo.subtitle].filter(Boolean).join(': ');
  const score = (v: GVolume) => similarity(ref.title ?? '', full(v)) + (author && [...tokens(v.volumeInfo.authors?.join(' ') ?? '')].some((t) => wordsMatch(author, t)) ? 0.5 : 0);
  const v = [...items].sort((a, b) => score(b) - score(a))[0];
  const ids = v.volumeInfo.industryIdentifiers ?? [];
  return judge(ref, {
    origin: 'googlebooks',
    title: full(v),
    authors: v.volumeInfo.authors?.join(', '),
    year: v.volumeInfo.publishedDate?.slice(0, 4),
    publisher: v.volumeInfo.publisher,
    isbn: ref.isbn ?? ids.find((i) => i.type === 'ISBN_13')?.identifier ?? ids.find((i) => i.type === 'ISBN_10')?.identifier,
    url: v.volumeInfo.infoLink ?? `https://books.google.com/books?q=${encodeURIComponent(full(v))}`,
    openAccess: v.accessInfo?.publicDomain && v.accessInfo.webReaderLink ? v.accessInfo.webReaderLink : undefined,
  }, !!ref.isbn && ids.some((i) => i.identifier === ref.isbn));
}

/** Looks the reference up in Open Library, Google Books and Crossref; returns the best candidate or null. */
export async function verifyReference(ref: Partial<Reference>): Promise<Candidate | null> {
  if (!navigator.onLine) throw new Error('Necesitas internet para verificar referencias.');
  // Books first (most syllabus references are books); Crossref mainly covers articles and DOIs.
  const order = ref.doi ? [crossref, openLibrary, googleBooks] : [openLibrary, googleBooks, crossref];
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
  // Neutral on purpose: many valid books (local editions, old printings) simply aren't in online catalogues.
  no_encontrada: { label: '· Sin coincidencia en línea', color: '#a7a1b8' },
  no_verificada: { label: '· Sin verificar', color: '#a7a1b8' },
};
