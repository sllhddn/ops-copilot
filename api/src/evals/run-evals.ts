import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AskService, REFUSAL } from '../ask/ask.service.js';
import { loadConfig } from '../config.js';
import { connectEmbedded, connectPostgres, migrate, type Db } from '../db/db.js';
import { OfflineLlm } from '../llm/offline.llm.js';
import type { LlmClient } from '../llm/types.js';
import { HashingEmbedder } from '../rag/embedder.js';
import { Retriever } from '../rag/retriever.js';
import { seed } from '../seed/seed.js';

export interface EvalReport {
  retrieval: { n: number; hitAt1: number; hitAt3: number; mrr: number; misses: string[] };
  answers: { grounded: number; withCitations: number; n: number };
  refusals: { correct: number; n: number };
}

/**
 * Measures the RAG pipeline on a fixed question set:
 * - retrieval: is the right runbook ranked 1st / in the top 3? (hit@k, mean reciprocal rank)
 * - answers: does every in-scope answer carry valid citations?
 * - refusals: does the app decline questions the runbooks do not cover?
 */
export async function runEvals(db: Db, llm: LlmClient = new OfflineLlm()): Promise<EvalReport> {
  const here = dirname(fileURLToPath(import.meta.url));
  const set = JSON.parse(await readFile(join(here, 'questions.json'), 'utf8')) as {
    retrieval: { q: string; expect: string }[]; out_of_scope: string[];
  };
  const retriever = new Retriever(db, new HashingEmbedder(256));
  const ask = new AskService(retriever, llm, loadConfig({}));

  let h1 = 0, h3 = 0, rr = 0, grounded = 0, cited = 0;
  const misses: string[] = [];
  for (const { q, expect } of set.retrieval) {
    const hits = await retriever.search(q, 5);
    const rank = hits.findIndex(h => h.title === expect) + 1;
    if (rank === 1) h1++;
    if (rank >= 1 && rank <= 3) h3++; else misses.push(q);
    if (rank) rr += 1 / rank;
    const a = await ask.ask(q);
    if (a.grounded) grounded++;
    if (a.citations.length) cited++;
  }
  let refused = 0;
  for (const q of set.out_of_scope) if ((await ask.ask(q)).answer === REFUSAL) refused++;

  const n = set.retrieval.length;
  const r = (x: number) => Math.round(x * 100) / 100;
  return {
    retrieval: { n, hitAt1: r(h1 / n), hitAt3: r(h3 / n), mrr: r(rr / n), misses },
    answers: { grounded, withCitations: cited, n },
    refusals: { correct: refused, n: set.out_of_scope.length },
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const db = process.env.DATABASE_URL ? await connectPostgres(process.env.DATABASE_URL) : await connectEmbedded();
  await migrate(db);
  await seed(db);
  const rep = await runEvals(db);
  console.log(JSON.stringify(rep, null, 2));
  await db.close();
  const pass = rep.retrieval.hitAt3 >= 0.8 && rep.refusals.correct === rep.refusals.n;
  console.log(pass ? 'EVALS PASSED' : 'EVALS FAILED');
  process.exit(pass ? 0 : 1);
}
