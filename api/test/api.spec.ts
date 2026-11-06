import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Db } from '../src/db/db.js';
import { startApp } from './helpers.js';

let app: INestApplication;
let db: Db;
let http: ReturnType<typeof request>;

beforeAll(async () => {
  ({ app, db } = await startApp());
  http = request(app.getHttpServer());
});
afterAll(async () => { await app.close(); await db.close(); });

describe('health and documents', () => {
  it('reports UP', async () => {
    await http.get('/api/health').expect(200, { status: 'UP' });
  });

  it('lists the seeded runbooks with chunk counts', async () => {
    const res = await http.get('/api/documents').expect(200);
    expect(res.body).toHaveLength(6);
    expect(res.body.every((d: { chunks: number }) => d.chunks > 0)).toBe(true);
  });

  it('ingests a new document and rejects a duplicate title', async () => {
    const body = { title: 'Log Rotation', content: '## Steps\n\nRotate the application logs daily and keep 14 days of compressed logs.' };
    const res = await http.post('/api/documents').send(body).expect(201);
    expect(res.body.chunks).toBe(1);
    await http.post('/api/documents').send(body).expect(409);
    await http.delete(`/api/documents/${res.body.id}`).expect(204);
    await http.get(`/api/documents/${res.body.id}`).expect(404);
  });

  it('validates input and rejects unknown fields', async () => {
    const res = await http.post('/api/documents').send({ title: 'x', content: 'short', hack: true }).expect(400);
    expect(JSON.stringify(res.body.message)).toMatch(/title|content|hack/);
  });
});

describe('POST /api/ask', () => {
  it('answers from the runbooks with valid citations', async () => {
    const res = await http.post('/api/ask').send({ question: 'What order do we switch over during a DR drill?' }).expect(200);
    expect(res.body.grounded).toBe(true);
    expect(res.body.citations[0].title).toBe('Disaster Recovery Failover Drill');
    expect(res.body.answer).toMatch(/\[\d\]/);
  });

  it('refuses questions the runbooks do not cover, without calling the model', async () => {
    const before = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM llm_calls');
    const res = await http.post('/api/ask').send({ question: 'What is the office wifi password?' }).expect(200);
    expect(res.body).toMatchObject({ grounded: false, citations: [] });
    const after = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM llm_calls');
    expect(after[0].n).toBe(before[0].n);
  });
});

describe('incidents', () => {
  it('filters by status and returns notes', async () => {
    const open = await http.get('/api/incidents?status=OPEN').expect(200);
    expect(open.body.map((i: { ref: string }) => i.ref).sort()).toEqual(['INC-1042', 'INC-1044']);
    const one = await http.get('/api/incidents/inc-1042').expect(200);
    expect(one.body.notes).toEqual([]);
  });

  it('creates an incident and rejects a bad severity', async () => {
    await http.post('/api/incidents').send({ ref: 'INC-2001', title: 'Batch job late', service: 'Batch', severity: 'P3' }).expect(201);
    await http.post('/api/incidents').send({ ref: 'INC-2002', title: 'Batch job late', service: 'Batch', severity: 'P9' }).expect(400);
  });
});

describe('metrics', () => {
  it('records every model call', async () => {
    const res = await http.get('/api/metrics/llm').expect(200);
    const answer = res.body.find((r: { purpose: string }) => r.purpose === 'answer');
    expect(answer.calls).toBeGreaterThan(0);
    expect(answer.failures).toBe(0);
  });
});
