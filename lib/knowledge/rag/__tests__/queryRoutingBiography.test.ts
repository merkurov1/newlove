/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';
import {
  buildBrainQueryPlan,
  classifyBrainDocument,
  resolveBrainSourceFilters,
} from '../queryRouting';

describe('Brain biography routing', () => {
  it('classifies owner self-questions as biography in Russian and English', () => {
    for (const query of [
      'Расскажи про меня',
      'Кто такой Антон Меркуров?',
      'Чем я занимаюсь?',
      'Что ты обо мне знаешь?',
      'Who is Anton Merkurov?',
      'What do you know about me?',
    ]) {
      const plan = buildBrainQueryPlan(query);
      expect(plan.intent).toBe('biography');
      expect(plan.requestedSources).toContain('biography');
    }
  });

  it('routes publications and changing views to article and overview retrieval', () => {
    const publications = buildBrainQueryPlan('Что я публиковал в последнее время?');
    expect(publications.requestedSources).toContain('article');
    expect(publications.wantsOverview).toBe(true);
    expect(publications.publishedFrom).toBeTruthy();

    const views = buildBrainQueryPlan('Как менялись мои взгляды?');
    expect(views.wantsOverview).toBe(true);
    expect(views.requestedSources).toContain('biography');
  });

  it('classifies the owner profile text document as biography', () => {
    expect(
      classifyBrainDocument({
        source_type: 'txt',
        title: 'Контекстный профиль Антона Меркюрова',
      })
    ).toBe('biography');

    expect(
      classifyBrainDocument({
        source_type: 'txt',
        title: 'Манифест отторжения и фильтры восприятия',
      })
    ).toBe('other');
  });

  it('lets biography retrieval see the profile text and memoir', () => {
    const plan = buildBrainQueryPlan('Расскажи про меня');
    const filters = resolveBrainSourceFilters(plan);

    expect(filters.sourceClasses).toEqual(expect.arrayContaining(['biography', 'manuscript']));
    expect(filters.sourceTypes).toEqual(expect.arrayContaining(['txt', 'text', 'manuscript']));
  });
});
