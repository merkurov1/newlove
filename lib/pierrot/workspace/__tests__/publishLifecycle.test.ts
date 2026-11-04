import {
  FLOW_UNDO_WINDOW_MS,
  beginDraftCreation,
  beginPublishing,
  cancelPublishing,
  canExpire,
  draftCreated,
  draftCreationFailed,
  initialPublishLifecycle,
  publishingFailed,
  publishingSucceeded,
  remainingMs,
} from '../publishLifecycle';

describe('Flow draft/undo lifecycle', () => {
  it('creates a real draft and arms a 10 second undo window', () => {
    const state = draftCreated('draft-1', 1_000);
    expect(state.phase).toBe('undo');
    expect(state.draftId).toBe('draft-1');
    expect(state.deadline).toBe(1_000 + FLOW_UNDO_WINDOW_MS);
    expect(remainingMs(state, 5_000)).toBe(6_000);
  });

  it('cancels only the undo phase and keeps the draft unpublished', () => {
    const state = draftCreated('draft-1', 1_000);
    const cancelled = cancelPublishing(state);

    expect(cancelled.phase).toBe('cancelled');
    expect(cancelled.deadline).toBeNull();
    expect(beginPublishing(cancelled)).toBe(cancelled);
    expect(publishingSucceeded(cancelled)).toBe(cancelled);
  });

  it('does not publish twice after success', () => {
    const armed = draftCreated('draft-1', 1_000);
    const publishing = beginPublishing(armed);
    const success = publishingSucceeded(publishing);

    expect(success.phase).toBe('published');
    expect(beginPublishing(success)).toBe(success);
  });

  it('expires only after the deadline', () => {
    const state = draftCreated('draft-1', 1_000, 10_000);
    expect(canExpire(state, 10_999)).toBe(false);
    expect(canExpire(state, 11_000)).toBe(true);
  });

  it('keeps the draft id after failed publication so retry is safe', () => {
    const publishing = beginPublishing(draftCreated('draft-1', 1_000));
    const failed = publishingFailed(publishing, 'network');

    expect(failed.phase).toBe('failed');
    expect(failed.draftId).toBe('draft-1');
    expect(failed.error).toBe('network');
    expect(publishingSucceeded(failed)).toBe(failed);
  });

  it('does not fabricate a draft id when creation fails', () => {
    const failed = draftCreationFailed('server');
    expect(failed).toEqual({
      phase: 'failed',
      draftId: null,
      deadline: null,
      error: 'server',
    });
    expect(beginDraftCreation().phase).toBe('creating_draft');
    expect(initialPublishLifecycle().phase).toBe('idle');
  });
});
