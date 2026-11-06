import { analyzeProjectReview } from '../review/analyze';
import type { ProjectHistoryMessage } from '../history';

function msg(
  id: string,
  role: 'user' | 'assistant',
  content: string,
  createdAt = '2026-01-01T10:00:00Z'
): ProjectHistoryMessage {
  return {
    id,
    conversationId: 'conv-1',
    role,
    content,
    messageIndex: 1,
    createdAt,
  };
}

const empty = {
  existingTasks: [],
  existingDecisions: [],
  existingMaterials: [],
};

describe('project review analysis', () => {
  it('keeps a prospective idea separate from actionable tasks', () => {
    const result = analyzeProjectReview({
      ...empty,
      messages: [msg('m1', 'user', 'Идея: можно было бы сделать серию открыток с архивными письмами.')],
    });

    expect(result.ideas).toHaveLength(1);
    expect(result.tasks).toHaveLength(0);
    expect(result.ideas[0].tags).toContain('idea');
  });

  it('does not turn Pierrot proposals into owner decisions', () => {
    const result = analyzeProjectReview({
      ...empty,
      messages: [
        msg('m1', 'assistant', 'Предлагаю решение: использовать Art Engine для лотов.'),
        msg('m2', 'assistant', 'Решили выпускать журнал раз в неделю.'),
      ],
    });

    expect(result.decisions).toHaveLength(0);
  });

  it('records an explicit owner decision and not a hypothesis', () => {
    const result = analyzeProjectReview({
      ...empty,
      messages: [
        msg('m1', 'user', 'Решили: Journal выходит по средам.'),
        msg('m2', 'user', 'Может быть, стоит перенести выпуск на пятницу.'),
      ],
    });

    expect(result.decisions).toHaveLength(1);
    expect(result.decisions[0].content).toContain('средам');
  });

  it('does not auto-close a task when a completion word is ambiguous', () => {
    const result = analyzeProjectReview({
      ...empty,
      existingTasks: [
        { id: 't1', title: 'Проверить макет', content: 'Проверить макет', status: 'current' },
        { id: 't2', title: 'Согласовать текст', content: 'Согласовать текст', status: 'current' },
      ],
      messages: [msg('m1', 'user', 'Готово.')],
    });

    expect(result.completions).toHaveLength(0);
  });

  it('closes a task only when the completion names it unambiguously', () => {
    const result = analyzeProjectReview({
      ...empty,
      existingTasks: [
        { id: 't1', title: 'Проверить макет', content: 'Проверить макет', status: 'current' },
        { id: 't2', title: 'Согласовать текст', content: 'Согласовать текст', status: 'current' },
      ],
      messages: [msg('m1', 'user', 'Проверить макет готово.')],
    });

    expect(result.completions).toHaveLength(1);
    expect(result.completions[0].taskId).toBe('t1');
  });

  it('turns “надо обсудить” into an open question, not a task', () => {
    const result = analyzeProjectReview({
      ...empty,
      messages: [msg('m1', 'user', 'Надо обсудить, как публиковать архивные письма.')],
    });

    expect(result.tasks).toHaveLength(0);
    expect(result.ambiguousTaskCandidates).toHaveLength(1);
    expect(result.openQuestions).toHaveLength(1);
  });

  it('creates a task for a concrete next action', () => {
    const result = analyzeProjectReview({
      ...empty,
      messages: [msg('m1', 'user', 'Проверь публичную страницу лота до пятницы.')],
    });

    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0].content).toContain('страницу лота');
  });
});
