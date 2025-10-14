#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

echo "Creating backups and applying final emergency changes..."

backup() {
  local f="$1"
  if [ -f "$f" ]; then
    cp -v "$f" "$f.bak-$(date +%s)"
  fi
}

# 1) attachTagsToArticles.js
F1="lib/attachTagsToArticles.js"
backup "$F1"
cat > "$F1" <<'JS'
// lib/attachTagsToArticles.js
// Minimal safe stub used for emergency production stabilization.
// It returns a guaranteed-serializable array of articles with empty `tags`.
export async function attachTagsToArticles(supabase, articles) {
  if (!Array.isArray(articles)) return [];

  // Возвращаем чистый, глубоко клонированный массив с гарантированно пустыми тегами
  // Этот массив не должен содержать несериализуемых объектов.
  return JSON.parse(JSON.stringify(articles.map(a => ({ ...a, tags: [] }))));
}
JS

# 2) metadataSanitize.ts
F2="lib/metadataSanitize.ts"
backup "$F2"
cat > "$F2" <<'TS'
// lib/metadataSanitize.ts
// Ensure metadata values are serializable for Next.js (no React elements, functions, symbols).
export function sanitizeMetadata(input: any): any {
  const DIAG = process.env.METADATA_DIAG === 'true';
  const seen = new WeakSet();

  function isReactElement(obj: any) {
    if (!obj || typeof obj !== 'object') return false;
    return Object.prototype.hasOwnProperty.call(obj, '$$typeof');
  }

  function constructorName(v: any) {
    try {
      return v && v.constructor && v.constructor.name ? v.constructor.name : typeof v;
    } catch (e) {
      return typeof v;
    }
  }

  function previewValue(v: any) {
    try {
      if (typeof v === 'string') return v.slice(0, 200);
      if (typeof v === 'number' || typeof v === 'boolean') return String(v);
      if (v === null || v === undefined) return String(v);
      if (Array.isArray(v)) return `[Array(${v.length})]`;
      if (v instanceof Date) return `Date(${v.toISOString()})`;
      if (v instanceof URL) return `URL(${v.toString()})`;
      if (v instanceof RegExp) return `RegExp(${v.toString()})`;
      if (typeof v === 'object') return Object.keys(v).slice(0, 10).join(', ');
      return typeof v;
    } catch (e) {
      return typeof v;
    }
  }

  function logDiag(path: string[], value: any, reason: string) {
    if (!DIAG) return;
    try {
      const p = path.length ? path.join('.') : '<root>';
      const preview = previewValue(value);
      const cname = constructorName(value);
      const stack = new Error().stack;
      // eslint-disable-next-line no-console
      console.error(`SANITIZE DIAG: ${reason} at metadata.${p} constructor=${cname} preview=${preview}`);
      // eslint-disable-next-line no-console
      console.error(stack);
    } catch (e) {
      // swallow
    }
  }

  function isPromiseLike(v: any) {
    return v && (typeof v.then === 'function' || Object.prototype.toString.call(v) === '[object Promise]');
  }

  function isRequestLike(v: any) {
    const name = constructorName(v);
    return name === 'Request' || name === 'NextRequest' || (v && typeof v.headers === 'object' && typeof v.method === 'string');
  }

  function isResponseLike(v: any) {
    const name = constructorName(v);
    return name === 'Response' || name === 'NextResponse' || (v && typeof v.json === 'function' && typeof v.headers === 'object');
  }

  function isStreamLike(v: any) {
    const name = constructorName(v);
    return name === 'ReadableStream' || name === 'Stream' || (v && typeof v.getReader === 'function');
  }

  function isMapLike(v: any) {
    return v instanceof Map || Object.prototype.toString.call(v) === '[object Map]';
  }

  function isSetLike(v: any) {
    return v instanceof Set || Object.prototype.toString.call(v) === '[object Set]';
  }

  function isArrayBufferLike(v: any) {
    return v instanceof ArrayBuffer || ArrayBuffer.isView(v) || Object.prototype.toString.call(v).includes('ArrayBuffer') || Object.prototype.toString.call(v).includes('Uint8');
  }

  function isURLSearchParams(v: any) {
    return Object.prototype.toString.call(v) === '[object URLSearchParams]';
  }

  function sanitize(value: any, path: string[] = []): any {
    if (value == null) return value;
    const t = typeof value;

    // Primitives
    if (t === 'string' || t === 'number' || t === 'boolean') return value;
    if (t === 'bigint' || t === 'symbol' || t === 'function') {
      logDiag(path, value, `unsupported-type:${t}`);
      return undefined;
    }

    // Promise-like -> drop
    if (isPromiseLike(value)) {
      logDiag(path, value, 'promise-like');
      return undefined;
    }

    // Dates -> ISO
    if (value instanceof Date) return isNaN(value.getTime()) ? undefined : value.toISOString();
    // URLs/RegExp -> toString
    if (value instanceof URL) return value.toString();
    if (value instanceof RegExp) return value.toString();

    // Request/Response/Stream/Headers detection
    if (isRequestLike(value)) {
      logDiag(path, value, 'request-like');
      return undefined;
    }
    if (isResponseLike(value)) {
      logDiag(path, value, 'response-like');
      return undefined;
    }
    if (isStreamLike(value)) {
      logDiag(path, value, 'stream-like');
      return undefined;
    }

    // Arrays: sanitize items and drop undefined
    if (Array.isArray(value)) {
      const arr = value.map((it, i) => sanitize(it, path.concat(String(i)))).filter(v => v !== undefined);
      return arr;
    }

    // Map -> convert to plain object with sanitized keys
    if (isMapLike(value)) {
      logDiag(path, value, 'map-like');
      const out: any = {};
      try {
        for (const [k, v] of value.entries()) {
          const key = typeof k === 'string' ? k : String(k);
          const sv = sanitize(v, path.concat(String(key)));
          if (sv !== undefined) out[key] = sv;
        }
        return out;
      } catch (e) {
        logDiag(path, value, 'map-convert-failed');
        return undefined;
      }
    }

    // Set -> convert to array
    if (isSetLike(value)) {
      logDiag(path, value, 'set-like');
      try {
        const arr = Array.from(value).map((it, i) => sanitize(it, path.concat(String(i)))).filter(v => v !== undefined);
        return arr;
      } catch (e) {
        logDiag(path, value, 'set-convert-failed');
        return undefined;
      }
    }

    // ArrayBuffer / TypedArray -> convert to array of numbers
    if (isArrayBufferLike(value)) {
      logDiag(path, value, 'arraybuffer-like');
      try {
        const view = ArrayBuffer.isView(value) ? value : new Uint8Array(value);
        return Array.from(view as any).slice(0, 10240); // cap length
      } catch (e) {
        logDiag(path, value, 'arraybuffer-convert-failed');
        return undefined;
      }
    }

    if (isURLSearchParams(value)) {
      try {
        return value.toString();
      } catch (e) {
        logDiag(path, value, 'urlsearchparams');
        return undefined;
      }
    }

    // Objects: drop React elements and circular refs
    if (t === 'object') {
      if (isReactElement(value)) {
        logDiag(path, value, 'react-element');
        return undefined;
      }
      if (seen.has(value)) {
        logDiag(path, value, 'circular');
        return undefined;
      }
      seen.add(value);

      // If this is a class instance with custom toJSON, prefer that
      if (typeof value.toJSON === 'function' && value.constructor && value.constructor.name !== 'Object') {
        try {
          const j = value.toJSON();
          return sanitize(j, path.concat('<toJSON>'));
        } catch (e) {
          logDiag(path, value, 'toJSON-failed');
        }
      }

      const out: any = {};
      // iterate own enumerable keys only
      for (const k of Object.keys(value)) {
        try {
          const v = sanitize(value[k], path.concat(k));
          if (v !== undefined) out[k] = v;
        } catch (err) {
          // skip problematic property but log diag
          logDiag(path.concat(k), value[k], 'property-skip');
        }
      }

      // If resulting object is empty but original had non-plain constructor, log it
      if (Object.keys(out).length === 0 && value.constructor && value.constructor.name && value.constructor.name !== 'Object') {
        logDiag(path, value, `class-instance:${value.constructor.name}`);
      }
      return out;
    }

    // Fallback: unsupported
    logDiag(path, value, `fallback-unsupported:${t}`);
    return undefined;
  }

  return sanitize(input, []);
}
TS

