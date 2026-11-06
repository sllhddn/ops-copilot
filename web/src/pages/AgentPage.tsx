import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api, type AgentStep, type ChatTurn, type PendingAction } from '../api';
import { ActionCard } from '../components/ActionCard';

interface Turn extends ChatTurn { steps?: AgentStep[] }

export function AgentPage() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actions, setActions] = useState<PendingAction[]>([]);
  const [reviewer, setReviewer] = useState('duty.engineer');
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => { api.actions('PENDING').then(setActions).catch(() => {}); }, []);
  useEffect(() => { end.current?.scrollIntoView?.({ behavior: 'smooth' }); }, [turns]);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    const text = msg.trim();
    if (text.length < 2) return;
    setBusy(true); setError(null); setMsg('');
    const history: ChatTurn[] = turns.map(({ role, content }) => ({ role, content }));
    setTurns(t => [...t, { role: 'user', content: text }]);
    try {
      const r = await api.chat(text, history);
      setTurns(t => [...t, { role: 'assistant', content: r.reply, steps: r.steps }]);
      if (r.pendingActions.length) setActions(a => [...r.pendingActions, ...a]);
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  };

  const decided = (a: PendingAction) => setActions(list => list.map(x => (x.id === a.id ? a : x)));

  return (
    <div className="page two-col">
      <section>
        <h1>Agent</h1>
        <p className="muted">Ask about incidents or procedures. Try: “What is the status of INC-1044?” or “Add a note to INC-1042: sequence resynced”.</p>
        <div className="chat" aria-live="polite">
          {turns.map((t, i) => (
            <div key={i} className={`bubble ${t.role}`}>
              <div className="who">{t.role === 'user' ? 'You' : 'Agent'}</div>
              <div className="text">{t.content}</div>
              {t.steps && t.steps.length > 0 && (
                <ul className="steps">
                  {t.steps.map((s, j) => <li key={j} className={s.outcome}><code>{s.tool}</code> {s.outcome} · {s.detail}</li>)}
                </ul>
              )}
            </div>
          ))}
          {busy && <div className="bubble assistant muted">Working…</div>}
          <div ref={end} />
        </div>
        <form onSubmit={send} className="ask">
          <label htmlFor="m" className="sr-only">Message</label>
          <input id="m" value={msg} onChange={e => setMsg(e.target.value)} placeholder="Message the agent" maxLength={2000} />
          <button className="btn primary" disabled={busy || msg.trim().length < 2}>Send</button>
        </form>
        {error && <p role="alert" className="error">{error}</p>}
      </section>
      <aside>
        <h2>Waiting for approval</h2>
        <label className="field">Reviewer
          <input value={reviewer} onChange={e => setReviewer(e.target.value)} maxLength={100} />
        </label>
        {actions.length === 0 && <p className="muted">Nothing to approve.</p>}
        {actions.map(a => <ActionCard key={a.id} action={a} reviewer={reviewer} onDecided={decided} />)}
      </aside>
    </div>
  );
}
