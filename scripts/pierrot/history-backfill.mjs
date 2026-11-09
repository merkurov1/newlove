#!/usr/bin/env node
/**
 * Pierrot unified history/session backfill.
 *
 * SAFE DEFAULT: dry run. All writes happen in one transaction and are rolled
 * back unless --apply is passed.
 *
 * Usage:
 *   SUPABASE_DB_URL=postgres://... node scripts/pierrot/history-backfill.mjs
 *   SUPABASE_DB_URL=postgres://... node scripts/pierrot/history-backfill.mjs --apply
 *   ... --owner=<uuid>             limit to one owner
 *   ... --report=path.json         write a machine-readable report
 *   ... --schema=path.sql          apply schema in the same transaction
 *   ... --no-schema                assume the schema is already applied
 *
 * The script never deletes or rewrites a message, conversation, event or
 * project row. It only fills the additive history/session/provenance columns.
 */

import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const { Client } = pg;

function arg(name, fallback = null) {
  const prefix = `--${name}=`;
  const found = process.argv.find((value) => value.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

const apply = process.argv.includes('--apply');
const noSchema = process.argv.includes('--no-schema');
const ownerFilter = arg('owner');
const reportPath =
  arg('report') || 'docs/audits/pierrot-history-backfill-report.json';
const schemaPath =
  arg('schema') || 'migrations/2026-11-09_pierrot_histories_sessions.sql';

const connectionString =
  process.env.SUPABASE_DB_URL ||
  process.env.DIRECT_URL ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL;

if (!connectionString) {
  console.error(
    'SUPABASE_DB_URL (or DIRECT_URL / DATABASE_URL / POSTGRES_URL) is required.'
  );
  process.exit(2);
}

const client = new Client({
  connectionString,
  ssl: connectionString.includes('localhost') ? false : { rejectUnauthorized: false },
});

function cleanTitle(value, fallback = 'Сессия') {
  const text = String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return fallback;
  return text.length > 120 ? `${text.slice(0, 117).trimEnd()}…` : text;
}

function iso(value) {
  return value ? new Date(value).toISOString() : null;
}

async function tableExists(name) {
  const { rows } = await client.query(
    `select 1 from information_schema.tables
      where table_schema='public' and table_name=$1 limit 1`,
    [name]
  );
  return rows.length > 0;
}

async function applySchemaIfNeeded() {
  if (noSchema) return false;
  const hasHistories = await tableExists('pierrot_histories');
  const hasSessions = await tableExists('pierrot_sessions');
  if (hasHistories && hasSessions) return false;

  if (!fs.existsSync(schemaPath)) {
    throw new Error(`schema file not found: ${schemaPath}`);
  }
  const sql = fs.readFileSync(schemaPath, 'utf8');
  await client.query(sql);
  return true;
}

async function loadCounts() {
  const { rows } = await client.query(`
    select
      (select count(*)::int from public.pierrot_conversations) as conversations,
      (select count(*)::int from public.pierrot_conversations where identity_type='owner') as owner_conversations,
      (select count(*)::int from public.pierrot_messages) as messages,
      (select count(*)::int from public.pierrot_messages m join public.pierrot_conversations c on c.id=m.conversation_id where c.identity_type='owner') as owner_messages,
      (select count(*)::int from public.pierrot_events) as events,
      (select count(*)::int from public.pierrot_projects) as projects,
      (select md5(coalesce(string_agg(id, ',' order by id), '')) from public.pierrot_messages) as message_id_digest,
      (select md5(coalesce(string_agg(id, ',' order by id), '')) from public.pierrot_conversations) as conversation_id_digest
  `);
  return rows[0];
}

async function loadOwnerIds() {
  const { rows } = await client.query(`
    select distinct user_id::text as owner_user_id
    from public.pierrot_conversations
    where identity_type='owner' and user_id is not null
      ${ownerFilter ? 'and user_id = $1::uuid' : ''}
    order by owner_user_id
  `, ownerFilter ? [ownerFilter] : []);
  return rows.map((row) => row.owner_user_id).filter(Boolean);
}

async function loadOwnerConversations(ownerIds) {
  const { rows } = await client.query(`
    select c.id, c.session_id, c.started_at, c.updated_at, c.last_message_at,
           c.ended_at, c.identity_type, c.mode, c.user_id::text as user_id,
           c.title, c.archived_at,
           (select count(*)::int from public.pierrot_messages m
             where m.conversation_id=c.id) as message_count
    from public.pierrot_conversations c
    where c.identity_type='owner'
      and (
        c.user_id::text = any($1::text[])
        or (c.user_id is null and cardinality($1::text[]) = 1)
      )
    order by c.started_at asc, c.id asc
  `, [ownerIds]);
  return rows;
}

async function loadMainCanonicalConversationIds() {
  const { rows } = await client.query(`
    select canonical_conversation_id
    from public.pierrot_histories
    where type='main' and canonical_conversation_id is not null
  `);
  return new Set(rows.map((row) => row.canonical_conversation_id));
}

async function loadFirstUserMessages() {
  const { rows } = await client.query(`
    select conversation_id, content
    from (
      select m.conversation_id, m.content,
             row_number() over (
               partition by m.conversation_id
               order by m.message_index asc
             ) as rn
      from public.pierrot_messages m
      where m.role='user'
    ) ranked
    where rn=1
  `);
  const result = new Map(rows.map((row) => [row.conversation_id, row.content]));

  // Project-chat merges physically moved messages into the canonical
  // conversation. Recover the old session's first user line from the merge
  // map so historical session titles are not lost.
  const { rows: mergedRows } = await client.query(`
    select source_conversation_id, original_row
    from public.pierrot_project_chat_merge_map
    order by source_conversation_id, original_message_index asc
  `).catch(() => ({ rows: [] }));

  for (const row of mergedRows) {
    if (result.has(row.source_conversation_id)) continue;
    if (row.original_row?.role !== 'user') continue;
    const content = row.original_row?.content;
    if (typeof content === 'string' && content.trim()) {
      result.set(row.source_conversation_id, content);
    }
  }

  return result;
}

async function loadProjects(ownerIds) {
  const { rows } = await client.query(`
    select id::text, owner_user_id::text, slug, name, status, conversation_id
    from public.pierrot_projects
    where ($1::text[] is null or owner_user_id::text = any($1::text[]))
    order by created_at asc
  `, [ownerIds.length ? ownerIds : null]);
  return rows;
}

async function loadProjectLinks(ownerIds) {
  const { rows } = await client.query(`
    select pc.project_id::text, pc.conversation_id, pc.owner_user_id::text,
           p.name as project_name, p.slug as project_slug,
           p.conversation_id as canonical_conversation_id
    from public.pierrot_project_conversations pc
    join public.pierrot_projects p on p.id = pc.project_id
    where ($1::text[] is null or pc.owner_user_id::text = any($1::text[]))
  `, [ownerIds.length ? ownerIds : null]);
  return rows;
}

function buildClassification(
  ownerIds,
  conversations,
  projects,
  links,
  firstUserByConversation,
  mainCanonicalConversationIds
) {
  const projectsById = new Map(projects.map((project) => [project.id, project]));
  const projectsByConversation = new Map();

  for (const project of projects) {
    if (project.conversation_id) {
      const list = projectsByConversation.get(project.conversation_id) || [];
      list.push(project);
      projectsByConversation.set(project.conversation_id, list);
    }
  }

  for (const link of links) {
    const project = projectsById.get(link.project_id);
    if (!project) continue;
    const list = projectsByConversation.get(link.conversation_id) || [];
    if (!list.some((item) => item.id === project.id)) list.push(project);
    projectsByConversation.set(link.conversation_id, list);
  }

  const soleOwner = ownerIds.length === 1 ? ownerIds[0] : null;
  const result = [];
  const unresolved = [];

  for (const conversation of conversations) {
    // The canonical MAIN conversation is physical storage for new sessions,
    // not a legacy session of its own. Re-running the backfill must not turn
    // it into another episode.
    if (mainCanonicalConversationIds.has(conversation.id)) continue;

    const assignedOwner =
      conversation.user_id ||
      (conversation.identity_type === 'owner' ? soleOwner : null);

    if (!assignedOwner) {
      unresolved.push({
        conversationId: conversation.id,
        reason: 'owner_missing_user_id_and_multiple_owner_accounts',
      });
      continue;
    }

    const candidateProjects = projectsByConversation.get(conversation.id) || [];
    const uniqueProjects = Array.from(
      new Map(candidateProjects.map((project) => [project.id, project])).values()
    );

    let classification = 'main';
    let project = null;
    let reason = 'no_project_link';

    if (uniqueProjects.length === 1) {
      classification = 'project';
      project = uniqueProjects[0];
      reason = project.conversation_id === conversation.id
        ? 'project_canonical_conversation'
        : 'project_conversation_link';
    } else if (uniqueProjects.length > 1) {
      classification = 'unresolved';
      reason = 'conversation_linked_to_multiple_projects';
    }

    const firstUser = firstUserByConversation.get(conversation.id) || '';
    const startedDay = conversation.started_at
      ? new Date(conversation.started_at).toISOString().slice(0, 10)
      : '';
    const title = cleanTitle(
      conversation.title || firstUser || `Сессия${startedDay ? ` ${startedDay}` : ''}`
    );

    const row = {
      conversation,
      ownerUserId: assignedOwner,
      classification,
      project,
      reason,
      title,
      firstUser,
    };
    result.push(row);

    if (classification === 'unresolved') {
      unresolved.push({
        conversationId: conversation.id,
        reason,
        projectIds: uniqueProjects.map((item) => item.id),
        title,
      });
    }
  }

  // Explicit audit list: old conversations that mention a project name but
  // have no structural link. They stay in MAIN and are listed for manual
  // review rather than guessed into a project.
  const projectNamePatterns = projects.map((project) => ({
    project,
    pattern: new RegExp(
      `${project.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}|${project.slug.replace(
        /[.*+?^${}()|[\]\\]/g,
        '\\$&'
      )}`,
      'iu'
    ),
  }));

  for (const row of result) {
    if (row.classification !== 'main') continue;
    const text = `${row.title}\n${row.firstUser}`;
    const matches = projectNamePatterns.filter(({ pattern }) => pattern.test(text));
    if (matches.length > 0) {
      row.ambiguousProjectMention = matches.map(({ project }) => ({
        projectId: project.id,
        projectName: project.name,
        projectSlug: project.slug,
      }));
    }
  }

  return { result, unresolved };
}

async function ensureMainHistory(ownerUserId) {
  const { rows } = await client.query(
    'select public.pierrot_ensure_main_history($1::uuid) as id',
    [ownerUserId]
  );
  const id = rows[0]?.id;
  if (!id) throw new Error(`main history not created for ${ownerUserId}`);
  const { rows: historyRows } = await client.query(
    `select id::text, canonical_conversation_id, title
       from public.pierrot_histories where id=$1`,
    [id]
  );
  return historyRows[0];
}

async function ensureProjectHistory(project) {
  if (!project.conversation_id) {
    return { history: null, reason: 'project_has_no_canonical_conversation' };
  }
  const { rows } = await client.query(
    'select public.pierrot_ensure_project_history($1::uuid) as id',
    [project.id]
  );
  const id = rows[0]?.id;
  if (!id) return { history: null, reason: 'history_not_created' };
  const { rows: historyRows } = await client.query(
    `select id::text, canonical_conversation_id, title
       from public.pierrot_histories where id=$1`,
    [id]
  );
  return { history: historyRows[0], reason: null };
}

async function createOrGetSession(history, row, ordinalHint) {
  const { rows } = await client.query(
    `select * from public.pierrot_create_session($1::uuid, $2, $3)`,
    [history.id, row.title, row.conversation.id]
  );
  const created = rows[0];
  if (!created) throw new Error(`session not created for ${row.conversation.id}`);

  const metadata = {
    source: 'legacy_conversation',
    conversation_id: row.conversation.id,
    identity_type: row.conversation.identity_type,
    mode: row.conversation.mode,
    classification: row.classification,
    reason: row.reason,
    original_started_at: iso(row.conversation.started_at),
    original_last_message_at: iso(row.conversation.last_message_at),
    original_updated_at: iso(row.conversation.updated_at),
    ...(row.ambiguousProjectMention
      ? { ambiguous_project_mention: row.ambiguousProjectMention }
      : {}),
  };

  await client.query(
    `update public.pierrot_sessions
        set conversation_id = $2,
            started_at = $3,
            ended_at = $4,
            title = $5,
            metadata = $6,
            updated_at = now()
      where id = $1`,
    [
      created.id,
      history.canonical_conversation_id,
      row.conversation.started_at,
      row.conversation.ended_at ||
        row.conversation.last_message_at ||
        row.conversation.updated_at,
      row.title,
      JSON.stringify(metadata),
    ]
  );

  return { id: created.id, ordinal: Number(created.ordinal), created: true, ordinalHint };
}

async function linkMessages() {
  // 1. Project merge provenance wins over the physical canonical conversation.
  const merged = await client.query(`
    update public.pierrot_messages m
       set history_id = s.history_id,
           session_id = s.id
      from public.pierrot_project_chat_merge_map mm
      join public.pierrot_histories h
        on h.project_id = mm.project_id and h.type = 'project'
      join public.pierrot_sessions s
        on s.history_id = h.id
       and s.source_conversation_id = mm.source_conversation_id
     where m.id = mm.message_id
       and mm.skipped_duplicate = false
       and mm.new_message_index is not null
       and m.history_id is null
  `);

  // 2. Every remaining unassigned message maps through its source conversation.
  const generic = await client.query(`
    update public.pierrot_messages m
       set history_id = s.history_id,
           session_id = s.id
      from public.pierrot_sessions s
     where m.conversation_id = s.source_conversation_id
       and m.history_id is null
  `);

  return { merged: merged.rowCount, generic: generic.rowCount };
}

async function assignHistorySequences() {
  const { rows: histories } = await client.query(`
    select id::text, coalesce((
      select max(m.history_sequence)
      from public.pierrot_messages m
      where m.history_id = h.id
    ), 0) as max_sequence
    from public.pierrot_histories h
  `);

  let assigned = 0;
  for (const history of histories) {
    const base = Number(history.max_sequence || 0);
    const result = await client.query(
      `with target as (
         select m.id,
                row_number() over (
                  order by m.created_at asc, m.conversation_id asc, m.message_index asc
                ) as rn
         from public.pierrot_messages m
         where m.history_id = $1::uuid
           and m.history_sequence is null
       )
       update public.pierrot_messages m
          set history_sequence = $2::bigint + target.rn
         from target
        where m.id = target.id`,
      [history.id, base]
    );
    assigned += result.rowCount;

    await client.query(
      `update public.pierrot_histories h
          set next_message_sequence = greatest(
                h.next_message_sequence,
                coalesce((
                  select max(m.history_sequence) + 1
                  from public.pierrot_messages m
                  where m.history_id = h.id
                ), 1)
              ),
              updated_at = now()
        where h.id = $1::uuid`,
      [history.id]
    );
  }
  return assigned;
}

async function refreshSessionCounters() {
  const { rowCount } = await client.query(`
    update public.pierrot_sessions s
       set message_count = coalesce(sub.count, 0),
           first_message_sequence = sub.first_seq,
           last_message_sequence = sub.last_seq,
           last_message_at = sub.last_at,
           updated_at = now()
      from (
        select session_id,
               count(*)::int as count,
               min(history_sequence) as first_seq,
               max(history_sequence) as last_seq,
               max(created_at) as last_at
        from public.pierrot_messages
        where session_id is not null
        group by session_id
      ) sub
     where s.id = sub.session_id
  `);
  return rowCount;
}

async function linkEvents() {
  const byMessage = await client.query(`
    update public.pierrot_events e
       set history_id = m.history_id,
           session_id = m.session_id
      from public.pierrot_messages m
     where e.history_id is null
       and e.payload ? 'message_id'
       and e.payload->>'message_id' = m.id
  `);

  const byEventKey = await client.query(`
    update public.pierrot_events e
       set history_id = m.history_id,
           session_id = m.session_id
      from public.pierrot_messages m
     where e.history_id is null
       and e.event_name in ('message_sent', 'assistant_replied', 'answer_feedback')
       and substring(e.event_key from '([A-Za-z0-9_-]{8,64})$') = m.id
  `);

  const bySource = await client.query(`
    update public.pierrot_events e
       set history_id = s.history_id,
           session_id = s.id
      from public.pierrot_sessions s
     where e.history_id is null
       and e.conversation_id = s.source_conversation_id
  `);

  const byCanonical = await client.query(`
    update public.pierrot_events e
       set history_id = latest.history_id,
           session_id = latest.id
      from (
        select distinct on (conversation_id)
               conversation_id, id, history_id
        from public.pierrot_sessions
        where conversation_id is not null
        order by conversation_id, ordinal desc
      ) latest
     where e.history_id is null
       and e.conversation_id = latest.conversation_id
  `);

  return {
    by_message: byMessage.rowCount,
    by_event_key: byEventKey.rowCount,
    by_source: bySource.rowCount,
    by_canonical: byCanonical.rowCount,
  };
}

async function verify(ownerIds, classification, before, sessionsCreated, projectIssues) {
  const { rows: afterRows } = await client.query(`
    select
      (select count(*)::int from public.pierrot_conversations) as conversations,
      (select count(*)::int from public.pierrot_conversations where identity_type='owner') as owner_conversations,
      (select count(*)::int from public.pierrot_messages) as messages,
      (select count(*)::int from public.pierrot_messages m join public.pierrot_conversations c on c.id=m.conversation_id where c.identity_type='owner') as owner_messages,
      (select count(*)::int from public.pierrot_events) as events,
      (select count(*)::int from public.pierrot_projects) as projects,
      (select md5(coalesce(string_agg(id, ',' order by id), '')) from public.pierrot_messages) as message_id_digest,
      (select md5(coalesce(string_agg(id, ',' order by id), '')) from public.pierrot_conversations) as conversation_id_digest
  `);
  const after = afterRows[0];

  const { rows: historyCounts } = await client.query(`
    select owner_user_id::text,
           count(*) filter (where type='main')::int as main_histories,
           count(*) filter (where type='project')::int as project_histories
    from public.pierrot_histories
    where owner_user_id::text = any($1::text[])
    group by owner_user_id
  `, [ownerIds]);

  const { rows: projectRows } = await client.query(`
    select h.id::text as history_id, h.project_id::text, p.name,
           h.canonical_conversation_id,
           (select count(*)::int from public.pierrot_sessions s where s.history_id=h.id) as sessions,
           (select count(*)::int from public.pierrot_messages m where m.history_id=h.id) as messages
    from public.pierrot_histories h
    join public.pierrot_projects p on p.id=h.project_id
    where h.type='project' and h.owner_user_id::text = any($1::text[])
    order by p.name
  `, [ownerIds]);

  const { rows: projectSessionRows } = await client.query(`
    select h.project_id::text, p.name as project_name,
           s.source_conversation_id, s.message_count
    from public.pierrot_sessions s
    join public.pierrot_histories h on h.id=s.history_id
    join public.pierrot_projects p on p.id=h.project_id
    where h.type='project' and h.owner_user_id::text = any($1::text[])
    order by p.name, s.ordinal
  `, [ownerIds]);

  const { rows: mergeRows } = await client.query(`
    select count(*)::int as map_rows,
           count(*) filter (where mm.skipped_duplicate)::int as skipped,
           count(*) filter (where m.id is null)::int as missing_message_rows,
           count(*) filter (where m.history_id is null)::int as unmapped_rows
    from public.pierrot_project_chat_merge_map mm
    left join public.pierrot_messages m on m.id=mm.message_id
  `);

  const { rows: unassignedRows } = await client.query(`
    select count(*)::int as owner_messages_without_history
    from public.pierrot_messages m
    join public.pierrot_conversations c on c.id=m.conversation_id
    where c.identity_type='owner' and m.history_id is null
  `);

  const { rows: sessionlessRows } = await client.query(`
    select c.id
    from public.pierrot_conversations c
    where c.identity_type='owner'
      and not exists (
        select 1 from public.pierrot_sessions s
        where s.source_conversation_id=c.id
      )
      and not exists (
        select 1 from public.pierrot_histories h
        where h.type='main' and h.canonical_conversation_id=c.id
      )
    order by c.started_at
  `);

  const { rows: duplicateRows } = await client.query(`
    select history_id::text, history_sequence, count(*)::int as n
    from public.pierrot_messages
    where history_id is not null and history_sequence is not null
    group by history_id, history_sequence
    having count(*) > 1
    limit 20
  `);

  const { rows: feedbackRows } = await client.query(`
    select count(*)::int as feedback_events,
           count(*) filter (where e.payload ? 'message_id')::int as with_message_id,
           count(*) filter (where e.history_id is not null)::int as with_history
    from public.pierrot_events e
    where e.event_name='answer_feedback'
  `);

  const candidateIds = [
    '932e705e-950c-4541-97fa-a26275209468',
    'd9bb59c0-8e20-4ade-9def-8790ac7b98c5',
    '81fb4733-6e4d-4bf1-93a0-1580de24280e',
    '0dff7735-4e36-4281-ba8c-4ee3ae9a0f45',
    'd1ff978f-61d9-48c3-8919-0451346e0667',
    'ed9994f2-f105-4673-83a5-576e0a9abf85',
  ];
  const { rows: candidateRows } = await client.query(`
    select s.source_conversation_id, s.title, h.type, h.project_id::text as project_id,
           p.name as project_name, s.message_count, s.id::text as session_id,
           h.id::text as history_id
    from public.pierrot_sessions s
    join public.pierrot_histories h on h.id=s.history_id
    left join public.pierrot_projects p on p.id=h.project_id
    where s.source_conversation_id = any($1::text[])
    order by s.source_conversation_id
  `, [candidateIds]);

  const unresolved = classification.unresolved;
  const ambiguousMentions = classification.result
    .filter((row) => row.ambiguousProjectMention)
    .map((row) => ({
      conversationId: row.conversation.id,
      title: row.title,
      historyType: row.classification === 'project' ? 'project' : 'main',
      mentions: row.ambiguousProjectMention,
    }));

  return {
    before,
    after,
    no_data_loss:
      after.conversations >= before.conversations &&
      after.owner_conversations >= before.owner_conversations &&
      before.messages === after.messages &&
      before.owner_messages === after.owner_messages &&
      before.message_id_digest === after.message_id_digest &&
      before.events === after.events &&
      before.projects === after.projects,
    histories_by_owner: historyCounts,
    one_main_per_owner: historyCounts.every((row) => Number(row.main_histories) === 1),
    one_project_history_per_project: projectIssues.length === 0,
    project_issues: projectIssues,
    project_histories: projectRows,
    project_sessions: projectSessionRows,
    journal_merge_check: mergeRows[0],
    owner_messages_without_history: unassignedRows[0].owner_messages_without_history,
    sessions_without_source_coverage: sessionlessRows.map((row) => row.id),
    duplicate_history_sequences: duplicateRows,
    feedback: feedbackRows[0],
    required_candidates: candidateRows,
    unresolved,
    ambiguous_project_mentions: ambiguousMentions,
    sessions_created_this_run: sessionsCreated,
  };
}

async function main() {
  await client.connect();
  let committed = false;

  try {
    await client.query('begin');
    const schemaApplied = await applySchemaIfNeeded();

    let before = await loadCounts();
    const ownerIds = await loadOwnerIds();
    if (ownerIds.length === 0) throw new Error('No owner accounts found.');

    const conversations = await loadOwnerConversations(ownerIds);
    const projects = await loadProjects(ownerIds);
    const links = await loadProjectLinks(ownerIds);
    const firstUserByConversation = await loadFirstUserMessages();
    const mainCanonicalConversationIds = await loadMainCanonicalConversationIds();
    const classification = buildClassification(
      ownerIds,
      conversations,
      projects,
      links,
      firstUserByConversation,
      mainCanonicalConversationIds
    );

    const mainHistories = new Map();
    for (const ownerUserId of ownerIds) {
      mainHistories.set(ownerUserId, await ensureMainHistory(ownerUserId));
    }

    const projectHistories = new Map();
    const projectIssues = [];
    for (const project of projects) {
      const result = await ensureProjectHistory(project);
      if (result.history) {
        projectHistories.set(project.id, result.history);
      } else {
        projectIssues.push({
          projectId: project.id,
          name: project.name,
          slug: project.slug,
          reason: result.reason,
        });
      }
    }

    // Preserve legacy session boundaries in chronological order: MAIN first,
    // then each project. A project conversation never leaks into MAIN.
    const byHistory = new Map();
    for (const row of classification.result) {
      if (row.classification === 'unresolved') continue;
      const history =
        row.classification === 'project'
          ? projectHistories.get(row.project.id)
          : mainHistories.get(row.ownerUserId);
      if (!history) {
        classification.unresolved.push({
          conversationId: row.conversation.id,
          reason: 'history_missing_for_classification',
        });
        continue;
      }
      const list = byHistory.get(history.id) || [];
      list.push({ ...row, history });
      byHistory.set(history.id, list);
    }

    let sessionsCreated = 0;
    let sessionsReused = 0;
    for (const [historyId, rows] of byHistory) {
      rows.sort(
        (left, right) =>
          new Date(left.conversation.started_at).getTime() -
          new Date(right.conversation.started_at).getTime()
      );
      for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index];
        const { rows: existing } = await client.query(
          `select 1 from public.pierrot_sessions
            where history_id=$1::uuid and source_conversation_id=$2 limit 1`,
          [historyId, row.conversation.id]
        );
        await createOrGetSession(row.history, row, index + 1);
        if (existing.length > 0) sessionsReused += 1;
        else sessionsCreated += 1;
      }
    }

    const linkedMessages = await linkMessages();
    const sequencesAssigned = await assignHistorySequences();
    const sessionsUpdated = await refreshSessionCounters();
    const linkedEvents = await linkEvents();

    const verification = await verify(
      ownerIds,
      classification,
      before,
      sessionsCreated,
      projectIssues
    );

    const report = {
      generatedAt: new Date().toISOString(),
      mode: apply ? 'apply' : 'dry_run',
      schemaApplied,
      ownerIds,
      classification: {
        main: classification.result.filter((row) => row.classification === 'main').length,
        project: classification.result.filter((row) => row.classification === 'project').length,
        unresolved: classification.result.filter((row) => row.classification === 'unresolved')
          .length,
      },
      histories: {
        main: mainHistories.size,
        project: projectHistories.size,
        projectIssues,
      },
      sessions: {
        created: sessionsCreated,
        reused: sessionsReused,
        updated: sessionsUpdated,
      },
      messages: {
        linkedByMergeMap: linkedMessages.merged,
        linkedByConversation: linkedMessages.generic,
        sequencesAssigned,
      },
      events: linkedEvents,
      verification,
      reportPath,
    };

    await client.query(
      `insert into public.pierrot_history_migration_runs
         (owner_user_id, status, report, completed_at)
       values ($1::uuid, $2, $3::jsonb, now())`,
      [
        ownerIds.length === 1 ? ownerIds[0] : null,
        apply ? 'applied' : 'dry_run',
        JSON.stringify(report),
      ]
    );

    if (apply) {
      await client.query('commit');
      committed = true;
    } else {
      await client.query('rollback');
    }

    if (!fs.existsSync(path.dirname(reportPath))) {
      fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    }
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    const summary = {
      mode: report.mode,
      schemaApplied,
      classification: report.classification,
      histories: report.histories,
      sessions: report.sessions,
      messages: report.messages,
      events: report.events,
      no_data_loss: verification.no_data_loss,
      one_main_per_owner: verification.one_main_per_owner,
      owner_messages_without_history: verification.owner_messages_without_history,
      duplicate_history_sequences: verification.duplicate_history_sequences.length,
      unresolved: verification.unresolved,
      reportPath,
    };
    console.log(JSON.stringify(summary, null, 2));

    if (!verification.no_data_loss) {
      throw new Error('Data preservation check failed; transaction was rolled back.');
    }
  } catch (error) {
    if (!committed) {
      await client.query('rollback').catch(() => undefined);
    }
    console.error(error instanceof Error ? error.stack || error.message : error);
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => undefined);
  }
}

main();
