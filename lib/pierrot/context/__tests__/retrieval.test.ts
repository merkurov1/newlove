/** @jest-environment node */

import { randomUUID } from 'crypto';
import { FakeSupabase, OWNER_ID } from '@/lib/pierrot/memory/testSupport/fakeSupabase';
import type { PierrotProject } from '@/lib/pierrot/projects/types';
import { detectContextQuery } from '../intent';
import { runContextQuery } from '../retrieval';

const NOW = new Date('2026-11-11T12:00:00.000Z');
const OPTIONS = { now: NOW, timezone: 'UTC', timezoneKnown: true };

const TABLES = [
  'pierrot_projects',
  'pierrot_conversations',
  'pierrot_messages',
  'pierrot_project_conversations',
  'pierrot_decisions',
  'pierrot_project_decisions',
  'pierrot_project_artifacts',
  'pierrot_project_events',
  'pierrot_entities',
  'pierrot_entity_relations',
  'knowledge_documents',
  'knowledge_chunks',
  'pierrot_project_knowledge',
];

function projectRow(projectId: string, conversationId: string) {
  return {
    id: projectId,
    owner_user_id: OWNER_ID,
    slug: 'unframed',
    name: 'UNFRAMED',
    description: 'Creative project around the book.',
    objective: 'Develop the book, series, website and proposal.',
    status: 'active',
    priority: 0,
    project_brief: 'Book and adaptation are related but distinct.',
    brief_revision: 3,
    conversation_id: conversationId,
    last_activity_at: '2026-11-11T10:00:00.000Z',
    created_at: '2026-10-01T10:00:00.000Z',
    updated_at: '2026-11-11T10:00:00.000Z',
  };
}

function project(projectId: string, conversationId: string): PierrotProject {
  return {
    id: projectId,
    ownerUserId: OWNER_ID,
    slug: 'unframed',
    name: 'UNFRAMED',
    description: 'Creative project around the book.',
    objective: 'Develop the book, series, website and proposal.',
    status: 'active',
    priority: 0,
    ownerRating: null,
    ownerRatingUpdatedAt: null,
    conversationId,
    projectBrief: 'Book and adaptation are related but distinct.',
    briefRevision: 3,
    lastActivityAt: '2026-11-11T10:00:00.000Z',
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-11-11T10:00:00.000Z',
  };
}

function conversation(id: string, title: string) {
  return {
    id,
    session_id: randomUUID(),
    title,
    user_id: OWNER_ID,
    identity_type: 'owner',
    started_at: '2026-11-01T10:00:00.000Z',
    updated_at: '2026-11-11T10:00:00.000Z',
    last_message_at: '2026-11-11T10:00:00.000Z',
  };
}

function message(input: {
  id: string;
  conversationId: string;
  content: string;
  at: string;
  role?: 'user' | 'assistant';
  index?: number;
}) {
  return {
    id: input.id,
    conversation_id: input.conversationId,
    role: input.role || 'user',
    content: input.content,
    created_at: input.at,
    ingested_at: input.at,
    message_index: input.index || 1,
  };
}

function seedBase() {
  const db = new FakeSupabase(TABLES);
  const projectId = randomUUID();
  const canonicalId = 'project-chat-1';
  const mainId = 'main-chat-1';

  db.seed('pierrot_projects', [projectRow(projectId, canonicalId)]);
  db.seed('pierrot_conversations', [
    conversation(canonicalId, 'UNFRAMED — проектный чат'),
    conversation(mainId, 'Главный чат'),
  ]);
  db.seed('pierrot_project_conversations', [
    {
      project_id: projectId,
      conversation_id: canonicalId,
      owner_user_id: OWNER_ID,
    },
  ]);
  db.seed('pierrot_messages', [
    message({
      id: 'm1',
      conversationId: canonicalId,
      content: 'Spectral Tiger — оригинальная глава книги UNFRAMED, не сериал.',
      at: '2026-11-11T10:00:00.000Z',
      index: 1,
    }),
    message({
      id: 'm2',
      conversationId: mainId,
      content: 'В отдельном разговоре мы обсуждали Spectral Tiger и сериал.',
      at: '2026-11-11T11:00:00.000Z',
      index: 1,
    }),
    message({
      id: 'm3',
      conversationId: mainId,
      content: 'Вчерашнее обсуждение не должно попасть в сегодняшний отчёт.',
      at: '2026-11-10T10:00:00.000Z',
      index: 2,
    }),
  ]);

  return { db, projectId, canonicalId, mainId };
}

function taskRow(input: {
  id: string;
  title: string;
  status: string;
  kind?: string;
  content?: string;
  updatedAt?: string;
  project?: string;
}) {
  return {
    id: input.id,
    user_id: OWNER_ID,
    kind: input.kind || 'task',
    title: input.title,
    content: input.content || input.title,
    rationale: null,
    status: input.status,
    project: input.project || 'UNFRAMED',
    tags: [],
    source_refs: [],
    conversation_id: null,
    message_id: null,
    decided_at: input.updatedAt || '2026-11-11T09:00:00.000Z',
    review_at: null,
    importance: 0.7,
    confidence: 0.9,
    created_at: '2026-11-01T09:00:00.000Z',
    updated_at: input.updatedAt || '2026-11-11T09:00:00.000Z',
  };
}

