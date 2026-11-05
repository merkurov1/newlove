'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

type LoadState = 'loading' | 'ready' | 'error';

type PostcardSignals = {
  state: LoadState;
  catalogue: number | null;
  available: number | null;
  orders: number | null;
};

type TraceSignals = {
  state: LoadState;
  recent: number | null;
  latestType: string | null;
  latestAt: string | null;
};

const ROOMS = [
  {
    index: '01',
    title: 'World',
    href: '/heartandangel/world',
    description: 'The living landscape: time, weather, angels and demons in one scene.',
  },
  {
    index: '02',
    title: 'About the World',
    href: '/heartandangel/about',
    description: 'The story, the symbols and the argument for love as a survival strategy.',
  },
  {
    index: '03',
    title: 'Keep Calm',
    href: '/heartandangel/calm',
    description: 'An interactive ritual for slowing down and holding a fragile heart in motion.',
  },
  {
    index: '04',
    title: 'Let It Go',
    href: '/heartandangel/letitgo',
    description: 'Release a burden into the sky. A small, quiet ritual of letting go.',
  },
  {
    index: '05',
    title: 'Temple',
    href: '/temple',
    description: 'Six rituals built around attention, memory, release and return.',
  },
  {
    index: '06',
    title: 'Postcard',
    href: '/heartandangel/card',
    description: 'The physical edition: an original artwork and a personal message, sent by post.',
  },
] as const;

function formatWhen(value: string | null): string | null {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  }).format(date);
}

function readOrderCount(value: unknown): number {
  if (!value || typeof value !== 'object') return 0;
  const record = value as Record<string, unknown>;
  const direct = record._count;

  if (direct && typeof direct === 'object') {
    const count = (direct as Record<string, unknown>).orders;
    if (typeof count === 'number' && Number.isFinite(count)) return count;
  }

  const relation = record.postcard_orders;
  if (Array.isArray(relation) && relation[0] && typeof relation[0] === 'object') {
    const count = (relation[0] as Record<string, unknown>).count;
    if (typeof count === 'number' && Number.isFinite(count)) return count;
  }

  return 0;
}

