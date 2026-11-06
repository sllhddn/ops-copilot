import type { INestApplication } from '@nestjs/common';
import { createApp } from '../src/bootstrap.js';
import { loadConfig } from '../src/config.js';
import { connectEmbedded, migrate, type Db } from '../src/db/db.js';
import type { LlmClient, LlmRequest, LlmResponse } from '../src/llm/types.js';
import { seed } from '../src/seed/seed.js';

export async function startApp(llm?: LlmClient): Promise<{ app: INestApplication; db: Db }> {
  const db = await connectEmbedded();
  await migrate(db);
  await seed(db);
  const app = await createApp({ config: loadConfig({}), db, llm });
  await app.init();
  return { app, db };
}

/** A scripted model: returns the queued responses in order and records the requests. */
export class ScriptedLlm implements LlmClient {
  readonly requests: LlmRequest[] = [];
  constructor(private readonly script: ((req: LlmRequest) => LlmResponse['content'])[]) {}
  async complete(req: LlmRequest): Promise<LlmResponse> {
    this.requests.push(req);
    const next = this.script.shift();
    if (!next) throw new Error('script exhausted');
    const content = next(req);
    return {
      model: 'scripted', content,
      stopReason: content.some(b => b.type === 'tool_use') ? 'tool_use' : 'end_turn',
      usage: { inputTokens: 10, outputTokens: 5 },
    };
  }
}
