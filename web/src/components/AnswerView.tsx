import { Fragment } from 'react';
import type { Answer } from '../api';

/** Renders an answer with [n] markers turned into links to the matching source card. */
export function AnswerView({ answer }: { answer: Answer }) {
  const parts = answer.answer.split(/(\[\d+\])/g);
  return (
    <section className="card answer" aria-live="polite">
      {!answer.grounded && <p className="badge warn">Not in the runbooks</p>}
      <p className="answer-text">
        {parts.map((p, i) => {
          const m = /^\[(\d+)\]$/.exec(p);
          return m
            ? <a key={i} className="cite" href={`#src-${m[1]}`} aria-label={`source ${m[1]}`}>{m[1]}</a>
            : <Fragment key={i}>{p}</Fragment>;
        })}
      </p>
      {answer.citations.length > 0 && (
        <ol className="sources">
          {answer.citations.map(c => (
            <li key={c.n} id={`src-${c.n}`}>
              <span className="cite static">{c.n}</span>
              <div>
                <strong>{c.title}</strong>{c.heading && <span className="muted"> · {c.heading}</span>}
                <p className="excerpt">{c.excerpt}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
      <details className="retrieval">
        <summary>Retrieval details</summary>
        <table>
          <thead><tr><th>Chunk</th><th>Fused score</th><th>Similarity</th></tr></thead>
          <tbody>
            {answer.retrieval.map((r, i) => (
              <tr key={i}><td>{r.title}{r.heading ? ` · ${r.heading}` : ''}</td><td className="num">{r.score.toFixed(3)}</td><td className="num">{r.similarity.toFixed(2)}</td></tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}
