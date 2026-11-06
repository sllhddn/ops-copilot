import { useEffect, useState } from 'react';
import { api, type Incident } from '../api';

export function IncidentsPage() {
  const [items, setItems] = useState<Incident[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api.incidents().then(setItems).catch(e => setError(e.message)); }, []);
  return (
    <div className="page">
      <h1>Incidents</h1>
      {error && <p role="alert" className="error">{error}</p>}
      <table className="grid">
        <thead><tr><th>Ref</th><th>Severity</th><th>Status</th><th>Service</th><th>Title</th></tr></thead>
        <tbody>
          {items.map(i => (
            <tr key={i.ref}>
              <td><code>{i.ref}</code></td>
              <td><span className={`sev ${i.severity}`}>{i.severity}</span></td>
              <td><span className={`badge ${i.status.toLowerCase()}`}>{i.status}</span></td>
              <td>{i.service}</td><td>{i.title}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
