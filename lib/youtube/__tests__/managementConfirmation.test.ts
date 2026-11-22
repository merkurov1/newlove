/** @jest-environment node */

import {
  createManagementConfirmation,
  describeManagementAction,
  managementActionHash,
  verifyManagementConfirmation,
} from '../managementConfirmation';

const originalEnv = { ...process.env };

beforeEach(() => {
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-secret';
});

afterAll(() => {
  process.env = originalEnv;
});

describe('YouTube management confirmation', () => {
  it('requires an explicit token bound to owner, action, project and params', () => {
    const params = { videoId: 'TmC6Lr5K4R8', title: 'Public title' };
    const { token } = createManagementConfirmation({
      userId: 'owner-1',
      action: 'video.update',
      params,
      project: 'unframed',
    });

    expect(() =>
      verifyManagementConfirmation({
        token,
        userId: 'owner-1',
        action: 'video.update',
        params,
        project: 'unframed',
      })
    ).not.toThrow();

    expect(() =>
      verifyManagementConfirmation({
        token,
        userId: 'visitor',
        action: 'video.update',
        params,
        project: 'unframed',
      })
    ).toThrow(/invalid or has expired/);

    expect(() =>
      verifyManagementConfirmation({
        token,
        userId: 'owner-1',
        action: 'video.update',
        params: { ...params, title: 'Changed after preview' },
        project: 'unframed',
      })
    ).toThrow(/invalid or has expired/);

    expect(() =>
      verifyManagementConfirmation({
        token,
        userId: 'owner-1',
        action: 'video.update',
        params,
        project: 'pierrot',
      })
    ).toThrow(/invalid or has expired/);
  });

  it('rejects missing, malformed and expired confirmations', () => {
    expect(() =>
      verifyManagementConfirmation({
        token: null,
        userId: 'owner-1',
        action: 'video.upload',
        params: {},
        project: 'pierrot',
      })
    ).toThrow(/Explicit owner confirmation/);

    expect(() =>
      verifyManagementConfirmation({
        token: 'not-a-token',
        userId: 'owner-1',
        action: 'video.upload',
        params: {},
        project: 'pierrot',
      })
    ).toThrow(/invalid or has expired/);

    const expired = createManagementConfirmation({
      userId: 'owner-1',
      action: 'video.upload',
      params: {},
      project: 'pierrot',
      now: Date.now() - 60 * 60 * 1000,
    });

    expect(() =>
      verifyManagementConfirmation({
        token: expired.token,
        userId: 'owner-1',
        action: 'video.upload',
        params: {},
        project: 'pierrot',
      })
    ).toThrow(/invalid or has expired/);
  });

  it('does not put file bytes or private content into the action hash', () => {
    const first = managementActionHash('video.upload', {
      title: 'Public title',
      bytes: new Uint8Array([1, 2, 3]),
    });
    const second = managementActionHash('video.upload', {
      title: 'Public title',
      bytes: new Uint8Array([9, 9, 9]),
    });

    expect(first).toBe(second);
  });

  it('marks destructive and externally visible actions in the preview', () => {
    expect(
      describeManagementAction({
        action: 'comment.delete',
        params: { commentId: 'c1' },
        project: 'pierrot',
      })
    ).toMatchObject({
      requiresConfirmation: true,
      destructive: true,
      externallyVisible: true,
      target: 'c1',
    });

    expect(
      describeManagementAction({
        action: 'comment.list',
        params: { videoId: 'TmC6Lr5K4R8' },
        project: 'unframed',
      }).requiresConfirmation
    ).toBe(false);
  });
});
