import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DB, type Db } from '../db/db.js';
import { chunkMarkdown } from '../rag/chunker.js';
import { EMBEDDER, type Embedder, toPgVector } from '../rag/embedder.js';

export interface DocumentSummary { id: number; title: string; source: string | null; chunks: number; createdAt: string }

@Injectable()
export class DocumentsService {
  constructor(@Inject(DB) private readonly db: Db, @Inject(EMBEDDER) private readonly embedder: Embedder) {}

  /** Stores a markdown document as heading-aware chunks with embeddings. */
  async ingest(title: string, content: string, source?: string): Promise<DocumentSummary> {
    const exists = await this.db.query('SELECT 1 FROM documents WHERE title = $1', [title]);
    if (exists.length) throw new ConflictException(`A document titled "${title}" already exists`);
    const chunks = chunkMarkdown(content);
    if (!chunks.length) throw new ConflictException('The document has no text to index');
    const vectors = await this.embedder.embed(chunks.map(c => `${title} ${c.heading ?? ''}\n${c.content}`));

    const [doc] = await this.db.query<{ id: number }>(
      'INSERT INTO documents(title, source) VALUES ($1, $2) RETURNING id', [title, source ?? null]);
    for (const [i, c] of chunks.entries()) {
      await this.db.query(
        'INSERT INTO chunks(document_id, ordinal, heading, content, embedding) VALUES ($1,$2,$3,$4,$5::vector)',
        [doc.id, c.ordinal, c.heading, c.content, toPgVector(vectors[i])],
      );
    }
    return this.get(Number(doc.id));
  }

  async list(): Promise<DocumentSummary[]> {
    const rows = await this.db.query<Row>(
      `SELECT d.id, d.title, d.source, d.created_at, count(c.id)::int AS chunks
         FROM documents d LEFT JOIN chunks c ON c.document_id = d.id
        GROUP BY d.id ORDER BY d.title`);
    return rows.map(map);
  }

  async get(id: number): Promise<DocumentSummary> {
    const rows = await this.db.query<Row>(
      `SELECT d.id, d.title, d.source, d.created_at, count(c.id)::int AS chunks
         FROM documents d LEFT JOIN chunks c ON c.document_id = d.id
        WHERE d.id = $1 GROUP BY d.id`, [id]);
    if (!rows.length) throw new NotFoundException(`Document ${id} not found`);
    return map(rows[0]);
  }

  async remove(id: number): Promise<void> {
    const rows = await this.db.query('DELETE FROM documents WHERE id = $1 RETURNING id', [id]);
    if (!rows.length) throw new NotFoundException(`Document ${id} not found`);
  }
}

interface Row { id: number; title: string; source: string | null; created_at: Date | string; chunks: number }
const map = (r: Row): DocumentSummary => ({
  id: Number(r.id), title: r.title, source: r.source, chunks: Number(r.chunks),
  createdAt: new Date(r.created_at).toISOString(),
});
