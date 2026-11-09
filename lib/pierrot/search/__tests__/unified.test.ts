/** @jest-environment node */

import { randomUUID } from 'crypto';
import { FakeSupabase, OWNER_ID } from '@/lib/pierrot/memory/testSupport/fakeSupabase';
import { mapProject } from '@/lib/pierrot/projects/store';
import { searchUnifiedOwnerContext } from '../unified';

const OTHER_ID = '99999999-9999-4999-8999-999999999999';
const TABLES = [
  'pierrot_projects',
  'pierrot_conversations',
  'pierrot_messages',
  'pierrot_project_conversations',
  'pierrot_project_artifacts',
  'pierrot_project_knowledge',
];

function project(id: string, conversationId: string | null = null) {
  return {
    id,
    owner_user_id: OWNER_ID,
    slug: 'heart-and-angel',
    name: 'Heart & Angel',
    description: '',
    objective: '',
    status: 'active',
    priority: 0,
    project_brief: '',
    brief_revision: 1,
    conversation_id: conversationId,
    last_activity_at: '2026-11-06T10:00:00.000Z',
    created_at: '2026-11-01T10:00:00.000Z',
    updated_at: '2026-11-06T10:00:00.000Z',
  };
}

describe('unified owner search', () => {
  it('finds conversations in one stream and keeps the project badge', async () => {
    const db = new FakeSupabase(TABLES);
    const projectId = randomUUID();
    const conversationId = randomUUID();
    db.seed('pierrot_projects', [project(projectId, conversationId)]);
    db.seed('pierrot_conversations', [
      {
        id: conversationId,
        session_id: randomUUID(),
        user_id: OWNER_ID,
        identity_type: 'owner',
        title: 'Мобильная версия Heart & Angel',
        started_at: '2026-11-06T10:00:00.000Z',
        updated_at: '2026-11-06T10:01:00.000Z',
        last_message_at: '2026-11-06T10:01:00.000Z',
      },
    ]);
    db.seed('pierrot_project_conversations', [
      {
        project_id: projectId,
        conversation_id: conversationId,
        owner_user_id: OWNER_ID,
      },
    ]);
    db.seed('pierrot_messages', [
      {
        id: randomUUID(),
        conversation_id: conversationId,
        role: 'user',
        content: 'Опустить шарик с сердечком ниже на мобильных',
        message_index: 1,
        created_at: '2026-11-06T10:01:00.000Z',
      },
    ]);

    const result = await searchUnifiedOwnerContext({
      store: db.asClient(),
      ownerUserId: OWNER_ID,
      query: 'Heart & Angel',
      scope: 'conversations',
      project: mapProject(project(projectId, conversationId)),
    });

    expect(result.hits).toHaveLength(1);
    expect(result.hits[0]).toMatchObject({
      source: 'conversation',
      projectName: 'Heart & Angel',
      projectSlug: 'heart-and-angel',
      href: '/admin/pierrot?project=heart-and-angel',
    });
  });

  it('never returns another owner’s transcript', async () => {
    const db = new FakeSupabase(TABLES);
    const conversationId = randomUUID();
    db.seed('pierrot_conversations', [
      {
        id: conversationId,
        session_id: randomUUID(),
        user_id: OTHER_ID,
        identity_type: 'owner',
        title: 'Чужой разговор',
        started_at: '2026-11-06T10:00:00.000Z',
        updated_at: '2026-11-06T10:01:00.000Z',
        last_message_at: '2026-11-06T10:01:00.000Z',
      },
    ]);
    db.seed('pierrot_messages', [
      {
        id: randomUUID(),
        conversation_id: conversationId,
        role: 'user',
        content: 'Heart & Angel — чужой секрет',
        message_index: 1,
        created_at: '2026-11-06T10:01:00.000Z',
      },
    ]);

    const result = await searchUnifiedOwnerContext({
      store: db.asClient(),
      ownerUserId: OWNER_ID,
      query: 'Heart & Angel',
      scope: 'conversations',
      project: null,
    });

    expect(result.hits).toHaveLength(0);
  });
});