# 3) app/layout.js
F3="app/layout.js"
backup "$F3"
cat > "$F3" <<'JS'
// app/layout.js

import './main.css';
import { Inter } from 'next/font/google';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import AuthProvider from '@/components/AuthProvider';
import Providers from './providers';
import GlobalErrorHandler from '@/components/GlobalErrorHandler';
// `getUserAndSupabaseFromRequest` is imported dynamically inside the layout to avoid
// circular import issues during the Next.js production build.
import { safeData } from '@/lib/safeSerialize';
import { sanitizeMetadata } from '@/lib/metadataSanitize';
import { Analytics } from '@vercel/analytics/react';
import { UmamiScript } from '@/lib/umami';
import nextDynamic from 'next/dynamic';

const UserSidebar = nextDynamic(() => import('@/components/UserSidebar'), { ssr: false });

const inter = Inter({
  variable: '--font-inter', // Используем CSS переменную для большей гибкости
  subsets: ['latin', 'cyrillic'],
  display: 'swap',
});

// --- ОБНОВЛЕННЫЙ БЛОК МЕТАДАННЫХ ---
export const metadata = sanitizeMetadata({
  // Шаблон для заголовков страниц
  title: {
    default: 'Anton Merkurov | Art x Love x Money', // Заголовок для главной страницы
    template: '%s | Anton Merkurov', // Шаблон для дочерних страниц (напр. "Моя статья | Anton Merkurov")
  },
  description: "Медиа, технологии и искусство. Персональный сайт и блог Антона Меркурова.",
  keywords: ['Антон Меркуров', 'медиа', 'технологии', 'digital', 'искусство', 'блог', 'статьи', 'маркетинг'],
  authors: [{ name: 'Anton Merkurov', url: 'https://merkurov.love' }],
  creator: 'Anton Merkurov',
  publisher: 'Anton Merkurov',
  category: 'Technology',
  // Метаданные для превью в соцсетях (Open Graph)
  openGraph: {
    title: 'Anton Merkurov | Art x Love x Money',
    description: 'Медиа, технологии и искусство.',
    url: 'https://merkurov.love', // Убедитесь, что здесь основной домен
    siteName: 'Anton Merkurov',
    images: [
      {
        // ВАЖНО: Укажите здесь URL на красивую картинку для превью
        url: 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/og-image.png', // Исправлен домен
        width: 1200,
        height: 630,
        alt: 'Anton Merkurov - Art x Love x Money',
      },
    ],
    locale: 'ru_RU',
    type: 'website',
  },
  // Twitter Card
  twitter: {
    card: 'summary_large_image',
    title: 'Anton Merkurov | Art x Love x Money',
    description: 'Медиа, технологии и искусство',
    images: ['https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/og-image.png'],
    creator: '@merkurov',
    site: '@merkurov',
  },
  // Дополнительные метаданные
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
  // Иконки сайта
  icons: {
    icon: '/favicon.ico',
    // shortcut: '/shortcut-icon.png',
    // apple: '/apple-touch-icon.png',
  },
  // Верификация для поисковых систем
  verification: {
    // google: 'your-google-verification-code',
    // yandex: 'your-yandex-verification-code',
  },
  // Альтернативные URL
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


export default async function RootLayout({ children }) {
  // Временно отключаем запрос к базе данных до настройки DATABASE_URL
  let projects = [];
  try {
  const globalReq = (globalThis && globalThis.request) || new Request('http://localhost');
  const mod = await import('@/lib/supabase-server');
  const { getUserAndSupabaseFromRequest } = mod;
  const { supabase } = await getUserAndSupabaseFromRequest(globalReq);
    if (supabase) {
      const { data, error } = await supabase.from('project').select('*').eq('published', true).order('createdAt', { ascending: true });
      if (error) console.error('Supabase fetch projects error', error);
      projects = safeData(data || []);
    } else {
      projects = [];
    }
  } catch (error) {
    // Логируем только в development
    if (process.env.NODE_ENV === 'development') {
      console.error('Database connection error:', error.message);
    }
    // Используем пустой массив для проектов
    projects = [];
  }

  const settings = { 
    site_name: 'Anton Merkurov', 
    slogan: 'Art x Love x Money', 
    logo_url: 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/logo.png' 
  };

  let subscriberCount = 0;
  try {
  const globalReq = (globalThis && globalThis.request) || new Request('http://localhost');
  const mod2 = await import('@/lib/supabase-server');
  const { getUserAndSupabaseFromRequest: getUserAndSupabaseFromRequest2 } = mod2;
  const { supabase } = await getUserAndSupabaseFromRequest2(globalReq);
    if (supabase) {
      const { data, error } = await supabase.from('subscribers').select('id');
      if (!error) {
        const safe = safeData(data || []);
        subscriberCount = (safe && safe.length) || 0;
      } else console.error('Supabase count subscribers error', error);
    }
  } catch (error) {
    // Логируем только в development
    if (process.env.NODE_ENV === 'development') {
      console.error('Ошибка при подсчёте подписчиков:', error);
    }
  }

  return (
    // Применяем шрифт через CSS переменную
    <html lang="ru" className={`${inter.variable} font-sans`}>
      <head>
        {/* Preload critical resources */}
        <link
          rel="preload"
          href={settings.logo_url}
          as="image"
          type="image/png"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href="https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/og-image.png"
          as="image"
          type="image/png"
          crossOrigin="anonymous"
        />
        {/* DNS prefetch for external domains */}
        <link rel="dns-prefetch" href="//txvkqcitalfbjytmnawq.supabase.co" />
        <link rel="dns-prefetch" href="//fonts.googleapis.com" />
        <link rel="dns-prefetch" href="//vercel.com" />
      </head>
  <body className="bg-white text-gray-800 min-h-screen overflow-x-hidden">
        <GlobalErrorHandler />
        <Providers>
          <AuthProvider>
            <div className="flex flex-col min-h-screen">
              <Header projects={safeData(projects)} settings={safeData(settings)} />
              <UserSidebar />
              <div className="flex flex-1 w-full px-0 py-0 gap-8">
                <main className="flex-grow">
                  {children}
                </main>
              </div>
              <Footer subscriberCount={Number(subscriberCount) || 0} />
            </div>
          </AuthProvider>
        </Providers>
  <Analytics />
  {/* Umami analytics */}
  <UmamiScript websiteId="87795d47-f53d-4ef8-8e82-3ee195ea997b" />
      </body>
    </html>
  );
}
JS