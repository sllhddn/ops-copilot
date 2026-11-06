import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Answer, PendingAction } from '../src/api';
import { ActionCard } from '../src/components/ActionCard';
import { AnswerView } from '../src/components/AnswerView';
import { AskPage } from '../src/pages/AskPage';

afterEach(() => vi.restoreAllMocks());

const answer: Answer = {
  answer: 'Raise the sequence above the highest ID. [1] Retry the transaction. [2]',
  grounded: true,
  citations: [
    { n: 1, documentId: 1, title: 'Sequence Drift', heading: 'Fix', excerpt: 'Raise the sequence…' },
    { n: 2, documentId: 1, title: 'Sequence Drift', heading: 'Fix', excerpt: 'Retry the failed transaction…' },
  ],
  retrieval: [{ title: 'Sequence Drift', heading: 'Fix', score: 0.033, similarity: 0.61 }],
};

describe('AnswerView', () => {
  it('turns [n] markers into links to the sources', () => {
    render(<AnswerView answer={answer} />);
    expect(screen.getByRole('link', { name: 'source 1' })).toHaveAttribute('href', '#src-1');
    expect(screen.getAllByText('Sequence Drift')).toHaveLength(2);
  });

  it('flags answers that are not grounded', () => {
    render(<AnswerView answer={{ ...answer, grounded: false, citations: [], answer: 'The sources do not cover this question.' }} />);
    expect(screen.getByText('Not in the runbooks')).toBeInTheDocument();
  });
});

describe('ActionCard', () => {
  const action: PendingAction = {
    id: 7, tool: 'add_incident_note', args: { ref: 'INC-1042', note: 'resynced' }, reason: null,
    status: 'PENDING', createdAt: '2026-11-05T00:00:00Z', decidedBy: null, result: null,
  };

  it('approves through the API and reports the decision', async () => {
    const decided = { ...action, status: 'APPROVED' as const, decidedBy: 'duty.engineer' };
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(decided), { status: 200 }));
    const onDecided = vi.fn();
    render(<ActionCard action={action} reviewer="duty.engineer" onDecided={onDecided} />);
    await userEvent.click(screen.getByRole('button', { name: 'Approve' }));
    expect(fetchMock).toHaveBeenCalledWith('/api/actions/7/approve', expect.objectContaining({ method: 'POST' }));
    expect(onDecided).toHaveBeenCalledWith(decided);
  });

  it('needs a reviewer name before deciding', () => {
    render(<ActionCard action={action} reviewer="" onDecided={() => {}} />);
    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled();
  });

  it('shows the API error message', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ message: 'Action 7 was already decided' }), { status: 409 }));
    render(<ActionCard action={action} reviewer="duty.engineer" onDecided={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: 'Reject' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('already decided');
  });
});

describe('AskPage', () => {
  it('asks the API and renders the answer', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(answer), { status: 200 }));
    render(<AskPage />);
    await userEvent.type(screen.getByLabelText('Question'), 'duplicate key after load');
    await userEvent.click(screen.getByRole('button', { name: 'Ask' }));
    expect(await screen.findByText(/Raise the sequence above/)).toBeInTheDocument();
  });
});
