import { Module, type DynamicModule } from '@nestjs/common';
import { ActionsService } from './actions/actions.service.js';
import { AgentService } from './agent/agent.service.js';
import { ToolRunner } from './agent/tools.js';
import { AskService } from './ask/ask.service.js';
import { CONFIG, type AppConfig } from './config.js';
import { ActionsController, AskController, DocumentsController, IncidentsController, OpsController } from './controllers.js';
import { DB, type Db } from './db/db.js';
import { DocumentsService } from './documents/documents.service.js';
import { IncidentsService } from './incidents/incidents.service.js';
import { AnthropicLlm } from './llm/anthropic.llm.js';
import { AuditedLlm } from './llm/audited.llm.js';
import { OfflineLlm } from './llm/offline.llm.js';
import { LLM, type LlmClient } from './llm/types.js';
import { EMBEDDER, HashingEmbedder, type Embedder } from './rag/embedder.js';
import { Retriever } from './rag/retriever.js';

export interface AppDeps { config: AppConfig; db: Db; llm?: LlmClient; embedder?: Embedder }

/** Everything external (database, model, embedder) is injected, so tests swap them freely. */
@Module({})
export class AppModule {
  static register(deps: AppDeps): DynamicModule {
    const { config, db } = deps;
    const raw = deps.llm ?? (config.anthropicApiKey ? new AnthropicLlm(config.anthropicApiKey, config.anthropicModel) : new OfflineLlm());
    return {
      module: AppModule,
      controllers: [DocumentsController, AskController, IncidentsController, ActionsController, OpsController],
      providers: [
        { provide: CONFIG, useValue: config },
        { provide: DB, useValue: db },
        { provide: EMBEDDER, useValue: deps.embedder ?? new HashingEmbedder(256) },
        { provide: LLM, useValue: new AuditedLlm(raw, db, config.anthropicApiKey ? config.anthropicModel : 'offline-extractive') },
        Retriever, DocumentsService, AskService, IncidentsService, ToolRunner, ActionsService, AgentService,
      ],
    };
  }
}
