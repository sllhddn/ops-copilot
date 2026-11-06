import { Inject, Injectable } from '@nestjs/common';
import { DB, type Db } from '../db/db.js';
import { EMBEDDER, type Embedder, toPgVector, tokenize } from './embedder.js';

export interface Hit {
  chunkId: number;
  documentId: number;
  title: string;
  heading: string | null;
  content: string;
  vectorScore: number;   // cosine similarity, 0..1
  keywordRank: number | null;
  score: number;         // fused score used for ordering
}

const RRF_K = 60;

/**
 * Hybrid retrieval: semantic (pgvector cosine) and keyword (PostgreSQL full-text)
 * searches run separately and are merged with Reciprocal Rank Fusion, so a chunk
 * that ranks well in either list surfaces, and one that ranks well in both wins.
 */
@Injectable()
export class Retriever {
  constructor(@Inject(DB) private readonly db: Db, @Inject(EMBEDDER) private readonly embedder: Embedder) {}

  async search(query: string, k = 5): Promise<Hit[]> {
    const [qv] = await this.embedder.embed([query]);
    const pool = Math.max(k * 4, 20);

    const semantic = await this.db.query<Row>(
      `SELECT c.id, c.document_id, d.title, c.heading, c.content,
              1 - (c.embedding <=> $1::vector) AS sim
         FROM chunks c JOIN documents d ON d.id = c.document_id
        ORDER BY c.embedding <=> $1::vector
        LIMIT $2`,
      [toPgVector(qv), pool],
    );

    const terms = tokenize(query).filter(t => /^[a-z0-9_]+$/.test(t));
    const keyword = terms.length
      ? await this.db.query<Row>(
          `SELECT c.id, c.document_id, d.title, c.heading, c.content,
                  ts_rank_cd(c.tsv, q) AS kw
             FROM chunks c JOIN documents d ON d.id = c.document_id,
                  to_tsquery('english', $1) q
            WHERE c.tsv @@ q
            ORDER BY kw DESC
            LIMIT $2`,
          [terms.join(' | '), pool],
        )
      : [];

    const byId = new Map<number, Hit>();
    const add = (r: Row, rank: number, kind: 'v' | 'k') => {
      const id = Number(r.id);
      const h = byId.get(id) ?? {
        chunkId: id, documentId: Number(r.document_id), title: r.title, heading: r.heading,
        content: r.content, vectorScore: 0, keywordRank: null, score: 0,
      };
      h.score += 1 / (RRF_K + rank);
      if (kind === 'v') h.vectorScore = Number(r.sim);
      else h.keywordRank = rank;
      byId.set(id, h);
    };
    semantic.forEach((r, i) => add(r, i + 1, 'v'));
    keyword.forEach((r, i) => add(r, i + 1, 'k'));

    // Chunks found only by keyword still need a similarity for the confidence check.
    const missing = [...byId.values()].filter(h => h.vectorScore === 0).map(h => h.chunkId);
    if (missing.length) {
      const sims = await this.db.query<{ id: number; sim: number }>(
        `SELECT id, 1 - (embedding <=> $1::vector) AS sim FROM chunks WHERE id = ANY($2::bigint[])`,
        [toPgVector(qv), missing],
      );
      for (const s of sims) byId.get(Number(s.id))!.vectorScore = Number(s.sim);
    }

    return [...byId.values()].sort((a, b) => b.score - a.score).slice(0, k);
  }
}

interface Row {
  id: number;
  document_id: number;
  title: string;
  heading: string | null;
  content: string;
  sim?: number;
  kw?: number;
}
