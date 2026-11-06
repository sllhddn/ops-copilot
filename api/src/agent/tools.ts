import { Injectable } from '@nestjs/common';
import type { ToolDef } from '../llm/types.js';
import { IncidentsService, type Severity } from '../incidents/incidents.service.js';
import { Retriever } from '../rag/retriever.js';

export interface ToolSpec extends ToolDef {
  /** Write tools never run directly: they become a pending action a person must approve. */
  write: boolean;
}

export const TOOLS: ToolSpec[] = [
  {
    name: 'search_runbooks', write: false,
    description: 'Search the team runbooks and SOPs. Returns the most relevant passages with their titles.',
    input_schema: { type: 'object', properties: { query: { type: 'string', description: 'What to look for' } }, required: ['query'] },
  },
  {
    name: 'get_incident', write: false,
    description: 'Get one incident by its reference (e.g. INC-1042), including notes.',
    input_schema: { type: 'object', properties: { ref: { type: 'string', pattern: '^INC-\\d+$' } }, required: ['ref'] },
  },
  {
    name: 'list_open_incidents', write: false,
    description: 'List incidents that are not resolved, optionally filtered by severity P1-P4.',
    input_schema: { type: 'object', properties: { severity: { type: 'string', enum: ['P1', 'P2', 'P3', 'P4'] } } },
  },
  {
    name: 'add_incident_note', write: true,
    description: 'Add a note to an incident timeline. Requires human approval before it is saved.',
    input_schema: {
      type: 'object',
      properties: { ref: { type: 'string', pattern: '^INC-\\d+$' }, note: { type: 'string', maxLength: 2000 } },
      required: ['ref', 'note'],
    },
  },
];

export class ToolInputError extends Error {}

/** Validates model-supplied arguments against the tool schema before anything runs. */
export function validateInput(tool: ToolSpec, input: Record<string, unknown>): void {
  const { properties, required = [] } = tool.input_schema;
  for (const r of required) if (input[r] === undefined || input[r] === '') throw new ToolInputError(`Missing "${r}"`);
  for (const [k, v] of Object.entries(input)) {
    const p = properties[k] as { type?: string; enum?: string[]; pattern?: string; maxLength?: number } | undefined;
    if (!p) throw new ToolInputError(`Unknown argument "${k}"`);
    if (p.type === 'string' && typeof v !== 'string') throw new ToolInputError(`"${k}" must be a string`);
    if (p.enum && !p.enum.includes(v as string)) throw new ToolInputError(`"${k}" must be one of ${p.enum.join(', ')}`);
    if (p.pattern && !new RegExp(p.pattern, 'i').test(v as string)) throw new ToolInputError(`"${k}" has an invalid format`);
    if (p.maxLength && (v as string).length > p.maxLength) throw new ToolInputError(`"${k}" is too long`);
  }
}

@Injectable()
export class ToolRunner {
  constructor(private readonly retriever: Retriever, private readonly incidents: IncidentsService) {}

  /** Runs a read tool, or performs an approved write. Returns compact JSON for the model. */
  async run(name: string, input: Record<string, unknown>, actor = 'agent'): Promise<string> {
    switch (name) {
      case 'search_runbooks': {
        const hits = await this.retriever.search(String(input.query), 3);
        return JSON.stringify(hits.map(h => ({ title: h.title, section: h.heading, text: h.content.slice(0, 600) })));
      }
      case 'get_incident':
        return JSON.stringify(await this.incidents.get(String(input.ref)));
      case 'list_open_incidents': {
        const list = await this.incidents.list({ openOnly: true, severity: input.severity as Severity | undefined });
        return JSON.stringify(list.map(i => ({ ref: i.ref, severity: i.severity, status: i.status, title: i.title, service: i.service })));
      }
      case 'add_incident_note': {
        const inc = await this.incidents.addNote(String(input.ref), String(input.note), actor);
        return JSON.stringify({ saved: true, ref: inc.ref, notes: inc.notes?.length });
      }
      default:
        throw new ToolInputError(`Unknown tool "${name}"`);
    }
  }
}
