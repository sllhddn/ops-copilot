import { tokenize } from '../rag/embedder.js';
import { textOf, type LlmClient, type LlmRequest, type LlmResponse, type ToolUseBlock } from './types.js';

/**
 * A deterministic stand-in for Claude, used when no API key is set and in tests.
 * - For answers it quotes the source sentences that overlap most with the question,
 *   each with its [n] citation (extractive, never invents text).
 * - For the agent it picks a tool with simple rules, then summarises the tool result.
 * It follows the same contract as the real model, so every code path is exercised offline.
 */
export class OfflineLlm implements LlmClient {
  private seq = 0;

  async complete(req: LlmRequest): Promise<LlmResponse> {
    const content = req.purpose === 'answer' ? [this.answer(req)] : this.agent(req);
    const stopReason = content.some(b => b.type === 'tool_use') ? 'tool_use' : 'end_turn';
    const input = req.system.length + req.messages.reduce((n, m) => n + textOf(m.content).length, 0);
    const output = content.reduce((n, b) => n + (b.type === 'text' ? b.text.length : JSON.stringify(b.input).length), 0);
    return {
      model: 'offline-extractive',
      content,
      stopReason,
      usage: { inputTokens: Math.ceil(input / 4), outputTokens: Math.ceil(output / 4) },
    };
  }

  private answer(req: LlmRequest): { type: 'text'; text: string } {
    const prompt = textOf(req.messages[req.messages.length - 1].content);
    const question = /QUESTION:\s*([\s\S]*)$/.exec(prompt)?.[1] ?? prompt;
    const q = new Set(tokenize(question));
    const sources = [...prompt.matchAll(/<source id="(\d+)"[^>]*>\n([\s\S]*?)\n<\/source>/g)];
    const scored: { n: string; s: string; score: number; order: number }[] = [];
    sources.forEach(([, n, body], si) => {
      body.replace(/([^\n])\n(?=[^\n])/g, '$1 ').split(/(?<=[.!?])\s+|\n+/).map(s => s.replace(/^[-*\d.)\s]+/, '').trim()).filter(s => s.length > 20)
        .forEach((s, i) => {
          const overlap = tokenize(s).filter(t => q.has(t)).length;
          if (overlap) scored.push({ n, s, score: overlap - si * 0.1, order: si * 1000 + i });
        });
    });
    const best = scored.sort((a, b) => b.score - a.score).slice(0, 3).sort((a, b) => a.order - b.order);
    if (!best.length) return { type: 'text', text: 'The sources do not cover this question.' };
    return { type: 'text', text: best.map(b => `${b.s.replace(/[.]?$/, '.')} [${b.n}]`).join(' ') };
  }

  private agent(req: LlmRequest): LlmResponse['content'] {
    const last = req.messages[req.messages.length - 1];
    if (Array.isArray(last.content) && last.content.some(b => b.type === 'tool_result')) {
      const results = last.content.filter(b => b.type === 'tool_result').map(b => (b as { content: string }).content);
      return [{ type: 'text', text: results.map(describe).join('\n') }];
    }
    const text = textOf(last.content);
    const ref = /\bINC-\d+\b/i.exec(text)?.[0].toUpperCase();
    const call = (name: string, input: Record<string, unknown>): ToolUseBlock =>
      ({ type: 'tool_use', id: `toolu_offline_${++this.seq}`, name, input });

    if (ref && /\b(note|add|record|log)\b/i.test(text)) {
      const note = (/:\s*["“]?(.+?)["”]?\s*$/.exec(text) ?? /\bnote\s+["“]?(.+?)["”]?\s*$/i.exec(text))?.[1] ?? text;
      return [call('add_incident_note', { ref, note })];
    }
    if (ref) return [call('get_incident', { ref })];
    if (/\bincidents?\b/i.test(text)) {
      const sev = /\bP[1-4]\b/i.exec(text)?.[0].toUpperCase();
      return [call('list_open_incidents', sev ? { severity: sev } : {})];
    }
    return [call('search_runbooks', { query: text })];
  }
}

/** Turns a tool's JSON result into a short readable sentence (the real model does this itself). */
function describe(raw: string): string {
  if (raw.startsWith('Error:')) return `The tool reported an error: ${raw.slice(7)}`;
  let data: unknown;
  try { data = JSON.parse(raw); } catch { return raw; }
  const inc = (i: Record<string, unknown>) => `${i.ref} (${i.severity}, ${i.status}) ${i.title}${i.summary ? ` — ${i.summary}` : ''}`;
  if (Array.isArray(data)) {
    if (!data.length) return 'Nothing matched.';
    if ('ref' in data[0]) return `${data.length} open incident(s):\n` + data.map(d => `• ${inc(d)}`).join('\n');
    if ('title' in data[0]) return 'Relevant runbook sections:\n' + data.map(d => `• ${d.title}${d.section ? ` › ${d.section}` : ''}: ${String(d.text).slice(0, 160)}…`).join('\n');
  }
  const o = data as Record<string, unknown>;
  if (o.queued) return `I queued that change as action #${o.actionId}. It is saved only after a person approves it.`;
  if (o.saved) return `Saved to ${o.ref}.`;
  if (o.ref) return inc(o) + (Array.isArray(o.notes) && o.notes.length ? `\nLatest note: ${(o.notes.at(-1) as { body: string }).body}` : '');
  return raw;
}
