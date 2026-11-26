/** @jest-environment node */

import { recordYouTubeManagementAudit } from '../managementAudit';

function storeWithInsert(insert: jest.Mock) {
  return { from: jest.fn(() => ({ insert })) } as never;
}

describe('YouTube management audit', () => {
  it('records actor, project, channel, video, status and changed field names only', async () => {
    const insert = jest.fn(async () => ({ error: null }));

    await recordYouTubeManagementAudit(storeWithInsert(insert), {
      userId: 'owner-1',
      project: 'art-engine',
      action: 'video.metadata.update',
      status: 'completed',
      channelId: 'UC_art',
      targetId: 'TmC6Lr5K4R8',
      changedFields: ['title', 'tags'],
      resultSummary: 'updated 2 field(s); preserved 3',
    });

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        actor_id: 'owner-1',
        project: 'art-engine',
        action: 'video.metadata.update',
        status: 'completed',
        channel_id: 'UC_art',
        target_id: 'TmC6Lr5K4R8',
        changed_fields: ['title', 'tags'],
        result_summary: 'updated 2 field(s); preserved 3',
        destructive: false,
        external: true,
      })
    );

    const payload = insert.mock.calls[0][0];
    expect(JSON.stringify(payload)).not.toMatch(/description|access_token|refresh_token/i);
  });

  it('never fails the operation when audit persistence is unavailable', async () => {
    const insert = jest.fn(async () => {
      throw new Error('db down');
    });

    await expect(
      recordYouTubeManagementAudit(storeWithInsert(insert), {
        userId: 'owner-1',
        project: 'pierrot',
        action: 'video.metadata.update',
        status: 'failed',
        errorCode: 'upstream_error',
      })
    ).resolves.toBeUndefined();
  });
});
