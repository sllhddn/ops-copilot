/** Typed client for the ops-copilot API. */
export interface Citation { n: number; documentId: number; title: string; heading: string | null; excerpt: string }
export interface Answer {
  answer: string; grounded: boolean; citations: Citation[];
  retrieval: { title: string; heading: string | null; score: number; similarity: number }[];
}
export interface AgentStep { tool: string; input: Record<string, unknown>; outcome: 'ran' | 'queued' | 'error'; detail: string }
export interface PendingAction {
  id: number; tool: string; args: Record<string, unknown>; reason: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED'; createdAt: string; decidedBy: string | null; result: string | null;
}
export interface AgentReply { reply: string; steps: AgentStep[]; pendingActions: PendingAction[] }
export interface DocumentSummary { id: number; title: string; source: string | null; chunks: number; createdAt: string }
export interface Incident {
  ref: string; title: string; service: string; severity: 'P1' | 'P2' | 'P3' | 'P4';
  status: 'OPEN' | 'MITIGATED' | 'RESOLVED'; openedAt: string; summary: string | null;
}
export interface LlmMetric {
  purpose: string; model: string; calls: number; failures: number;
  input_tokens: number; output_tokens: number; avg_latency_ms: number; p95_latency_ms: number;
}
export interface ChatTurn { role: 'user' | 'assistant'; content: string }

export class ApiError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

const BASE = import.meta.env.VITE_API_URL ?? '';

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, { headers: { 'Content-Type': 'application/json' }, ...init });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const b = await res.json();
      msg = Array.isArray(b.message) ? b.message.join('; ') : b.message ?? msg;
    } catch { /* not JSON */ }
    throw new ApiError(res.status, msg);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

const post = <T>(path: string, body: unknown) => call<T>(path, { method: 'POST', body: JSON.stringify(body) });

export const api = {
  ask: (question: string) => post<Answer>('/api/ask', { question }),
  chat: (message: string, history: ChatTurn[]) => post<AgentReply>('/api/agent/chat', { message, history }),
  actions: (status?: string) => call<PendingAction[]>(`/api/actions${status ? `?status=${status}` : ''}`),
  approve: (id: number, reviewer: string) => post<PendingAction>(`/api/actions/${id}/approve`, { reviewer }),
  reject: (id: number, reviewer: string) => post<PendingAction>(`/api/actions/${id}/reject`, { reviewer }),
  documents: () => call<DocumentSummary[]>('/api/documents'),
  addDocument: (title: string, content: string) => post<DocumentSummary>('/api/documents', { title, content }),
  deleteDocument: (id: number) => call<void>(`/api/documents/${id}`, { method: 'DELETE' }),
  incidents: () => call<Incident[]>('/api/incidents'),
  metrics: () => call<LlmMetric[]>('/api/metrics/llm'),
};
