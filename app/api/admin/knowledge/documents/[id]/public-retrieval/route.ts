import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

import { authorizeKnowledgeAdmin } from '@/lib/knowledge/adminAuth';
import { isFlowPublicSourceType } from '@/lib/knowledge/rag/flowRetrieval';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store, max-age=0, must-revalidate',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}

function getStore() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) return null;

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  const auth = await authorizeKnowledgeAdmin(request);

  if (!auth.ok) return json({ error: 'Unauthorized' }, 401);

  const store = getStore();

  if (!store) return json({ error: 'Knowledge database is not configured.' }, 503);

  const { id } = await context.params;

  if (!id || id.length > 200) return json({ error: 'Invalid document id.' }, 400);

  const { data, error } = await store
    .from('knowledge_documents')
    .select(
      'id,title,source_type,access_class,ingestion_status,chunk_count,public_retrieval_allowed,public_retrieval_allowed_at,public_retrieval_allowed_by,public_retrieval_note'
    )
    .eq('id', id)
    .maybeSingle();

  if (error) return json({ error: 'Could not read document.' }, 503);
  if (!data) return json({ error: 'Document not found.' }, 404);

  return json({ status: 'ok', document: data });
}

export async function POST(request: Request, context: Context) {
  const auth = await authorizeKnowledgeAdmin(request);

  if (!auth.ok) return json({ error: 'Unauthorized' }, 401);

  const store = getStore();

  if (!store) return json({ error: 'Knowledge database is not configured.' }, 503);

  const { id } = await context.params;

  if (!id || id.length > 200) return json({ error: 'Invalid document id.' }, 400);

  const body = await request.json().catch(() => null);

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return json({ error: 'Invalid request body.' }, 400);
  }

  const value = body as Record<string, unknown>;

  if (typeof value.allowed !== 'boolean') {
    return json({ error: '`allowed` must be a boolean.' }, 400);
  }

  const { data: document, error: documentError } = await store
    .from('knowledge_documents')
    .select('id,title,source_type,access_class,ingestion_status,chunk_count')
    .eq('id', id)
    .maybeSingle();

  if (documentError) return json({ error: 'Could not read document.' }, 503);
  if (!document) return json({ error: 'Document not found.' }, 404);

  const sourceType = String((document as { source_type?: unknown }).source_type || '');

  if (value.allowed && !isFlowPublicSourceType(sourceType)) {
    return json(
      {
        error:
          'This document type is not eligible for public Flow retrieval. Manuscripts and private columns are always excluded.',
      },
      400
    );
  }

  const now = new Date().toISOString();
  const patch = {
    public_retrieval_allowed: value.allowed,
    public_retrieval_allowed_at: value.allowed ? now : null,
    public_retrieval_allowed_by: value.allowed ? auth.actor : null,
    public_retrieval_note:
      typeof value.note === 'string' && value.note.trim()
        ? value.note.trim().slice(0, 500)
        : null,
    updated_at: now,
  };

  const { data, error } = await store
    .from('knowledge_documents')
    .update(patch)
    .eq('id', id)
    .select(
      'id,title,source_type,access_class,ingestion_status,chunk_count,public_retrieval_allowed,public_retrieval_allowed_at,public_retrieval_allowed_by,public_retrieval_note'
    )
    .single();

  if (error || !data) return json({ error: 'Could not update public retrieval permission.' }, 503);

  return json({ status: 'ok', document: data });
}
