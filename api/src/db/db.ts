import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The only database surface the app uses: parameterised SQL in, rows out. */
export interface Db {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  close(): Promise<void>;
}

export const DB = Symbol('DB');

/** PostgreSQL (with the pgvector extension) via node-postgres. */
export async function connectPostgres(url: string): Promise<Db> {
  const pg = await import('pg');
  const pool = new pg.default.Pool({ connectionString: url, max: 10 });
  return {
    async query<T>(sql: string, params: unknown[] = []) {
      const r = await pool.query(sql, params);
      return r.rows as T[];
    },
    close: () => pool.end(),
  };
}

/** Embedded PostgreSQL compiled to WebAssembly, with pgvector. Used for tests and zero-setup runs. */
export async function connectEmbedded(dataDir?: string): Promise<Db> {
  const { PGlite } = await import('@electric-sql/pglite');
  const { vector } = await import('@electric-sql/pglite-pgvector');
  const db = await PGlite.create({ dataDir, extensions: { vector } });
  return {
    async query<T>(sql: string, params: unknown[] = []) {
      const r = await db.query<T>(sql, params as never[]);
      return r.rows;
    },
    close: () => db.close(),
  };
}

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'migrations');

/**
 * Applies versioned SQL files (001_*.sql, 002_*.sql …) once each, in order.
 * Applied versions are recorded in schema_migrations, like Flyway.
 */
export async function migrate(db: Db, dir = MIGRATIONS_DIR): Promise<string[]> {
  await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version    text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now())`);
  const done = new Set((await db.query<{ version: string }>('SELECT version FROM schema_migrations')).map(r => r.version));
  const files = (await readdir(dir)).filter(f => /^\d{3}_.+\.sql$/.test(f)).sort();
  const applied: string[] = [];
  for (const f of files) {
    if (done.has(f)) continue;
    const sql = await readFile(join(dir, f), 'utf8');
    for (const stmt of splitStatements(sql)) await db.query(stmt);
    await db.query('INSERT INTO schema_migrations(version) VALUES ($1)', [f]);
    applied.push(f);
  }
  return applied;
}

/** Splits a migration file on semicolons at line ends (no procedural bodies in these files). */
export function splitStatements(sql: string): string[] {
  return sql
    .split('\n')
    .filter(l => !l.trim().startsWith('--'))
    .join('\n')
    .split(/;\s*(?:\n|$)/)
    .map(s => s.trim())
    .filter(Boolean);
}
