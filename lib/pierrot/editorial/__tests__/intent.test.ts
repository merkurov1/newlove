import { detectEditorialIntent, parseEditorialConstraints } from '../intent';
import { emptyEditorialContext, type EditorialContext } from '../types';

function context(patch: Partial<EditorialContext> = {}): EditorialContext {
  return {
    ...emptyEditorialContext(),
    projectId: 'project-1',
    projectSlug: 'unframed',
    projectName: 'Unframed',
    documentId: 'doc_unframed_manuscript',
    documentTitle: 'UNFRAMED',
    ...patch,
  };
}

describe('editorial intent detection', () => {
  it('A. resolves a request for the book as an exact manuscript operation', () => {
    const intent = detectEditorialIntent({ message: 'Найди мою книгу UNFRAMED.' });
    expect(intent).not.toBeNull();
    expect(intent?.operation).toBe('manuscript.inspect');
    expect(intent?.explicitDocument).toBe(true);
  });

  it('B. resolves a whole-book map request without claiming a model read', () => {
    const intent = detectEditorialIntent({
      message: 'Прочитай всю книгу и составь карту её структуры.',
    });
    expect(intent?.operation).toBe('manuscript.outline');
    expect(intent?.wantsFullRead).toBe(true);
  });

  it('C. resolves an episode/theme search through the manuscript', () => {
    const intent = detectEditorialIntent({
      message: 'Найди все эпизоды, связанные с Лондоном.',
    });
    expect(intent?.operation).toBe('manuscript.search');
    expect(intent?.wantsBroadCoverage).toBe(true);
  });

  it('D. resolves a full chapter read', () => {
    const intent = detectEditorialIntent({ message: 'Прочитай главу 14 полностью.' });
    expect(intent?.operation).toBe('manuscript.chapter');
    expect(intent?.chapterNumber).toBe(14);
  });

  it('E. resolves an independent two-chapter comparison', () => {
    const intent = detectEditorialIntent({ message: 'Сравни главы 14 и 36.' });
    expect(intent?.operation).toBe('manuscript.compare');
    expect(intent?.compareChapters).toEqual([14, 36]);
  });

  it('F. inherits the manuscript and applies new constraints on a follow-up', () => {
    const intent = detectEditorialIntent({
      message: 'Не рассматривай уголовные дела. Ищи период 2010–2015.',
      activeContext: context({
        activeTask: 'manuscript.search',
        currentEditorialObjective:
          'Перечитай книгу Unframed и выбери главу и сюжет для следующего ролика',
      }),
    });
    expect(intent?.operation).toBe('manuscript.search');
    expect(intent?.followUp).toBe(true);
    expect(intent?.constraints.excludedTopics).toEqual(['уголовные дела']);
    expect(intent?.constraints.fromYear).toBe(2010);
    expect(intent?.constraints.toYear).toBe(2015);
  });

  it('G. "Найди ещё" continues the previous search and asks for broader coverage', () => {
    const intent = detectEditorialIntent({
      message: 'Найди ещё.',
      activeContext: context({
        activeTask: 'manuscript.search',
        currentEditorialObjective: 'Лондон',
        lastEvidenceChunkIds: ['chk_1', 'chk_2'],
      }),
    });
    expect(intent?.operation).toBe('manuscript.search');
    expect(intent?.followUp).toBe(true);
    expect(intent?.wantsBroadCoverage).toBe(true);
  });

  it('H. "Вернёмся к UNFRAMED" restores project context', () => {
    const intent = detectEditorialIntent({
      message: 'Вернёмся к UNFRAMED.',
      activeContext: context({ activeTask: 'manuscript.search' }),
    });
    expect(intent?.operation).toBe('project.overview');
  });

  it('I/J. resolves project status and project history questions', () => {
    const status = detectEditorialIntent({
      message: 'Что сейчас происходит с проектом UNFRAMED?',
    });
    expect(status?.operation).toBe('project.overview');

    const history = detectEditorialIntent({
      message: 'Какие идеи для следующих выпусков мы уже обсуждали?',
      activeContext: context({ activeTask: 'project.episodes' }),
    });
    expect(history?.operation).toBe('project.history');
  });

  it('K. resolves an episode-to-book connection as a proposal, not a saved relation', () => {
    const intent = detectEditorialIntent({
      message: 'Свяжи этот выпуск с книгой.',
      activeContext: context({ activeTask: 'project.episodes' }),
    });
    expect(intent?.operation).toBe('project.link_episode');
  });

  it('does not hijack an unrelated book question', () => {
    expect(detectEditorialIntent({ message: 'Посоветуй книгу о дизайне.' })).toBeNull();
    expect(detectEditorialIntent({ message: 'Найди кулинарную книгу.' })).toBeNull();
  });

  it('does not inherit UNFRAMED for an unrelated new topic', () => {
    const intent = detectEditorialIntent({
      message: 'Покажи статистику сайта за неделю.',
      activeContext: context({
        activeTask: 'manuscript.search',
        currentEditorialObjective: 'Лондон',
      }),
    });
    expect(intent).toBeNull();
  });

  it('switches to another project explicitly instead of inheriting UNFRAMED', () => {
    const intent = detectEditorialIntent({
      message: 'Теперь переключись на Heart & Angel.',
      activeContext: context({ activeTask: 'manuscript.search' }),
    });
    expect(intent).toBeNull();
  });

  it('restores the previous task for a short continuation in English', () => {
    const intent = detectEditorialIntent({
      message: 'Find more.',
      activeContext: context({
        activeTask: 'manuscript.search',
        currentEditorialObjective: 'London',
      }),
    });
    expect(intent?.operation).toBe('manuscript.search');
    expect(intent?.followUp).toBe(true);
  });

  it('does not turn a bare book mention into a chapter request', () => {
    const intent = detectEditorialIntent({ message: 'Давай поработаем над UNFRAMED.' });
    expect(intent?.operation).toBe('project.overview');
  });

  it('extracts excluded topics and a date range without treating the range as exclusion', () => {
    const constraints = parseEditorialConstraints(
      'Не рассматривай уголовные дела и арест. Ищи период 2010–2015.'
    );
    expect(constraints.excludedTopics).toEqual(['уголовные дела']);
    expect(constraints.fromYear).toBe(2010);
    expect(constraints.toYear).toBe(2015);
  });
});
