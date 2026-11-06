/** @jest-environment node */

import { FakeSupabase, OWNER_ID } from '@/lib/pierrot/memory/testSupport/fakeSupabase';
import { randomUUID } from 'crypto';
import { buildProjectChatContext, searchProjectHistory } from '../history';
import type { PierrotProjectSnapshot } from '../types';

const TABLES = ['pierrot_project_conversations', 'pierrot_messages', 'pierrot_projects'];

const CONVERSATION_ID = 'project-conv-1';

function snapshot(projectId: string): PierrotProjectSnapshot {
  return {
    id: projectId,
    ownerUserId: OWNER_ID,
    slug: 'journal',
    name: 'Journal',
    description: '',
    objective: 'Weekly editorial selection.',
    status: 'active',
    priority: 0,
    ownerRating: null,
    ownerRatingUpdatedAt: null,
    conversationId: CONVERSATION_ID,
    projectBrief: 'Journal publishes a weekly selection.',
    briefRevision: 3,
    lastActivityAt: '2026-11-01T10:00:00.000Z',
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-11-01T10:00:00.000Z',
    decisions: [
      {
        id: 'd1',
        title: 'Выпуск по средам',
        content: 'Выпуск по средам',
        status: 'current',
        kind: 'decision',
        updatedAt: '2026-11-01T10:00:00.000Z',
      },
    ],
    tasks: [
      {
        id: 't1',
        title: 'Проверить макет',
        content: 'Проверить макет',
        status: 'current',
        updatedAt: '2026-11-01T10:00:00.000Z',
      },
    ],
    conversations: [],
    knowledge: [],
    artifacts: [{ id: 'a1', title: 'Архив писем', artifactType: 'link', updatedAt: '' }],
    latestReview: null,
  };
}

function message(id: string, content: string, index: number, role: 'user' | 'assistant' = 'user') {
  return {
    id,
    conversation_id: CONVERSATION_ID,
    role,
    content,
    message_index: index,
    created_at: `2026-11-0${Math.min(index, 9)}T10:00:00.000Z`,
  };
}

describe('project chat history context', () => {
  it('includes current project state and the recent canonical transcript', async () => {
    const db = new FakeSupabase(TABLES);
    const projectId = randomUUID();
    db.seed('pierrot_project_conversations', [
      { project_id: projectId, conversation_id: CONVERSATION_ID, owner_user_id: OWNER_ID },
    ]);
    db.seed('pierrot_messages', [
      message('m1', 'Раннее сообщение о макете', 1),
      message('m2', 'Последнее сообщение о выпуске', 2),
    ]);

    const context = await buildProjectChatContext({
      store: db.asClient(),
      ownerUserId: OWNER_ID,
      project: snapshot(projectId),
      conversationId: CONVERSATION_ID,
      query: 'Что мы решили про выпуск?',
      wantsHistory: true,
    });

    expect(context).toContain('Journal');
    expect(context).toContain('Journal publishes a weekly selection.');
    expect(context).toContain('Выпуск по средам');
    expect(context).toContain('Проверить макет');
    expect(context).toContain('Последнее сообщение о выпуске');
  });

  it('finds an older message by search instead of guessing', async () => {
    const db = new FakeSupabase(TABLES);
    const projectId = randomUUID();
    db.seed('pierrot_project_conversations', [
      { project_id: projectId, conversation_id: CONVERSATION_ID, owner_user_id: OWNER_ID },
    ]);
    db.seed('pierrot_messages', [
      message('m1', 'Обсуждали серию открыток с архивными письмами', 1),
      message('m2', 'Совсем другая тема про лендинг', 2),
    ]);

    const found = await searchProjectHistory(
      db.asClient(),
      OWNER_ID,
      projectId,
      'Что мы обсуждали про архивные открытки?'
    );

    expect(found.map((item) => item.id)).toContain('m1');
  });
});
