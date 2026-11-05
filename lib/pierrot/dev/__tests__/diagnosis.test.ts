/** @jest-environment node */

import {
  diagnosisFromEvents,
  diagnosisToTaskInput,
  extractDevDiagnosis,
  sanitizeDevDiagnosis,
} from '../diagnosis';
import type { DevToolTraceEntry } from '../types';

function trace(overrides: Partial<DevToolTraceEntry> = {}): DevToolTraceEntry {
  return {
    name: 'read_file_range',
    repository: 'merkurov1/newlove',
    ok: true,
    durationMs: 4,
    summary: 'components/FlowPreview.tsx:10-40',
    meta: {
      repository: 'merkurov1/newlove',
      branch: 'main',
      commitSha: 'a'.repeat(40),
      complete: true,
      source: 'github',
      paths: ['components/FlowPreview.tsx'],
      ranges: [{ path: 'components/FlowPreview.tsx', startLine: 10, endLine: 40 }],
    },
    ...overrides,
  };
}

function block(value: unknown): string {
  return `<DEV_DIAGNOSIS>\n${JSON.stringify(value)}\n</DEV_DIAGNOSIS>`;
}

describe('Dev structured diagnosis', () => {
  it('strips the machine block and keeps the visible answer', () => {
    const reply = `Причина найдена.\n\n${block({
      taskSummary: 'Preview image is dropped',
      repository: 'newlove',
      ref: 'main',
      commitSha: 'a'.repeat(40),
      inspectedFiles: [{ path: 'components/FlowPreview.tsx', startLine: 10, endLine: 20 }],
      confirmedFindings: [
        {
          statement: 'The preview URL is discarded before rendering.',
          evidence: 'components/FlowPreview.tsx:14',
        },
      ],
      likelyFindings: [],
      hypotheses: [],
      recommendedFix: 'Keep the preview URL in the normalized item.',
      risks: [],
      tests: ['jest FlowPreview'],
      changes: {
        backend: ['Preserve previewUrl in the API payload'],
        frontend: [],
        database: [],
        mobile: [],
      },
      shouldCreateTask: true,
      confidence: 'confirmed',
    })}`;

    const result = extractDevDiagnosis(reply, [trace()]);

    expect(result.reply).toBe('Причина найдена.');
    expect(result.diagnosis).toMatchObject({
      taskSummary: 'Preview image is dropped',
      repository: 'newlove',
      confidence: 'confirmed',
      shouldCreateTask: true,
    });
    expect(result.diagnosis?.inspectedFiles).toEqual([
      { path: 'components/FlowPreview.tsx', startLine: 10, endLine: 20 },
    ]);
  });

  it('drops invented files and line numbers that were never returned', () => {
    const diagnosis = sanitizeDevDiagnosis(
      {
        taskSummary: 'Preview bug',
        repository: 'newlove',
        ref: 'main',
        commitSha: 'b'.repeat(40),
        inspectedFiles: [
          { path: 'components/FlowPreview.tsx', startLine: 10, endLine: 999 },
          { path: 'components/Invented.tsx', startLine: 1, endLine: 5 },
        ],
        confirmedFindings: [
          {
            statement: 'Preview is dropped.',
            evidence: 'components/FlowPreview.tsx:999',
          },
          {
            statement: 'Invented claim.',
            evidence: 'components/Invented.tsx:1',
          },
        ],
        likelyFindings: [],
        hypotheses: [],
        recommendedFix: 'Preserve the preview URL.',
        risks: [],
        tests: [],
        changes: { backend: [], frontend: [], database: [], mobile: [] },
        shouldCreateTask: true,
        confidence: 'likely',
      },
      [trace()]
    );

    expect(diagnosis?.repository).toBe('newlove');
    expect(diagnosis?.commitSha).toBe('a'.repeat(40));
    expect(diagnosis?.inspectedFiles).toEqual([
      { path: 'components/FlowPreview.tsx', startLine: 10, endLine: 40 },
    ]);
    expect(diagnosis?.confirmedFindings[0].evidence).toBe('`components/FlowPreview.tsx`');
    expect(diagnosis?.confirmedFindings[1].evidence).toBe('`components/Invented.tsx`');
  });

  it('builds a Task Studio draft with only verified files and the conversation id', () => {
    const diagnosis = sanitizeDevDiagnosis(
      {
        taskSummary: 'Fix Flow preview rendering',
        repository: 'newlove',
        ref: 'main',
        commitSha: 'a'.repeat(40),
        inspectedFiles: [
          { path: 'components/FlowPreview.tsx', startLine: 10, endLine: 20 },
          { path: 'lib/invented.ts', startLine: 1, endLine: 2 },
        ],
        confirmedFindings: [
          { statement: 'Preview is dropped.', evidence: 'components/FlowPreview.tsx:14' },
        ],
        likelyFindings: [],
        hypotheses: [{ statement: 'Remote host may time out.', evidence: 'not measured' }],
        recommendedFix: 'Preserve previewUrl.',
        risks: ['Remote images may still fail.'],
        tests: ['jest FlowPreview'],
        changes: {
          backend: ['Preserve previewUrl'],
          frontend: ['Render previewUrl'],
          database: [],
          mobile: [],
        },
        shouldCreateTask: true,
        confidence: 'confirmed',
      },
      [trace()]
    );

    const input = diagnosisToTaskInput(diagnosis!, { conversationId: 'conv_12345678' });

    expect(input.conversationId).toBe('conv_12345678');
    expect(input.repository).toBe('newlove');
    expect(input.baseCommit).toBe('a'.repeat(40));
    expect(input.affectedFiles).toEqual(['components/FlowPreview.tsx']);
    expect(input.affectedFiles).not.toContain('lib/invented.ts');
    expect(input.unverified).toContain('Remote host may time out.');
    expect(input.backendChanges).toEqual(['Preserve previewUrl']);
    expect(input.status).toBe('draft');
  });

  it('keeps no file references when there is no tool evidence', () => {
    const diagnosis = sanitizeDevDiagnosis(
      {
        taskSummary: 'Speculative diagnosis',
        repository: 'newlove',
        ref: 'main',
        commitSha: 'b'.repeat(40),
        inspectedFiles: [{ path: 'lib/invented.ts', startLine: 1, endLine: 5 }],
        confirmedFindings: [{ statement: 'Invented claim.', evidence: 'lib/invented.ts:5' }],
        likelyFindings: [],
        hypotheses: [],
        recommendedFix: 'Check the source first.',
        risks: [],
        tests: [],
        changes: {},
        shouldCreateTask: false,
        confidence: 'unverified',
      },
      []
    );

    expect(diagnosis?.inspectedFiles).toEqual([]);
    expect(diagnosis?.commitSha).toBeNull();
    expect(diagnosis?.confirmedFindings[0].evidence).toBe('`lib/invented.ts`');
  });

  it('reads the diagnosis back from persisted request events', () => {
    const diagnosis = sanitizeDevDiagnosis(
      {
        taskSummary: 'Persisted diagnosis',
        repository: 'pierrot',
        ref: 'main',
        commitSha: null,
        inspectedFiles: [],
        confirmedFindings: [],
        likelyFindings: [],
        hypotheses: [],
        recommendedFix: '',
        risks: [],
        tests: [],
        changes: {},
        shouldCreateTask: false,
        confidence: 'unverified',
      },
      []
    );

    expect(
      diagnosisFromEvents([
        { type: 'status', label: 'ok' },
        { type: 'diagnosis', diagnosis: diagnosis! },
      ])
    ).toMatchObject({ taskSummary: 'Persisted diagnosis' });
  });

  it('does not treat an invalid block as a diagnosis and never shows raw JSON', () => {
    const raw = 'Ответ.\n<DEV_DIAGNOSIS>{not json}</DEV_DIAGNOSIS>';
    const result = extractDevDiagnosis(raw, [trace()]);

    expect(result.reply).toBe('Ответ.');
    expect(result.diagnosis).toBeNull();
  });
});
