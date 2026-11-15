/** @jest-environment node */

import {
  buildExecutionPrompt,
  parseExecutorReport,
} from '../prompt';

const material = {
  id: '11111111-1111-4111-8111-111111111111',
  userId: null,
  title: 'Queue test',
  promptText: '# Task\n\nDo the thing.',
  repository: 'merkurov1/newlove',
  baseRef: 'main',
  baseCommit: null,
  tests: ['pnpm typecheck'],
  acceptanceCriteria: ['The queue persists in Supabase'],
  securityConstraints: ['Never read .env files'],
  affectedFiles: ['lib/example.ts'],
};

describe('execution prompt', () => {
  it('contains the task, attempt identity and the no-secrets contract', () => {
    const prompt = buildExecutionPrompt({
      task: material,
      attemptId: '22222222-2222-4222-8222-222222222222',
      attemptNumber: 2,
      branch: 'pierrot/dev/11111111-1111-4111-8111-111111111111/2',
      repositoryFullName: 'merkurov1/newlove',
      baseRef: 'main',
      baseCommit: null,
    });

    expect(prompt).toContain('PIERROT EXECUTION CONTRACT');
    expect(prompt).toContain('22222222-2222-4222-8222-222222222222');
    expect(prompt).toContain('pierrot/dev/11111111-1111-4111-8111-111111111111/2');
    expect(prompt).toContain('Never read, print, copy or modify secrets');
    expect(prompt).toContain('Never read .env files');
    expect(prompt).toContain('The queue persists in Supabase');
    expect(prompt).not.toMatch(/PIERROT_DEV_WORKER_TOKEN=|SUPABASE_SERVICE_ROLE_KEY=/);
  });
});

describe('executor report parsing', () => {
  it('parses the last fenced JSON block and bounds values', () => {
    const raw = [
      'Some narrative',
      '```json',
      JSON.stringify({
        summary: 'Changed the queue',
        changedFiles: ['lib/a.ts', 42],
        commands: [{ name: 'pnpm typecheck', status: 'passed' }],
        acceptanceCriteria: [
          { criterion: 'Queue persists', status: 'satisfied', evidence: 'schema' },
        ],
        warnings: ['manual merge required'],
        unverified: [],
      }),
      '```',
      '```json',
      '{not valid json',
      '```',
    ].join('\n');

    // The last block is malformed, so nothing is trusted.
    const malformed = parseExecutorReport(raw);
    expect(malformed.summary).toBe('');

    const validRaw = [
      'Some narrative',
      '```json',
      JSON.stringify({
        summary: 'Changed the queue',
        changedFiles: ['lib/a.ts'],
        commands: [{ name: 'pnpm typecheck', status: 'passed' }],
        acceptanceCriteria: [
          { criterion: 'Queue persists', status: 'satisfied', evidence: 'schema' },
        ],
        warnings: ['manual merge required'],
        unverified: [],
      }),
      '```',
    ].join('\n');

    const parsed = parseExecutorReport(validRaw);
    expect(parsed.summary).toBe('Changed the queue');
    expect(parsed.criteria[0].criterion).toBe('Queue persists');
    expect(parsed.commands[0].status).toBe('passed');
  });

  it('returns empty defaults for non-JSON output', () => {
    const result = parseExecutorReport('just text');
    expect(result).toEqual({
      summary: '',
      changedFiles: [],
      commands: [],
      criteria: [],
      warnings: [],
      unverified: [],
    });
  });

  it('accepts escaped newlines from JSON-formatted CLI output', () => {
    const payload = JSON.stringify({
      summary: 'ok',
      changedFiles: ['app/page.tsx'],
      commands: [],
      acceptanceCriteria: [],
      warnings: [],
      unverified: [],
    });
    const inner = '```json\n' + payload + '\n```';
    const raw = JSON.stringify({ text: inner });
    const parsed = parseExecutorReport(raw);
    expect(parsed?.summary).toBe('ok');
  });
});
