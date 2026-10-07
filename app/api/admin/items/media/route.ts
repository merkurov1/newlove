import {
  NextRequest,
  NextResponse,
} from 'next/server';

import sharp from 'sharp';

import { createClient } from '@/lib/supabase/server';
import { requireAdminFromRequest } from '@/lib/serverAuth';

export const dynamic = 'force-dynamic';

const MAX_IMAGE_SIZE =
  10 * 1024 * 1024;

const ALLOWED_MIME_TYPES =
  new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/avif',
  ]);

function safeFilename(
  filename: string,
) {
  const extension =
    filename
      .split('.')
      .pop()
      ?.toLowerCase()
      .replace(
        /[^a-z0-9]/g,
        '',
      ) || 'bin';

  return extension;
}

export async function POST(
  req: NextRequest,
) {
  try {
    await requireAdminFromRequest(
      req,
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Unauthorized',
      },
      { status: 401 },
    );
  }

  try {
    const form =
      await req.formData();

    const file =
      form.get('file');

    const itemId =
      form.get('item_id');

    const lang =
      form.get('lang');

    if (!(file instanceof File)) {
      return NextResponse.json(
        {
          error:
            'Image file is required.',
        },
        { status: 400 },
      );
    }

    if (
      typeof itemId !==
      'string'
    ) {
      return NextResponse.json(
        {
          error:
            'item_id is required.',
        },
        { status: 400 },
      );
    }

    if (
      !ALLOWED_MIME_TYPES.has(
        file.type,
      )
    ) {
      return NextResponse.json(
        {
          error:
            'Unsupported image type.',
        },
        { status: 400 },
      );
    }

    if (
      file.size >
      MAX_IMAGE_SIZE
    ) {
      return NextResponse.json(
        {
          error:
            'Image is too large. Maximum size is 10 MB.',
        },
        { status: 413 },
      );
    }

    const buffer =
      Buffer.from(
        await file.arrayBuffer(),
      );

    const image =
      sharp(buffer);

    const info =
      await image.metadata();

    const width =
      info.width ?? null;

    const height =
      info.height ?? null;

    const supabase =
      createClient({
        useServiceRole: true,
      });

    const extension =
      safeFilename(
        file.name,
      );

    const storageKey =
      `flow/${itemId}/${crypto.randomUUID()}.${extension}`;

    const {
      error:
        uploadError,
    } = await supabase
      .storage
      .from('media')
      .upload(
        storageKey,
        buffer,
        {
          contentType:
            file.type,
          cacheControl:
            '31536000',
          upsert:
            false,
        },
      );

    if (uploadError) {
      throw uploadError;
    }

    const {
      data: media,
      error:
        mediaError,
    } = await supabase
      .from('media')
      .insert({
        item_id:
          itemId,
        storage_key:
          storageKey,
        mime:
          file.type,
        width,
        height,
        alt:
          file.name,
      })
      .select('*')
      .single();

    if (mediaError) {
      await supabase
        .storage
        .from('media')
        .remove([
          storageKey,
        ]);

      throw mediaError;
    }

    const {
      data: publicUrl,
    } =
      supabase
        .storage
        .from('media')
        .getPublicUrl(
          storageKey,
        );

    const metadata = {
      alt:
        file.name,
      mime:
        file.type,
      width,
      height,
      storage_key:
        storageKey,
      public_url:
        publicUrl.publicUrl,
      media_id:
        media.id,
    };

    const {
      data: item,
      error:
        itemError,
    } = await supabase
      .from('items')
      .update({
        type: 'photo',
        title:
          file.name
            .replace(
              /\.[^.]+$/,
              '',
            )
            .slice(0, 160),
        body_md:
          `![${file.name}](${publicUrl.publicUrl})`,
        metadata,
        lang:
          typeof lang ===
            'string' &&
          lang.trim()
            ? lang.trim()
            : 'ru',
      })
      .eq('id', itemId)
      .select('*')
      .single();

    if (itemError) {
      throw itemError;
    }

    return NextResponse.json(
      {
        success: true,
        item,
        media,
        metadata,
      },
    );
  } catch (error) {
    console.error(
      '[admin-items-media]',
      error,
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to upload image.',
      },
      { status: 500 },
    );
  }
}