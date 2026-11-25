'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Compass,
  Flame,
  Heart,
  Moon,
  Radio,
  ShieldCheck,
  Sparkles,
  Trash2,
  Users,
} from 'lucide-react';
import { useTempleChronicles } from '@/hooks/useTempleChronicles';
import {
  groupTempleChronicleEvents,
  type TempleChronicleDay,
} from '@/lib/temple/chronicles';
import type {
  TempleChronicleEvent,
  TemplePublicAggregates,
} from '@/lib/temple/feed';
import {
  readPublicIdentityPreference,
  writePublicIdentityPreference,
} from '@/lib/temple/publicIdentity';
import styles from '@/app/temple/temple.module.css';

type IconComponent = React.ComponentType<{
  size?: number;
  className?: string;
}>;

const RITUAL_VISUALS: Record<
  string,
  { icon: IconComponent; accent: string }
> = {
  VIGIL: { icon: Flame, accent: '#b77c1f' },
  VIGIL_SPARK: { icon: Flame, accent: '#b77c1f' },
  ASH: { icon: Trash2, accent: '#a24c55' },
  CAST: { icon: Compass, accent: '#5f699f' },
  ABSOLUTION: { icon: ShieldCheck, accent: '#4f7a58' },
  TRIBUTE: { icon: Heart, accent: '#a9752c' },
  MEDITATION: { icon: Moon, accent: '#7d62a1' },
  SILENCE: { icon: Moon, accent: '#7d62a1' },
  HEARTANDANGEL: { icon: Moon, accent: '#7d62a1' },
  WHISPER: { icon: Sparkles, accent: '#9a7437' },
};

function visualsFor(event: TempleChronicleEvent) {
  return (
    RITUAL_VISUALS[event.ritual] ?? {
      icon: Radio,
      accent: '#85786b',
    }
  );
}

function formatEventTime(iso: string): string {
  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) return '';

  // Fixed UTC output keeps server and client HTML identical.
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'UTC',
  }).format(date);
}

function EventRow({ event }: { event: TempleChronicleEvent }) {
  const visuals = visualsFor(event);
  const Icon = visuals.icon;
  const fullText = [
    event.ritualLabel,
    event.description,
    event.visitor ?? null,
  ]
    .filter(Boolean)
    .join(' — ');

  return (
    <li
      className={styles.chronicleEvent}
      aria-label={fullText}
      title={fullText}
    >
      <span
        className={styles.chronicleEventIcon}
        style={{ color: visuals.accent }}
        aria-hidden="true"
      >
        <Icon size={14} />
      </span>

      <span className={styles.chronicleEventBody}>
        <span className={styles.chronicleEventRitual}>
          {event.ritualLabel}
        </span>
        <span className={styles.chronicleEventText}>{event.description}</span>
        {event.visitor && (
          <span className={styles.chronicleEventVisitor}>
            · {event.visitor}
          </span>
        )}
      </span>

      <time
        dateTime={event.occurredAt}
        className={styles.chronicleEventTime}
      >
        {formatEventTime(event.occurredAt)}
      </time>
    </li>
  );
}

function DayGroup({ day }: { day: TempleChronicleDay }) {
  return (
    <section className={styles.chronicleDay} aria-label={day.label}>
      <h4 className={styles.chronicleDayTitle}>{day.label}</h4>
      <ol className={styles.chronicleList}>
        {day.events.map((event) => (
          <EventRow key={event.id} event={event} />
        ))}
      </ol>
    </section>
  );
}

export default function TempleChronicles({
  initialAggregates = null,
}: {
  initialAggregates?: TemplePublicAggregates | null;
}) {
  const {
    events,
    aggregates,
    status,
    error,
    hasMore,
    loadingMore,
    live,
    loadMore,
  } = useTempleChronicles();

  const [publicIdentity, setPublicIdentity] = useState(false);

  useEffect(() => {
    setPublicIdentity(readPublicIdentityPreference());
  }, []);

  const days = useMemo(
    () => groupTempleChronicleEvents(events),
    [events]
  );

  const memory = aggregates ?? initialAggregates;
  const namedVisitors = memory?.namedAuthors ?? 0;
  const completedRituals = memory?.completedRituals ?? 0;
  const vigilSparks = memory?.vigilSparks ?? 0;

  const handleIdentityToggle = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const next = event.target.checked;
    setPublicIdentity(next);
    writePublicIdentityPreference(next);
  };

  return (
    <div className={styles.chronicleBody}>
      <section
        className={styles.statGrid}
        aria-label="Temple memory in the last 30 days"
      >
        <div className={styles.stat}>
          <Activity size={18} aria-hidden="true" />
          <span className={styles.statValue}>{completedRituals}</span>
          <span className={styles.statLabel}>Rituals kept</span>
          <span className={styles.statNote}>
            In the last 30 days
          </span>
        </div>

        <div className={styles.stat}>
          <Flame
            size={18}
            className="text-amber-600"
            aria-hidden="true"
          />
          <span className={styles.statValue}>{vigilSparks}</span>
          <span className={styles.statLabel}>Vigil sparks</span>
          <span className={styles.statNote}>
            Shared heart, last 30 days
          </span>
        </div>

        <div className={styles.stat}>
          <Users size={18} aria-hidden="true" />
          <span className={styles.statValue}>{namedVisitors}</span>
          <span className={styles.statLabel}>Named pilgrims</span>
          <span className={styles.statNote}>
            Only visitors who chose to be named
          </span>
        </div>
      </section>

      <p className={styles.chronicleLive} role="status" aria-live="polite">
        <span
          className={
            live
              ? styles.chronicleLiveDot
              : `${styles.chronicleLiveDot} ${styles.chronicleLiveDotIdle}`
          }
          aria-hidden="true"
        />
        {live
          ? 'The chronicle is live.'
          : 'The chronicle refreshes as the Temple changes.'}
      </p>

      <label className={styles.chronicleIdentity}>
        <input
          type="checkbox"
          checked={publicIdentity}
          onChange={handleIdentityToggle}
        />
        <span>
          Show my name beside future rituals. Off by default.
        </span>
      </label>

      {status === 'stale' && events.length > 0 && (
        <p className={styles.chronicleNotice} role="status">
          Showing the entries already received. The chronicle will catch up
          shortly.
        </p>
      )}

      {status === 'error' && events.length === 0 && (
        <p className={styles.chronicleEmpty} role="status">
          The chronicle is resting for a moment. Please try again shortly.
        </p>
      )}

      {status === 'loading' && events.length === 0 && (
        <p className={styles.chronicleEmpty} role="status">
          Opening the chronicle…
        </p>
      )}

      {status !== 'loading' &&
        status !== 'error' &&
        events.length === 0 && (
          <p className={styles.chronicleEmpty}>
            The chronicle is still empty. The first ritual will open it.
          </p>
        )}

      {days.length > 0 && (
        <div className={styles.chronicleTimeline}>
          {days.map((day) => (
            <DayGroup key={day.key} day={day} />
          ))}
        </div>
      )}

      {hasMore && (
        <button
          type="button"
          className={styles.chronicleMore}
          onClick={() => void loadMore()}
          disabled={loadingMore}
        >
          {loadingMore ? 'Reading older entries…' : 'Read older entries'}
        </button>
      )}

      {error && events.length > 0 && status !== 'stale' && (
        <p className={styles.chronicleNotice} role="status">
          The newest entries are still on their way. The older ones remain
          here.
        </p>
      )}
    </div>
  );
}
