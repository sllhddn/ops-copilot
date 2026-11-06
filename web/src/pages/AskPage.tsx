import { useState, type FormEvent } from 'react';
import { api, type Answer } from '../api';
import { AnswerView } from '../components/AnswerView';

const EXAMPLES = [
  'Inserts fail with ORA-00001 after a data migration, what do I do?',
  'What order do we switch over during a DR drill?',
  'When should we remove the maintenance page after a release?',
];

export function AskPage() {
  const [q, setQ] = useState('');
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e?: FormEvent, question = q) => {
    e?.preventDefault();
    if (question.trim().length < 3) return;
    setBusy(true); setError(null);
    try { setAnswer(await api.ask(question.trim())); }
    catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div className="page">
      <h1>Ask the runbooks</h1>
      <p className="muted">Answers are built only from the documents in this workspace, with numbered sources.</p>
      <form onSubmit={submit} className="ask">
        <label htmlFor="q" className="sr-only">Question</label>
        <input id="q" value={q} onChange={e => setQ(e.target.value)} placeholder="e.g. How do we roll back a failed release?" maxLength={1000} />
        <button className="btn primary" disabled={busy || q.trim().length < 3}>{busy ? 'Searching…' : 'Ask'}</button>
      </form>
      <div className="chips">
        {EXAMPLES.map(x => <button key={x} className="chip" onClick={() => { setQ(x); submit(undefined, x); }}>{x}</button>)}
      </div>
      {error && <p role="alert" className="error">{error}</p>}
      {answer && <AnswerView answer={answer} />}
    </div>
  );
}
