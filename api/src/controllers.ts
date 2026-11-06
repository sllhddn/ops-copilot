import { Body, Controller, Delete, Get, HttpCode, Inject, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { ActionsService, type PendingAction } from './actions/actions.service.js';
import { AgentService } from './agent/agent.service.js';
import { AskService } from './ask/ask.service.js';
import { AgentChatDto, AskDto, CreateDocumentDto, CreateIncidentDto, DecideDto } from './common/dto.js';
import { DB, type Db } from './db/db.js';
import { DocumentsService } from './documents/documents.service.js';
import { IncidentsService, type IncidentStatus, type Severity } from './incidents/incidents.service.js';

@Controller('api/documents')
export class DocumentsController {
  constructor(private readonly docs: DocumentsService) {}
  @Get() list() { return this.docs.list(); }
  @Get(':id') get(@Param('id', ParseIntPipe) id: number) { return this.docs.get(id); }
  @Post() create(@Body() dto: CreateDocumentDto) { return this.docs.ingest(dto.title, dto.content, dto.source); }
  @Delete(':id') @HttpCode(204) remove(@Param('id', ParseIntPipe) id: number) { return this.docs.remove(id); }
}

@Controller('api')
export class AskController {
  constructor(private readonly ask: AskService, private readonly agent: AgentService) {}

  @Post('ask') @HttpCode(200)
  answer(@Body() dto: AskDto) { return this.ask.ask(dto.question, dto.k); }

  @Post('agent/chat') @HttpCode(200)
  async chat(@Body() dto: AgentChatDto) {
    const r = await this.agent.chat(dto.history ?? [], dto.message);
    return { reply: r.reply, steps: r.steps, pendingActions: r.pendingActions };
  }
}

@Controller('api/incidents')
export class IncidentsController {
  constructor(private readonly incidents: IncidentsService) {}
  @Get() list(@Query('status') status?: IncidentStatus, @Query('severity') severity?: Severity) {
    return this.incidents.list({ status, severity });
  }
  @Get(':ref') get(@Param('ref') ref: string) { return this.incidents.get(ref); }
  @Post() create(@Body() dto: CreateIncidentDto) { return this.incidents.create(dto); }
}

@Controller('api/actions')
export class ActionsController {
  constructor(private readonly actions: ActionsService) {}
  @Get() list(@Query('status') status?: PendingAction['status']) { return this.actions.list(status); }
  @Post(':id/approve') @HttpCode(200)
  approve(@Param('id', ParseIntPipe) id: number, @Body() dto: DecideDto) { return this.actions.decide(id, true, dto.reviewer); }
  @Post(':id/reject') @HttpCode(200)
  reject(@Param('id', ParseIntPipe) id: number, @Body() dto: DecideDto) { return this.actions.decide(id, false, dto.reviewer); }
}

@Controller('api')
export class OpsController {
  constructor(@Inject(DB) private readonly db: Db) {}

  @Get('health')
  async health() {
    await this.db.query('SELECT 1');
    return { status: 'UP' };
  }

  /** Model usage per purpose: calls, failures, tokens and latency percentiles. */
  @Get('metrics/llm')
  async llm() {
    const rows = await this.db.query<Record<string, unknown>>(
      `SELECT purpose, model, count(*)::int AS calls, sum(CASE WHEN ok THEN 0 ELSE 1 END)::int AS failures,
              sum(input_tokens)::int AS input_tokens, sum(output_tokens)::int AS output_tokens,
              round(avg(latency_ms))::int AS avg_latency_ms,
              percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms)::int AS p95_latency_ms
         FROM llm_calls GROUP BY purpose, model ORDER BY purpose`);
    return rows;
  }
}
