/** @jest-environment node */
/* eslint-disable @typescript-eslint/no-require-imports */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('@/lib/serverAuth', () => ({
  getCurrentUser: jest.fn(),
  requireAdminFromRequest: jest.fn(async () => {
    throw new Error('not admin');
  }),
}));

jest.mock('@/lib/pierrot/serverStore', () => ({
  createPierrotStore: jest.fn(() => ({ mocked: true })),
}));

jest.mock('@/lib/pierrot/skills/store', () => ({
  listSkills: jest.fn(async () => []),
  getSkill: jest.fn(),
  createSkillDraft: jest.fn(),
}));

const auth = require('@/lib/serverAuth') as {
  getCurrentUser: { mockResolvedValue: (value: unknown) => void };
};
const skills = require('@/lib/pierrot/skills/store') as {
  listSkills: jest.Mock;
};
const { GET } = require('../route') as {
  GET: (request: Request) => Promise<Response>;
};

const ownerId = '11111111-1111-4111-8111-111111111111';

beforeEach(() => {
  jest.clearAllMocks();
  auth.getCurrentUser.mockResolvedValue({
    id: ownerId,
    role: 'ADMIN',
    profile: { role: 'ADMIN' },
  });
});

describe('Skill Foundry API authorization', () => {
  it('rejects a visitor before touching skill storage', async () => {
    auth.getCurrentUser.mockResolvedValue({
      id: ownerId,
      role: 'USER',
      profile: { role: 'USER' },
    });

    const response = await GET(new Request('http://localhost/api/pierrot/skills'));
    expect(response.status).toBe(403);
    expect(skills.listSkills).not.toHaveBeenCalled();
  });

  it('lists skills only for the verified owner', async () => {
    const response = await GET(new Request('http://localhost/api/pierrot/skills?q=review'));
    const json = (await response.json()) as { available: boolean; skills: unknown[] };

    expect(response.status).toBe(200);
    expect(json.available).toBe(true);
    expect(json.skills).toEqual([]);
    expect(skills.listSkills).toHaveBeenCalledWith(
      expect.anything(),
      ownerId,
      expect.objectContaining({ query: 'review' })
    );
  });
});
