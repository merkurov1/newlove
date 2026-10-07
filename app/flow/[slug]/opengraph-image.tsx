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
  const { data, error } = await supabase
    .from('items')
    .select('title, body_md, type, source_url, metadata')
    .eq('slug', slug)
    .eq('status', 'published')
    .eq('visibility', 'public')
    .maybeSingle();
  if (error || !data) {
    return null;
  }
  return data as FlowItem;
}
export default async function OpenGraphImage({
  params,
}: {
  params: { slug: string };
}) {
  const item = await getItem(params.slug);
  const title = truncate(
    cleanText(item?.title || 'Flow'),
    72,
  );
  const description = item
    ? getDescription(item)
    : 'Personal publishing by Anton Merkurov.';
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
          padding: '64px 72px',
          fontFamily: 'sans-serif',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: 22,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: '#737373',
          }}
        >
          <span>Flow</span>
          <span
            style={{
              fontSize: 18,
              letterSpacing: '0.08em',
              color: '#A3A3A3',
            }}
          >
            MERKUROV.LOVE
          </span>
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            maxWidth: 1020,
            gap: 24,
          }}
        >
          <div
            style={{
              fontSize: 58,
              lineHeight: 1.08,
              fontWeight: 500,
              letterSpacing: '-0.025em',
            }}
          >
            {title}
          </div>
          {description && (
            <div
              style={{
                fontSize: 27,
                lineHeight: 1.35,
                color: '#666666',
                maxWidth: 900,
              }}
            >
              {description}
            </div>
          )}
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            borderTop: '1px solid #D6D3D1',
            paddingTop: 20,
            fontSize: 18,
            color: '#737373',
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