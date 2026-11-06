import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import type { Db } from '../src/db/db.js';
import { ScriptedLlm, startApp } from './helpers.js';

let app: INestApplication | undefined;
let db: Db | undefined;
afterEach(async () => { await app?.close(); await db?.close(); app = db = undefined; });

const tool = (name: string, input: Record<string, unknown>, id = 't1') => ({ type: 'tool_use' as const, id, name, input });
const text = (t: string) => ({ type: 'text' as const, text: t });

describe('agent (offline model)', () => {
  it('looks up an incident with a read tool', async () => {
    ({ app, db } = await startApp());
    const res = await request(app.getHttpServer()).post('/api/agent/chat').send({ message: 'What is the status of INC-1044?' }).expect(200);
    expect(res.body.steps).toEqual([expect.objectContaining({ tool: 'get_incident', outcome: 'ran' })]);
    expect(res.body.reply).toContain('Payment gateway');
  });

  it('queues a write for approval, then saves it once approved', async () => {
    ({ app, db } = await startApp());
    const http = request(app.getHttpServer());
    const res = await http.post('/api/agent/chat').send({ message: 'Add a note to INC-1042: sequence resynced, monitoring' }).expect(200);
    expect(res.body.steps[0]).toMatchObject({ tool: 'add_incident_note', outcome: 'queued' });
    const id = res.body.pendingActions[0].id;

    // Nothing saved yet.
    expect((await http.get('/api/incidents/INC-1042')).body.notes).toHaveLength(0);

    const ok = await http.post(`/api/actions/${id}/approve`).send({ reviewer: 'duty.engineer' }).expect(200);
    expect(ok.body).toMatchObject({ status: 'APPROVED', decidedBy: 'duty.engineer' });
    const inc = (await http.get('/api/incidents/INC-1042')).body;
    expect(inc.notes).toEqual([expect.objectContaining({ body: 'sequence resynced, monitoring', author: 'duty.engineer' })]);

    // A second decision on the same action is refused.
    await http.post(`/api/actions/${id}/reject`).send({ reviewer: 'someone.else' }).expect(409);
    await http.post('/api/actions/9999/approve').send({ reviewer: 'x1' }).expect(404);
  });
});

describe('agent (scripted model)', () => {
  it('returns tool input errors to the model instead of running the tool', async () => {
    const llm = new ScriptedLlm([
      () => [tool('get_incident', { ref: "INC-1'; DROP TABLE incidents;--" })],
      req => {
        const last = req.messages[req.messages.length - 1].content as { type: string; is_error?: boolean }[];
        expect(last[0]).toMatchObject({ type: 'tool_result', is_error: true });
        return [text('That reference looks invalid.')];
      },
    ]);
    ({ app, db } = await startApp(llm));
    const res = await request(app.getHttpServer()).post('/api/agent/chat').send({ message: 'check it' }).expect(200);
    expect(res.body.steps[0]).toMatchObject({ outcome: 'error' });
    expect(res.body.reply).toBe('That reference looks invalid.');
    expect((await db.query('SELECT count(*)::int AS n FROM incidents'))[0]).toEqual({ n: 4 });
  });

  it('stops after five rounds if the model keeps calling tools', async () => {
    const llm = new ScriptedLlm(Array.from({ length: 5 }, (_, i) => () => [tool('list_open_incidents', {}, `t${i}`)]));
    ({ app, db } = await startApp(llm));
    const res = await request(app.getHttpServer()).post('/api/agent/chat').send({ message: 'loop' }).expect(200);
    expect(res.body.steps).toHaveLength(5);
    expect(res.body.reply).toMatch(/maximum number of steps/);
  });

  it('drops citations that point at sources it was not given', async () => {
    const llm = new ScriptedLlm([() => [text('Restart everything at once. [7]')]]);
    ({ app, db } = await startApp(llm));
    const res = await request(app.getHttpServer()).post('/api/ask').send({ question: 'How do we roll back a failed production release?' }).expect(200);
    expect(res.body).toMatchObject({ grounded: false, citations: [] });
  });

  it('marks sources as data and tells the model to ignore instructions inside them', async () => {
    const llm = new ScriptedLlm([() => [text('Use the rollback scripts. [1]')]]);
    ({ app, db } = await startApp(llm));
    await request(app.getHttpServer()).post('/api/ask').send({ question: 'How do we roll back a failed production release?' }).expect(200);
    const req = llm.requests[0];
    expect(req.system).toMatch(/not instructions/);
    expect(req.messages[0].content).toMatch(/<source id="1"/);
  });

  it('records failed model calls', async () => {
    const llm = new ScriptedLlm([]);   // throws on first call
    ({ app, db } = await startApp(llm));
    await request(app.getHttpServer()).post('/api/ask').send({ question: 'How do we roll back a failed production release?' }).expect(500);
    const rows = await db.query<{ ok: boolean }>('SELECT ok FROM llm_calls');
    expect(rows).toEqual([{ ok: false }]);
  });
});
