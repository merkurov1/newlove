
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAdminFromRequest } from '@/lib/serverAuth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const BUCKET = 'media';

const MIME_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
};

export async function POST(req: NextRequest) {
  try {
    await requireAdminFromRequest(req);

    const formData = await req.formData();
    const file = formData.get('image');

    if (!(file instanceof File)) {
      return NextResponse.json(
        { success: false, error: 'No image uploaded.' },
        { status: 400 },
      );
    }

    const extension = MIME_EXTENSIONS[file.type];

    if (!extension) {
      return NextResponse.json(
        { success: false, error: 'Unsupported image type.' },
        { status: 400 },
      );
    }

    if (file.size === 0 || file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          success: false,
          error: 'Image must be smaller than 10 MB.',
        },
        { status: 400 },
      );
    }

    const supabase = createClient({ useServiceRole: true });

    const storageKey =
      `flow/uploads/${crypto.randomUUID()}.${extension}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storageKey, await file.arrayBuffer(), {
        contentType: file.type,
        cacheControl: '31536000',
        upsert: false,
      });

    if (uploadError) {
      console.error('[flow-upload] Storage error:', uploadError);

      return NextResponse.json(
        {
          success: false,
          error: `Storage upload failed: ${uploadError.message}`,
        },
        { status: 500 },
      );
    }

    const { data } = supabase.storage
      .from(BUCKET)
      .getPublicUrl(storageKey);

    if (!data.publicUrl) {
      await supabase.storage.from(BUCKET).remove([storageKey]);

      return NextResponse.json(
        { success: false, error: 'Could not create public image URL.' },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      file: {
        url: data.publicUrl,
        path: storageKey,
        name: file.name,
        type: file.type,
        size: file.size,
      },
    });
  } catch (error) {
    console.error('[flow-upload] Error:', error);

    const message =
      error instanceof Error ? error.message : 'Upload failed.';

    return NextResponse.json(
      { success: false, error: message },
      { status: 401 },
    );
  }
}
