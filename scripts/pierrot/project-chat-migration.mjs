#!/usr/bin/env node
/**
 * Reviewed project-chat history merge.
 *
 * SAFE DEFAULT: dry run. No writes happen unless --apply is passed.
 *
 * Usage:
 *   SUPABASE_DB_URL=postgres://... node scripts/pierrot/project-chat-migration.mjs
 *   SUPABASE_DB_URL=postgres://... node scripts/pierrot/project-chat-migration.mjs --apply
 *   ... --project=<uuid|slug>       limit to one project
 *   ... --owner=<uuid>              limit to one owner
 *   ... --json                      machine-readable output
 *   ... --restore-run=<uuid>        restore the previous structure from a run map
 *
 * The script:
 *   1. picks the project's canonical conversation when set, otherwise the
 *      oldest linked conversation (chronology-preserving; reported explicitly);
 *   2. moves messages into the target and assigns one continuous
 *      message_index sequence;
 *   3. keeps every conversation row and every event untouched;
 *   4. stores a before/after mapping and a full row backup for rollback;
 *   5. is transaction-per-project and idempotent via the mapping table.
 */

import pg from 'pg';

const { Client } = pg;

function arg(name, fallback = null) {
  const prefix = `--${name}=`;
  const found = process.argv.find((value) => value.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

const apply = process.argv.includes('--apply');
const json = process.argv.includes('--json');
const projectFilter = arg('project');
const ownerFilter = arg('owner');
const restoreRun = arg('restore-run');
const connectionString =
  process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || process.env.POSTGRES_URL;

if (!connectionString) {
  console.error(
    'SUPABASE_DB_URL (or DATABASE_URL / POSTGRES_URL) is required. This script never guesses credentials.'
  );
  process.exit(2);
}

const client = new Client({
  connectionString,
  ssl: connectionString.includes('localhost') ? false : { rejectUnauthorized: false },
});

function text(value) {
  return typeof value === 'string' ? value : '';
}

function duplicateKey(row) {
  const createdAt = row.created_at ? new Date(row.created_at).toISOString().slice(0, 19) : '';
  return `${row.role}\u0000${createdAt}\u0000${String(row.content).replace(/\s+/g, ' ').trim()}`;
}

function compareMessages(left, right) {
  const leftTime = left.created_at ? new Date(left.created_at).getTime() : Number.MAX_SAFE_INTEGER;
  const rightTime = right.created_at ? new Date(right.created_at).getTime() : Number.MAX_SAFE_INTEGER;
  if (leftTime !== rightTime) return leftTime - rightTime;
  if (left.message_index !== right.message_index) return left.message_index - right.message_index;
  return String(left.id).localeCompare(String(right.id));
}

function planMerge(targetConversationId, messages) {
  const ordered = [...messages].sort(compareMessages);
  const seen = new Map();
  const assignments = [];
  let nextIndex = 0;
  let duplicates = 0;

  for (const message of ordered) {
    const key = duplicateKey(message);
    if (seen.has(key)) {
      duplicates += 1;
      assignments.push({
        messageId: message.id,
        sourceConversationId: message.conversation_id,
        originalMessageIndex: Number(message.message_index),
        newMessageIndex: null,
        skippedDuplicate: true,
        duplicateOf: seen.get(key),
      });
      continue;
    }

    seen.set(key, message.id);
    nextIndex += 1;
    assignments.push({
      messageId: message.id,
      sourceConversationId: message.conversation_id,
      originalMessageIndex: Number(message.message_index),
      newMessageIndex: nextIndex,
      skippedDuplicate: false,
      duplicateOf: null,
    });
  }

  return {
    targetConversationId,
    messageCountBefore: messages.length,
    messageCountAfter: nextIndex,
    duplicates,
    assignments,
  };
}

async function projectRows() {
  const values = [];
  const filters = [];
  if (projectFilter) {
    values.push(projectFilter);
    filters.push(`(p.id::text = $${values.length} OR p.slug = $${values.length})`);
  }
  if (ownerFilter) {
    values.push(ownerFilter);
    filters.push(`p.owner_user_id = $${values.length}::uuid`);
  }

  const { rows } = await client.query(
    `select p.id, p.owner_user_id, p.slug, p.name, p.conversation_id
       from public.pierrot_projects p
      where true ${filters.length ? `and ${filters.join(' and ')}` : ''}
      order by p.created_at asc`,
    values
  );
  return rows;
}

async function linkedConversations(projectId) {
  const { rows } = await client.query(
    `select l.conversation_id,
            c.started_at,
            count(m.id)::int as message_count,
            min(m.created_at) as first_message_at
       from public.pierrot_project_conversations l
       left join public.pierrot_conversations c on c.id = l.conversation_id
       left join public.pierrot_messages m on m.conversation_id = l.conversation_id
      where l.project_id = $1
      group by l.conversation_id, c.started_at
      order by coalesce(min(m.created_at), c.started_at) asc nulls last`,
    [projectId]
  );
  return rows;
}

async function conversationExists(id) {
  if (!id) return false;
  const { rows } = await client.query('select 1 from public.pierrot_conversations where id = $1', [
    id,
  ]);
  return rows.length > 0;
}

async function buildReport(project) {
  const linked = await linkedConversations(project.id);
  const warnings = [];
  const linkedWithMessages = linked.filter((row) => Number(row.message_count) > 0);

  let target = project.conversation_id || null;
  if (target && !(await conversationExists(target))) {
    warnings.push(`Canonical conversation ${target} no longer exists.`);
    target = null;
  }

  if (!target) {
    const oldest = linkedWithMessages[0] || linked[0];
    target = oldest ? oldest.conversation_id : null;
    if (target && linkedWithMessages.length > 1) {
      warnings.push(
        `Project has ${linkedWithMessages.length} linked chats; the oldest with messages was selected as the merge target. Review this choice before --apply.`
      );
    }
  }

  if (!target) {
    return {
      projectId: project.id,
      project: project.name,
      slug: project.slug,
      ownerUserId: project.owner_user_id,
      targetConversationId: null,
      linkedConversations: linked.length,
      messageCountBefore: 0,
      messageCountAfter: 0,
      duplicates: 0,
      warnings: [...warnings, 'No linked conversation exists; nothing to merge.'],
      needsManualResolution: false,
      noop: true,
    };
  }

  const conversationIds = Array.from(
    new Set([target, ...linked.map((row) => row.conversation_id)])
  );
  const { rows: messages } = await client.query(
    `select id, conversation_id, role, content, message_index, created_at, provider
       from public.pierrot_messages
      where conversation_id = any($1::text[])
      order by created_at asc nulls last, message_index asc, id asc`,
    [conversationIds]
  );

  const plan = planMerge(target, messages);
  const skippedInTarget = plan.assignments.filter(
    (item) => item.skippedDuplicate && item.sourceConversationId === target
  ).length;
  const targetMessageCountAfter = plan.messageCountAfter + skippedInTarget;
  const sourceIds = conversationIds.filter((id) => id !== target);
  const sourceMessageCount = messages.filter((row) => row.conversation_id !== target).length;
  const alreadyContiguous =
    project.conversation_id === target &&
    plan.assignments.every(
      (item) =>
        item.skippedDuplicate ||
        (item.sourceConversationId === target && item.newMessageIndex === item.originalMessageIndex)
    );

  if (linkedWithMessages.length > 1) {
    warnings.push(
      `Messages will be preserved from ${linkedWithMessages.length} linked chats; events and conversation rows remain untouched.`
    );
  }
  if (plan.duplicates > 0) {
    warnings.push(
      `${plan.duplicates} exact duplicate message(s) will stay in their source conversation and be recorded in the mapping instead of being moved.`
    );
  }
  if (sourceIds.length > 0 && sourceMessageCount === 0) {
    warnings.push('Linked source conversations are already empty; only the canonical link will be set.');
  }

  return {
    projectId: project.id,
    project: project.name,
    slug: project.slug,
    ownerUserId: project.owner_user_id,
    previousProjectConversationId: project.conversation_id || null,
    targetConversationId: target,
    sourceConversationIds: sourceIds,
    linkedConversations: linked.length,
    messageCountBefore: plan.messageCountBefore,
    messageCountAfter: targetMessageCountAfter,
    duplicates: plan.duplicates,
    warnings,
    needsManualResolution: linkedWithMessages.length > 1 || plan.duplicates > 0,
    noop: alreadyContiguous,
    plan,
  };
}

async function applyProject(report) {
  const { plan } = report;
  if (!plan || report.noop) {
    return { ...reportWithoutPlan(report), status: 'noop' };
  }

  await client.query('begin');
  try {
    await client.query('select id from public.pierrot_projects where id = $1 for update', [
      report.projectId,
    ]);

    // Re-read after the lock so two operators cannot apply conflicting plans.
    const { rows: currentRows } = await client.query(
      'select conversation_id from public.pierrot_projects where id = $1',
      [report.projectId]
    );
    const currentConversationId = currentRows[0]?.conversation_id || null;
    const { rows: runRows } = await client.query(
      `insert into public.pierrot_project_chat_migrations
         (project_id, owner_user_id, target_conversation_id, status, report)
       values ($1, $2, $3, 'planned', $4::jsonb)
       returning id`,
      [
        report.projectId,
        report.ownerUserId,
        report.targetConversationId,
        JSON.stringify(reportWithoutPlan({ ...report, previousProjectConversationId: currentConversationId })),
      ]
    );
    const runId = runRows[0].id;

    const conversationIds = Array.from(
      new Set([report.targetConversationId, ...(report.sourceConversationIds || [])])
    );

    const originalIds = plan.assignments
      .filter((assignment) => !assignment.skippedDuplicate)
      .map((assignment) => assignment.messageId);
    const { rows: originalRows } = await client.query(
      'select * from public.pierrot_messages where id = any($1::text[])',
      [originalIds]
    );
    const originalById = new Map(originalRows.map((row) => [row.id, row]));

    const { rows: maxRows } = await client.query(
      `select coalesce(max(message_index), 0)::bigint as max_index
         from public.pierrot_messages
        where conversation_id = any($1::text[])`,
      [conversationIds]
    );
    const offset = Number(maxRows[0].max_index) + 1_000_000;

    await client.query(
      `update public.pierrot_messages
          set message_index = message_index + $2
        where conversation_id = any($1::text[])`,
      [conversationIds, offset]
    );

    for (const assignment of plan.assignments) {
      const originalRow = assignment.skippedDuplicate
        ? null
        : originalById.get(assignment.messageId) || null;

      await client.query(
        `insert into public.pierrot_project_chat_merge_map
           (run_id, project_id, owner_user_id, message_id, source_conversation_id,
            target_conversation_id, original_message_index, new_message_index,
            original_row, skipped_duplicate)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10)
         on conflict (message_id) do nothing`,
        [
          runId,
          report.projectId,
          report.ownerUserId,
          assignment.messageId,
          assignment.sourceConversationId,
          report.targetConversationId,
          assignment.originalMessageIndex,
          assignment.newMessageIndex,
          JSON.stringify(originalRow || {}),
          assignment.skippedDuplicate,
        ]
      );

      if (assignment.skippedDuplicate) {
        await client.query(
          `update public.pierrot_messages
              set message_index = $2
            where id = $1`,
          [assignment.messageId, assignment.originalMessageIndex]
        );
      } else {
        await client.query(
          `update public.pierrot_messages
              set conversation_id = $2, message_index = $3
            where id = $1`,
          [assignment.messageId, report.targetConversationId, assignment.newMessageIndex]
        );
      }
    }

    const { rows: stats } = await client.query(
      `select count(*)::int as message_count, max(created_at) as last_message_at
         from public.pierrot_messages
        where conversation_id = $1`,
      [report.targetConversationId]
    );
    if (Number(stats[0].message_count) !== expectedTargetCount(plan, report.targetConversationId)) {
      throw new Error(
        `Post-merge verification failed: target has ${stats[0].message_count} messages, expected ${expectedTargetCount(plan, report.targetConversationId)}.`
      );
    }

    await client.query(
      `update public.pierrot_conversations
          set next_message_sequence = $2,
              last_message_at = $3,
              updated_at = now(),
              expires_at = now() + interval '90 days'
        where id = $1`,
      [report.targetConversationId, stats[0].message_count, stats[0].last_message_at]
    );

    await client.query(
      `update public.pierrot_projects
          set conversation_id = $2, updated_at = now(), last_activity_at = now()
        where id = $1`,
      [report.projectId, report.targetConversationId]
    );

    await client.query(
      `insert into public.pierrot_project_conversations
         (project_id, conversation_id, owner_user_id)
       values ($1,$2,$3)
       on conflict (project_id, conversation_id) do nothing`,
      [report.projectId, report.targetConversationId, report.ownerUserId]
    );

    const finalReport = {
      ...reportWithoutPlan(report),
      previousProjectConversationId: currentConversationId,
      messageCountAfterApply: Number(stats[0].message_count),
      lastMessageAt: stats[0].last_message_at,
      appliedAt: new Date().toISOString(),
    };

    await client.query(
      `update public.pierrot_project_chat_migrations
          set status = 'applied', report = $2::jsonb, completed_at = now()
        where id = $1`,
      [runId, JSON.stringify(finalReport)]
    );

    await client.query('commit');
    return { ...finalReport, runId, status: 'applied' };
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  }
}

function reportWithoutPlan(report) {
  const { plan, ...rest } = report;
  return rest;
}

function expectedTargetCount(plan, targetConversationId) {
  return plan.assignments.filter(
    (assignment) =>
      !assignment.skippedDuplicate || assignment.sourceConversationId === targetConversationId
  ).length;
}

async function restore(runId) {
  const { rows: runRows } = await client.query(
    'select * from public.pierrot_project_chat_migrations where id = $1',
    [runId]
  );
  if (runRows.length === 0) throw new Error(`Run ${runId} not found.`);
  const run = runRows[0];
  const { rows: mapping } = await client.query(
    'select * from public.pierrot_project_chat_merge_map where run_id = $1 order by id asc',
    [runId]
  );

  await client.query('begin');
  try {
    const conversationIds = Array.from(
      new Set([run.target_conversation_id, ...mapping.map((row) => row.source_conversation_id)])
    );
    const { rows: maxRows } = await client.query(
      `select coalesce(max(message_index), 0)::bigint as max_index
         from public.pierrot_messages
        where conversation_id = any($1::text[])`,
      [conversationIds]
    );
    const offset = Number(maxRows[0].max_index) + 1_000_000;
    await client.query(
      `update public.pierrot_messages
          set message_index = message_index + $2
        where conversation_id = any($1::text[])`,
      [conversationIds, offset]
    );

    for (const row of mapping) {
      if (row.skipped_duplicate) continue;
      await client.query(
        `update public.pierrot_messages
            set conversation_id = $2, message_index = $3
          where id = $1`,
        [row.message_id, row.source_conversation_id, row.original_message_index]
      );
    }

    await client.query(
      `update public.pierrot_conversations c
          set next_message_sequence = coalesce(s.max_index, 0),
              last_message_at = s.last_message_at,
              updated_at = now()
         from (
           select conversation_id,
                  max(message_index)::bigint as max_index,
                  max(created_at) as last_message_at
             from public.pierrot_messages
            where conversation_id = any($1::text[])
            group by conversation_id
         ) s
        where c.id = s.conversation_id`,
      [conversationIds]
    );

    const previous = text(run.report?.previousProjectConversationId) || null;
    await client.query(
      `update public.pierrot_projects
          set conversation_id = $2, updated_at = now()
        where id = $1`,
      [run.project_id, previous]
    );
    await client.query(
      `update public.pierrot_project_chat_migrations
          set status = 'rolled_back', completed_at = now()
        where id = $1`,
      [runId]
    );
    await client.query('commit');
    return { runId, status: 'rolled_back', restoredMessages: mapping.length, previous };
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  }
}

async function main() {
  await client.connect();

  const { rows: migrationCheck } = await client.query(
    `select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'pierrot_projects'
        and column_name = 'conversation_id'`
  );
  if (migrationCheck.length === 0) {
    throw new Error(
      'pierrot_projects.conversation_id is missing. Apply 2026-11-24_pierrot_canonical_project_chat.sql first.'
    );
  }

  if (restoreRun) {
    const result = await restore(restoreRun);
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  const projects = await projectRows();
  const reports = [];

  for (const project of projects) {
    const report = await buildReport(project);
    if (apply && !report.noop) {
      const applied = await applyProject(report);
      reports.push(applied);
    } else {
      reports.push(reportWithoutPlan(report));
    }
  }

  const summary = {
    mode: apply ? 'apply' : 'dry-run',
    projects: reports.length,
    needingManualResolution: reports.filter((item) => item.needsManualResolution).length,
    messagesBefore: reports.reduce((sum, item) => sum + (item.messageCountBefore || 0), 0),
    messagesAfter: reports.reduce((sum, item) => sum + (item.messageCountAfter || 0), 0),
    duplicates: reports.reduce((sum, item) => sum + (item.duplicates || 0), 0),
    reports,
  };

  if (json) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(`Mode: ${summary.mode}`);
    console.log(
      `Projects: ${summary.projects}; messages ${summary.messagesBefore} -> ${summary.messagesAfter}; duplicates ${summary.duplicates}`
    );
    console.log(`Needs manual resolution: ${summary.needingManualResolution}`);
    for (const item of reports) {
      console.log(
        `\n- ${item.project} (${item.slug})\n  target: ${item.targetConversationId || '—'}\n  messages: ${item.messageCountBefore} -> ${item.messageCountAfter}\n  status: ${item.status || (item.noop ? 'noop' : 'planned')}`
      );
      for (const warning of item.warnings || []) console.log(`  ! ${warning}`);
    }
    if (!apply) console.log('\nDry run only. Re-run with --apply after reviewing the report.');
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end().catch(() => undefined);
  });
