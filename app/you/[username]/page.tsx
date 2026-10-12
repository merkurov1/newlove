
import { notFound } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import type { Metadata } from 'next';
import { sanitizeMetadata } from '@/lib/metadataSanitize';
import { getServerSupabaseClient } from '@/lib/serverAuth';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ username: string }>;
};

type Profile = {
  id: string;
  username: string | null;
  name: string | null;
  website: string | null;
  role: string | null;
};

type FlowItem = {
  id: string;
  title: string | null;
  slug: string | null;
  published_at: string | null;
  metadata?: unknown;
};

type TempleEvent = {
  id: string;
  event_type: string | null;
  message: string | null;
  created_at: string | null;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function formatDate(value: string | null) {
  if (!value) return '';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return '';

  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
    .format(date)
    .toUpperCase();
}

function getTempleLabel(eventType: string | null) {
  switch ((eventType || '').toUpperCase()) {
    case 'VIGIL':
    case 'VIGIL_SPARK':
      return 'VIGIL';
    case 'CAST':
      return 'CAST';
    case 'ABSOLUTION':
      return 'ABSOLUTION';
    case 'ASH':
      return 'LET IT GO';
    case 'HEARTANDANGEL':
    case 'MEDITATION':
    case 'SILENCE':
      return 'CALM';
    case 'WHISPER':
      return 'WHISPER';
    case 'TRIBUTE':
      return 'TRIBUTE';
    default:
      return eventType ? eventType.toUpperCase() : 'ACTIVITY';
  }
}

function normalizeWebsite(value: string | null) {
  if (!value) return null;

  try {
    return new URL(value.trim()).toString();
  } catch {
    return null;
  }
}

async function findProfile(identifier: string): Promise<Profile | null> {
  const supabase = getServerSupabaseClient({
    useServiceRole: true,
  });

  const query = supabase
    .from('users')
    .select('id,username,name,website,role');

  const { data, error } = UUID_PATTERN.test(identifier)
    ? await query.eq('id', identifier).maybeSingle()
    : await query.eq('username', identifier.toLowerCase()).maybeSingle();

  if (error) {
    console.error('[public-profile] profile lookup failed:', error);
    return null;
  }

  return data as Profile | null;
}

async function getAuthAvatar(userId: string) {
  try {
    const supabase = getServerSupabaseClient({
      useServiceRole: true,
    });

    const {
      data: { user },
      error,
    } = await supabase.auth.admin.getUserById(userId);

    if (error || !user) return null;

    const metadata = user.user_metadata ?? {};
    const image =
      metadata.avatar_url ||
      metadata.picture ||
      metadata.image ||
      metadata.avatar ||
      null;

    return typeof image === 'string' ? image : null;
  } catch (error) {
    console.error('[public-profile] avatar lookup failed:', error);
    return null;
  }
}

async function getFlowItems(userId: string): Promise<FlowItem[]> {
  const supabase = getServerSupabaseClient({
    useServiceRole: true,
  });

  const { data, error } = await supabase
    .from('items')
    .select('id,title,slug,published_at,metadata')
    .eq('status', 'published')
    .eq('visibility', 'public')
    .order('published_at', { ascending: false })
    .limit(50);

  if (error) {
    console.error('[public-profile] Flow lookup failed:', error);
    return [];
  }

  return ((data ?? []) as FlowItem[])
    .filter((item) => {
      const metadata = item.metadata;

      if (!metadata || typeof metadata !== 'object') {
        return false;
      }

      const flow = (metadata as Record<string, unknown>).flow;

      if (!flow || typeof flow !== 'object') {
        return false;
      }

      return (
        (flow as Record<string, unknown>).author_id === userId
      );
    })
    .slice(0, 5);
}

async function getTempleEvents(userId: string): Promise<TempleEvent[]> {
  const supabase = getServerSupabaseClient({
    useServiceRole: true,
  });

  const eventTypes = [
    'VIGIL', 'vigil',
    'VIGIL_SPARK', 'vigil_spark',
    'ASH', 'ash',
    'CAST', 'cast',
    'TRIBUTE', 'tribute',
    'ABSOLUTION', 'absolution',
    'HEARTANDANGEL',
    'MEDITATION', 'meditation',
    'SILENCE', 'silence',
    'WHISPER', 'whisper',
  ];

  const { data, error } = await supabase
    .from('temple_log')
    .select('id,event_type,message,created_at')
    .eq('user_id', userId)
    .in('event_type', eventTypes)
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) {
    console.error('[public-profile] Temple lookup failed:', error);
    return [];
  }

  return (data ?? []) as TempleEvent[];
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { username } = await params;
  const decoded = decodeURIComponent(username || '').trim();

  if (!decoded) {
    return sanitizeMetadata({
      title: 'Profile',
      robots: { index: false, follow: false },
    });
  }

  const profile = await findProfile(decoded);

  if (!profile) {
    return sanitizeMetadata({
      title: 'Profile not found',
      robots: { index: false, follow: false },
    });
  }

  const name = profile.name || profile.username || decoded;
  const canonicalUsername = profile.username || decoded;
  const canonical =
    `https://www.merkurov.love/you/${encodeURIComponent(canonicalUsername)}`;

  return sanitizeMetadata({
    title: `${name} | merkurov.love`,
    description: `${name} on merkurov.love.`,
    alternates: { canonical },
    openGraph: {
      title: `${name} | merkurov.love`,
      description: `${name} on merkurov.love.`,
      type: 'profile',
      url: canonical,
    },
  });
}

