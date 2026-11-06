'use client';

import type { BrainStatusSnapshot } from '@/lib/pierrot/memory/brainStatusTypes';
import type { WorkspaceOverview } from '@/lib/pierrot/workspace/types';
import { aggregateActivityState } from '@/lib/pierrot/workspace/status';
import BrainStatusCard from './BrainStatusCard';
import { CommercialBrief } from './CommercialReport';
import MetricStatusList from './MetricStatusList';

function formatUpdatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'время неизвестно';

  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    // Explicit UTC keeps the server-rendered timestamp identical to the first
    // client render regardless of the browser timezone.
    timeZone: 'UTC',
  }).format(date);
}

/**
 * Minimal owner home: one deterministic headline, three compact indicators and
 * the chat composer below. This is deliberately not a second dashboard.
 */
export default function HomeOverview({
  overview,
  brainStatus,
  onBrainStatusChange,
}: {
  overview: WorkspaceOverview;
  brainStatus: BrainStatusSnapshot | null;
  onBrainStatusChange: (snapshot: BrainStatusSnapshot) => void;
}) {
  const activityState = aggregateActivityState(overview.metrics);

  return (
    <div className="pw-empty">
      <p className="pw-kicker">Pierrot · owner workspace</p>
      <h2 className="pw-empty-title" data-state={activityState}>
        {overview.summary}
      </h2>

      <div className="pw-home-indicators" aria-label="Состояние">
        <BrainStatusCard snapshot={brainStatus} onSnapshotChange={onBrainStatusChange} />
        <CommercialBrief summary={overview.commercial} />
        <MetricStatusList metrics={overview.metrics} />
      </div>

      <p className="pw-home-updated" data-stale={overview.stale ? 'true' : 'false'}>
        {overview.stale ? 'Последнее известное состояние · ' : 'Обновлено '}
        {formatUpdatedAt(overview.generatedAt)}
      </p>
    </div>
  );
}
