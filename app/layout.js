import AuthProvider from '@/components/AuthProvider';

import './main.css';

import { sanitizeMetadata } from '@/lib/metadataSanitize';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import NextDynamic from 'next/dynamic';
const UserSidebar = NextDynamic(() => import('@/components/UserSidebar'), { ssr: false });

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
    let projects = [];
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

export default async function RootLayout({ children }) {
  // Получаем только опубликованные проекты через anon key
  const projects = await getPublicProjects();
  const settings = {
    site_name: 'Anton Merkurov',
    slogan: 'Art x Love x Money',
    logo_url: 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/logo.png'
  };
  return (
    <html lang="ru">
      <body>
        <AuthProvider>
          <Header settings={settings} projects={projects} />
          {/* client-only sidebar should appear immediately under the header for logged-in users */}
          <UserSidebar />
          <main>
            {children}
          </main>
          <Footer />
        </AuthProvider>
      </body>
    </html>
  );
}
