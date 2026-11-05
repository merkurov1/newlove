/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';
import { analyzeEvidence, ANALYSIS_LIMITS } from '../analyze';
import type { AnalysisEvidenceBundle, AnalysisWorkItem } from '../evidence';
import { evaluateHistoricalApplicability } from '../../historical';
import type { SkillDefinition } from '../../types';

function workItem(overrides: Partial<AnalysisWorkItem> & { id: string }): AnalysisWorkItem {
  return {
    source: 'owner_chat',
    date: '2026-11-01T10:00:00.000Z',
    text: 'Проверить брендинг проекта Heart & Angel и обновить карточки перед публикацией',
    assistantText: 'Карточки обновлены, проверка завершена.',
    conversationId: `conversation-${overrides.id}`,
    href: '/admin/pierrot',
    tools: [],
    labels: ['Owner chat'],
    ...overrides,
  };
}

function bundle(items: AnalysisWorkItem[]): AnalysisEvidenceBundle {
  return {
    periodDays: 30,
    periodStart: '2026-10-01T00:00:00.000Z',
    periodEnd: '2026-11-01T00:00:00.000Z',
    generatedAt: '2026-11-01T00:00:00.000Z',
    workItems: items,
    toolEvents: [],
    memories: [],
    devTasks: [],
    devRequests: [],
    skills: [],
    sources: [
      {
        key: 'owner_chat',
        label: 'История диалогов владельца',
        status: 'available',
        count: 3,
        note: '',
      },
    ],
    counts: {
      conversations: 3,
      messages: 3,
      devTasks: 0,
      devRequests: 0,
      memoryRecords: 0,
      toolTraceEvents: 0,
    },
  };
}

describe('Skill work analysis', () => {
  it('finds a repeated procedure with evidence and prepares a bounded draft', () => {
    const report = analyzeEvidence(
      bundle([
        workItem({ id: 'a', date: '2026-10-02T10:00:00.000Z' }),
        workItem({ id: 'b', date: '2026-10-09T10:00:00.000Z' }),
        workItem({ id: 'c', date: '2026-10-16T10:00:00.000Z' }),
      ])
    );

    expect(report.procedures).toHaveLength(1);
    expect(report.procedures[0].exampleCount).toBe(3);
    expect(report.procedures[0].evidence.length).toBeGreaterThanOrEqual(3);
    expect(report.proposals).toHaveLength(1);
    expect(report.proposals[0].kind).toBe('new');
    expect(report.proposals[0].definition.examples.length).toBeGreaterThanOrEqual(3);
    expect(report.proposals[0].gaps.length).toBeGreaterThan(0);
    expect(report.proposals.length).toBeLessThanOrEqual(ANALYSIS_LIMITS.maxProposals);
  });

  it('does not turn unrelated themes into a skill', () => {
    const report = analyzeEvidence(
      bundle([
        workItem({ id: 'a', text: 'Проверить погоду в Лиссабоне перед поездкой' }),
        workItem({ id: 'b', text: 'Создать список покупок для ужина' }),
        workItem({ id: 'c', text: 'Обновить пароль от почты' }),
      ])
    );

    expect(report.procedures).toHaveLength(0);
    expect(report.proposals).toHaveLength(0);
    expect(report.overview).toContain('Подтверждённых процедур нет');
  });

  it('keeps evidence links tied to the source conversations', () => {
    const report = analyzeEvidence(
      bundle([
        workItem({ id: 'a' }),
        workItem({ id: 'b', date: '2026-10-10T10:00:00.000Z' }),
        workItem({ id: 'c', date: '2026-10-20T10:00:00.000Z' }),
      ])
    );

    expect(report.procedures[0].evidence[0]).toMatchObject({
      source: 'owner_chat',
      href: '/admin/pierrot',
    });
    expect(report.procedures[0].evidence[0].conversationId).toContain('conversation-');
  });
});

describe('Historical applicability checks', () => {
  const definition: SkillDefinition = {
    name: 'Обновление карточек Heart & Angel',
    description: 'Проверить брендинг и обновить карточки перед публикацией.',
    purpose: 'Держать карточки Heart & Angel актуальными перед публикацией.',
    conditions: ['Когда владелец просит проверить брендинг Heart & Angel и обновить карточки.'],
    inputs: ['Текущие карточки проекта'],
    steps: ['Проверить брендинг проекта Heart & Angel', 'Обновить карточки перед публикацией'],
    tools: [],
    constraints: ['Только чтение до подтверждения владельцем.'],
    expectedResult: 'Обновлённые карточки после проверки брендинга.',
    tests: [],
    examples: [],
  };

  it('separates structural, historical and execution evidence', () => {
    const checks = evaluateHistoricalApplicability({
      definition,
      examples: [
        workItem({ id: 'a' }),
        workItem({ id: 'b', date: '2026-10-09T10:00:00.000Z' }),
        workItem({ id: 'c', date: '2026-10-16T10:00:00.000Z' }),
      ],
      toolEvents: [],
    });

    const historical = checks.filter((check) => check.phase === 'historical');
    const execution = checks.find((check) => check.phase === 'execution');

    expect(historical.length).toBeGreaterThan(0);
    expect(historical.every((check) => check.blocking === false)).toBe(true);
    expect(execution).toMatchObject({
      name: 'actual_execution',
      passed: false,
      blocking: false,
    });
    expect(
      checks.find((check) => check.name === 'conditions_match_history')?.evidence?.length
    ).toBeGreaterThan(0);
  });

  it('reports when history is too small instead of claiming applicability', () => {
    const checks = evaluateHistoricalApplicability({
      definition,
      examples: [workItem({ id: 'a' })],
      toolEvents: [],
    });

    expect(checks.find((check) => check.name === 'historical_examples_available')).toMatchObject({
      passed: false,
      blocking: false,
    });
  });
});
