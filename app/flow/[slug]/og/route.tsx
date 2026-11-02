import { ImageResponse } from 'next/og';
import { createClient } from '@supabase/supabase-js';

import {
  normalizeFlowItem,
  truncateGraphemes,
} from '@/lib/flow/content';
import { resolveFlowMetadataFromContent } from '@/lib/flow/metadata';

export const runtime = 'edge';
export const contentType = 'image/png';

export const size = {
  width: 1200,
  height: 630,
};

type RouteContext = {
  params: Promise<{ slug: string }> | { slug: string };
};

type FlowRow = Record<string, unknown>;

async function getItem(slug: string): Promise<FlowRow | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) return null;

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const decoded = decodeURIComponent(slug);

  const { data } = await supabase
    .from('items')
    .select(
      'id,title,slug,lang,type,status,visibility,body_md,source_url,metadata,published_at,created_at,updated_at'
    )
    .eq('slug', decoded)
    .eq('status', 'published')
    .eq('visibility', 'public')
    .maybeSingle();

  if (data) return data as FlowRow;

  if (decoded !== slug) {
    const { data: rawData } = await supabase
      .from('items')
      .select(
        'id,title,slug,lang,type,status,visibility,body_md,source_url,metadata,published_at,created_at,updated_at'
      )
      .eq('slug', slug)
      .eq('status', 'published')
      .eq('visibility', 'public')
      .maybeSingle();

    if (rawData) return rawData as FlowRow;
  }

  return null;
}

function typeLabel(type: string): string {
  const labels: Record<string, string> = {
    note: 'NOTE',
    article: 'ARTICLE',
    photo: 'PHOTO',
    video: 'VIDEO',
    link: 'LINK',
    quote: 'QUOTE',
    mixed: 'POST',
  };

  return labels[type] ?? 'PUBLICATION';
}

export async function GET(request: Request, context: RouteContext) {
  const resolvedParams = await Promise.resolve(context.params);
  const slug = resolvedParams?.slug || '';
  const item = await getItem(slug);

  const content = item
    ? normalizeFlowItem(item as any)
    : null;
  const metadata = content ? resolveFlowMetadataFromContent(content) : null;

  const title = truncateGraphemes(
    metadata?.title || 'Flow',
    90
  ).trim();
  const description = truncateGraphemes(
    metadata?.description || 'Personal publishing by Anton Merkurov.',
    180
  ).trim();
  const previewImage = metadata?.cardImage ?? null;
  const label = typeLabel(content?.contentType ?? 'mixed');
  const language = content?.language?.toUpperCase() ?? '';

  const version = new URL(request.url).searchParams.get('v');

  const response = new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          backgroundColor: '#FAF8F5',
          color: '#171717',
          padding: '56px 64px',
          fontFamily: 'sans-serif',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: 20,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: '#737373',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                backgroundColor: '#990F3D',
              }}
            />
            <span style={{ fontWeight: 600, color: '#171717' }}>FLOW</span>
          </div>
          <span style={{ fontSize: 16, letterSpacing: '0.12em', color: '#8C857B' }}>
            MERKUROV.LOVE
          </span>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 44,
            flex: 1,
            margin: '26px 0',
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              flex: 1,
              maxWidth: previewImage ? 660 : 1050,
              gap: 18,
            }}
          >
            <div
              style={{
                fontSize: title.length > 58 ? 44 : 54,
                lineHeight: 1.1,
                fontWeight: 600,
                letterSpacing: '-0.025em',
                color: '#111111',
              }}
            >
              {title}
            </div>

            {description && (
              <div
                style={{
                  fontSize: 23,
                  lineHeight: 1.4,
                  color: '#57534E',
                  maxWidth: previewImage ? 620 : 950,
                }}
              >
                {description}
              </div>
            )}
          </div>

          {previewImage && (
            <div
              style={{
                width: 320,
                height: 240,
                borderRadius: 20,
                overflow: 'hidden',
                border: '1px solid #E7E5E4',
                display: 'flex',
                boxShadow: '0 8px 30px rgba(0,0,0,0.06)',
              }}
            >
              <img
                src={previewImage}
                alt=""
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                }}
              />
            </div>
          )}
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            borderTop: '1px solid #E7E5E4',
            paddingTop: 18,
            fontSize: 16,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: '#78716C',
          }}
        >
          <span>Anton Merkurov</span>
          <span>
            {label}
            {language ? ` · ${language}` : ''}
          </span>
        </div>
      </div>
    ),
    {
      width: size.width,
      height: size.height,
      headers: {
        'Cache-Control': 'public, max-age=31536000, immutable',
        ...(version ? { 'X-Flow-Card-Version': version } : {}),
      },
    }
  );

  return response;
}
