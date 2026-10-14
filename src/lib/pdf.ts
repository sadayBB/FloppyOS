/** Extracts text from a PDF in the browser (pdf.js is loaded only when needed). */
export async function pdfToText(file: File, onProgress?: (page: number, total: number) => void) {
  const pdfjs = await import('pdfjs-dist');
  const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer(), isEvalSupported: false }).promise;
  let text = '';
  let emptyPages = 0;
  for (let p = 1; p <= doc.numPages; p++) {
    onProgress?.(p, doc.numPages);
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    let pageText = '';
    for (const it of content.items) {
      if (!('str' in it)) continue;
      pageText += it.str + (it.hasEOL ? '\n' : '');
    }
    if (pageText.replace(/\s/g, '').length < 20) emptyPages++;
    text += pageText + '\n';
  }
  // Re-join words split by hyphenation at line ends and trim noisy blank lines.
  text = text.replace(/(\w)-\n(\w)/g, '$1$2').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n');
  return { text, pages: doc.numPages, emptyPages, scanned: emptyPages === doc.numPages };
}