export default function HeartAndAngelWorkspace() {
  const [postcards, setPostcards] = useState<PostcardSignals>({
    state: 'loading',
    catalogue: null,
    available: null,
    orders: null,
  });
  const [traces, setTraces] = useState<TraceSignals>({
    state: 'loading',
    recent: null,
    latestType: null,
    latestAt: null,
  });

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      const [postcardResult, traceResult] = await Promise.allSettled([
        fetch('/api/postcards', { signal: controller.signal, cache: 'no-store' }),
        fetch('/api/temple_logs', { signal: controller.signal, cache: 'no-store' }),
      ]);

      if (controller.signal.aborted) return;

      if (postcardResult.status === 'fulfilled' && postcardResult.value.ok) {
        try {
          const payload = (await postcardResult.value.json()) as {
            postcards?: unknown;
          };
          const list = Array.isArray(payload.postcards) ? payload.postcards : [];

          setPostcards({
            state: 'ready',
            catalogue: list.length,
            available: list.filter((item) => {
              if (!item || typeof item !== 'object') return false;
              return (item as Record<string, unknown>).available === true;
            }).length,
            orders: list.reduce((sum, item) => sum + readOrderCount(item), 0),
          });
        } catch {
          setPostcards({
            state: 'error',
            catalogue: null,
            available: null,
            orders: null,
          });
        }
      } else {
        setPostcards({
          state: 'error',
          catalogue: null,
          available: null,
          orders: null,
        });
      }

      if (traceResult.status === 'fulfilled' && traceResult.value.ok) {
        try {
          const payload = (await traceResult.value.json()) as { data?: unknown };
          const list = Array.isArray(payload.data) ? payload.data : [];
          const latest =
            list[0] && typeof list[0] === 'object' ? (list[0] as Record<string, unknown>) : null;

          setTraces({
            state: 'ready',
            recent: list.length,
            latestType: latest && typeof latest.event_type === 'string' ? latest.event_type : null,
            latestAt: latest && typeof latest.created_at === 'string' ? latest.created_at : null,
          });
        } catch {
          setTraces({
            state: 'error',
            recent: null,
            latestType: null,
            latestAt: null,
          });
        }
      } else {
        setTraces({
          state: 'error',
          recent: null,
          latestType: null,
          latestAt: null,
        });
      }
    }

    void load();

    return () => controller.abort();
  }, []);

  const latestWhen = formatWhen(traces.latestAt);

  return (
    <div className="pw-page pw-heart">
      <div className="pw-page-inner">
        <header className="pw-heart-head">
          <div className="pw-heart-head-copy">
            <p className="pw-kicker">HEART &amp; ANGEL · owner index</p>
            <h1 className="pw-page-title">The living world.</h1>
            <p className="pw-page-lede">
              A doorway into the existing Heart &amp; Angel rooms. Nothing is duplicated here: the
              tab opens the same public works, rituals and postcard flow.
            </p>
          </div>

          <div className="pw-heart-actions">
            <Link href="/heartandangel" className="pw-button pw-button-primary">
              Open public hub
            </Link>
            <Link href="/heartandangel/world" className="pw-button">
              Enter World
            </Link>
          </div>
        </header>

        <section aria-labelledby="pw-heart-rooms">
          <div className="pw-heart-section-head">
            <h2 id="pw-heart-rooms" className="pw-section-title">
              Rooms
            </h2>
            <span>existing routes</span>
          </div>

          <div className="pw-heart-rooms">
            {ROOMS.map((room) => (
              <Link key={room.href} href={room.href} className="pw-heart-room">
                <span className="pw-heart-room-index">{room.index}</span>
                <h3>{room.title}</h3>
                <p>{room.description}</p>
                <span className="pw-heart-room-open">Open ↗</span>
              </Link>
            ))}
          </div>
        </section>

        <div className="pw-heart-lower">
          <section className="pw-heart-panel" aria-labelledby="pw-heart-signals">
            <div className="pw-heart-section-head">
              <h2 id="pw-heart-signals" className="pw-section-title">
                Live signals
              </h2>
              <span>existing APIs</span>
            </div>

            <div className="pw-heart-signals">
              <div className="pw-heart-signal">
                <span>Postcard catalogue</span>
                <strong>{postcards.state === 'ready' ? postcards.catalogue : '—'}</strong>
                <em>
                  {postcards.state === 'ready'
                    ? `${postcards.available} available`
                    : postcards.state === 'error'
                      ? 'unavailable'
                      : 'loading'}
                </em>
              </div>

              <div className="pw-heart-signal">
                <span>Postcard orders</span>
                <strong>{postcards.state === 'ready' ? postcards.orders : '—'}</strong>
                <em>
                  {postcards.state === 'ready'
                    ? 'catalogue total'
                    : postcards.state === 'error'
                      ? 'unavailable'
                      : 'loading'}
                </em>
              </div>

              <div className="pw-heart-signal">
                <span>Temple traces</span>
                <strong>{traces.state === 'ready' ? traces.recent : '—'}</strong>
                <em>
                  {traces.state === 'ready'
                    ? 'last 10 events'
                    : traces.state === 'error'
                      ? 'unavailable'
                      : 'loading'}
                </em>
              </div>

              <div className="pw-heart-signal">
                <span>Latest trace</span>
                <strong className="pw-heart-signal-type">
                  {traces.state === 'ready' && traces.latestType ? traces.latestType : '—'}
                </strong>
                <em>{latestWhen ? `${latestWhen} UTC` : 'no recent event'}</em>
              </div>
            </div>
          </section>

          <section className="pw-heart-panel" aria-labelledby="pw-heart-tools">
            <div className="pw-heart-section-head">
              <h2 id="pw-heart-tools" className="pw-section-title">
                Owner desk
              </h2>
              <span>existing tools</span>
            </div>

            <div className="pw-heart-tools">
              <Link href="/admin/postcards">
                <span>Postcard catalogue</span>
                <em>Edit artworks, availability and orders ↗</em>
              </Link>
              <Link href="/admin/pierrot/dash">
                <span>Commercial dash</span>
                <em>Heart &amp; Angel postcard revenue and funnels ↗</em>
              </Link>
              <Link href="/admin/pierrot/intelligence">
                <span>Intelligence</span>
                <em>Conversations and postcard funnel snapshot ↗</em>
              </Link>
            </div>
          </section>
        </div>

        <p className="pw-heart-foot">
          This screen only reads existing public routes and APIs. It does not write to Temple,
          postcards, orders or the public Heart &amp; Angel state.
        </p>
      </div>
    </div>
  );
}
