import type { UnframedChunk } from '../../types';
import { DEFAULT_STOPWORDS } from '../c1/retrieval';
import { tokenizeForBm25, uniqueTokens } from '../tokenize';

import type { C4Features, C4Question, C4QuestionResult } from './types';

export function computeC4Features(
  question: C4Question,
  result: C4QuestionResult,
  chunkById: Map<string, UnframedChunk>,
): C4Features {
  const top = result.top[0];
  const second = result.top[1];
  const stopwords = new Set(DEFAULT_STOPWORDS);
  const queryOrdered = tokenizeForBm25(question.question).filter(
    (token) => !stopwords.has(token),
  );
  const queryTokens = uniqueTokens(question.question).filter(
    (token) => !stopwords.has(token),
  );

  if (!top) {
    return {
      topScore: 0,
      secondScore: 0,
      margin: 0,
      queryTokenCount: queryTokens.length,
      distinctMatchedTerms: 0,
      coverage: 0,
      exactPhrase: false,
      expectedSectionMatch: false,
    };
  }

  const chunk = chunkById.get(top.chunkId);
  const topTokens = chunk
    ? tokenizeForBm25(`${chunk.text} ${chunk.heading}`)
    : [];
  const topTokenSet = new Set(topTokens);
  const matched = queryTokens.filter((token) => topTokenSet.has(token));
  const exactPhrase =
    queryOrdered.length === 0
      ? false
      : queryOrdered.length === 1
        ? topTokenSet.has(queryOrdered[0])
        : queryOrdered.some((token, index) => {
            if (index === 0) return false;

            const previous = queryOrdered[index - 1];

            for (let position = 1; position < topTokens.length; position += 1) {
              if (
                topTokens[position - 1] === previous &&
                topTokens[position] === token
              ) {
                return true;
              }
            }

            return false;
          });
  const relevantChunks = new Set(question.relevantChunkIds ?? []);
  const relevantSections = new Set(question.relevantSectionIndexes ?? []);

  return {
    topScore: top.score,
    secondScore: second?.score ?? 0,
    margin: top.score - (second?.score ?? 0),
    queryTokenCount: queryTokens.length,
    distinctMatchedTerms: matched.length,
    coverage:
      queryTokens.length > 0 ? matched.length / queryTokens.length : 0,
    exactPhrase,
    expectedSectionMatch:
      relevantChunks.has(top.chunkId) || relevantSections.has(top.sectionIndex),
  };
}