export default async function UserProfilePage({
  params,
}: PageProps) {
  const { username } = await params;
  const decoded = decodeURIComponent(username || '').trim();

  if (!decoded) notFound();

  const profile = await findProfile(decoded);

  if (!profile) notFound();

  const [avatarUrl, flowItems, templeEvents] = await Promise.all([
    getAuthAvatar(profile.id),
    getFlowItems(profile.id),
    getTempleEvents(profile.id),
  ]);

  const displayName = profile.name || profile.username || decoded;
  const website = normalizeWebsite(profile.website);
  const role = profile.role?.trim() || null;

  return (
    <main className="min-h-screen bg-[#FAF8F5] text-[#111111]">
      <div className="mx-auto w-full max-w-3xl px-5 pb-24 pt-28 sm:px-8 sm:pt-32">
        <Link
          href="/heartandangel/world"
          className="inline-flex font-mono text-[10px] uppercase tracking-[0.18em] text-stone-400 transition-colors hover:text-stone-900"
        >
          ← Back to World
        </Link>

        <header className="mt-12 sm:mt-16">
          <div className="flex items-start gap-5 sm:gap-7">
            {avatarUrl ? (
              <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-full bg-stone-200 sm:h-24 sm:w-24">
                <Image
                  src={avatarUrl}
                  alt=""
                  fill
                  sizes="96px"
                  className="object-cover"
                />
              </div>
            ) : (
              <div
                className="h-20 w-20 shrink-0 rounded-full bg-stone-200 sm:h-24 sm:w-24"
                aria-hidden="true"
              />
            )}

            <div className="min-w-0 pt-1">
              <h1 className="font-serif text-3xl font-light leading-tight tracking-tight sm:text-4xl">
                {displayName}
              </h1>

              {role && (
                <div className="mt-2 font-mono text-[10px] uppercase tracking-[0.18em] text-stone-400">
                  {role}
                </div>
              )}

              {website && (
                <a
                  href={website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 block truncate font-mono text-[10px] uppercase tracking-[0.14em] text-stone-500 transition-colors hover:text-stone-900"
                >
                  {new URL(website).hostname.replace(/^www\./, '')}
                </a>
              )}
            </div>
          </div>

          {profile.username && (
            <div className="mt-5 font-mono text-[10px] uppercase tracking-[0.16em] text-stone-300">
              @{profile.username}
            </div>
          )}
        </header>

        {flowItems.length > 0 && (
          <section className="mt-16">
            <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-stone-400">
              Flow
            </h2>

            <div className="mt-4">
              {flowItems.map((item) => (
                <Link
                  key={item.id}
                  href={item.slug ? `/flow/${item.slug}` : '/flow'}
                  className="group grid grid-cols-[6.25rem_minmax(0,1fr)] gap-3 border-b border-stone-200/70 py-2.5 font-serif text-[16px] leading-6 text-stone-800 transition-colors hover:text-stone-400 sm:grid-cols-[7.5rem_minmax(0,1fr)]"
                >
                  <time
                    dateTime={item.published_at || undefined}
                    className="pt-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-stone-400"
                  >
                    {formatDate(item.published_at)}
                  </time>

                  <span className="min-w-0 truncate">
                    {item.title || 'Untitled'}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {templeEvents.length > 0 && (
          <section className="mt-16">
            <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-stone-400">
              Temple
            </h2>

            <div className="mt-4">
              {templeEvents.map((event) => (
                <div
                  key={event.id}
                  className="grid grid-cols-[6.25rem_minmax(0,1fr)] gap-3 border-b border-stone-200/50 py-2 sm:grid-cols-[7.5rem_minmax(0,1fr)]"
                >
                  <time
                    dateTime={event.created_at || undefined}
                    className="pt-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-stone-400"
                  >
                    {formatDate(event.created_at)}
                  </time>

                  <div className="min-w-0">
                    <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-stone-800">
                      {getTempleLabel(event.event_type)}
                    </span>

                    {event.message && (
                      <span className="ml-3 font-serif text-[16px] text-stone-500">
                        {event.message}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
