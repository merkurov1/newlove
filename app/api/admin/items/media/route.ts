import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAdminFromRequest } from '@/lib/serverAuth';

export const dynamic = 'force-dynamic';

const MAX_FILE_SIZE = 10 * 1024 * 1024;

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
]);

function getExtension(mime: string, filename: string) {
  const originalExtension =
    filename
      .split('.')
      .pop()
      ?.toLowerCase()
      .replace(/[^a-z0-9]/g, '');

  if (
    originalExtension &&
    ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif'].includes(
      originalExtension,
    )
  ) {
    return originalExtension === 'jpeg'
      ? 'jpg'
      : originalExtension;
  }

  switch (mime) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    case 'image/gif':
      return 'gif';
    case 'image/avif':
      return 'avif';
    default:
      return 'bin';
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdminFromRequest(req);

    const formData = await req.formData();

    const itemId = formData.get('itemId');
    const file = formData.get('file');

    if (
      typeof itemId !== 'string' ||
      !itemId.trim()
    ) {
      return NextResponse.json(
        {
          success: false,
          error: 'itemId is required',
        },
        { status: 400 },
      );
    }

    if (!(file instanceof File)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Image file is required',
        },
        { status: 400 },
      );
    }

    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Unsupported image type',
        },
        { status: 400 },
      );
    }

    if (file.size <= 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'Image file is empty',
        },
        { status: 400 },
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          success: false,
          error: 'Image is too large. Maximum size is 10 MB.',
        },
        { status: 400 },
      );
    }

    const supabase = createClient({
      useServiceRole: true,
    });

    const extension = getExtension(
      file.type,
      file.name,
    );

    const storageKey =
      `flow/${itemId}/${crypto.randomUUID()}.${extension}`;

    const buffer = Buffer.from(
      await file.arrayBuffer(),
    );

    const { error: uploadError } =
      await supabase.storage
        .from('media')
        .upload(storageKey, buffer, {
          contentType: file.type,
          cacheControl: '31536000',
          upsert: false,
        });

    if (uploadError) {
      console.error(
        '[admin-items-media] upload error:',
        uploadError,
      );

      return NextResponse.json(
        {
          success: false,
          error: uploadError.message,
        },
        { status: 500 },
      );
    }

    const {
      data: publicUrlData,
    } = supabase.storage
      .from('media')
      .getPublicUrl(storageKey);

    const publicUrl =
      publicUrlData.publicUrl;

    const {
      data: media,
      error: mediaError,
    } = await supabase
      .from('media')
      .insert({
        item_id: itemId,
        storage_key: storageKey,
        mime: file.type,
        width: null,
        height: null,
      })
      .select('*')
      .single();

    if (mediaError) {
      console.error(
        '[admin-items-media] media row error:',
        mediaError,
      );

      await supabase.storage
        .from('media')
        .remove([storageKey]);

      return NextResponse.json(
        {
          success: false,
          error: mediaError.message,
        },
        { status: 500 },
      );
    }

    const title =
      file.name
        .replace(/\.[^/.]+$/, '')
        .trim() || 'Image';

    const {
      error: itemError,
    } = await supabase
      .from('items')
      .update({
        type: 'photo',
        title,
        body_md: `![${title}](${publicUrl})`,
        metadata: {
          media_id: media.id,
          storage_key: storageKey,
          mime: file.type,
          filename: file.name,
          size: file.size,
          public_url: publicUrl,
        },
      })
      .eq('id', itemId);

    if (itemError) {
      console.error(
        '[admin-items-media] item update error:',
        itemError,
      );

      await supabase
        .from('media')
        .delete()
        .eq('id', media.id);

      await supabase.storage
        .from('media')
        .remove([storageKey]);

      return NextResponse.json(
        {
          success: false,
          error: itemError.message,
        },
        { status: 500 },
      );
    }

    return NextResponse.json(
      {
        success: true,
        media,
        url: publicUrl,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error(
      '[admin-items-media]',
      error,
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Unauthorized',
      },
      { status: 401 },
    );
  }
}