describe('unified context retrieval', () => {
  it('keeps the original message id when searching a project conversation', async () => {
    const { db, projectId, canonicalId } = seedBase();
    const plan = detectContextQuery('Где мы обсуждали Spectral Tiger?', OPTIONS);
    expect(plan).not.toBeNull();

    const result = await runContextQuery({
      store: db.asClient(),
      ownerUserId: OWNER_ID,
      plan: plan!,
      project: project(projectId, canonicalId),
      embeddingClient: null,
    });

    const messageHits = result.hits.filter((hit) => hit.sourceType === 'message');
    expect(messageHits).toHaveLength(1);
    expect(messageHits[0]).toMatchObject({
      messageId: 'm1',
      conversationId: canonicalId,
      eventAt: '2026-11-11T10:00:00.000Z',
      retrievalMethod: 'keyword',
      evidenceClass: 'DIRECTLY_OBSERVED',
    });
  });

  it('reconstructs today across every conversation and excludes yesterday', async () => {
    const { db, projectId, canonicalId, mainId } = seedBase();
    const plan = detectContextQuery('Что мы делали сегодня?', OPTIONS);
    expect(plan).toMatchObject({ intent: 'DAILY_SUMMARY', period: { key: 'today' } });

    const result = await runContextQuery({
      store: db.asClient(),
      ownerUserId: OWNER_ID,
      plan: plan!,
      project: null,
      embeddingClient: null,
    });

    const messageHits = result.hits.filter((hit) => hit.sourceType === 'message');
    expect(new Set(messageHits.map((hit) => hit.conversationId))).toEqual(
      new Set([canonicalId, mainId])
    );
    expect(messageHits.map((hit) => hit.messageId)).not.toContain('m3');
    expect(result.timeline.map((event) => event.id).indexOf('m1')).toBeLessThan(
      result.timeline.map((event) => event.id).indexOf('m2')
    );
    expect(result.daily?.timezone).toBe('UTC');
  });

  it('retrieves a Brain document by title and returns its internal structure', async () => {
    const { db, projectId, canonicalId } = seedBase();
    const documentId = 'doc_unframed_blueprint';
    db.seed('knowledge_documents', [
      {
        id: documentId,
        title: 'UNFRAMED: MASTER PROJECT BLUEPRINT',
        source_type: 'project_document',
        access_class: 'owner',
        chunk_count: 3,
        created_at: '2026-11-01T10:00:00.000Z',
        updated_at: '2026-11-01T10:00:00.000Z',
      },
    ]);
    db.seed('knowledge_chunks', [
      {
        id: 'chk_1',
        document_id: documentId,
        content: 'Structure: book, series, video, website and proposal.',
        heading: 'Project structure',
        section_path: ['Blueprint', 'Structure'],
        section_index: 0,
        access_class: 'owner',
      },
      {
        id: 'chk_2',
        document_id: documentId,
        content: 'The book remains the source work for the larger project.',
        heading: 'Book and project',
        section_path: ['Blueprint', 'Entities'],
        section_index: 1,
        access_class: 'owner',
      },
      {
        id: 'chk_3',
        document_id: documentId,
        content: 'Series development, promotional campaign and landing pages.',
        heading: 'Workstreams',
        section_path: ['Blueprint', 'Workstreams'],
        section_index: 2,
        access_class: 'owner',
      },
    ]);

    const plan = detectContextQuery(
      'Найди документ UNFRAMED: MASTER PROJECT BLUEPRINT',
      OPTIONS
    );
    expect(plan).toMatchObject({ intent: 'DOCUMENT_SEARCH' });

    const result = await runContextQuery({
      store: db.asClient(),
      ownerUserId: OWNER_ID,
      plan: plan!,
      project: project(projectId, canonicalId),
      embeddingClient: null,
    });

    expect(result.documents[0]).toMatchObject({
      documentId,
      title: 'UNFRAMED: MASTER PROJECT BLUEPRINT',
      sectionCount: 3,
    });
    expect(result.documents[0].headings).toEqual(
      expect.arrayContaining(['Project structure', 'Book and project', 'Workstreams'])
    );
    expect(result.hits.some((hit) => hit.sourceType === 'document_chunk')).toBe(true);
  });

  it('returns both UNFRAMED entity candidates instead of silently choosing one', async () => {
    const { db, projectId, canonicalId } = seedBase();
    db.seed('pierrot_entities', [
      {
        id: 'ent-book',
        owner_user_id: OWNER_ID,
        entity_type: 'BOOK',
        name: 'UNFRAMED',
        canonical_name: 'unframed',
        description: 'Literary work with chapters and editions.',
        project_id: projectId,
        status: 'active',
        aliases: ['UNFRAMED book'],
      },
      {
        id: 'ent-project',
        owner_user_id: OWNER_ID,
        entity_type: 'PROJECT',
        name: 'UNFRAMED',
        canonical_name: 'unframed',
        description: 'Creative project with series, video, website and proposal.',
        project_id: projectId,
        status: 'active',
        aliases: ['UNFRAMED project'],
      },
    ]);

    const plan = detectContextQuery('Что такое UNFRAMED — книга или проект?', OPTIONS);
    expect(plan).toMatchObject({ intent: 'ENTITY_DISTINCTION' });

    const result = await runContextQuery({
      store: db.asClient(),
      ownerUserId: OWNER_ID,
      plan: plan!,
      project: null,
      embeddingClient: null,
    });

    expect(result.ambiguities).toHaveLength(1);
    expect(result.ambiguities[0].candidates.map((candidate) => candidate.entityType).sort()).toEqual([
      'BOOK',
      'PROJECT',
    ]);
  });

  it('separates completed tasks, remaining work and confirmed deliverables', async () => {
    const { db, projectId, canonicalId } = seedBase();
    db.seed('pierrot_decisions', [
      taskRow({
        id: 'task-done',
        title: 'Опубликовать промо-видео',
        status: 'completed',
        updatedAt: '2026-11-11T09:30:00.000Z',
      }),
      taskRow({
        id: 'task-open',
        title: 'Собрать финальное предложение',
        status: 'current',
      }),
      taskRow({
        id: 'decision-1',
        kind: 'decision',
        title: 'Финальная структура — 12 глав',
        content: 'Утверждена финальная структура книги.',
        status: 'current',
      }),
    ]);
    db.seed('pierrot_project_decisions', [
      { project_id: projectId, decision_id: 'task-done', owner_user_id: OWNER_ID },
      { project_id: projectId, decision_id: 'task-open', owner_user_id: OWNER_ID },
      { project_id: projectId, decision_id: 'decision-1', owner_user_id: OWNER_ID },
    ]);
    db.seed('pierrot_project_artifacts', [
      {
        id: 'artifact-1',
        project_id: projectId,
        owner_user_id: OWNER_ID,
        title: 'Промо-видео Spectral Tiger',
        artifact_type: 'video',
        content: 'Опубликовано на сайте.',
        metadata: { status: 'published' },
        updated_at: '2026-11-11T09:40:00.000Z',
        created_at: '2026-11-11T09:40:00.000Z',
      },
    ]);
    db.seed('pierrot_entities', [
      {
        id: 'ent-project',
        owner_user_id: OWNER_ID,
        entity_type: 'PROJECT',
        name: 'UNFRAMED',
        canonical_name: 'unframed',
        description: 'Creative project.',
        project_id: projectId,
        status: 'active',
        aliases: [],
      },
      {
        id: 'ent-series',
        owner_user_id: OWNER_ID,
        entity_type: 'SERIES',
        name: 'Spectral Tiger',
        canonical_name: 'spectral tiger',
        description: 'Series adaptation.',
        project_id: projectId,
        status: 'active',
        aliases: [],
      },
    ]);
    db.seed('pierrot_entity_relations', [
      {
        id: 'rel-1',
        owner_user_id: OWNER_ID,
        from_entity_id: 'ent-project',
        to_entity_id: 'ent-series',
        relation_type: 'HAS_SERIES',
        confidence: 0.9,
        evidence_class: 'DOCUMENTED',
      },
    ]);

    const plan = detectContextQuery('What is the current state of UNFRAMED?', OPTIONS);
    expect(plan).toMatchObject({ intent: 'PROJECT_STATUS' });

    const result = await runContextQuery({
      store: db.asClient(),
      ownerUserId: OWNER_ID,
      plan: plan!,
      project: project(projectId, canonicalId),
      embeddingClient: null,
    });

    expect(result.projectState).not.toBeNull();
    expect(result.projectState?.completed.map((event) => event.id)).toContain('memory:task-done');
    expect(result.projectState?.remaining.map((event) => event.id)).toContain('memory:task-open');
    expect(result.projectState?.decisions.map((event) => event.id)).toContain('memory:decision-1');
    expect(result.projectState?.deliverables.map((event) => event.id)).toContain('artifact:artifact-1');
    expect(result.projectState?.workstreams.map((stream) => stream.name)).toContain('Spectral Tiger');
    expect(result.projectState?.status).toBe('IN_PROGRESS');
  });

  it('does not count a discussed task as a completed achievement', async () => {
    const { db } = seedBase();
    db.seed('pierrot_decisions', [
      taskRow({
        id: 'task-done',
        title: 'Опубликовать промо-видео',
        status: 'completed',
        updatedAt: '2026-11-11T09:30:00.000Z',
      }),
      taskRow({
        id: 'task-open',
        title: 'Сделать промо-видео',
        status: 'current',
      }),
    ]);

    const plan = detectContextQuery('What did I complete today?', OPTIONS);
    expect(plan).toMatchObject({ intent: 'ACHIEVEMENT_LOG' });

    const result = await runContextQuery({
      store: db.asClient(),
      ownerUserId: OWNER_ID,
      plan: plan!,
      project: null,
      embeddingClient: null,
    });

    expect(result.daily?.completed.map((event) => event.id)).toContain('memory:task-done');
    expect(result.daily?.completed.map((event) => event.id)).not.toContain('memory:task-open');
  });
});
