/** Message shapes follow the Anthropic Messages API, so the real client needs no mapping. */
export type TextBlock = { type: 'text'; text: string };
export type ToolUseBlock = { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> };
export type ToolResultBlock = { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean };
export type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock;

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string | ContentBlock[];
}

export interface ToolDef {
  name: string;
  description: string;
  input_schema: { type: 'object'; properties: Record<string, unknown>; required?: string[] };
}

export type Purpose = 'answer' | 'agent';

export interface LlmRequest {
  purpose: Purpose;
  system: string;
  messages: ChatMessage[];
  tools?: ToolDef[];
  maxTokens?: number;
}

export interface LlmResponse {
  model: string;
  content: (TextBlock | ToolUseBlock)[];
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens' | 'other';
  usage: { inputTokens: number; outputTokens: number };
}

export interface LlmClient {
  complete(req: LlmRequest): Promise<LlmResponse>;
}

export const LLM = Symbol('LLM');

export function textOf(content: ChatMessage['content']): string {
  if (typeof content === 'string') return content;
  return content.map(b => (b.type === 'text' ? b.text : b.type === 'tool_result' ? b.content : '')).join('\n');
}
