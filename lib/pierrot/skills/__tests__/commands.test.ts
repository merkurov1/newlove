import { describe, expect, it } from '@jest/globals';
import { formatSkillAnalysisChatReply, parseSkillAnalysisCommand } from '../analysis/reply';
import type { SkillAnalysisReport } from '../types';

function report(overrides: Partial<SkillAnalysisReport> = {}): SkillAnalysisReport {
  return {
    id: null,
    generatedAt: '2026-11-01T00:00:00.000Z',
    periodDays: 60,
    periodStart: '2026-09-02T00:00:00.000Z',
    periodEnd: '2026-11-01T00:00:00.000Z',
    overview: 'Overview',
    sources: [],
    procedures: [],
    problems: [],
    proposals: [],
    skillReviews: [],
    stats: {
      conversations: 0,
      messages: 0,
      devTasks: 0,
      devRequests: 0,
      memoryRecords: 0,
      toolTraceEvents: 0,
    },
    ...overrides,
  };
}

describe('Skill analysis chat commands', () => {
  it('recognises explicit owner requests in Russian and English', () => {
    expect(parseSkillAnalysisCommand('Проанализируй свою работу')).toBe('analyze');
    expect(parseSkillAnalysisCommand('Чему ты научился за последнее время?')).toBe('learned');
    expect(parseSkillAnalysisCommand('Какие навыки нам стоит создать?')).toBe('skills');
    expect(parseSkillAnalysisCommand('Проверь существующие навыки')).toBe('skills');
    expect(parseSkillAnalysisCommand('Покажи, какие процедуры ты повторяешь')).toBe('procedures');
    expect(parseSkillAnalysisCommand('Analyze my work')).toBe('analyze');
    expect(parseSkillAnalysisCommand('Review existing skills')).toBe('skills');
  });

  it('does not start an analysis for ordinary questions', () => {
    expect(parseSkillAnalysisCommand('Что ты умеешь?')).toBeNull();
    expect(parseSkillAnalysisCommand('Расскажи о своих навыках')).toBeNull();
    expect(parseSkillAnalysisCommand('How do skills work?')).toBeNull();
  });

  it('returns an honest empty report instead of inventing procedures', () => {
    const text = formatSkillAnalysisChatReply(report(), 'analyze', false);

    expect(text).toContain('не нашёл пригодной истории');
    expect(text).toContain('не сохранён');
    expect(text).toContain('не успешный анализ');
  });
});
