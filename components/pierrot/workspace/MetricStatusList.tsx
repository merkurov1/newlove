import {
  Activity,
  CircleHelp,
  Minus,
  TrendingDown,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';
import type { WorkspaceMetric } from '@/lib/pierrot/workspace/types';
import {
  ACTIVITY_STATE_COPY,
  aggregateActivityState,
  type ActivityState,
} from '@/lib/pierrot/workspace/status';

const ACTIVITY_ICON: Record<ActivityState, LucideIcon> = {
  тревога: TrendingDown,
  смешанно: Activity,
  падает: TrendingDown,
  пухнет: TrendingUp,
  растёт: TrendingUp,
  ровно: Minus,
  тихо: Minus,
  'нет данных': CircleHelp,
};

const ACTIVITY_TONE: Record<ActivityState, string> = {
  тревога: 'negative',
  смешанно: 'attention',
  падает: 'negative',
  пухнет: 'positive',
  растёт: 'positive',
  ровно: 'neutral',
  тихо: 'quiet',
  'нет данных': 'missing',
};

/**
 * The home screen shows one aggregated project word, not the five-row metric
 * list. All five metrics still arrive from the real sources; DASH keeps the
 * detailed presentation.
 */
export default function MetricStatusList({
  metrics,
}: {
  metrics: WorkspaceMetric[];
  limit?: number;
}) {
  const state = aggregateActivityState(metrics);
  const Icon = ACTIVITY_ICON[state];
  const missing = metrics.filter((metric) => metric.state === null).length;

  return (
    <div
      className="pw-home-indicator pw-activity-indicator"
      data-tone={ACTIVITY_TONE[state]}
      title={
        missing > 0
          ? `Нет данных по ${missing} из ${metrics.length} показателей. Подробности в DASH.`
          : 'Подробные показатели — в DASH.'
      }
      aria-label={`Активность проектов: ${ACTIVITY_STATE_COPY[state]}${
        missing > 0 ? `. Нет данных по ${missing} из ${metrics.length} показателей` : ''
      }`}
    >
      <span className="pw-home-indicator-icon" aria-hidden="true">
        <Icon size={16} strokeWidth={1.5} />
      </span>
      <span className="pw-home-indicator-label">Проект</span>
      <span className="pw-home-indicator-value">{ACTIVITY_STATE_COPY[state]}</span>
    </div>
  );
}
