import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { api, type DocumentSummary } from '../api';

export function DocumentsPage() {
  const [docs, setDocs] = useState<DocumentSummary[]>([]);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => api.documents().then(setDocs).catch(e => setError(e.message));
  useEffect(() => { load(); }, []);

  const pickFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const text = await f.text();
    setContent(text);
    if (!title) setTitle(/^#\s+(.+)$/m.exec(text)?.[1] ?? f.name.replace(/\.md$/, ''));
  };

  const add = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try { await api.addDocument(title.trim(), content); setTitle(''); setContent(''); await load(); }
    catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  };

  const remove = async (d: DocumentSummary) => {
    if (!window.confirm(`Delete "${d.title}"?`)) return;
    await api.deleteDocument(d.id).catch(e => setError(e.message));
    load();
  };

  return (
    <div className="page">
      <h1>Documents</h1>
      <table className="grid">
        <thead><tr><th>Title</th><th>Source</th><th className="num">Chunks</th><th /></tr></thead>
        <tbody>
          {docs.map(d => (
            <tr key={d.id}><td>{d.title}</td><td className="muted">{d.source ?? '—'}</td><td className="num">{d.chunks}</td>
              <td><button className="btn small" onClick={() => remove(d)}>Delete</button></td></tr>
          ))}
        </tbody>
      </table>
      <h2>Add a runbook (Markdown)</h2>
      <form onSubmit={add} className="stack">
        <label className="field">File <input type="file" accept=".md,.txt" onChange={pickFile} /></label>
        <label className="field">Title <input value={title} onChange={e => setTitle(e.target.value)} maxLength={200} required minLength={3} /></label>
        <label className="field">Content <textarea rows={8} value={content} onChange={e => setContent(e.target.value)} required minLength={20} /></label>
        <button className="btn primary" disabled={busy}>{busy ? 'Indexing…' : 'Add document'}</button>
      </form>
      {error && <p role="alert" className="error">{error}</p>}
    </div>
  );
}
