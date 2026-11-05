/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';
import { FakeSupabase, OWNER_ID } from '@/lib/pierrot/memory/testSupport/fakeSupabase';
import {
  approveSkill,
  buildSkillsContext,
  createSkillDraft,
  createSkillVersion,
  disableSkill,
  listSkills,
  restoreSkillVersion,
  testSkill,
} from '../store';
import { suggestSkillDraft } from '../suggest';
import type { SkillDefinition } from '../types';

function definition(overrides: Partial<SkillDefinition> = {}): SkillDefinition {
  return {
    name: 'Weekly studio review',
    description: 'Review the week and decide the next three moves.',
    purpose: 'Turn scattered notes into an honest weekly plan.',
    conditions: ['When the owner asks for a weekly review.'],
    inputs: ['Current projects and open tasks.'],
    steps: ['Collect current projects', 'List open tasks', 'Propose three next moves'],
    tools: ['memory.search'],
    constraints: ['Read-only; owner authorization is required.'],
    expectedResult: 'Three concrete next moves with reasons.',
    tests: [{ name: 'empty memory', expected: 'Reports insufficient material.' }],
    examples: [],
    ...overrides,
  };
}

describe('Skill Foundry', () => {
  it('creates a draft, tests it, approves it and exposes it to Pierrot', async () => {
    const db = new FakeSupabase();
    const store = db.asClient();

    const draft = await createSkillDraft(store, OWNER_ID, { definition: definition() });
    expect(draft.status).toBe('draft');
    expect(draft.currentVersion?.version).toBe(1);

    const run = await testSkill(store, OWNER_ID, draft.id);
    expect(run.status).toBe('passed');

    await expect(approveSkill(store, OWNER_ID, draft.id)).resolves.toMatchObject({
      status: 'active',
    });

    const context = await buildSkillsContext(store, OWNER_ID, 'weekly review of the studio');
    expect(context).toContain('APPROVED SKILLS');
    expect(context).toContain('Weekly studio review');
    expect(context).toContain('Conditions:');
    expect(context).toContain('owner authorization is required');
  });

  it('refuses approval before a passing control test', async () => {
    const db = new FakeSupabase();
    const store = db.asClient();

    const draft = await createSkillDraft(store, OWNER_ID, { definition: definition() });

    await expect(approveSkill(store, OWNER_ID, draft.id)).rejects.toThrow('skill_test_required');
  });

  it('versions without silently replacing the tested version', async () => {
    const db = new FakeSupabase();
    const store = db.asClient();

    const draft = await createSkillDraft(store, OWNER_ID, { definition: definition() });
    await testSkill(store, OWNER_ID, draft.id);
    const approved = await approveSkill(store, OWNER_ID, draft.id);
    const v1 = approved.currentVersionId;

    const v2 = await createSkillVersion(store, OWNER_ID, draft.id, {
      definition: definition({
        name: 'Weekly studio review',
        description: 'A revised procedure.',
      }),
      changelog: 'Add an explicit evidence check',
    });

    expect(v2.currentVersion?.version).toBe(2);
    expect(v2.status).toBe('draft');
    expect(v2.currentVersionId).not.toBe(v1);

    await testSkill(store, OWNER_ID, draft.id);
    const v2Approved = await approveSkill(store, OWNER_ID, draft.id);
    expect(v2Approved.currentVersion?.version).toBe(2);

    const rolledBack = await restoreSkillVersion(store, OWNER_ID, draft.id, v1 || '');
    expect(rolledBack.currentVersionId).toBe(v1);
    expect(rolledBack.currentVersion?.version).toBe(1);
    expect(rolledBack.versions).toHaveLength(2);
  });

  it('disables a skill and removes it from active matching', async () => {
    const db = new FakeSupabase();
    const store = db.asClient();

    const draft = await createSkillDraft(store, OWNER_ID, { definition: definition() });
    await testSkill(store, OWNER_ID, draft.id);
    await approveSkill(store, OWNER_ID, draft.id);

    const disabled = await disableSkill(store, OWNER_ID, draft.id);
    expect(disabled.status).toBe('disabled');
    expect(await listSkills(store, OWNER_ID, { status: 'active' })).toEqual([]);
    expect(await buildSkillsContext(store, OWNER_ID, 'weekly review')).toBeNull();
  });

  it('fails a skill that tries to bypass approval or run unbounded loops', async () => {
    const db = new FakeSupabase();
    const store = db.asClient();

    const draft = await createSkillDraft(store, OWNER_ID, {
      definition: definition({
        steps: ['while (true) keep going', 'Deploy to production'],
        tools: ['deploy production'],
        constraints: ['No approval needed.'],
      }),
    });

    const run = await testSkill(store, OWNER_ID, draft.id);
    expect(run.status).toBe('failed');
    expect(run.checks.find((check) => check.name === 'dangerous_tools_guarded')?.passed).toBe(
      false
    );
    expect(run.checks.find((check) => check.name === 'bounded_steps')?.passed).toBe(false);

    await expect(approveSkill(store, OWNER_ID, draft.id)).rejects.toThrow('skill_test_required');
  });

  it('detects a repeated procedure in memory and prepares a draft without creating it', async () => {
    const db = new FakeSupabase();
    const store = db.asClient();
    const now = new Date().toISOString();

    db.seed(
      'pierrot_decisions',
      [1, 2, 3].map((index) => ({
        id: `00000000-0000-4000-8000-00000000000${index}`,
        user_id: OWNER_ID,
        kind: 'task',
        title: `Подготовить еженедельный обзор студии ${index}`,
        content: 'Собрать проекты, открытые задачи и решения, затем предложить три следующих шага.',
        status: 'current',
        project: 'Studio',
        importance: 0.6,
        confidence: 0.8,
        tags: [],
        source_refs: [],
        created_at: now,
        updated_at: now,
        valid_from: now,
      }))
    );

    const suggestion = await suggestSkillDraft(store, OWNER_ID);
    expect(suggestion.available).toBe(true);
    expect(suggestion.suggestion?.definition.name).toContain('Повторяемая процедура');
    expect(suggestion.suggestion?.definition.steps.length).toBeGreaterThanOrEqual(2);
    expect(suggestion.suggestion?.definition.tests.length).toBeGreaterThan(0);

    // Detection does not persist a skill.
    expect(db.all('pierrot_skills')).toHaveLength(0);
  });

  it('does not invent a skill from a single record', async () => {
    const db = new FakeSupabase();
    const store = db.asClient();
    db.seed('pierrot_decisions', [
      {
        id: '00000000-0000-4000-8000-000000000099',
        user_id: OWNER_ID,
        kind: 'task',
        title: 'Один раз собрать обзор',
        content: 'Единственная запись, повторения нет.',
        status: 'current',
        importance: 0.6,
        confidence: 0.8,
        tags: [],
        source_refs: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ]);

    const suggestion = await suggestSkillDraft(store, OWNER_ID);
    expect(suggestion.available).toBe(false);
    expect(suggestion.reason).toBe('not_enough_repetition');
  });

  it('does not leak skills between users', async () => {
    const db = new FakeSupabase();
    const store = db.asClient();

    await createSkillDraft(store, OWNER_ID, { definition: definition() });
    expect(await listSkills(store, '22222222-2222-4222-8222-222222222222', { limit: 20 })).toEqual(
      []
    );
  });
});
