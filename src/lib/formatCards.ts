/** «Concepto: definición» / «Concepto - definición» lines in a note → flashcards (no AI needed). */
export function formatCards(body: string) {
  const out: { pregunta: string; respuesta: string }[] = [];
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.replace(/^\s*(?:\d+[.)]|[-•*])\s+/, '').trim();
    if (/https?:\/\//i.test(line)) continue;
    const m = line.match(/^([^:–—]{2,60}?)\s*(?::|\s[-–—]\s)\s*(.{3,})$/);
    if (m && !/^(nota|ojo|tarea|duda|resumen|fecha|hora)$/i.test(m[1].trim())) out.push({ pregunta: m[1].trim(), respuesta: m[2].trim() });
  }
  return out;
}
