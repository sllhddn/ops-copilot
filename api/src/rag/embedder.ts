import { createHash } from 'node:crypto';

/** Turns text into a fixed-length vector. Swap in a hosted model by implementing this. */
export interface Embedder {
  readonly dimensions: number;
  embed(texts: string[]): Promise<number[][]>;
}

export const EMBEDDER = Symbol('EMBEDDER');

const STOP = new Set('a an and are as at be by for from has have how i if in is it of on or that the this to was what when where which who why will with you your do does'.split(' '));

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9_\-. ]+/g, ' ')
    .split(/\s+/)
    .map(t => t.replace(/^[.\-]+|[.\-]+$/g, ''))
    .filter(t => t.length > 1 && !STOP.has(t))
    .map(stem);
}

/** Light suffix stripping so "restarting", "restarted" and "restart" match. */
function stem(t: string): string {
  if (t.length > 5 && t.endsWith('ing')) return t.slice(0, -3);
  if (t.length > 4 && t.endsWith('ed')) return t.slice(0, -2);
  if (t.length > 3 && t.endsWith('s') && !t.endsWith('ss')) return t.slice(0, -1);
  return t;
}

/**
 * Local, dependency-free embedder using the hashing trick over words and word pairs.
 * It needs no API key or model download, so the app and its tests run anywhere.
 * It captures shared vocabulary, not meaning: a hosted embedding model will retrieve
 * better on paraphrased questions, and the evals in src/evals measure the difference.
 */
export class HashingEmbedder implements Embedder {
  constructor(readonly dimensions = 256) {}

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map(t => this.one(t));
  }

  private one(text: string): number[] {
    const v = new Array<number>(this.dimensions).fill(0);
    const toks = tokenize(text);
    const feats = [...toks, ...toks.slice(1).map((t, i) => `${toks[i]}_${t}`)];
    for (const f of feats) {
      const h = createHash('md5').update(f).digest();
      const idx = h.readUInt32LE(0) % this.dimensions;
      const sign = h[4] & 1 ? 1 : -1;
      v[idx] += sign * (f.includes('_') ? 0.5 : 1);
    }
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
    return v.map(x => x / norm);
  }
}

export function toPgVector(v: number[]): string {
  return `[${v.map(x => x.toFixed(6)).join(',')}]`;
}
