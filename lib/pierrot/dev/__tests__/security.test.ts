/** @jest-environment node */

jest.mock('@octokit/rest', () => ({
  Octokit: class Octokit {},
}));

import fs from 'fs';
import path from 'path';
import { DEV_TOOL_NAMES, devToolDefinitions, isDevWriteTool } from '../tools';
import { PIERROT_DEV_SYSTEM_PROMPT } from '../prompt';

const root = path.resolve(__dirname, '../../../..');

describe('Dev Mode security boundary', () => {
  it('exposes exactly the read-only tool set', () => {
    const definitions = devToolDefinitions();
    const names = definitions.map((tool) => tool.function.name);

    expect(names).toEqual([...DEV_TOOL_NAMES]);
    expect(names).toHaveLength(13);
    expect(names).not.toContain('create_or_update_file');
    expect(names).not.toContain('create_pull_request');
    expect(isDevWriteTool('create_or_update_file')).toBe(true);
    expect(isDevWriteTool('read_file')).toBe(false);
  });

  it('does not promise write capabilities in the system prompt', () => {
    expect(PIERROT_DEV_SYSTEM_PROMPT).toContain('read-only GitHub tools');
    expect(PIERROT_DEV_SYSTEM_PROMPT).toMatch(/no write tool|You do not write code/i);
    expect(PIERROT_DEV_SYSTEM_PROMPT).not.toContain(
      'create_or_update_file(path, content, message, branch)'
    );
  });

  it('keeps the investigation workflow narrow and evidence-based', () => {
    expect(PIERROT_DEV_SYSTEM_PROMPT).toContain('search_repo');
    expect(PIERROT_DEV_SYSTEM_PROMPT).toContain('4–8 tool calls');
    expect(PIERROT_DEV_SYSTEM_PROMPT).toContain('Do not perform a whole-project audit');
    expect(PIERROT_DEV_SYSTEM_PROMPT).toContain('Never invent line numbers');
    expect(PIERROT_DEV_SYSTEM_PROMPT).toContain('<DEV_DIAGNOSIS>');
    expect(PIERROT_DEV_SYSTEM_PROMPT).toContain('OpenCode');
  });

  it('reports missing GitHub access before calling the model', () => {
    const route = fs.readFileSync(path.join(root, 'app/api/admin/pierrot/dev/route.ts'), 'utf8');

    expect(route).toContain('DEV_GITHUB_UNAVAILABLE');
    expect(route.indexOf('DEV_GITHUB_UNAVAILABLE')).toBeLessThan(route.indexOf('callDevModel({'));
  });

  it('keeps the example configuration read-only', () => {
    const env = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
    expect(env).toContain('PIERROT_DEV_WRITE_ENABLED=false');
    expect(env).not.toContain('PIERROT_DEV_WRITE_ENABLED=true');
  });

  it('declares RLS and service-role-only access for new tables', () => {
    const sql = fs.readFileSync(
      path.join(root, 'migrations/2026-11-18_pierrot_dev_engineering.sql'),
      'utf8'
    );

    expect(sql).toContain('ALTER TABLE public.pierrot_dev_prompts ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('ALTER TABLE public.pierrot_dev_requests ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain(
      'REVOKE ALL ON TABLE public.pierrot_dev_prompts FROM PUBLIC, anon, authenticated'
    );
    expect(sql).toContain(
      'REVOKE ALL ON TABLE public.pierrot_dev_requests FROM PUBLIC, anon, authenticated'
    );
    expect(sql).toContain('GRANT ALL ON TABLE public.pierrot_dev_requests TO service_role');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS title');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS pull_requests');
    expect(sql).not.toMatch(/DROP\s+TABLE/i);
    expect(sql).not.toMatch(/DROP\s+COLUMN/i);
  });

  it('requires an admin request for the Dev API routes', () => {
    const route = fs.readFileSync(path.join(root, 'app/api/admin/pierrot/dev/route.ts'), 'utf8');
    const tasksRoute = fs.readFileSync(
      path.join(root, 'app/api/admin/pierrot/dev/tasks/route.ts'),
      'utf8'
    );
    const reviewRoute = fs.readFileSync(
      path.join(root, 'app/api/admin/pierrot/dev/review/route.ts'),
      'utf8'
    );

    for (const source of [route, tasksRoute, reviewRoute]) {
      expect(source).toContain('requireAdminFromRequest');
      expect(source).toContain('401');
    }
  });
});
