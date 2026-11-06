import Anthropic from '@anthropic-ai/sdk';
import type { LlmClient, LlmRequest, LlmResponse } from './types.js';

/** Claude via the official SDK. Retries (429/5xx) are handled by the SDK. */
export class AnthropicLlm implements LlmClient {
  private readonly client: Anthropic;

  constructor(apiKey: string, private readonly model: string) {
    this.client = new Anthropic({ apiKey, maxRetries: 2, timeout: 60_000 });
  }

  async complete(req: LlmRequest): Promise<LlmResponse> {
    const res = await this.client.messages.create({
      model: this.model,
      max_tokens: req.maxTokens ?? 1024,
      system: req.system,
      messages: req.messages as never,
      ...(req.tools?.length ? { tools: req.tools as never } : {}),
    });
    const content = (res.content as { type: string }[])
      .filter(b => b.type === 'text' || b.type === 'tool_use') as LlmResponse['content'];
    const stop = res.stop_reason;
    return {
      model: res.model,
      content,
      stopReason: stop === 'end_turn' || stop === 'tool_use' || stop === 'max_tokens' ? stop : 'other',
      usage: { inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens },
    };
  }
}
