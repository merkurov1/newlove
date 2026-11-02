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

  it('searches for a general-knowledge definition', () => {
    const decision = decideWebSearch({ message: 'What is poststructuralism?' });

    expect(decision.shouldSearch).toBe(true);
    expect(decision.reason).toBe('factual_lookup');
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
});
