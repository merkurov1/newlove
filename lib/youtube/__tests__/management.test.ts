/** @jest-environment node */

import {
  YOUTUBE_MANAGEMENT_ACTIONS,
  addVideoToPlaylist,
  assertManagementScope,
  createPlaylist,
  deleteCaption,
  deleteComment,
  deletePlaylist,
  listCaptions,
  listComments,
  listPlaylists,
  moderateComment,
  removeVideoFromPlaylist,
  replyToComment,
  requiredScopeForAction,
  setVideoThumbnail,
  updateCaption,
  updatePlaylist,
  updateVideoMetadata,
  uploadCaption,
  uploadVideo,
} from '../management';
import { YOUTUBE_FORCE_SSL_SCOPE, YOUTUBE_UPLOAD_SCOPE } from '../config';
import { YouTubeError } from '../types';

type Call = { url: string; init: RequestInit };

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

function recorder(handlers: Array<(call: Call) => Response>) {
  const calls: Call[] = [];
  const fetchImpl = jest.fn(async (url: string, init?: RequestInit) => {
    const call = { url, init: init ?? {} };
    calls.push(call);
    const handler = handlers.shift();
    if (!handler) throw new Error(`Unexpected request: ${url}`);
    return handler(call);
  });

  return { calls, fetchImpl };
}

const auth = (fetchImpl: jest.Mock) => ({
  accessToken: 'management-access-token',
  fetchImpl: fetchImpl as never,
});

const video = {
  id: 'TmC6Lr5K4R8',
  snippet: { title: 'Title', publishedAt: '2026-11-01T00:00:00.000Z' },
  status: { privacyStatus: 'private' },
};

describe('YouTube management capability scopes', () => {
  it('maps every action to the least-privilege scope', () => {
    expect(requiredScopeForAction('video.upload')).toBe(YOUTUBE_UPLOAD_SCOPE);
    expect(requiredScopeForAction('playlist.create')).toBe(YOUTUBE_UPLOAD_SCOPE);
    expect(requiredScopeForAction('comment.reply')).toBe(YOUTUBE_FORCE_SSL_SCOPE);
    expect(requiredScopeForAction('caption.upload')).toBe(YOUTUBE_FORCE_SSL_SCOPE);

    expect(() => assertManagementScope('video.upload', [YOUTUBE_FORCE_SSL_SCOPE])).toThrow(
      YouTubeError
    );
    expect(() => assertManagementScope('video.upload', [YOUTUBE_UPLOAD_SCOPE])).not.toThrow();
  });

  it('catalogues destructive actions separately from ordinary writes', () => {
    expect(YOUTUBE_MANAGEMENT_ACTIONS['video.upload'].write).toBe(true);
    expect(YOUTUBE_MANAGEMENT_ACTIONS['video.upload'].destructive).toBe(false);
    expect(YOUTUBE_MANAGEMENT_ACTIONS['comment.delete'].destructive).toBe(true);
    expect(YOUTUBE_MANAGEMENT_ACTIONS['playlist.delete'].destructive).toBe(true);
    expect(YOUTUBE_MANAGEMENT_ACTIONS['comment.list'].write).toBe(false);
  });
});

