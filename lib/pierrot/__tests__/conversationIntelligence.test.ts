/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';

import {
  detectExplicitSourceSwitch,
  detectRequestedResultLimit,
  extractRequestedDocumentTitle,
  understandPierrotQuery,
} from '../queryUnderstanding';
import { isCorrectionMessage, isRepeatRequest } from '../correction';
import { buildPierrotExecutionPlan } from '../executionPlan';

const mediaHistory = [
  { role: 'user' as const, content: 'Сделай анализ медиа за 2026 год' },
  { role: 'assistant' as const, content: 'Media report.' },
];

const brainDocumentHistory = [
  { role: 'user' as const, content: 'Найди Weekly Review' },
  { role: 'assistant' as const, content: 'Commercial report.' },
];

describe('conversation intelligence — explicit corrections and follow-ups', () => {
  it('switches back to a named Brain document after a wrong answer', () => {
    const plan = understandPierrotQuery('Не то, я имел в виду документ в Brain', {
      history: brainDocumentHistory,
    });

    expect(plan.correction).toBe(true);
    expect(plan.intent).toBe('document_lookup');
    expect(plan.documentTitle).toMatch(/weekly review/i);
    expect(plan.sources.brain).toBe(true);
    expect(plan.sources.commercial).toBe(false);
  });

  it('recognises a bare “Перечитай” as a repeat request', () => {
    expect(isRepeatRequest('Перечитай')).toBe(true);
    expect(isCorrectionMessage('Перечитай')).toBe(true);

    const plan = understandPierrotQuery('Перечитай', { history: brainDocumentHistory });
    expect(plan.followUp).toBe(true);
    expect(plan.intent).toBe('document_lookup');
    expect(plan.documentTitle).toMatch(/weekly review/i);
  });

  it('recognises “Проверь ещё раз” and recovers the previous source', () => {
    expect(isCorrectionMessage('Проверь ещё раз')).toBe(true);

    const plan = understandPierrotQuery('Проверь ещё раз', { history: mediaHistory });
    expect(plan.correction).toBe(true);
    expect(plan.intent).toBe('media_mentions');
    expect(plan.sources.media).toBe(true);
  });

  it('recognises “Нет, я спрашивал другое” as a correction', () => {
    expect(isCorrectionMessage('Нет, я спрашивал другое')).toBe(true);

    const plan = understandPierrotQuery('Нет, я спрашивал другое', { history: mediaHistory });
    expect(plan.correction).toBe(true);
    expect(plan.intent).toBe('media_mentions');
  });

  it('does not keep the old intent after “Теперь только Media”', () => {
    const plan = understandPierrotQuery('Теперь только Media', {
      history: brainDocumentHistory,
    });

    expect(detectExplicitSourceSwitch('Теперь только Media')).toBe('media');
    expect(plan.topicSwitch).toBe(true);
    expect(plan.intent).toBe('media_mentions');
    expect(plan.sources.media).toBe(true);
    expect(plan.sources.brain).toBe(false);
    expect(plan.sources.web).toBe(false);
  });

  it('continues with “Продолжай” without inventing a new topic', () => {
    const plan = understandPierrotQuery('Продолжай', { history: mediaHistory });
    expect(plan.followUp).toBe(true);
    expect(plan.intent).toBe('media_mentions');
  });

  it('compares against the previous version through history', () => {
    const plan = understandPierrotQuery('Сопоставь это с предыдущей версией', {
      history: brainDocumentHistory,
    });

    expect(plan.followUp).toBe(true);
    expect(plan.intent).toBe('document_lookup');
    expect(plan.documentTitle).toMatch(/weekly review/i);
  });
});

describe('conversation intelligence — source selection', () => {
  it('routes “А последние два выпуска?” to Journal only', () => {
    const plan = understandPierrotQuery('А последние два выпуска?');

    expect(detectRequestedResultLimit('А последние два выпуска?')).toBe(2);
    expect(plan.intent).toBe('journal');
    expect(plan.sources.journal).toBe(true);
    expect(plan.sources.brain).toBe(false);
    expect(plan.sources.media).toBe(false);
    expect(plan.resultLimit).toBe(2);
  });

  it('routes Flow questions to the Flow source', () => {
    const plan = understandPierrotQuery('Покажи последние записи Flow');
    expect(plan.intent).toBe('flow');
    expect(plan.sources.flow).toBe(true);
    expect(plan.sources.brain).toBe(false);
  });

  it('keeps Journal and Flow distinguishable in a combined question', () => {
    const plan = understandPierrotQuery('Сопоставь Journal и Flow за 2025 год');
    expect(plan.intent).toBe('journal_flow');
    expect(plan.sources.journal).toBe(true);
    expect(plan.sources.flow).toBe(true);
  });

  it('does not treat GitHub issues as the editorial Journal', () => {
    const plan = understandPierrotQuery('Найди GitHub issues по Art Engine');
    expect(plan.sources.journal).toBe(false);
  });

  it('keeps Journal out of generic stats shortcuts', () => {
    const plan = buildPierrotExecutionPlan('Статистика Journal', { ownerMode: true });
    expect(plan.operation).toBe('journal.search');
    expect(plan.ownerTool).toBeNull();
  });
});

describe('conversation intelligence — document lookup safety', () => {
  it('never treats a quoted interface label as a document title', () => {
    expect(extractRequestedDocumentTitle('Найди «Media»')).toBeNull();
    expect(extractRequestedDocumentTitle('Открой раздел «Journal»')).toBeNull();

    const plan = understandPierrotQuery('Найди «Media»');
    expect(plan.intent).not.toBe('document_lookup');
  });

  it('still accepts an explicitly named document even if the name is a UI word', () => {
    expect(
      extractRequestedDocumentTitle('Найди документ с названием «Media» в Brain')
    ).toEqual({ title: 'Media', kind: 'exact' });
  });

  it('does not turn “Сколько документов в Brain?” into a title lookup', () => {
    const plan = buildPierrotExecutionPlan('Сколько документов в Brain?', { ownerMode: true });
    expect(plan.operation).toBe('brain.stats');
  });
});
