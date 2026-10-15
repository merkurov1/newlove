import { ImageResponse } from 'next/og';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'edge';
export const alt = 'Flow — Anton Merkurov';
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';

type FlowItem = {
  title: string | null;
  body_md: string | null;
  type: string | null;
  source_url: string | null;
  metadata: Record<string, unknown> | null;
};

function cleanText(value: unknown): string {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength - 1).trim()}…`;
}

function getDescription(item: FlowItem): string {
  const metadata = item.metadata ?? {};
  const metadataDescription =
    typeof metadata.description === 'string'
      ? metadata.description
      : typeof metadata.excerpt === 'string'
        ? metadata.excerpt
        : '';
  const body = cleanText(item.body_md);
  return truncate(
    cleanText(metadataDescription || body || item.source_url || 'Personal publishing by Anton Merkurov.'),
    180,
  );
}

function getItemImage(item: FlowItem): string | null {
  const meta = item.metadata ?? {};
  const youtube = meta.youtube as Record<string, unknown> | undefined;
  const candidates = [
    youtube?.thumbnail_url,
    meta.public_url,
    meta.image,
    meta.image_url,
    meta.og_image,
  ];

  for (const c of candidates) {
    if (typeof c === 'string' && c.startsWith('http')) {
      return c;
    }
  }
  return null;
}

async function getItem(slug: string): Promise<FlowItem | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }
  const supabase = createClient(
    supabaseUrl,
    serviceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );

  const decoded = decodeURIComponent(slug);

  // 1. Поиск по декодированному slug
  const { data } = await supabase
    .from('items')
    .select('title, body_md, type, source_url, metadata')
    .eq('slug', decoded)
    .eq('status', 'published')
    .eq('visibility', 'public')
    .maybeSingle();

  if (data) return data as FlowItem;

  // 2. Если не найдено, поиск по исходному slug
  if (decoded !== slug) {
    const { data: rawData } = await supabase
      .from('items')
      .select('title, body_md, type, source_url, metadata')
      .eq('slug', slug)
      .eq('status', 'published')
      .eq('visibility', 'public')
      .maybeSingle();

    if (rawData) return rawData as FlowItem;
  }

  return null;
}

export default async function OpenGraphImage({
  params,
}: {
  params: { slug: string } | Promise<{ slug: string }>;
}) {
  const resolvedParams = await Promise.resolve(params);
  const rawSlug = resolvedParams?.slug || '';
  const item = await getItem(rawSlug);

  const title = truncate(
    cleanText(item?.title || 'Flow'),
    72,
  );
  const description = item
    ? getDescription(item)
    : 'Personal publishing by Anton Merkurov.';
  const previewImage = item ? getItemImage(item) : null;

  return new ImageResponse(
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
          padding: '60px 68px',
          fontFamily: 'sans-serif',
        }}
      >
        {/* Top Header */}
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
                backgroundColor: '#10B981',
              }}
            />
            <span style={{ fontWeight: 600, color: '#171717' }}>FLOW</span>
          </div>
          <span
            style={{
              fontSize: 16,
              letterSpacing: '0.12em',
              color: '#8C857B',
            }}
          >
            MERKUROV.LOVE
          </span>
        </div>

        {/* Content Area (With optional thumbnail) */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 40,
            flex: 1,
            margin: '28px 0',
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              flex: 1,
              maxWidth: previewImage ? 680 : 1060,
              gap: 20,
            }}
          >
            <div
              style={{
                fontSize: title.length > 50 ? 46 : 56,
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
                  fontSize: 24,
                  lineHeight: 1.4,
                  color: '#57534E',
                  maxWidth: previewImage ? 640 : 960,
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

        {/* Bottom Footer */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            borderTop: '1px solid #E7E5E4',
            paddingTop: 20,
            fontSize: 17,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: '#78716C',
          }}
        >
          <span>Anton Merkurov</span>
          <span>
            {item?.type ? cleanText(item.type) : 'publication'}
          </span>
        </div>
      </div>
    ),
    {
      width: size.width,
      height: size.height,
    },
  );
}
