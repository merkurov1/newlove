import { notFound } from 'next/navigation';
import Link from 'next/link';
import { sanitizeMetadata } from '@/lib/metadataSanitize';
import Image from 'next/image';
import { cookies } from 'next/headers';
import { Suspense } from 'react';
import SubscriptionToggle from '@/components/profile/SubscriptionToggle';
import { getFirstImage } from '@/lib/contentUtils';
import ProfileEditLink from '@/components/profile/ProfileEditLink';
import dynamic from 'next/dynamic';
import type { Metadata } from 'next';

const ConnectWalletButton = dynamic(() => import('@/components/profile/ConnectWalletButton'), { ssr: false });

function FallbackAvatar({ name }: { name: string }) {
  const letter = (name || '?').charAt(0).toUpperCase();
  return (
    <div className="w-24 h-24 sm:w-32 sm:h-32 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-3xl sm:text-5xl font-bold mb-4 shadow-lg">
      {letter}
    </div>
  );
}

async function getUserProfile(username: string) {
  const cookieStore = cookies();
  const cookieHeader = cookieStore.getAll().map(c => `${c.name}=${c.value}`).join('; ');
  const globalReq = ((globalThis as any)?.request) || new Request('http://localhost', { headers: { cookie: cookieHeader } });
  const { getUserAndSupabaseForRequest } = await import('@/lib/getUserAndSupabaseForRequest');
  const ctx = await getUserAndSupabaseForRequest(globalReq) || {};
  const supabase = ctx.supabase;
  if (!supabase) notFound();
  const { data: users } = await supabase.from('users').select('*').eq('username', username).limit(1);
  const user = (users && users[0]) || null;
  if (!user) notFound();
  // Check whether this user has an active subscriber record
  let isSubscribed = false;
  try {
    const { data: subRow, error: subErr } = await supabase.from('subscribers').select('id,isActive').eq('userId', user.id).limit(1).maybeSingle();
    if (!subErr && subRow) {
      // if table has isActive column, prefer it; otherwise presence implies subscribed
      isSubscribed = typeof subRow.isActive !== 'undefined' ? !!subRow.isActive : true;
    }
  } catch (e) {
    // ignore subscription lookup errors (table may not exist in some environments)
  }
  // Fetch articles and projects separately
  // Load articles via the request-scoped client (this will include tag attach later)
  const { data: articlesRaw } = await supabase.from('articles').select('*').eq('authorId', user.id).eq('published', true).order('publishedAt', { ascending: false });
  // For projects prefer the server service-role client for public reads to avoid RLS blocks
  let projectsRaw = [];
  try {
    const { getServerSupabaseClient } = await import('@/lib/serverAuth');
    const srv = getServerSupabaseClient({ useServiceRole: true });
    const res = await srv.from('projects').select('*').eq('authorId', user.id).eq('published', true).order('publishedAt', { ascending: false });
    projectsRaw = res && res.data ? res.data : [];
  } catch (e) {
    // Fallback to request-scoped client if server client not available
    try {
      const res = await supabase.from('projects').select('*').eq('authorId', user.id).eq('published', true).order('publishedAt', { ascending: false });
      projectsRaw = res && res.data ? res.data : [];
    } catch (err) {
      console.error('Failed to fetch user projects via server or request client', err);
      projectsRaw = [];
    }
  }
  // attach tags to articles and projects where needed
  const { attachTagsToArticles } = await import('@/lib/attachTagsToArticles');
  const articles = await attachTagsToArticles(supabase, articlesRaw || []);
  const projects = await attachTagsToArticles(supabase, projectsRaw || []);
  // Do not mutate original DB object; return a safe clone with serialized arrays
  return {
    ...user,
    isSubscribed: !!isSubscribed,
    articles: Array.isArray(articles) ? JSON.parse(JSON.stringify(articles)) : [],
    projects: Array.isArray(projects) ? JSON.parse(JSON.stringify(projects)) : []
  };
}

export async function generateMetadata({ params }: { params: { username: string } }): Promise<Metadata> {
  const user = await getUserProfile(params.username);
  const meta = {
    title: `Профиль: ${user.name}`,
    description: user.bio || `Публичные статьи и проекты автора ${user.name}`,
  };
  return sanitizeMetadata(meta);
}

// --- 3. САМ КОМПОНЕНТ СТРАНИЦЫ ---
function ProfileSkeleton() {
  return (
    <div className="max-w-2xl mx-auto py-8 px-4 animate-pulse">
      <div className="flex flex-col items-center">
        <div className="w-32 h-32 rounded-full bg-gray-200 mb-4" />
        <div className="h-6 w-40 bg-gray-200 rounded mb-2" />
        <div className="h-4 w-24 bg-gray-200 rounded mb-2" />
        <div className="h-4 w-64 bg-gray-100 rounded mb-2" />
        <div className="h-4 w-32 bg-gray-100 rounded mb-2" />
      </div>
      <div className="mt-8">
        <div className="h-5 w-32 bg-gray-200 rounded mb-4" />
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-gray-100 rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  );
}

