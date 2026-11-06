/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';

import { buildWebSearchQuery, decideWebSearch } from '../searchDecision';

const history = [
  { role: 'user' as const, content: 'We were talking about Mark Rothko.' },
  { role: 'assistant' as const, content: 'He was an abstract expressionist painter.' },
];

describe('autonomous web search decision', () => {
  it('does not search for an ordinary greeting', () => {
    const decision = decideWebSearch({ message: 'Hello, how are you?' });

    expect(decision.shouldSearch).toBe(false);
    expect(decision.reason).toBe('greeting');
    expect(decision.query).toBe('');
  });

  it('does not search for a casual thanks message', () => {
    const decision = decideWebSearch({ message: 'Thanks!' });

    expect(decision.shouldSearch).toBe(false);
    expect(decision.reason).toBe('greeting');
  });

  it('searches for a simple factual question', () => {
    const decision = decideWebSearch({ message: 'Who is Mark Rothko?' });

    expect(decision.shouldSearch).toBe(true);
    expect(decision.reason).toBe('factual_lookup');
    expect(decision.query).toBe('Who is Mark Rothko?');
  });

  it('does not search for a general-knowledge definition', () => {
    const decision = decideWebSearch({ message: 'What is poststructuralism?' });

    expect(decision.shouldSearch).toBe(false);
    expect(decision.reason).toBe('general_knowledge');
  });

  it('does not search for "Что такое Gemini?" just because it is a definition', () => {
    const decision = decideWebSearch({ message: 'Что такое Gemini?' });

    expect(decision.shouldSearch).toBe(false);
    expect(decision.reason).toBe('general_knowledge');
  });

  it('searches for a current-events question', () => {
    const decision = decideWebSearch({
      message: 'What are the latest developments in AI?',
    });

    expect(decision.shouldSearch).toBe(true);
    expect(decision.reason).toBe('current_events');
  });

  it('searches for the contemporary art market', () => {
    const decision = decideWebSearch({
      message: 'What is happening in the contemporary art market?',
    });

    expect(decision.shouldSearch).toBe(true);
    expect(decision.reason).toBe('current_events');
  });

  it('searches for a recent publication question', () => {
    const decision = decideWebSearch({
      message: 'Who recently published something about Rothko?',
    });

    expect(decision.shouldSearch).toBe(true);
    expect(decision.reason).toBe('current_events');
  });

  it('searches when a claim needs verification', () => {
    const decision = decideWebSearch({
      message: 'Is it true that the EU AI Act was delayed?',
    });

    expect(decision.shouldSearch).toBe(true);
    expect(decision.signals).toEqual(expect.arrayContaining(['verification']));
  });

  it('does not search for a personal question about Anton’s earlier position', () => {
    const decision = decideWebSearch({
      message: 'What did you say about UNFRAMED and memory?',
      history,
    });

    expect(decision.shouldSearch).toBe(false);
    expect(decision.reason).toBe('personal_brain');
  });

  it('does not search for a third-person question about Anton’s previous opinion', () => {
    const decision = decideWebSearch({
      message: "What is Anton's opinion on Rothko?",
      history,
    });

    expect(decision.shouldSearch).toBe(false);
    expect(decision.reason).toBe('personal_brain');
  });

  it('does not search for a question about the owner’s own book', () => {
    const decision = decideWebSearch({
      message: 'What did I write about Rothko in my book?',
      history,
    });

    expect(decision.shouldSearch).toBe(false);
    expect(decision.reason).toBe('owner_brain');
  });

  it('does not search for a writing or editing request', () => {
    const decision = decideWebSearch({
      message: 'Write a short caption for this postcard.',
    });

    expect(decision.shouldSearch).toBe(false);
    expect(decision.reason).toBe('writing_request');
  });

  it('does not search for a short follow-up that the history can answer', () => {
    const decision = decideWebSearch({ message: 'Tell me more.', history });

    expect(decision.shouldSearch).toBe(false);
    expect(decision.reason).toBe('follow_up');
  });

  it.each([
    'Итак, посмотри в памяти, что на сегодня?',
    'Посмотри в памяти, что у меня сегодня?',
    'Как у меня дела? Что происходит? Какие планы на день?',
    'Что сейчас происходит с моим проектом?',
    'Что осталось сделать?',
    'Какие у меня планы?',
    'Что изменилось?',
    'Что нового в моем проекте?',
    'Что мы обсуждали вчера?',
    'О чем мы говорили?',
    'What did we discuss yesterday?',
    'What is left to do?',
    'What changed?',
  ])('keeps an internal owner question off the web: %s', (message) => {
    const decision = decideWebSearch({ message, ownerMode: true, history });

    expect(decision.shouldSearch).toBe(false);
    expect(decision.query).toBe('');
  });

  it('keeps the owner public persona off the web for personal state questions', () => {
    const decision = decideWebSearch({
      message: 'Как у меня дела? Что происходит? Какие планы на день?',
      ownerMode: true,
    });

    expect(decision.shouldSearch).toBe(false);
    expect(decision.reason).toBe('owner_brain');
  });

  it('does not search when the user asks what the Sources block is', () => {
    const decision = decideWebSearch({
      message: 'А что за источники в ответе?',
      ownerMode: true,
      history: [
        { role: 'user', content: 'Итак, посмотри в памяти, что на сегодня?' },
        { role: 'assistant', content: 'Ответ.\n\nSources:\n- [Memory](https://example.com)' },
      ],
    });

    expect(decision.shouldSearch).toBe(false);
    expect(decision.reason).toBe('conversation_meta');
  });

  it('still searches when an owner asks for external news about their project', () => {
    const decision = decideWebSearch({
      message: 'Найди последние новости о моем проекте',
      ownerMode: true,
    });

    expect(decision.shouldSearch).toBe(true);
    expect(decision.reason).toBe('current_events');
  });

  it('still searches for an external change even when the wording resembles an internal check', () => {
    const decision = decideWebSearch({
      message: 'Что изменилось в законе об AI?',
      ownerMode: true,
    });

    expect(decision.shouldSearch).toBe(true);
    expect(decision.reason).toBe('current_events');
  });

  it('does not search for a change inside the owner project', () => {
    const decision = decideWebSearch({
      message: 'Что изменилось в моем проекте?',
      ownerMode: true,
    });

    expect(decision.shouldSearch).toBe(false);
  });

  it('allows both Brain and Web when an owner question also needs current evidence', () => {
    const decision = decideWebSearch({
      message: 'What have I written about the current AI art market?',
      history,
    });

    expect(decision.shouldSearch).toBe(true);
    expect(decision.signals).toEqual(expect.arrayContaining(['owner_brain', 'current_events']));
  });

  it('searches for a Russian factual question', () => {
    const decision = decideWebSearch({ message: 'Кто такой Марк Ротко?' });

    expect(decision.shouldSearch).toBe(true);
    expect(decision.reason).toBe('factual_lookup');
  });

  it('does not search for a Russian question about Anton’s earlier statement', () => {
    const decision = decideWebSearch({
      message: 'Что ты говорил о рукописи?',
      history,
    });

    expect(decision.shouldSearch).toBe(false);
    expect(decision.reason).toBe('personal_brain');
  });

  it('keeps the query bounded and strips conversational filler', () => {
    const decision = decideWebSearch({
      message: 'Can you tell me about the latest developments in AI?',
    });

    expect(decision.shouldSearch).toBe(true);
    expect(decision.query).toBe('the latest developments in AI?');
    expect(buildWebSearchQuery('x'.repeat(1_000)).length).toBeLessThanOrEqual(500);
  });

  it.each([
    'Найди в интернете последние новости о Sotheby’s',
    'Поищи в сети информацию о Sotheby’s',
    'Найди в сети информацию о Sotheby’s',
    'Посмотри в сети последние результаты аукционов',
    'Проверь в интернете, что нового у Sotheby’s',
    'Что пишут в интернете о Sotheby’s',
    'Search the web for the latest Sotheby’s results',
    'Find online the latest Sotheby’s results',
    'Look it up: Sotheby’s auction results',
    'Check online for Sotheby’s news',
  ])('forces web search for an explicit command: %s', (message) => {
    const decision = decideWebSearch({ message });

    expect(decision.shouldSearch).toBe(true);
    expect(decision.reason).toBe('explicit_web');
    expect(decision.query.length).toBeGreaterThan(0);
    expect(decision.query.toLowerCase()).not.toContain('найди в интернете');
    expect(decision.query.toLowerCase()).not.toContain('search the web');
  });

  it('keeps explicit Brain and Media Archive requests away from web search', () => {
    expect(decideWebSearch({ message: 'Найди в Brain заметку о Sotheby’s' })).toMatchObject({
      shouldSearch: false,
      reason: 'explicit_brain',
    });
    expect(
      decideWebSearch({ message: 'Найди в Media Archive публикации о Sotheby’s' })
    ).toMatchObject({
      shouldSearch: false,
      reason: 'explicit_media',
    });
  });

  it('routes an explicit comparison to Brain + Web', () => {
    const decision = decideWebSearch({
      message: 'Сравни мои тексты с тем, что пишут в интернете',
    });

    expect(decision.shouldSearch).toBe(true);
    expect(decision.reason).toBe('explicit_brain_web');
    expect(decision.explicitSource).toBe('brain_web');
  });

  it('keeps the previous web topic across a follow-up', () => {
    const decision = decideWebSearch({
      message: 'А теперь подробнее про результаты аукционов',
      history: [
        {
          role: 'user',
          content: 'Найди в интернете последние новости о Sotheby’s',
        },
        { role: 'assistant', content: 'Вот несколько источников.' },
      ],
    });

    expect(decision.shouldSearch).toBe(true);
    expect(decision.reason).toBe('web_follow_up');
    expect(decision.usedContext).toBe(true);
    expect(decision.query).toContain('Sotheby');
    expect(decision.query).toContain('аукцион');
  });

  it('resolves a pronoun from the previous web query', () => {
    const decision = decideWebSearch({
      message: 'А что известно о его финансировании?',
      history: [
        {
          role: 'user',
          content: 'Найди в интернете информацию о новом проекте X',
        },
        { role: 'assistant', content: 'Нашёл несколько публикаций.' },
      ],
    });

    expect(decision.shouldSearch).toBe(true);
    expect(decision.reason).toBe('web_follow_up');
    expect(decision.query).toContain('новом проекте X');
    expect(decision.query).toContain('финансировании');
  });

  it('switches cleanly to a new web topic when asked', () => {
    const decision = decideWebSearch({
      message: 'А теперь про Christie’s',
      history: [
        {
          role: 'user',
          content: 'Найди в интернете последние новости о Sotheby’s',
        },
        { role: 'assistant', content: 'Вот несколько источников.' },
      ],
    });

    expect(decision.shouldSearch).toBe(true);
    expect(decision.topicChanged).toBe(true);
    expect(decision.query).toContain('Christie');
    expect(decision.query).not.toContain('Sotheby');
  });

  it('preserves explicit domains and date constraints in the query', () => {
    const decision = decideWebSearch({
      message: 'Найди в интернете на artnet.com новости о Sotheby’s за последнюю неделю',
    });

    expect(decision.shouldSearch).toBe(true);
    expect(decision.query).toContain('artnet.com');
    expect(decision.query).toContain('последнюю неделю');
  });

  it('does not treat an empty explicit command as a successful search', () => {
    const decision = decideWebSearch({ message: 'Поищи в интернете' });

    expect(decision.shouldSearch).toBe(false);
    expect(decision.reason).toBe('ambiguous');
    expect(decision.signals).toContain('empty_query');
  });
});
