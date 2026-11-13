/**
 * @jest-environment node
 */
import {
  editorialContextFromPayload,
  editorialContextToPayload,
  emptyEditorialContext,
  inferEditorialContext,
  loadEditorialContext,
  mergeEditorialContext,
} from '../context';
import { detectEditorialIntent } from '../intent';

describe('editorial context continuity', () => {
  it('round-trips the active project, document, task, evidence and constraints', () => {
    const context = mergeEditorialContext(emptyEditorialContext(), {
      projectId: 'project-1',
      projectSlug: 'unframed',
      projectName: 'Unframed',
      documentId: 'doc_unframed_manuscript',
      documentTitle: 'UNFRAMED',
      activeChapterNumber: 14,
      activeTask: 'manuscript.chapter',
      currentEditorialObjective: 'Прочитать главу 14',
      lastRetrievalScope: 'chapter:14',
      lastEvidenceChunkIds: ['chk_1', 'chk_2'],
      sourceConstraints: {
        excludedTopics: ['уголовные дела'],
        fromYear: 2010,
        toYear: 2015,
        raw: [],
      },
    });

    const payload = editorialContextToPayload(context);
    const restored = editorialContextFromPayload(payload);

    expect(restored).toMatchObject({
      projectId: 'project-1',
      documentId: 'doc_unframed_manuscript',
      activeChapterNumber: 14,
      activeTask: 'manuscript.chapter',
      lastEvidenceChunkIds: ['chk_1', 'chk_2'],
    });
    expect(restored?.sourceConstraints).toMatchObject({
      excludedTopics: ['уголовные дела'],
      fromYear: 2010,
      toYear: 2015,
    });
  });

  it('Q. preserves the active project when later patches only change evidence', () => {
    const first = mergeEditorialContext(emptyEditorialContext(), {
      projectId: 'project-1',
      projectSlug: 'unframed',
      documentId: 'doc_unframed_manuscript',
      activeTask: 'manuscript.search',
    });
    const second = mergeEditorialContext(first, {
      lastEvidenceChunkIds: ['chk_9'],
    });
    expect(second.projectId).toBe('project-1');
    expect(second.documentId).toBe('doc_unframed_manuscript');
    expect(second.activeTask).toBe('manuscript.search');
    expect(second.lastEvidenceChunkIds).toEqual(['chk_9']);
  });

  it('L. reports a failed context read instead of returning a fabricated empty context', async () => {
    const store = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              like: () => ({
                order: () => ({
                  limit: () => ({
                    maybeSingle: async () => ({ data: null, error: { message: 'permission denied' } }),
                  }),
                }),
              }),
            }),
          }),
        }),
      }),
    } as never;

    const loaded = await loadEditorialContext({
      store,
      conversationId: 'conversation-1',
    });
    expect(loaded.unavailable).toBe(true);
    expect(loaded.error).toBe('permission denied');
    expect(loaded.context).toBeNull();
  });

  it('does not infer UNFRAMED from an unrelated conversation', () => {
    const context = inferEditorialContext({ project: null });
    expect(context.documentId).toBeNull();
    expect(context.projectSlug).toBeNull();
    expect(
      detectEditorialIntent({
        message: 'Найди ещё.',
        activeContext: context,
      })
    ).toBeNull();
  });

  it('keeps a long chain of chapter follow-ups on the same manuscript', () => {
    let context = inferEditorialContext({
      project: { id: 'project-1', slug: 'unframed', name: 'Unframed' },
      documentId: 'doc_unframed_manuscript',
      documentTitle: 'UNFRAMED',
    });
    context = mergeEditorialContext(context, {
      activeChapterNumber: 14,
      activeTask: 'manuscript.chapter',
      currentEditorialObjective: 'Глава 14',
    });

    const intent = detectEditorialIntent({
      message: 'А теперь следующую главу.',
      activeContext: context,
    });
    expect(intent?.operation).toBe('manuscript.chapter');
    expect(intent?.chapterNumber).toBe(15);
    expect(intent?.followUp).toBe(true);
  });
});
