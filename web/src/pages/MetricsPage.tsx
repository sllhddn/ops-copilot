import { useEffect, useState } from 'react';
import { api, type LlmMetric } from '../api';

export function MetricsPage() {
  const [rows, setRows] = useState<LlmMetric[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api.metrics().then(setRows).catch(e => setError(e.message)); }, []);
  return (
    <div className="page">
      <h1>Model usage</h1>
      <p className="muted">Every model call is logged with its tokens and latency, so cost and speed are visible.</p>
      {error && <p role="alert" className="error">{error}</p>}
      <div className="tiles">
        {rows.map(r => (
          <div key={r.purpose + r.model} className="card tile">
            <div className="muted small">{r.purpose} · {r.model}</div>
            <div className="big">{r.calls}<span className="unit"> calls</span></div>
            <dl>
              <dt>Failures</dt><dd>{r.failures}</dd>
              <dt>Tokens in / out</dt><dd>{r.input_tokens} / {r.output_tokens}</dd>
              <dt>Latency avg / p95</dt><dd>{r.avg_latency_ms} / {r.p95_latency_ms} ms</dd>
            </dl>
          </div>
        ))}
        {rows.length === 0 && !error && <p className="muted">No calls yet. Ask a question first.</p>}
      </div>
    </div>
  );
}
