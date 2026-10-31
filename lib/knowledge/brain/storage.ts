import { randomUUID } from 'node:crypto';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { RagEnvironment } from '@/lib/knowledge/rag/config';
import type { BrainSourceKind } from './sourceTypes';
import {
  BRAIN_SOURCE_BUCKET,
  BrainSourceError,
  extensionForKind,
  type BrainStorageFormat,
  isIncomingStoragePath,
  sha256Hex,
  sourceObjectPath,
  sourceObjectPathFromPath,
  sourcePathForStorage,
} from './sourceValidation';

export type BrainStorage = NonNullable<ReturnType<typeof createBrainStorage>>;

function createServiceClient(env: RagEnvironment): SupabaseClient | null {
  const url = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) return null;

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

export function createBrainStorage(env: RagEnvironment = process.env) {
  const store = createServiceClient(env);

  if (!store) return null;

  const bucket = store.storage.from(BRAIN_SOURCE_BUCKET);

  return {
    client: store,

    async createSignedUpload(kind: Exclude<BrainSourceKind, 'url' | 'text'>) {
      const objectPath = `incoming/${randomUUID()}.${extensionForKind(kind)}`;
      const { data, error } = await bucket.createSignedUploadUrl(objectPath);

      if (error || !data) {
        throw new BrainSourceError('storage_upload_url_failed', undefined, { status: 503 });
      }

      return {
        bucket: BRAIN_SOURCE_BUCKET,
        path: objectPath,
        token: data.token,
        signedUrl: data.signedUrl,
      };
    },

    async downloadSource(sourcePath: string): Promise<Buffer> {
      const objectPath = sourceObjectPathFromPath(sourcePath);

      if (!objectPath) {
        throw new BrainSourceError('storage_path_invalid');
      }

      const { data, error } = await bucket.download(objectPath);

      if (error || !data) {
        throw new BrainSourceError('storage_download_failed', undefined, {
          status: 503,
          retryable: true,
        });
      }

      return Buffer.from(await data.arrayBuffer());
    },

    async storeSourceBuffer(
      buffer: Buffer,
      format: BrainStorageFormat,
      contentType: string
    ): Promise<{
      sourcePath: string;
      sourceSha256: string;
      byteSize: number;
    }> {
      if (buffer.length === 0) throw new BrainSourceError('source_empty');

      const sourceSha256 = sha256Hex(buffer);
      const objectPath = sourceObjectPath(sourceSha256, format);
      const { error } = await bucket.upload(objectPath, buffer, {
        contentType,
        upsert: true,
        cacheControl: '0',
      });

      if (error) {
        throw new BrainSourceError('storage_upload_failed', undefined, {
          status: 503,
          retryable: true,
        });
      }

      return {
        sourcePath: sourcePathForStorage(sourceSha256, format),
        sourceSha256,
        byteSize: buffer.length,
      };
    },

    async storeOriginal(buffer: Buffer, kind: Exclude<BrainSourceKind, 'url'>): Promise<{
      sourcePath: string;
      sourceSha256: string;
      byteSize: number;
    }> {
      const format = extensionForKind(kind);
      return this.storeSourceBuffer(
        buffer,
        format,
        kind === 'pdf' ? 'application/pdf' : 'text/plain'
      );
    },

    async promoteIncomingSource(input: {
      incomingPath: string;
      kind: Exclude<BrainSourceKind, 'url'>;
      expectedSha256?: string | null;
    }): Promise<{ sourcePath: string; sourceSha256: string; byteSize: number; buffer: Buffer }> {
      const incomingPath = input.incomingPath.trim().replace(/^\/+/, '');

      if (!isIncomingStoragePath(incomingPath)) {
        throw new BrainSourceError('storage_incoming_path_invalid');
      }

      const { data, error } = await bucket.download(incomingPath);

      if (error || !data) {
        throw new BrainSourceError('storage_incoming_missing', undefined, { status: 404 });
      }

      const buffer = Buffer.from(await data.arrayBuffer());
      const sourceSha256 = sha256Hex(buffer);

      if (input.expectedSha256 && sourceSha256 !== input.expectedSha256) {
        throw new BrainSourceError('storage_hash_mismatch');
      }

      const stored = await this.storeOriginal(buffer, input.kind);
      await bucket.remove([incomingPath]).catch(() => undefined);

      return { ...stored, buffer };
    },

    async downloadVerified(
      sourcePath: string,
      sourceSha256: string
    ): Promise<{ buffer: Buffer; byteSize: number }> {
      const buffer = await this.downloadSource(sourcePath);
      const actual = sha256Hex(buffer);

      if (actual !== sourceSha256) {
        throw new BrainSourceError('storage_hash_mismatch');
      }

      return { buffer, byteSize: buffer.length };
    },

    async verifySource(input: {
      sourcePath: string;
      sourceSha256: string;
      kind: Exclude<BrainSourceKind, 'url'>;
    }): Promise<{ buffer: Buffer; byteSize: number }> {
      const buffer = await this.downloadSource(input.sourcePath);
      const actual = sha256Hex(buffer);

      if (actual !== input.sourceSha256) {
        throw new BrainSourceError('storage_hash_mismatch');
      }

      return { buffer, byteSize: buffer.length };
    },

    async removeSource(sourcePath: string): Promise<void> {
      const objectPath = sourceObjectPathFromPath(sourcePath);
      if (!objectPath) return;
      await bucket.remove([objectPath]).catch(() => undefined);
    },
  };
}
