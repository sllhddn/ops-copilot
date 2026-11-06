import { useState } from 'react';
import { api, type PendingAction } from '../api';

/** One agent write waiting for a person. Approve runs it; reject discards it. */
export function ActionCard({ action, reviewer, onDecided }: {
  action: PendingAction; reviewer: string; onDecided: (a: PendingAction) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const decide = async (approve: boolean) => {
    setBusy(true); setError(null);
    try { onDecided(await (approve ? api.approve : api.reject)(action.id, reviewer)); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  return (
    <div className={`card action ${action.status.toLowerCase()}`}>
      <div className="row between">
        <strong>#{action.id} · {action.tool}</strong>
        <span className={`badge ${action.status.toLowerCase()}`}>{action.status}</span>
      </div>
      <pre className="args">{JSON.stringify(action.args, null, 2)}</pre>
      {action.status === 'PENDING' ? (
        <div className="row">
          <button className="btn primary" disabled={busy || reviewer.trim().length < 2} onClick={() => decide(true)}>Approve</button>
          <button className="btn" disabled={busy || reviewer.trim().length < 2} onClick={() => decide(false)}>Reject</button>
        </div>
      ) : (
        <p className="muted small">Decided by {action.decidedBy}{action.result ? ` · ${action.result}` : ''}</p>
      )}
      {error && <p role="alert" className="error">{error}</p>}
    </div>
  );
}
