/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';
import { buildPierrotExecutionPlan } from '../executionPlan';

const history = (content: string) => [{ role: 'user' as const, content }];

describe('Pierrot execution plan routing', () => {
  it('routes “Найди в RAG рецепты еды” to brain.search, not RAG stats', () => {
    const plan = buildPierrotExecutionPlan('Найди в RAG рецепты еды', { ownerMode: true });

    expect(plan.operation).toBe('brain.search');
    expect(plan.ownerTool).toBeNull();
    expect(plan.tool).toBe('brain');
  });

  it('routes “Поищи в Brain рецепты еды” to brain.search', () => {
    const plan = buildPierrotExecutionPlan('Поищи в Brain рецепты еды', { ownerMode: true });
    expect(plan.operation).toBe('brain.search');
  });

  it('keeps explicit RAG statistics as stats', () => {
    const plan = buildPierrotExecutionPlan('Статистика RAG', { ownerMode: true });
    expect(plan.operation).toBe('brain.stats');
    expect(plan.ownerTool?.kind).toBe('rag');
  });

  it('treats “Сколько документов в Brain?” as stats', () => {
    const plan = buildPierrotExecutionPlan('Сколько документов в Brain?', { ownerMode: true });
    expect(plan.operation).toBe('brain.stats');
  });

  it('routes “Много продал?” to Commercial', () => {
    const plan = buildPierrotExecutionPlan('Много продал?', { ownerMode: true });
    expect(plan.operation).toBe('commercial.report');
    expect(plan.tool).toBe('commercial');
  });

  it('routes media mention requests to media.search', () => {
    const plan = buildPierrotExecutionPlan('Покажи публикации обо мне', { ownerMode: true });
    expect(plan.operation).toBe('media.search');
  });

  it('routes system health explicitly', () => {
    const plan = buildPierrotExecutionPlan('Покажи состояние системы', { ownerMode: true });
    expect(plan.operation).toBe('system.health');
  });

  it('continues a Brain search across a follow-up', () => {
    const plan = buildPierrotExecutionPlan('А теперь все рецепты недели', {
      ownerMode: true,
      history: history('Найди рецепты в Brain'),
    });

    expect(plan.operation).toBe('brain.search');
    expect(plan.requiresConversationContext).toBe(true);
    expect(plan.searchQuery).toContain('рецепты');
  });

  it('continues a source search with a date filter request', () => {
    const plan = buildPierrotExecutionPlan('А за 2025 год?', {
      ownerMode: true,
      history: history('Найди статьи о Sotheby’s'),
    });

    expect(plan.operation).toBe('brain.search');
    expect(plan.queryPlan.sources.brain).toBe(true);
  });
});
