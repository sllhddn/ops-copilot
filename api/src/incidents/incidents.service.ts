import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DB, type Db } from '../db/db.js';

export type Severity = 'P1' | 'P2' | 'P3' | 'P4';
export type IncidentStatus = 'OPEN' | 'MITIGATED' | 'RESOLVED';

export interface Incident {
  ref: string; title: string; service: string; severity: Severity; status: IncidentStatus;
  openedAt: string; resolvedAt: string | null; summary: string | null;
  notes?: { body: string; author: string; createdAt: string }[];
}

@Injectable()
export class IncidentsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async list(filter: { status?: IncidentStatus; severity?: Severity; openOnly?: boolean } = {}): Promise<Incident[]> {
    const where: string[] = [];
    const params: unknown[] = [];
    if (filter.openOnly) where.push(`status <> 'RESOLVED'`);
    if (filter.status) { params.push(filter.status); where.push(`status = $${params.length}`); }
    if (filter.severity) { params.push(filter.severity); where.push(`severity = $${params.length}`); }
    const rows = await this.db.query<Row>(
      `SELECT * FROM incidents ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
        ORDER BY severity, opened_at DESC LIMIT 100`, params);
    return rows.map(map);
  }

  async get(ref: string): Promise<Incident> {
    const rows = await this.db.query<Row>('SELECT * FROM incidents WHERE ref = $1', [ref.toUpperCase()]);
    if (!rows.length) throw new NotFoundException(`Incident ${ref} not found`);
    const notes = await this.db.query<{ body: string; author: string; created_at: string }>(
      'SELECT body, author, created_at FROM incident_notes WHERE incident_id = $1 ORDER BY created_at', [rows[0].id]);
    return { ...map(rows[0]), notes: notes.map(n => ({ body: n.body, author: n.author, createdAt: new Date(n.created_at).toISOString() })) };
  }

  async create(i: { ref: string; title: string; service: string; severity: Severity; summary?: string }): Promise<Incident> {
    const ref = i.ref.toUpperCase();
    const dup = await this.db.query('SELECT 1 FROM incidents WHERE ref = $1', [ref]);
    if (dup.length) throw new ConflictException(`Incident ${ref} already exists`);
    await this.db.query('INSERT INTO incidents(ref, title, service, severity, summary) VALUES ($1,$2,$3,$4,$5)',
      [ref, i.title, i.service, i.severity, i.summary ?? null]);
    return this.get(ref);
  }

  async addNote(ref: string, body: string, author: string): Promise<Incident> {
    const rows = await this.db.query<{ id: number }>('SELECT id FROM incidents WHERE ref = $1', [ref.toUpperCase()]);
    if (!rows.length) throw new NotFoundException(`Incident ${ref} not found`);
    await this.db.query('INSERT INTO incident_notes(incident_id, body, author) VALUES ($1,$2,$3)', [rows[0].id, body.slice(0, 2000), author]);
    return this.get(ref);
  }
}

interface Row {
  id: number; ref: string; title: string; service: string; severity: Severity; status: IncidentStatus;
  opened_at: string; resolved_at: string | null; summary: string | null;
}
const map = (r: Row): Incident => ({
  ref: r.ref, title: r.title, service: r.service, severity: r.severity, status: r.status,
  openedAt: new Date(r.opened_at).toISOString(), resolvedAt: r.resolved_at ? new Date(r.resolved_at).toISOString() : null,
  summary: r.summary,
});
