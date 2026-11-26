/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';

import { checkYouTubeMultichannelSchema, youtubeMultichannelSchemaReady } from '../channels';

type TableResult = { error?: { code?: string; message?: string } | null } | Error;

function fakeStore(results: Record<string, TableResult>) {
  return {
    from(table: string) {
      return {
        select() {
          return {
            async limit() {
              const result = results[table] ?? { error: null };
              if (result instanceof Error) throw result;
              return { data: [], error: result.error ?? null };
            },
          };
        },
      };
    },
  } as unknown as Parameters<typeof checkYouTubeMultichannelSchema>[0];
}

const TABLES = ['youtube_oauth_connections', 'youtube_channels', 'youtube_project_bindings'];

describe('multi-channel YouTube schema readiness', () => {
  it('is ready when every table exists and the service role can select', async () => {
    const status = await checkYouTubeMultichannelSchema(
      fakeStore(Object.fromEntries(TABLES.map((table) => [table, { error: null }])))
    );

    expect(status).toEqual({
      ready: true,
      reason: 'ready',
      missingTables: [],
      code: null,
    });
  });

  it('names every missing table exposed by PostgREST', async () => {
    const status = await checkYouTubeMultichannelSchema(
      fakeStore({
        youtube_oauth_connections: { error: null },
        youtube_channels: {
          error: { code: 'PGRST205', message: 'Could not find the table in schema cache' },
        },
        youtube_project_bindings: {
          error: {
            code: '42P01',
            message: 'relation "public.youtube_project_bindings" does not exist',
          },
        },
      })
    );

    expect(status.ready).toBe(false);
    expect(status.reason).toBe('missing_tables');
    expect(status.missingTables).toEqual(['youtube_channels', 'youtube_project_bindings']);
    expect(status.code).toBe('PGRST205');
  });

  it('is not ready when the service role cannot select even though tables exist', async () => {
    const status = await checkYouTubeMultichannelSchema(
      fakeStore({
        youtube_oauth_connections: {
          error: { code: '42501', message: 'permission denied for table' },
        },
        youtube_channels: { error: null },
        youtube_project_bindings: { error: null },
      })
    );

    expect(status.ready).toBe(false);
    expect(status.reason).toBe('database_error');
    expect(status.missingTables).toEqual([]);
    expect(status.code).toBe('42501');
  });

  it('treats a thrown client/network failure as not ready', async () => {
    const status = await checkYouTubeMultichannelSchema(
      fakeStore({
        youtube_oauth_connections: new Error('fetch failed'),
        youtube_channels: { error: null },
        youtube_project_bindings: { error: null },
      })
    );

    expect(status.ready).toBe(false);
    expect(status.reason).toBe('database_error');
  });

  it('keeps the boolean wrapper compatible with existing callers', async () => {
    await expect(youtubeMultichannelSchemaReady(fakeStore({}))).resolves.toBe(true);

    await expect(
      youtubeMultichannelSchemaReady(
        fakeStore({
          youtube_oauth_connections: {
            error: { code: 'PGRST205', message: 'table missing' },
          },
        })
      )
    ).resolves.toBe(false);
  });
});
