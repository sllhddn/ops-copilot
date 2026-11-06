import { useState } from 'react';
import { AgentPage } from './pages/AgentPage';
import { AskPage } from './pages/AskPage';
import { DocumentsPage } from './pages/DocumentsPage';
import { IncidentsPage } from './pages/IncidentsPage';
import { MetricsPage } from './pages/MetricsPage';

const TABS = [
  { id: 'ask', label: 'Ask the runbooks', page: AskPage },
  { id: 'agent', label: 'Agent', page: AgentPage },
  { id: 'incidents', label: 'Incidents', page: IncidentsPage },
  { id: 'documents', label: 'Documents', page: DocumentsPage },
  { id: 'metrics', label: 'Model usage', page: MetricsPage },
] as const;

export function App() {
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('ask');
  const Page = TABS.find(t => t.id === tab)!.page;
  return (
    <div className="shell">
      <header className="top">
        <div className="brand"><span className="logo" aria-hidden>◆</span> ops-copilot</div>
        <nav role="tablist" aria-label="Sections">
          {TABS.map(t => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} className="tab" onClick={() => setTab(t.id)}>{t.label}</button>
          ))}
        </nav>
      </header>
      <main><Page /></main>
      <footer className="foot">Answers come only from your runbooks. Writes by the agent wait for approval.</footer>
    </div>
  );
}
