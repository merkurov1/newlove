/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';
import fs from 'fs';
import path from 'path';

const moduleDir = path.join(process.cwd(), 'lib', 'pierrot', 'personalAssistant');

const sources = fs
  .readdirSync(moduleDir)
  .filter((file) => file.endsWith('.ts'))
  .map((file) => ({
    file,
    content: fs.readFileSync(path.join(moduleDir, file), 'utf8'),
  }));

describe('personal assistant isolation', () => {
  it('never imports or queries owner, Brain, project or decision stores', () => {
    const forbidden = [
      'pierrot_decisions',
      'pierrot_conversations',
      'pierrot_projects',
      'brain_documents',
      'brain_chunks',
      'retrieveBrainEvidence',
      'retrieveUnframedEvidence',
      'createPierrotStore',
      'pierrot_owner',
    ];

    for (const source of sources) {
      for (const token of forbidden) {
        expect({ file: source.file, token, found: source.content.includes(token) }).toEqual({
          file: source.file,
          token,
          found: false,
        });
      }
    }
  });

  it('only names its own profile-scoped tables', () => {
    const storeSource = sources.find((source) => source.file === 'store.ts');
    expect(storeSource).toBeDefined();

    expect(storeSource?.content).toContain("'pierrot_assistant_profiles'");
    expect(storeSource?.content).toContain("'pierrot_assistant_messages'");
    expect(storeSource?.content).toContain("'pierrot_assistant_memories'");
    expect(storeSource?.content).not.toMatch(/'pierrot_(?:messages|conversations|events)'/);
  });

  it('owner stores have no reference to the personal assistant tables', () => {
    const ownerSources = [
      'lib/pierrot/serverStore.ts',
      'lib/pierrot/memory/store.ts',
      'lib/pierrot/projects/store.ts',
      'lib/pierrot/context/store.ts',
    ];

    for (const file of ownerSources) {
      const content = fs.readFileSync(path.join(process.cwd(), file), 'utf8');
      expect({ file, found: content.includes('pierrot_assistant') }).toEqual({
        file,
        found: false,
      });
    }
  });
});
