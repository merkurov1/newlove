import AuthProvider from '@/components/AuthProvider';

import './main.css';
// Global Swiper styles (move here so CSS is present before client-only slider mounts)
import 'swiper/css';
import 'swiper/css/navigation';
import 'swiper/css/pagination';

import { sanitizeMetadata } from '@/lib/metadataSanitize';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import NextDynamic from 'next/dynamic';
const UserSidebar = NextDynamic(() => import('@/components/UserSidebar'), { ssr: false });
const NewsletterModal = NextDynamic(() => import('@/components/NewsletterModal'), { ssr: false });

// --- SEO: Корректный шаблон заголовка и метаданных ---
export const metadata = sanitizeMetadata({
  title: {
    default: 'Anton Merkurov | Art x Love x Money',
    template: '%s | Anton Merkurov',
  },
  description: 'Медиа, технологии и искусство. Персональный сайт и блог Антона Меркурова.',
  keywords: ['Антон Меркуров', 'медиа', 'технологии', 'digital', 'искусство', 'блог', 'статьи', 'маркетинг'],
  authors: [{ name: 'Anton Merkurov', url: 'https://merkurov.love' }],
  creator: 'Anton Merkurov',
  publisher: 'Anton Merkurov',
  category: 'Technology',
  openGraph: {
    title: 'Anton Merkurov | Art x Love x Money',
    description: 'Медиа, технологии и искусство.',
    url: 'https://merkurov.love',
    siteName: 'Anton Merkurov',
    images: [
      {
        url: 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Anton Merkurov - Art x Love x Money',
      },
    ],
    locale: 'ru_RU',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Anton Merkurov | Art x Love x Money',
    description: 'Медиа, технологии и искусство',
    images: ['https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/og-image.png'],
    creator: '@merkurov',
    site: '@merkurov',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  icons: {
    icon: '/favicon.ico',
  },
  verification: {},
  alternates: {
    canonical: 'https://merkurov.love',
    languages: {
      'ru-RU': 'https://merkurov.love',
    },
    types: {
      'application/rss+xml': 'https://merkurov.love/rss.xml',
    },
  },
});

// Force dynamic rendering for the entire app during this migration/debug pass.
// This avoids Next attempting to prerender/export pages which currently fail
// due to runtime serialization of complex server values. We'll narrow this
// later and re-enable static rendering per-route where safe.
export const dynamic = 'force-dynamic';



import { safeData } from '@/lib/safeSerialize';

// Надёжный SSR-запрос опубликованных проектов через anon key
async function getPublicProjects() {
  try {
    const { getServerSupabaseClient } = await import('@/lib/serverAuth');
    const supabase = getServerSupabaseClient({ useServiceRole: true });
    let projects: any[] = [];
    if (supabase) {
      const res = await supabase.from('projects').select('id,slug,title,publishedAt').eq('published', true).order('publishedAt', { ascending: false }).limit(10);
      projects = res && res.data ? res.data : [];
    } else {
      try {
        const { getServerSupabaseClient } = await import('@/lib/serverAuth');
        const srv = getServerSupabaseClient({ useServiceRole: true });
        const res = await srv.from('projects').select('id,slug,title,publishedAt').eq('published', true).order('publishedAt', { ascending: false }).limit(10);
        projects = res && res.data ? res.data : [];
      } catch (e) {
        console.error('Failed to fetch projects for layout via server client', e);
        projects = [];
      }
    }
    // Ensure we have an array of projects
    if (!Array.isArray(projects)) {
      return [];
    }
    // Guarantee shape for the component
    return projects.map(p => ({
      id: p.id,
      slug: p.slug,
      title: p.title,
    }));
  } catch (e) {
    console.error('SSR getPublicProjects fatal error', e);
    return [];
  }
}

// Fetch subscriber count from the database (service-role client)
async function getSubscriberCount() {
  try {
    const { getServerSupabaseClient } = await import('@/lib/serverAuth');
    const supabase = getServerSupabaseClient({ useServiceRole: true });
    if (!supabase) return 0;
    const res = await supabase.from('subscribers').select('id', { count: 'exact', head: true });
    return res && typeof res.count === 'number' ? Number(res.count) : 0;
  } catch (e) {
    console.error('Failed to fetch subscriber count for layout', e);
    return 0;
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Получаем только опубликованные проекты через anon key
  const projects = await getPublicProjects();
  const subscriberCount = await getSubscriberCount();
  const settings = {
    site_name: 'Anton Merkurov',
    slogan: 'Art x Love x Money',
    logo_url: 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/logo.png'
  };
  return (
    <html lang="ru">
      <head>
        {/* Umami analytics */}
        <script defer src="https://cloud.umami.is/script.js" data-website-id="87795d47-f53d-4ef8-8e82-3ee195ea997b"></script>
      </head>
      <body>
        <AuthProvider>
          <Header settings={safeData(settings)} projects={safeData(projects)} />
          {/* client-only sidebar should appear immediately under the header for logged-in users */}
          <UserSidebar />
          <main>
            {children}
          </main>
          <Footer subscriberCount={Number(subscriberCount) || 0} />
          {/* Newsletter subscription modal - shows once per 24h for non-subscribers */}
          <NewsletterModal />
        </AuthProvider>
      </body>
    </html>
  );
}
