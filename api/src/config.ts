/** Runtime settings, read once from environment variables. */
export interface AppConfig {
  port: number;
  databaseUrl?: string;          // unset = embedded PGlite (no install needed)
  anthropicApiKey?: string;      // unset = offline LLM (deterministic, for demos and tests)
  anthropicModel: string;
  minRetrievalScore: number;     // below this, /ask refuses instead of guessing
  corsOrigin: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    port: Number(env.PORT ?? 3000),
    databaseUrl: env.DATABASE_URL || undefined,
    anthropicApiKey: env.ANTHROPIC_API_KEY && env.ANTHROPIC_API_KEY !== 'offline' ? env.ANTHROPIC_API_KEY : undefined,
    anthropicModel: env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-5',
    minRetrievalScore: Number(env.MIN_RETRIEVAL_SCORE ?? 0.2),
    corsOrigin: env.CORS_ORIGIN ?? 'http://localhost:5173',
  };
}

export const CONFIG = Symbol('CONFIG');
