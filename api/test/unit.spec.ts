import { describe, expect, it } from 'vitest';
import { TOOLS, ToolInputError, validateInput } from '../src/agent/tools.js';
import { splitStatements } from '../src/db/db.js';
import { chunkMarkdown } from '../src/rag/chunker.js';
import { HashingEmbedder, tokenize } from '../src/rag/embedder.js';

describe('chunkMarkdown', () => {
  it('keeps each chunk inside one heading section', () => {
    const md = '# A\n\nalpha text here.\n\n## B\n\nbeta text here.\n\nmore beta.';
    const chunks = chunkMarkdown(md);
    expect(chunks.map(c => c.heading)).toEqual(['A', 'B']);
    expect(chunks[1].content).toContain('more beta');
  });

  it('splits long sections with one paragraph of overlap', () => {
    const paras = Array.from({ length: 6 }, (_, i) => `Paragraph ${i} ` + 'x'.repeat(200));
    const chunks = chunkMarkdown('# Long\n\n' + paras.join('\n\n'), 500);
    expect(chunks.length).toBeGreaterThan(2);
    const lastOfFirst = chunks[0].content.split('\n\n').pop()!;
    expect(chunks[1].content.startsWith(lastOfFirst)).toBe(true);
  });

  it('returns nothing for empty input', () => {
    expect(chunkMarkdown('   \n\n')).toEqual([]);
  });
});

describe('HashingEmbedder', () => {
  const e = new HashingEmbedder(256);
  const cos = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0);

  it('produces unit-length vectors of the configured size', async () => {
    const [v] = await e.embed(['restart the application server']);
    expect(v).toHaveLength(256);
    expect(Math.abs(cos(v, v) - 1)).toBeLessThan(1e-6);
  });

  it('scores related text higher than unrelated text', async () => {
    const [q, near, far] = await e.embed(['restart application server', 'restarting the application servers', 'renew tls certificate']);
    expect(cos(q, near)).toBeGreaterThan(cos(q, far));
  });

  it('drops stop words and stems simple suffixes', () => {
    expect(tokenize('The servers were restarted')).toEqual(['server', 'were', 'restart']);
  });
});

describe('validateInput', () => {
  const tool = (n: string) => TOOLS.find(t => t.name === n)!;

  it('accepts valid arguments', () => {
    expect(() => validateInput(tool('get_incident'), { ref: 'INC-1042' })).not.toThrow();
  });
  it.each([
    [{}, 'Missing "ref"'],
    [{ ref: 'DROP TABLE' }, 'invalid format'],
    [{ ref: 'INC-1', extra: 1 }, 'Unknown argument'],
  ])('rejects %j', (input, msg) => {
    expect(() => validateInput(tool('get_incident'), input as Record<string, unknown>)).toThrow(ToolInputError);
    expect(() => validateInput(tool('get_incident'), input as Record<string, unknown>)).toThrow(msg);
  });
  it('enforces enums', () => {
    expect(() => validateInput(tool('list_open_incidents'), { severity: 'P9' })).toThrow('must be one of');
  });
});

describe('splitStatements', () => {
  it('splits on line-ending semicolons and drops comments', () => {
    expect(splitStatements('-- c\nCREATE TABLE a (x int);\nCREATE INDEX i ON a (x);\n')).toEqual([
      'CREATE TABLE a (x int)', 'CREATE INDEX i ON a (x)',
    ]);
  });
});

describe('loadConfig', () => {
  it('treats a missing key or the word "offline" as no key', async () => {
    const { loadConfig } = await import('../src/config.js');
    expect(loadConfig({}).anthropicApiKey).toBeUndefined();
    expect(loadConfig({ ANTHROPIC_API_KEY: 'offline' }).anthropicApiKey).toBeUndefined();
    expect(loadConfig({ ANTHROPIC_API_KEY: 'sk-ant-x' }).anthropicApiKey).toBe('sk-ant-x');
  });
});
