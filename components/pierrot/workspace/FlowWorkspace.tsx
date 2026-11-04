'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ExternalLink, PenLine, Trash2 } from 'lucide-react';
import NewPostModal from '@/components/flow/NewPostModal';
import { useOnlineStatus } from './useOnlineStatus';

type FlowImage = {
  url: string;
  alt: string | null;
  caption: string | null;
};

type FlowLink = {
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
  domain: string | null;
  inBody: boolean;
};

type FlowVideo = {
  url: string;
  provider: 'youtube' | 'other';
  videoId: string | null;
  title: string | null;
  thumbnail: string | null;
  author: string | null;
};

type FlowFeedItem = {
  id: string;
  title: string;
  slug: string | null;
  lang: string;
  type: string;
  contentType: string;
  status: string;
  visibility: string;
  body_md?: string | null;
  bodyText?: string;
  bodyExcerpt?: string;
  bodyTruncated?: boolean;
  showTitle?: boolean;
  description?: string;
  source_url?: string | null;
  canonicalUrl?: string;
  sourceName?: string;
  images?: FlowImage[];
  videos?: FlowVideo[];
  links?: FlowLink[];
  published_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type FlowFeedResponse = {
  items?: FlowFeedItem[];
  hasMore?: boolean;
  error?: string;
};

function formatDate(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

function itemHref(item: FlowFeedItem): string {
  return item.slug ? `/flow/${encodeURIComponent(item.slug)}` : '/flow';
}

export default function FlowWorkspace() {
  const online = useOnlineStatus();
  const [items, setItems] = useState<FlowFeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const fetchingRef = useRef(false);

  const loadItems = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;

    try {
      const response = await fetch('/api/flow/items?limit=20&offset=0', {
        cache: 'no-store',
      });
      const payload = (await response.json().catch(() => ({}))) as FlowFeedResponse;

      if (!response.ok) {
        throw new Error(payload.error || 'Не удалось загрузить Flow.');
      }

      if (!mountedRef.current) return;
      setItems(Array.isArray(payload.items) ? payload.items : []);
      setError(null);
    } catch (caught) {
      if (!mountedRef.current) return;
      setError(caught instanceof Error ? caught.message : 'Не удалось загрузить Flow.');
    } finally {
      fetchingRef.current = false;
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void loadItems();

    const handleUpdated = () => {
      void loadItems();
    };

    window.addEventListener('flow:updated', handleUpdated);
    return () => {
      mountedRef.current = false;
      window.removeEventListener('flow:updated', handleUpdated);
    };
  }, [loadItems]);

  async function deleteItem(item: FlowFeedItem) {
    if (!online) return;
    const confirmed = window.confirm(
      `Удалить «${item.title || 'эту запись'}»? Существующий backend также попытается удалить внешние копии.`
    );
    if (!confirmed) return;

    setDeletingId(item.id);
    setError(null);

    try {
      const response = await fetch(`/api/flow/items/${encodeURIComponent(item.id)}`, {
        method: 'DELETE',
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.error || 'Удаление не удалось.');
      }

      setItems((current) => current.filter((entry) => entry.id !== item.id));
      window.dispatchEvent(new CustomEvent('flow:updated'));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Удаление не удалось.');
    } finally {
      setDeletingId(null);
    }
  }

  const empty = !loading && items.length === 0;

  const content = useMemo(
    () =>
      items.map((item) => {
        const body = item.bodyExcerpt || item.bodyText || '';
        const images = item.images ?? [];
        const links = (item.links ?? []).filter((link) => !link.inBody);
        const href = itemHref(item);

        return (
          <article key={item.id} className="pw-site-entry">
            <div className="pw-site-entry-meta">
              <time dateTime={item.published_at || item.created_at || undefined}>
                {formatDate(item.published_at || item.created_at)}
              </time>
              <div className="pw-site-entry-actions">
                <button
                  type="button"
                  onClick={() => setEditingId(item.id)}
                  disabled={!online || deletingId === item.id}
                  aria-label="Редактировать запись"
                >
                  <PenLine size={13} aria-hidden="true" />
                  Редактировать
                </button>
                <button
                  type="button"
                  onClick={() => void deleteItem(item)}
                  disabled={!online || deletingId === item.id}
                  aria-label="Удалить запись"
                >
                  <Trash2 size={13} aria-hidden="true" />
                  {deletingId === item.id ? 'Удаляю…' : 'Удалить'}
                </button>
              </div>
            </div>

            {item.showTitle && item.title && (
              <h2 className="pw-site-entry-title">
                <Link href={href}>{item.title}</Link>
              </h2>
            )}

            {body && (
              <Link href={href} className="pw-site-entry-body">
                <p>{body}</p>
              </Link>
            )}

            {item.bodyTruncated && (
              <Link href={href} className="pw-site-entry-more">
                Read full →
              </Link>
            )}

            {images.length > 0 && (
              <Link href={href} className="pw-site-entry-image">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={images[0].url} alt={images[0].alt || ''} loading="lazy" />
              </Link>
            )}

            {links.map((link) => (
              <a
                key={link.url}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="pw-site-entry-link"
              >
                <span>{link.title || link.siteName || link.domain || link.url}</span>
                {link.description && <small>{link.description}</small>}
                <em>{link.siteName || link.domain || 'источник'} ↗</em>
              </a>
            ))}

            <div className="pw-site-entry-footer">
              <Link href={href}>
                Открыть на сайте <ExternalLink size={11} aria-hidden="true" />
              </Link>
            </div>
          </article>
        );
      }),
    [deletingId, items, online]
  );

  return (
    <div className="pw-flow-site">
      <div className="pw-flow-site-inner">
        <header className="pw-flow-site-head">
          <div>
            <p className="pw-kicker">FLOW · ПУБЛИЧНО</p>
            <h1 className="pw-flow-site-title">Flow</h1>
            <p className="pw-flow-site-sub">Stream of thoughts, media &amp; signals</p>
          </div>
          <div className="pw-flow-site-links">
            <a
              href="https://bsky.app/profile/merkurov.love"
              target="_blank"
              rel="noopener noreferrer"
            >
              Bluesky ↗
            </a>
            <span>·</span>
            <a
              href="https://t.me/unframed_am"
              target="_blank"
              rel="noopener noreferrer"
            >
              Telegram ↗
            </a>
            <span>·</span>
            <a href="/flow/rss.xml" target="_blank" rel="noopener noreferrer">
              RSS ↗
            </a>
          </div>
        </header>

        <button
          type="button"
          className="pw-flow-composer"
          onClick={() => setComposerOpen(true)}
          disabled={!online}
          aria-haspopup="dialog"
        >
          <span className="pw-flow-composer-placeholder">
            {online ? 'Что нового?' : 'Нет соединения'}
          </span>
          <span className="pw-flow-composer-action">
            <PenLine size={14} aria-hidden="true" />
            Опубликовать
          </span>
        </button>

        {error && (
          <div className="pw-notice pw-notice-warning" role="alert">
            {error}
          </div>
        )}

        {loading ? (
          <div className="pw-flow-loading" aria-busy="true" aria-label="Загрузка Flow">
            <span />
            <span />
            <span />
          </div>
        ) : empty ? (
          <div className="pw-flow-empty">
            <p>Публикаций пока нет.</p>
            <button
              type="button"
              onClick={() => setComposerOpen(true)}
              disabled={!online}
            >
              Написать первую запись
            </button>
          </div>
        ) : (
          <div className="pw-site-feed">{content}</div>
        )}
      </div>

      <NewPostModal
        open={composerOpen}
        onClose={() => setComposerOpen(false)}
        onCreated={() => {
          setComposerOpen(false);
          void loadItems();
          window.dispatchEvent(new CustomEvent('flow:updated'));
        }}
      />

      {editingId && (
        <NewPostModal
          open
          itemId={editingId}
          onClose={() => setEditingId(null)}
          onCreated={() => {
            setEditingId(null);
            void loadItems();
            window.dispatchEvent(new CustomEvent('flow:updated'));
          }}
        />
      )}
    </div>
  );
}
