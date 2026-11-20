/** @jest-environment node */

import { classifyRetrievalFailure } from '../failureClassification';
import { buildPierrotRetrievalPayload } from '@/lib/pierrot/brainAnalytics';

describe('retrieval failure classification', () => {
  it('does not treat a successful retrieval as a failure', () => {
    expect(classifyRetrievalFailure('relevant_results', null)).toBe('not_a_failure');
  });

  it('separates timeout, empty corpus, weak match and index faults', () => {
    expect(classifyRetrievalFailure('unavailable', 'timeout')).toBe('timeout');
    expect(classifyRetrievalFailure('unavailable', 'embedding_timeout')).toBe('timeout');
    expect(classifyRetrievalFailure('no_match', 'no_published_records')).toBe('empty_corpus');
    expect(classifyRetrievalFailure('no_match', null)).toBe('no_relevant_match');
    expect(classifyRetrievalFailure('weak_match', null)).toBe('weak_match');
    expect(classifyRetrievalFailure('unavailable', 'embedding_dimension_mismatch')).toBe(
      'index_mismatch'
    );
    expect(classifyRetrievalFailure('unavailable', 'database_unavailable')).toBe(
      'database_unavailable'
    );
    expect(classifyRetrievalFailure('unavailable', 'embedding_failed')).toBe(
      'embedding_unavailable'
    );
    expect(classifyRetrievalFailure('disabled', 'disabled')).toBe('disabled');
    expect(classifyRetrievalFailure('unavailable', 'invalid_query')).toBe('invalid_request');
  });

  it('adds the derived class to the persisted retrieval trace', () => {
    const payload = buildPierrotRetrievalPayload({
      conversationId: 'conv_12345678',
      sessionId: 'sess_12345678',
      userMessageId: 'msg_12345678',
      mode: 'brain_v2',
      outcome: 'unavailable',
      code: 'timeout',
      selectedSources: [],
      documentIds: [],
      chunkIds: [],
      latencyMs: 9000,
      usedContext: false,
      generationOk: true,
    });

    expect(payload).toMatchObject({
      mode: 'brain_v2',
      outcome: 'unavailable',
      code: 'timeout',
      failure_class: 'timeout',
    });
  });
});
