/** @jest-environment node */

import { detectContextQuery, parseContextPeriod, resolveContextTimezone } from '../intent';

const now = new Date('2026-11-11T12:00:00.000Z');
const options = { now, timezone: 'Europe/Moscow', timezoneKnown: true };

describe('context intent detection', () => {
  it('recognises daily and historical questions, not just explicit search verbs', () => {
    expect(detectContextQuery('Что мы делали сегодня?', options)).toMatchObject({
      intent: 'DAILY_SUMMARY',
      period: { key: 'today' },
    });
    expect(detectContextQuery('Что мы обсуждали сегодня?', options)).toMatchObject({
      intent: 'PROJECT_HISTORY',
      period: { key: 'today' },
    });
    expect(detectContextQuery('What did we decide yesterday?', options)).toMatchObject({
      intent: 'PROJECT_HISTORY',
      period: { key: 'yesterday' },
    });
    expect(detectContextQuery('Show the history of UNFRAMED', options)).toMatchObject({
      intent: 'PROJECT_HISTORY',
    });
  });

  it('recognises status, achievements, conversation search and document search', () => {
    expect(detectContextQuery('What is the current state of UNFRAMED?', options)).toMatchObject({
      intent: 'PROJECT_STATUS',
    });
    expect(detectContextQuery('What did I complete today?', options)).toMatchObject({
      intent: 'ACHIEVEMENT_LOG',
    });
    expect(
      detectContextQuery('Find the conversation where we discussed Spectral Tiger', options)
    ).toMatchObject({ intent: 'CONVERSATION_SEARCH' });
    expect(
      detectContextQuery('Найди документ UNFRAMED: MASTER PROJECT BLUEPRINT', options)
    ).toMatchObject({ intent: 'DOCUMENT_SEARCH' });
  });

  it('recognises entity confusion and does not pick a type', () => {
    const plan = detectContextQuery('Что такое UNFRAMED — книга или проект?', options);
    expect(plan).toMatchObject({ intent: 'ENTITY_DISTINCTION' });
    expect(plan?.entityTypeHint).toBeNull();

    // The short mandatory regression form also reaches entity resolution.
    expect(detectContextQuery('What is UNFRAMED?', options)).toMatchObject({
      intent: 'ENTITY_DISTINCTION',
    });
    // A sentence-case ordinary question stays in normal chat.
    expect(detectContextQuery('What is Pierrot?', options)).toBeNull();
  });

  it('recognises historical exclusions, continuity and original-source questions', () => {
    expect(
      detectContextQuery('What did I explicitly exclude from the series outline?', options)
    ).toMatchObject({ intent: 'PROJECT_HISTORY' });
    expect(detectContextQuery('Continue from where we stopped.', options)).toMatchObject({
      intent: 'PROJECT_HISTORY',
    });
    expect(detectContextQuery('Show me where we decided on the final structure.', options)).toMatchObject({
      intent: 'CONVERSATION_SEARCH',
    });
  });

  it('leaves analytics, Flow and MSI to their existing tools', () => {
    expect(detectContextQuery('Show Bluesky statistics', options)).toBeNull();
    expect(detectContextQuery('Show website analytics for today', options)).toBeNull();
    expect(detectContextQuery('Calculate my MSI', options)).toBeNull();
    expect(detectContextQuery('Analyze my Flow for the last month', options)).toBeNull();
    expect(detectContextQuery('Как дела с Journal?', options)).toBeNull();
  });
});

describe('context periods and timezone', () => {
  it('uses the configured zone for calendar-day boundaries', () => {
    const period = parseContextPeriod('Что было сегодня?', options);
    expect(period?.from).toBe('2026-11-10T21:00:00.000Z');
    expect(period?.to).toBe('2026-11-11T21:00:00.000Z');
  });

  it('honours an explicit GMT request over the configured zone', () => {
    const timezone = resolveContextTimezone('Сделай отчёт за сегодня в GMT', options);
    expect(timezone).toMatchObject({ timezone: 'UTC', known: true, explicit: true });

    const period = parseContextPeriod('Сделай отчёт за сегодня в GMT', options);
    expect(period?.from).toBe('2026-11-11T00:00:00.000Z');
    expect(period?.to).toBe('2026-11-12T00:00:00.000Z');
  });

  it('parses an explicit calendar date without silently reinterpreting it', () => {
    const period = parseContextPeriod('Что было 2026-11-11?', options);
    expect(period?.from).toBe('2026-11-10T21:00:00.000Z');
    expect(period?.to).toBe('2026-11-11T21:00:00.000Z');
  });
});
