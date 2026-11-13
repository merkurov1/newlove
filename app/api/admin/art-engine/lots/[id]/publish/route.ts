import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createId } from '@paralleldrive/cuid2';
import { requireAdminFromRequest, getServerSupabaseClient } from '@/lib/serverAuth';
import { findLotById, updateLotById } from '@/lib/art-engine/repository';
import { mergeVault, normalizeVault } from '@/lib/art-engine/vault';
import { extractionFromLotRow, missingForPublication } from '@/lib/art-engine/extraction';
import {
  alternativeSelectionUrl,
  buildSelectionSpecs,
  mergeSelectionContent,
  publicSelectionUrl,
  selectionArticleSnapshot,
  slugifyArtwork,
} from '@/lib/art-engine/selection';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;
export const maxDuration = 30;

function publicImageUrl(imagePath: string | null | undefined): string | null {
  if (!imagePath) return null;
  if (/^https?:\/\//i.test(imagePath)) return imagePath;

  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
  return base
    ? `${base}/storage/v1/object/public/artifacts/${imagePath}`
    : null;
}

async function resolveAuthorId(
  supabase: ReturnType<typeof getServerSupabaseClient>,
  admin: Awaited<ReturnType<typeof requireAdminFromRequest>>,
): Promise<string | null> {
  const direct = await supabase
    .from('users')
    .select('id, role')
    .eq('id', admin.id)
    .maybeSingle();

  if (direct.data?.id && direct.data.role === 'ADMIN') {
    return direct.data.id;
  }

  const fallback = await supabase
    .from('users')
    .select('id, role')
    .eq('role', 'ADMIN')
    .limit(1)
    .maybeSingle();

  return fallback.data?.role === 'ADMIN' ? fallback.data.id : null;
}

async function resolveSlug(
  supabase: ReturnType<typeof getServerSupabaseClient>,
  desired: string,
  existingId?: string | null,
): Promise<string> {
  let candidate = desired;

  for (let index = 1; index <= 20; index += 1) {
    const { data } = await supabase
      .from('articles')
      .select('id')
      .eq('slug', candidate)
      .maybeSingle();

    if (!data || data.id === existingId) return candidate;

    candidate = `${desired}-${index + 1}`;
  }

  return `${desired}-${Date.now().toString(36)}`;
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  let admin: Awaited<ReturnType<typeof requireAdminFromRequest>>;

  try {
    admin = await requireAdminFromRequest(req);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));

  if (body?.confirm !== true) {
    return NextResponse.json(
      { error: 'Publication requires explicit confirmation.' },
      { status: 400 },
    );
  }

  if (body?.imageRightsConfirmed !== true) {
    return NextResponse.json(
      { error: 'Image publication rights must be confirmed before publishing.' },
      { status: 400 },
    );
  }

  const lot = await findLotById(params.id);
  if (!lot) {
    return NextResponse.json({ error: 'Vault record not found.' }, { status: 404 });
  }

  const vault = normalizeVault(lot.vault);
  const extraction = extractionFromLotRow(lot, vault);
  const essay = vault.editorial?.current?.curatorial_essay || null;
  const imageUrl =
    vault.image?.publicUrl ||
    vault.image?.originalUrl ||
    publicImageUrl(lot.image_path);

  const missing = missingForPublication({
    extraction,
    essay,
    imageUrl,
  });

  if (missing.length) {
    return NextResponse.json(
      {
        error: `Cannot publish: missing ${missing.join(', ')}.`,
        missing,
      },
      { status: 422 },
    );
  }

  const supabase = getServerSupabaseClient({ useServiceRole: true });
  const authorId = await resolveAuthorId(supabase, admin);

  if (!authorId) {
    return NextResponse.json(
      { error: 'No ADMIN user is available as the publication author.' },
      { status: 422 },
    );
  }

  let existingArticle: Record<string, any> | null = null;

  if (vault.publication?.article_id) {
    const byId = await supabase
      .from('articles')
      .select('*')
      .eq('id', vault.publication.article_id)
      .maybeSingle();
    existingArticle = byId.data || null;
  }

  if (!existingArticle && vault.publication?.slug) {
    const bySlug = await supabase
      .from('articles')
      .select('*')
      .eq('slug', vault.publication.slug)
      .maybeSingle();
    existingArticle = bySlug.data || null;
  }

  const baseSlug =
    existingArticle?.slug ||
    slugifyArtwork(
      extraction.artist || '',
      extraction.title || '',
      extraction.year,
    );

  // Recover from a previous partial publication where the article was created
  // but the Vault write failed: adopt the matching article instead of creating
  // a duplicate with a suffixed slug.
  if (!existingArticle) {
    const matching = await supabase
      .from('articles')
      .select('*')
      .eq('slug', baseSlug)
      .maybeSingle();

    if (
      matching.data &&
      matching.data.artist === extraction.artist &&
      matching.data.title === extraction.title
    ) {
      existingArticle = matching.data;
    }
  }

  const currentVersion = vault.editorial?.current?.version || null;
  const publishedVersion = vault.publication?.version || null;
  const isUpdate = body?.mode === 'update';

  if (
    existingArticle &&
    vault.publication?.status === 'published' &&
    !isUpdate
  ) {
    if (currentVersion === publishedVersion) {
      const url = publicSelectionUrl(existingArticle.slug);
      return NextResponse.json({
        success: true,
        unchanged: true,
        article_id: existingArticle.id,
        slug: existingArticle.slug,
        url,
        selection_url: alternativeSelectionUrl(existingArticle.slug),
        message: 'This version is already published.',
      });
    }

    return NextResponse.json(
      {
        error:
          'A newer essay version exists. Use Update Publication to replace the existing article.',
        requires_update: true,
        article_id: existingArticle.id,
        slug: existingArticle.slug,
      },
      { status: 409 },
    );
  }

  const desiredSlug =
    existingArticle?.slug ||
    slugifyArtwork(
      extraction.artist || '',
      extraction.title || '',
      extraction.year,
    );
  const slug = await resolveSlug(
    supabase,
    desiredSlug,
    existingArticle?.id || null,
  );

  const now = new Date().toISOString();
  const articlePayload = {
    title: extraction.title,
    slug,
    content: mergeSelectionContent(existingArticle?.content, imageUrl as string),
    published: true,
    publishedAt: existingArticle?.publishedAt || now,
    authorId,
    artist: extraction.artist,
    curatorNote: essay,
    quote: existingArticle?.quote ?? null,
    specs: buildSelectionSpecs(extraction),
    preview_image: imageUrl,
  };

  let article: Record<string, any> | null = null;

  if (existingArticle) {
    const updated = await supabase
      .from('articles')
      .update(articlePayload)
      .eq('id', existingArticle.id)
      .select('*')
      .single();

    if (updated.error || !updated.data) {
      console.error('[Selection Publish] update failed:', updated.error);
      return NextResponse.json(
        { error: 'Selection article could not be updated.' },
        { status: 500 },
      );
    }

    article = updated.data;
  } else {
    const inserted = await supabase
      .from('articles')
      .insert({
        id: createId(),
        ...articlePayload,
      })
      .select('*')
      .single();

    if (inserted.error || !inserted.data) {
      console.error('[Selection Publish] insert failed:', inserted.error);
      return NextResponse.json(
        { error: 'Selection article could not be created.' },
        { status: 500 },
      );
    }

    article = inserted.data;
  }

  if (!article) {
    return NextResponse.json(
      { error: 'Selection article could not be resolved.' },
      { status: 500 },
    );
  }

  const history = [
    ...(vault.publication?.history || []),
    {
      at: now,
      action: existingArticle ? 'selection.updated' : 'selection.created',
      version: currentVersion,
      article: selectionArticleSnapshot(existingArticle || article),
      article_id: article.id,
      slug: article.slug,
    },
  ].slice(-20);

  const updatedVault = mergeVault(vault, {
    editorial: {
      ...(vault.editorial || {}),
      status: 'approved',
      current: vault.editorial?.current || null,
      history: vault.editorial?.history || [],
      updated_at: now,
    },
    publication: {
      status: 'published',
      article_id: article.id,
      slug: article.slug,
      version: currentVersion,
      published_at: existingArticle?.publishedAt || now,
      approved_by: admin.email || admin.id,
      approved_at: now,
      update_pending: false,
      history,
    },
    audit: [
      {
        at: now,
        action: existingArticle ? 'selection.updated' : 'selection.published',
        actor: admin.email || admin.id,
        details: {
          article_id: article.id,
          slug: article.slug,
          version: currentVersion,
        },
      },
    ],
  });

  const saved = await updateLotById(String(lot.id), {
    status: 'published',
    vault: updatedVault,
  });

  if (!saved.lot) {
    return NextResponse.json(
      {
        error:
          'Selection article was saved, but the Vault publication state could not be updated.',
        article_id: article.id,
        slug: article.slug,
      },
      { status: 500 },
    );
  }

  revalidatePath('/selection');
  revalidatePath(`/${article.slug}`);
  revalidatePath(`/selection/${article.slug}`);
  revalidatePath('/sitemap.xml');
  revalidatePath('/lots');
  revalidatePath(`/lots/${encodeURIComponent(params.id)}`);

  return NextResponse.json({
    success: true,
    updated: Boolean(existingArticle),
    unchanged: false,
    article_id: article.id,
    slug: article.slug,
    url: publicSelectionUrl(article.slug),
    selection_url: alternativeSelectionUrl(article.slug),
    published_at: existingArticle?.publishedAt || now,
    version: currentVersion,
  });
}
