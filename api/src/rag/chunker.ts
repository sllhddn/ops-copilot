export interface Chunk {
  ordinal: number;
  heading: string | null;
  content: string;
}

/**
 * Splits markdown into chunks that follow its headings, so each chunk keeps
 * the context of the section it came from. Long sections are cut on paragraph
 * boundaries into pieces of about `maxChars`, with one paragraph of overlap.
 */
export function chunkMarkdown(markdown: string, maxChars = 900): Chunk[] {
  const sections: { heading: string | null; body: string[] }[] = [];
  let current: { heading: string | null; body: string[] } = { heading: null, body: [] };
  for (const line of markdown.replace(/\r\n/g, '\n').split('\n')) {
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      if (current.body.join('').trim() || current.heading) sections.push(current);
      current = { heading: h[2].trim(), body: [] };
    } else {
      current.body.push(line);
    }
  }
  sections.push(current);

  const chunks: Chunk[] = [];
  for (const s of sections) {
    const paras = s.body.join('\n').split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
    if (!paras.length) continue;
    let piece: string[] = [];
    let size = 0;
    const flush = () => {
      if (piece.length) chunks.push({ ordinal: chunks.length, heading: s.heading, content: piece.join('\n\n') });
    };
    for (const p of paras) {
      if (size + p.length > maxChars && piece.length) {
        flush();
        const overlap = piece[piece.length - 1];
        piece = overlap.length < maxChars / 2 ? [overlap] : [];
        size = piece.reduce((n, x) => n + x.length, 0);
      }
      piece.push(p);
      size += p.length;
    }
    flush();
  }
  return chunks;
}
