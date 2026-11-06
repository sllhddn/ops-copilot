import type { Db } from '../db/db.js';
import type { LlmClient, LlmRequest, LlmResponse } from './types.js';

/** Wraps any client and records model, tokens, latency and success of every call. */
export class AuditedLlm implements LlmClient {
  constructor(private readonly inner: LlmClient, private readonly db: Db, private readonly modelName: string) {}

  async complete(req: LlmRequest): Promise<LlmResponse> {
    const t0 = Date.now();
    try {
      const res = await this.inner.complete(req);
      await this.record(req.purpose, res.model, res.usage.inputTokens, res.usage.outputTokens, Date.now() - t0, true);
      return res;
    } catch (e) {
      await this.record(req.purpose, this.modelName, 0, 0, Date.now() - t0, false);
      throw e;
    }
  }

  private record(purpose: string, model: string, inTok: number, outTok: number, ms: number, ok: boolean) {
    return this.db.query(
      'INSERT INTO llm_calls(purpose, model, input_tokens, output_tokens, latency_ms, ok) VALUES ($1,$2,$3,$4,$5,$6)',
      [purpose, model, inTok, outTok, ms, ok],
    );
  }
}
