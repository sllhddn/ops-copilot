import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Db } from '../db/db.js';
import { DocumentsService } from '../documents/documents.service.js';
import { HashingEmbedder } from '../rag/embedder.js';

const here = dirname(fileURLToPath(import.meta.url));

/** Loads the fictional runbooks and incidents. Safe to run twice. */
export async function seed(db: Db): Promise<{ documents: number; incidents: number }> {
  const docs = new DocumentsService(db, new HashingEmbedder(256));
  let documents = 0;
  for (const f of (await readdir(join(here, 'runbooks'))).filter(f => f.endsWith('.md')).sort()) {
    const md = await readFile(join(here, 'runbooks', f), 'utf8');
    const title = /^#\s+(.+)$/m.exec(md)?.[1] ?? f;
    const exists = await db.query('SELECT 1 FROM documents WHERE title = $1', [title]);
    if (exists.length) continue;
    await docs.ingest(title, md.replace(/^#\s+.+\n/, ''), `runbooks/${f}`);
    documents++;
  }
  const incidents = JSON.parse(await readFile(join(here, 'incidents.json'), 'utf8')) as Record<string, string>[];
  let n = 0;
  for (const i of incidents) {
    const rows = await db.query(
      `INSERT INTO incidents(ref, title, service, severity, status, summary, opened_at, resolved_at)
       VALUES ($1,$2,$3,$4,$5,$6, now() - interval '3 hours', CASE WHEN $7 THEN now() ELSE NULL END)
       ON CONFLICT (ref) DO NOTHING RETURNING id`,
      [i.ref, i.title, i.service, i.severity, i.status, i.summary, i.status === 'RESOLVED']);
    n += rows.length;
  }
  return { documents, incidents: n };
}

// Run directly: npm run seed
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { connectEmbedded, connectPostgres, migrate } = await import('../db/db.js');
  const url = process.env.DATABASE_URL;
  const db = url ? await connectPostgres(url) : await connectEmbedded(process.env.PGLITE_DIR ?? './.pglite');
  await migrate(db);
  console.log(await seed(db));
  await db.close();
}
