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

function extensionFromMime(mime: string) {
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

function cleanFilename(filename: string) {
  return filename
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}._-]+/gu, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 120);
}

export async function POST(req: NextRequest) {
  try {
    await requireAdminFromRequest(req);

    const form = await req.formData();
    const file = form.get('file');
    const itemId = form.get('item_id');
    const lang = form.get('lang');

    if (!(file instanceof File)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Image file is required.',
        },
        { status: 400 },
      );
    }

    if (typeof itemId !== 'string' || !itemId.trim()) {
      return NextResponse.json(
        {
          success: false,
          error: 'item_id is required.',
        },
        { status: 400 },
      );
    }

    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Unsupported image type.',
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

    const {
      data: existingItem,
      error: itemError,
    } = await supabase
      .from('items')
      .select('id,type,status,visibility,lang,metadata')
      .eq('id', itemId.trim())
      .maybeSingle();

    if (itemError) {
      console.error(
        '[admin-items-media] item lookup error:',
        itemError,
      );

      return NextResponse.json(
        {
          success: false,
          error: itemError.message,
        },
        { status: 500 },
      );
    }

    if (!existingItem) {
      return NextResponse.json(
        {
          success: false,
          error: 'Item not found.',
        },
        { status: 404 },
      );
    }

    const extension = extensionFromMime(file.type);

    const filename =
      cleanFilename(file.name) || `image.${extension}`;

    const storageKey =
      `flow/${itemId}/${crypto.randomUUID()}.${extension}`;

    const bytes = await file.arrayBuffer();

    const { error: uploadError } = await supabase.storage
      .from('media')
      .upload(storageKey, bytes, {
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

    const { data: publicData } = supabase.storage
      .from('media')
      .getPublicUrl(storageKey);

    const publicUrl = publicData.publicUrl;

    const metadata = {
      ...(existingItem.metadata &&
      typeof existingItem.metadata === 'object'
        ? existingItem.metadata
        : {}),
      public_url: publicUrl,
      storage_key: storageKey,
      filename,
      mime: file.type,
      size: file.size,
      alt: filename,
    };

    const {
      data: mediaRow,
      error: mediaError,
    } = await supabase
      .from('media')
      .insert({
        item_id: itemId.trim(),
        storage_key: storageKey,
        mime: file.type,
        alt: filename,
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

    const {
      data: updatedItem,
      error: updateError,
    } = await supabase
      .from('items')
      .update({
        type: 'photo',
        title: filename.slice(0, 160),
        source_url: null,
        metadata,
        lang:
          typeof lang === 'string' && lang.trim()
            ? lang.trim()
            : existingItem.lang,
      })
      .eq('id', itemId.trim())
      .select('*')
      .single();

    if (updateError) {
      console.error(
        '[admin-items-media] item update error:',
        updateError,
      );

      await supabase
        .from('media')
        .delete()
        .eq('id', mediaRow.id);

      await supabase.storage
        .from('media')
        .remove([storageKey]);

      return NextResponse.json(
        {
          success: false,
          error: updateError.message,
        },
        { status: 500 },
      );
    }

    return NextResponse.json(
      {
        success: true,
        item: updatedItem,
        media: mediaRow,
        url: publicUrl,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error('[admin-items-media]', error);

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