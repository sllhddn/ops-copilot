import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DB, type Db } from '../db/db.js';
import { ToolRunner } from '../agent/tools.js';

export interface PendingAction {
  id: number; tool: string; args: Record<string, unknown>; reason: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED'; createdAt: string; decidedAt: string | null; decidedBy: string | null; result: string | null;
}

/** Human-in-the-loop queue for agent writes. */
@Injectable()
export class ActionsService {
  constructor(@Inject(DB) private readonly db: Db, private readonly tools: ToolRunner) {}

  async propose(tool: string, args: Record<string, unknown>, reason: string): Promise<PendingAction> {
    const [r] = await this.db.query<Row>(
      'INSERT INTO pending_actions(tool, args, reason) VALUES ($1, $2::jsonb, $3) RETURNING *',
      [tool, JSON.stringify(args), reason.slice(0, 500)]);
    return map(r);
  }

  async list(status?: PendingAction['status']): Promise<PendingAction[]> {
    const rows = status
      ? await this.db.query<Row>('SELECT * FROM pending_actions WHERE status = $1 ORDER BY id DESC', [status])
      : await this.db.query<Row>('SELECT * FROM pending_actions ORDER BY id DESC LIMIT 100');
    return rows.map(map);
  }

  async decide(id: number, approve: boolean, by: string): Promise<PendingAction> {
    // Conditional update: only one reviewer can move an action out of PENDING.
    const rows = await this.db.query<Row>(
      `UPDATE pending_actions SET status = $2, decided_at = now(), decided_by = $3
        WHERE id = $1 AND status = 'PENDING' RETURNING *`, [id, approve ? 'APPROVED' : 'REJECTED', by]);
    if (!rows.length) {
      const exists = await this.db.query('SELECT 1 FROM pending_actions WHERE id = $1', [id]);
      if (!exists.length) throw new NotFoundException(`Action ${id} not found`);
      throw new ConflictException(`Action ${id} was already decided`);
    }
    const action = map(rows[0]);
    if (!approve) return action;
    let result: string;
    try {
      result = await this.tools.run(action.tool, action.args, by);
    } catch (e) {
      result = `FAILED: ${(e as Error).message}`;
    }
    const [done] = await this.db.query<Row>('UPDATE pending_actions SET result = $2 WHERE id = $1 RETURNING *', [id, result]);
    return map(done);
  }
}

interface Row {
  id: number; tool: string; args: Record<string, unknown> | string; reason: string | null; status: PendingAction['status'];
  created_at: string; decided_at: string | null; decided_by: string | null; result: string | null;
}
const map = (r: Row): PendingAction => ({
  id: Number(r.id), tool: r.tool, args: typeof r.args === 'string' ? JSON.parse(r.args) : r.args, reason: r.reason,
  status: r.status, createdAt: new Date(r.created_at).toISOString(),
  decidedAt: r.decided_at ? new Date(r.decided_at).toISOString() : null, decidedBy: r.decided_by, result: r.result,
});
