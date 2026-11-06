import { describe, expect, it } from 'vitest';
import { connectEmbedded, migrate } from '../src/db/db.js';
import { runEvals } from '../src/evals/run-evals.js';
import { seed } from '../src/seed/seed.js';

describe('RAG evals', () => {
  it('meets the quality bar on the fixed question set', async () => {
    const db = await connectEmbedded();
    await migrate(db);
    await seed(db);
    const rep = await runEvals(db);
    await db.close();
    expect(rep.retrieval.hitAt3).toBeGreaterThanOrEqual(0.8);
    expect(rep.retrieval.mrr).toBeGreaterThanOrEqual(0.7);
    expect(rep.answers.withCitations).toBe(rep.answers.n);
    expect(rep.refusals.correct).toBe(rep.refusals.n);
  });
});