async function ProfileContent({ username }: { username: string }) {
  const user = await getUserProfile(username);
  if (!user) return notFound();

  const cookieStore = cookies();
  const cookieHeader = cookieStore.getAll().map(c => `${c.name}=${c.value}`).join('; ');
  const globalReq = ((globalThis as any)?.request) || new Request('http://localhost', { headers: { cookie: cookieHeader } });
  let viewerIsOwner = false;
  try {
    const { getUserAndSupabaseForRequest } = await import('@/lib/getUserAndSupabaseForRequest');
    const ctx = await getUserAndSupabaseForRequest(globalReq) || {};
    const viewer = ctx.user || null;
    if (viewer && viewer.id && viewer.id === user.id) viewerIsOwner = true;
  } catch (e) {
    // ignore
  }

  return (
    <div className="container mx-auto px-4 py-12">
      {/* --- БЛОК С ИНФОРМАЦИЕЙ О ПОЛЬЗОВАТЕЛЕ --- */}
      <div className="flex flex-col items-center text-center mb-16">
        {user.image ? (
          <Image
            src={user.image}
            alt={user.name || 'Аватар'}
            width={128}
            height={128}
            className="rounded-full mb-4 shadow-lg"
          />
        ) : (
          <FallbackAvatar name={user.name} />
        )}
        <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900">{user.name}</h1>
        <p className="text-lg text-gray-500 mt-1">@{user.username}</p>

        {user.bio && (
          <p className="max-w-2xl mt-4 text-gray-700">{user.bio}</p>
        )}

        {user.website && (
          <Link href={user.website} target="_blank" rel="noopener noreferrer" className="mt-4 text-blue-600 hover:underline">
            {user.website.replace(/^(https?:\/\/)?(www\.)?/, '')}
          </Link>
        )}

        {/* Subscription status for this profile (public) */}
        <div className="mt-4">
          {user.isSubscribed ? (
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-green-50 text-green-700 text-sm font-semibold">📫 Подписан на рассылку</span>
          ) : (
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gray-100 text-gray-700 text-sm">✉️ Не подписан</span>
          )}
        </div>

        {viewerIsOwner && (
          <div className="mt-4 flex items-center gap-4">
            <ProfileEditLink className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700" />
            {user.email && (
              <Suspense fallback={null}>
                <SubscriptionToggle initialSubscribed={user.isSubscribed} />
              </Suspense>
            )}
            <ConnectWalletButton />
          </div>
        )}
      </div>

      {/* --- СПИСОК ПУБЛИКАЦИЙ ПОЛЬЗОВАТЕЛЯ --- */}
      <div className="space-y-16">
        {user.articles.length > 0 && (
          <div>
            <h2 className="text-2xl font-bold text-gray-800 mb-8">Публикации</h2>
            <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {/* Используем вёрстку карточек с главной страницы */}
              {await Promise.all(user.articles.map(async (article: any) => {
                const previewImage = await getFirstImage(article.content);
                return (
                  <div key={article.id} className="bg-white rounded-lg shadow-sm hover:shadow-lg transition-shadow duration-300 border border-gray-100 flex flex-col group overflow-hidden">
                    {previewImage && (
                      <Link href={`/${article.slug}`} className="block relative w-full h-48">
                        <Image src={previewImage} alt={article.title} fill sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw" className="object-cover group-hover:scale-105 transition-transform duration-300" />
                      </Link>
                    )}
                    <div className="p-6 flex-grow flex flex-col">
                      <Link href={`/${article.slug}`}>
                        <h3 className="text-xl font-semibold text-gray-900 mb-2 group-hover:text-blue-600">{article.title}</h3>
                      </Link>
                      {article.tags.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {article.tags.map((t: any) => (<Link key={t.id} href={`/tags/${t.slug}`} className="bg-gray-100 text-gray-600 text-xs font-medium px-2.5 py-1 rounded-full hover:bg-gray-200">{t.name}</Link>))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              }))}
            </div>
          </div>
        )}

        {/* В будущем здесь можно будет добавить и проекты */}
      </div>
    </div>
  );
}

export default function UserProfilePage({ params }: { params: { username: string } }) {
  const { username } = params;
  return (
    <Suspense fallback={<ProfileSkeleton />}>
      <ProfileContent username={username} />
    </Suspense>
  );

}
