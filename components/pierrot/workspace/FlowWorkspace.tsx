'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { ExternalLink, PenLine, Trash2, X } from 'lucide-react';
import NewPostModal from '@/components/flow/NewPostModal';
import FlowImage from '@/components/flow/FlowImage';
import { resolveFlowCardComposition } from '@/lib/flow/cardComposition';
import WorkspaceMarkdown from './WorkspaceMarkdown';
import { useOnlineStatus } from './useOnlineStatus';

type FlowImageItem = {
  url: string;
  alt: string | null;
  caption: string | null;
  width: number | null;
  height: number | null;
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
  images?: FlowImageItem[];
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

function imageAspect(image: FlowImageItem): string {
  return image.width && image.height ? `${image.width} / ${image.height}` : '4 / 3';
}

function EntryImages({
  images,
  title,
  priority,
  onOpen,
}: {
  images: FlowImageItem[];
  title: string;
  priority: boolean;
  onOpen: () => void;
}) {
  if (images.length === 1) {
    const image = images[0];

    return (
      <button
        type="button"
        className="pw-site-entry-image"
        onClick={onOpen}
        aria-label="Открыть запись с изображением"
      >
        <FlowImage
          src={image.url}
          alt={image.alt || image.caption || title || ''}
          aspectRatio={imageAspect(image)}
          objectFit="contain"
          sizes="(max-width: 900px) 100vw, 720px"
          priority={priority}
        />
      </button>
    );
  }

  const visible = images.slice(0, 4);
  const remaining = images.length - visible.length;

  return (
    <div className="pw-site-entry-gallery">
      {visible.map((image, index) => (
        <button
          key={`${image.url}-${index}`}
          type="button"
          className="pw-site-entry-gallery-item"
          onClick={onOpen}
          aria-label="Открыть запись с изображениями"
        >
          <FlowImage
            src={image.url}
            alt={image.alt || image.caption || `${title} — ${index + 1}`}
            aspectRatio={index === 0 && visible.length === 3 ? '16 / 9' : '1 / 1'}
            sizes="(max-width: 900px) 50vw, 350px"
            priority={priority && index === 0}
          />
          {index === visible.length - 1 && remaining > 0 && (
            <span className="pw-site-entry-gallery-count">+{remaining}</span>
          )}
        </button>
      ))}
    </div>
  );
}

function EntryVideos({ videos }: { videos: FlowVideo[] }) {
  return (
    <>
      {videos.map((video, index) => (
        <a
          key={`${video.url}-${index}`}
          href={video.url}
          target="_blank"
          rel="noopener noreferrer"
          className="pw-site-entry-video"
        >
          {video.thumbnail && (
            <span className="pw-site-entry-video-thumb">
              <FlowImage
                src={video.thumbnail}
                alt=""
                aspectRatio="16 / 9"
                sizes="(max-width: 900px) 40vw, 220px"
              />
              <span className="pw-site-entry-video-play" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="currentColor" width="26" height="26">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </span>
            </span>
          )}
          <span className="pw-site-entry-video-copy">
            <strong>{video.title || 'Смотреть видео'}</strong>
            <span>
              {video.author ? `${video.author} · ` : ''}
              {video.provider === 'youtube' ? 'YouTube' : 'Видео'} ↗
            </span>
          </span>
        </a>
      ))}
    </>
  );
}

export default function FlowWorkspace() {
  const online = useOnlineStatus();
  const [items, setItems] = useState<FlowFeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<FlowFeedItem | null>(null);
  const mountedRef = useRef(true);
  const requestIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const loadItems = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const requestId = ++requestIdRef.current;

    try {
      const response = await fetch('/api/flow/items?limit=20&offset=0', {
        cache: 'no-store',
        signal: controller.signal,
      });
      const payload = (await response.json().catch(() => ({}))) as FlowFeedResponse;

      if (!response.ok) {
        throw new Error(payload.error || 'Не удалось загрузить Flow.');
      }

      if (!mountedRef.current || requestId !== requestIdRef.current) return;
      setItems(Array.isArray(payload.items) ? payload.items : []);
      setError(null);
    } catch (caught) {
      if (!mountedRef.current || requestId !== requestIdRef.current) return;
      if (caught instanceof DOMException && caught.name === 'AbortError') return;
      setError(caught instanceof Error ? caught.message : 'Не удалось загрузить Flow.');
    } finally {
      if (mountedRef.current && requestId === requestIdRef.current) {
        setLoading(false);
      }
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
      abortRef.current?.abort();
      window.removeEventListener('flow:updated', handleUpdated);
    };
  }, [loadItems]);

  useEffect(() => {
    if (!selectedItem) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setSelectedItem(null);
    }

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [selectedItem]);

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
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Удаление не удалось.');
    } finally {
      setDeletingId(null);
    }
  }

  const empty = !loading && items.length === 0;

  function openReader(item: FlowFeedItem) {
    setSelectedItem(item);
  }

  return (
    <div className="pw-flow-site">
      <div className="pw-flow-site-inner">
        {error && (
          <div className="pw-notice pw-notice-warning" role="alert">
            {error}
          </div>
        )}

        {loading ? (
          <div className="pw-flow-loading" aria-busy="true" aria-label="Загрузка Flow">
            {[0, 1, 2].map((index) => (
              <div key={index} className="pw-flow-skeleton">
                <span className="pw-flow-skeleton-meta" />
                <span className="pw-flow-skeleton-title" />
                <span className="pw-flow-skeleton-line" />
                <span className="pw-flow-skeleton-image" />
              </div>
            ))}
          </div>
        ) : error && items.length === 0 ? (
          <div className="pw-flow-empty">
            <p>Не удалось загрузить Flow.</p>
            <button type="button" onClick={() => void loadItems()}>
              Повторить
            </button>
          </div>
        ) : empty ? (
          <div className="pw-flow-empty">
            <p>Публикаций пока нет.</p>
          </div>
        ) : (
          <div className="pw-site-feed">
            {items.map((item, itemIndex) => {
              const body = item.bodyExcerpt || item.bodyText || '';
              const images = item.images ?? [];
              const videos = item.videos ?? [];
              const links = (item.links ?? []).filter((link) => !link.inBody);
              const href = itemHref(item);
              const showTitle = Boolean(item.showTitle && item.title);
              const hasText = showTitle || Boolean(body);
              const hasImages = images.length > 0;
              const hasVideos = videos.length > 0;
              const hasMedia = hasImages || hasVideos;
              const composition = resolveFlowCardComposition({
                hasText,
                images: images.length,
                videos: videos.length,
                links: links.length,
              });

              return (
                <article
                  key={item.id}
                  className={`pw-site-entry pw-site-entry--${composition}`}
                  data-content-type={item.contentType || item.type}
                  style={{ '--pw-entry-index': itemIndex } as CSSProperties}
                >
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

                  {/* Visual content always comes before the title and body when
                   * both exist. The text can no longer push an image below the
                   * fold or make it look secondary. */}
                  {hasMedia && (
                    <div className="pw-site-entry-media">
                      {hasImages && (
                        <EntryImages
                          images={images}
                          title={item.title}
                          priority={itemIndex === 0}
                          onOpen={() => openReader(item)}
                        />
                      )}
                      {hasVideos && <EntryVideos videos={videos} />}
                    </div>
                  )}

                  {showTitle && (
                    <h2 className="pw-site-entry-title">
                      <button type="button" onClick={() => openReader(item)}>
                        {item.title}
                      </button>
                    </h2>
                  )}

                  {body && (
                    <button
                      type="button"
                      className="pw-site-entry-body"
                      onClick={() => openReader(item)}
                    >
                      <span className="pw-site-entry-body-text">{body}</span>
                    </button>
                  )}

                  {item.bodyTruncated && (
                    <button
                      type="button"
                      className="pw-site-entry-more"
                      onClick={() => openReader(item)}
                    >
                      Читать полностью →
                    </button>
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
                    <button type="button" onClick={() => openReader(item)}>
                      Читать
                    </button>
                    <a href={href} target="_blank" rel="noopener noreferrer">
                      На сайте <ExternalLink size={11} aria-hidden="true" />
                    </a>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      <button
        type="button"
        className="pw-flow-publish"
        onClick={() => setComposerOpen(true)}
        disabled={!online}
        aria-haspopup="dialog"
        aria-label="Написать в Flow"
      >
        <PenLine size={15} aria-hidden="true" />
        Написать
      </button>

      {selectedItem && (
        <div
          className="pw-flow-reader"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pw-flow-reader-title"
          onClick={(event) => {
            if (event.target === event.currentTarget) setSelectedItem(null);
          }}
        >
          <article className="pw-flow-reader-panel">
            <header className="pw-flow-reader-head">
              <div>
                <p className="pw-dev-kicker">FLOW · ПУБЛИЧНО</p>
                <time dateTime={selectedItem.published_at || selectedItem.created_at || undefined}>
                  {formatDate(selectedItem.published_at || selectedItem.created_at)}
                </time>
              </div>
              <button
                type="button"
                className="pw-icon-button"
                onClick={() => setSelectedItem(null)}
                aria-label="Закрыть запись"
                autoFocus
              >
                <X size={18} strokeWidth={1.4} aria-hidden="true" />
              </button>
            </header>

            {selectedItem.title && (
              <h2 id="pw-flow-reader-title" className="pw-flow-reader-title">
                {selectedItem.title}
              </h2>
            )}

            {(selectedItem.images ?? []).map((image, index) => (
              <FlowImage
                key={`${image.url}-${index}`}
                src={image.url}
                alt={image.alt || image.caption || ''}
                aspectRatio={
                  image.width && image.height ? `${image.width} / ${image.height}` : '4 / 3'
                }
                objectFit="contain"
                sizes="(max-width: 900px) 100vw, 720px"
                className="pw-flow-reader-image"
                priority={index === 0}
              />
            ))}

            {selectedItem.body_md ? (
              <WorkspaceMarkdown className="pw-flow-reader-body" content={selectedItem.body_md} />
            ) : (
              <p className="pw-flow-reader-text">
                {selectedItem.bodyText || selectedItem.bodyExcerpt || ''}
              </p>
            )}

            {(selectedItem.links ?? [])
              .filter((link) => !link.inBody)
              .map((link) => (
                <a
                  key={link.url}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="pw-flow-reader-link"
                >
                  <span>{link.title || link.siteName || link.domain || link.url}</span>
                  {link.description && <small>{link.description}</small>}
                  <em>{link.siteName || link.domain || 'источник'} ↗</em>
                </a>
              ))}

            <footer className="pw-flow-reader-foot">
              <a href={itemHref(selectedItem)} target="_blank" rel="noopener noreferrer">
                Открыть на сайте <ExternalLink size={12} aria-hidden="true" />
              </a>
            </footer>
          </article>
        </div>
      )}

      <NewPostModal
        open={composerOpen}
        onClose={() => setComposerOpen(false)}
        onCreated={() => {
          setComposerOpen(false);
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
            window.dispatchEvent(new CustomEvent('flow:updated'));
          }}
        />
      )}
    </div>
  );
}