describe('YouTube management writes', () => {
  it('uploads a resumable video and returns its id', async () => {
    const { calls, fetchImpl } = recorder([
      () =>
        new Response(null, {
          status: 200,
          headers: { location: 'https://upload.example/video-session' },
        }),
      () => jsonResponse(video),
    ]);

    const result = await uploadVideo(auth(fetchImpl), {
      title: 'UNFRAMED — Episode',
      description: 'Private draft',
      privacyStatus: 'private',
      mimeType: 'video/mp4',
      bytes: new Uint8Array([1, 2, 3]),
    });

    expect(result).toMatchObject({ videoId: 'TmC6Lr5K4R8', privacyStatus: 'private' });
    expect(calls[0].url).toContain('uploadType=resumable&part=snippet,status');
    expect(calls[0].url).toContain('youtube/v3/videos');
    expect(calls[0].init.method).toBe('POST');
    expect(calls[0].init.headers).toMatchObject({
      Authorization: 'Bearer management-access-token',
      'X-Upload-Content-Type': 'video/mp4',
    });
    expect(calls[1].url).toBe('https://upload.example/video-session');
    expect(calls[1].init.method).toBe('PUT');
  });

  it('updates metadata, sets a thumbnail and manages playlists', async () => {
    const { calls, fetchImpl } = recorder([
      () => jsonResponse(video),
      () => jsonResponse({ items: [{ default: 'https://img.example/t.jpg' }] }),
      () =>
        jsonResponse({
          id: 'PL1',
          snippet: { title: 'UNFRAMED' },
          status: { privacyStatus: 'public' },
        }),
      () => jsonResponse({ id: 'PL1', snippet: { title: 'Updated' } }),
      () => new Response(null, { status: 204 }),
      () => jsonResponse({ id: 'PLI1' }),
      () => new Response(null, { status: 204 }),
      () =>
        jsonResponse({
          items: [
            { id: 'PL1', snippet: { title: 'UNFRAMED' }, status: { privacyStatus: 'public' } },
          ],
        }),
    ]);
    const client = auth(fetchImpl);

    await updateVideoMetadata(client, {
      videoId: 'TmC6Lr5K4R8',
      title: 'New title',
      privacyStatus: 'unlisted',
    });
    await setVideoThumbnail(client, {
      videoId: 'TmC6Lr5K4R8',
      mimeType: 'image/jpeg',
      bytes: new Uint8Array([9, 9]),
    });
    await createPlaylist(client, { title: 'UNFRAMED', privacyStatus: 'public' });
    await updatePlaylist(client, { playlistId: 'PL1', title: 'Updated' });
    await deletePlaylist(client, { playlistId: 'PL1' });
    await addVideoToPlaylist(client, { playlistId: 'PL1', videoId: 'TmC6Lr5K4R8' });
    await removeVideoFromPlaylist(client, { playlistItemId: 'PLI1' });
    const listed = await listPlaylists(client);

    expect(calls[0].url).toContain('/videos?part=snippet,status');
    expect(calls[0].init.method).toBe('PUT');
    expect(calls[1].url).toContain('/thumbnails/set?videoId=TmC6Lr5K4R8');
    expect(calls[4].init.method).toBe('DELETE');
    expect(calls[5].url).toContain('/playlistItems?part=snippet');
    expect(listed[0]).toMatchObject({ playlistId: 'PL1', title: 'UNFRAMED' });
  });

  it('lists, replies to, moderates and deletes comments', async () => {
    const { calls, fetchImpl } = recorder([
      () =>
        jsonResponse({
          items: [
            {
              id: 'thread-1',
              snippet: {
                topLevelComment: {
                  id: 'comment-1',
                  snippet: {
                    authorDisplayName: 'Viewer',
                    textOriginal: 'Hello',
                    publishedAt: '2026-11-01T00:00:00.000Z',
                  },
                },
              },
            },
          ],
        }),
      () => jsonResponse({ id: 'reply-1', snippet: { textOriginal: 'Thanks' } }),
      () => new Response(null, { status: 204 }),
      () => new Response(null, { status: 204 }),
    ]);
    const client = auth(fetchImpl);

    const comments = await listComments(client, { videoId: 'TmC6Lr5K4R8' });
    await replyToComment(client, { parentCommentId: 'comment-1', text: 'Thanks' });
    await moderateComment(client, { commentId: 'comment-1', moderationStatus: 'heldForReview' });
    await deleteComment(client, { commentId: 'comment-1' });

    expect(comments[0]).toMatchObject({ commentId: 'comment-1', text: 'Hello' });
    expect(calls[1].url).toContain('/comments?part=snippet');
    expect(calls[2].url).toContain('moderationStatus=heldForReview');
    expect(calls[3].init.method).toBe('DELETE');
  });

  it('lists, uploads, updates and deletes captions', async () => {
    const { calls, fetchImpl } = recorder([
      () =>
        jsonResponse({
          items: [
            {
              id: 'cap-1',
              snippet: { videoId: 'TmC6Lr5K4R8', language: 'ru', name: 'Русский' },
            },
          ],
        }),
      () =>
        jsonResponse({
          id: 'cap-2',
          snippet: { videoId: 'TmC6Lr5K4R8', language: 'en', name: 'English' },
        }),
      () => new Response(null, { status: 204 }),
      () => new Response(null, { status: 204 }),
    ]);
    const client = auth(fetchImpl);

    const captions = await listCaptions(client, { videoId: 'TmC6Lr5K4R8' });
    await uploadCaption(client, {
      videoId: 'TmC6Lr5K4R8',
      language: 'en',
      name: 'English',
      bytes: new TextEncoder().encode('WEBVTT'),
    });
    await updateCaption(client, { captionId: 'cap-2', name: 'English (edited)' });
    await deleteCaption(client, { captionId: 'cap-2' });

    expect(captions[0]).toMatchObject({ captionId: 'cap-1', language: 'ru' });
    expect(calls[0].url).toContain('/captions?part=snippet&videoId=');
    expect(calls[1].url).toContain('uploadType=multipart');
    expect(
      String(
        calls[1].init.headers && (calls[1].init.headers as Record<string, string>)['Content-Type']
      )
    ).toContain('multipart/related');
    expect(calls[3].init.method).toBe('DELETE');
  });

  it('never leaks the access token in a management error', async () => {
    const { fetchImpl } = recorder([
      () =>
        new Response(
          JSON.stringify({
            error: {
              code: 403,
              message: 'The request cannot be completed because you have exceeded your quota.',
              errors: [{ reason: 'quotaExceeded' }],
            },
          }),
          { status: 403 }
        ),
    ]);

    await expect(
      updateVideoMetadata(auth(fetchImpl), {
        videoId: 'TmC6Lr5K4R8',
        title: 'New title',
      })
    ).rejects.toMatchObject<YouTubeError>({ code: 'quota_exceeded' });

    try {
      await updateVideoMetadata(auth(fetchImpl), {
        videoId: 'TmC6Lr5K4R8',
        title: 'New title',
      });
    } catch (error) {
      expect(JSON.stringify(error)).not.toContain('management-access-token');
    }
  });

  it('rejects missing auth and invalid input before calling YouTube', async () => {
    const fetchImpl = jest.fn();

    await expect(
      uploadVideo(
        { accessToken: '', fetchImpl: fetchImpl as never },
        { title: 'x', bytes: new Uint8Array([1]) }
      )
    ).rejects.toMatchObject({ code: 'needs_reauthorization' });

    await expect(
      updateVideoMetadata(auth(fetchImpl as never), {
        videoId: 'not a valid id!',
        title: 'x',
      })
    ).rejects.toMatchObject({ code: 'invalid_request' });

    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
