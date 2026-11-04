import {
  parsePierrotResponse,
  retrievalStateLabel,
  safeSourceUrl,
  totalSourceCount,
} from '../chatParser';

describe('Pierrot response parser', () => {
  it('reads the non-streaming JSON contract and real sources only', () => {
    const parsed = parsePierrotResponse({
      reply: 'Ответ',
      conversationId: 'conv_12345678',
      sessionId: 'sess_12345678',
      assistantMessageId: 'a_12345678abcdef',
      provider: 'deepseek',
      recorded: true,
      rag: {
        mode: 'brain',
        outcome: 'relevant_results',
        sources: [
          {
            documentId: 'doc-1',
            documentTitle: 'Название',
            sourceType: 'article',
            sourceDomain: 'example.com',
            excerpt: 'Фрагмент',
            canonicalUrl: 'https://example.com/a',
          },
          { documentTitle: 'Без ссылки' },
        ],
      },
      web: {
        sources: [{ title: 'Web', url: 'https://example.org', domain: 'example.org' }],
      },
      answerSources: { label: 'BRAIN + WEB' },
    });

    expect(parsed.reply).toBe('Ответ');
    expect(parsed.recorded).toBe(true);
    expect(parsed.answerLabel).toBe('BRAIN + WEB');
    expect(parsed.assistantMessageId).toBe('a_12345678abcdef');
    expect(parsed.sources.outcome).toBe('relevant_results');
    expect(totalSourceCount(parsed.sources)).toBe(3);
    expect(parsed.sources.brain[1].canonicalUrl).toBeNull();
    expect(parsed.sources.web[0].url).toBe('https://example.org');
  });

  it('does not invent sources when retrieval returned none', () => {
    const parsed = parsePierrotResponse({
      reply: 'Ответ',
      rag: { outcome: 'no_match', sources: [] },
      sourceStatus: { brain: 'empty' },
    });

    expect(totalSourceCount(parsed.sources)).toBe(0);
    expect(retrievalStateLabel(parsed.sources.outcome, parsed.sources.code)).toBe(
      'совпадений нет'
    );
  });

  it('rejects unsafe source URLs', () => {
    expect(safeSourceUrl('javascript:alert(1)')).toBeNull();
    expect(safeSourceUrl('//evil.example')).toBeNull();
    expect(safeSourceUrl('/flow/ok')).toBe('/flow/ok');
    expect(safeSourceUrl('https://ok.example')).toBe('https://ok.example');
  });

  it('reports unavailable retrieval honestly', () => {
    expect(retrievalStateLabel('unavailable', 'timeout')).toBe(
      'поиск не ответил вовремя'
    );
    expect(retrievalStateLabel('unavailable', 'database_unavailable')).toBe(
      'база источников недоступна'
    );
  });
});
