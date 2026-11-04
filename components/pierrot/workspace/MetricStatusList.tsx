import type { WorkspaceMetric } from '@/lib/pierrot/workspace/types';
import { METRIC_STATE_COPY, metricDotTone } from '@/lib/pierrot/workspace/status';

export default function MetricStatusList({
  metrics,
  limit = 5,
}: {
  metrics: WorkspaceMetric[];
  limit?: number;
}) {
  return (
    <ul className="pw-status-list" aria-label="Состояние проектов">
      {metrics.slice(0, limit).map((metric) => (
        <li key={metric.key} className="pw-status-row">
          <span className="pw-status-label">{metric.label}</span>
          {metric.state ? (
            <span className="pw-status-word">{METRIC_STATE_COPY[metric.state]}</span>
          ) : (
            <span className="pw-status-missing">нет данных</span>
          )}
          <span
            className={`pw-dot pw-dot-${metricDotTone(metric.state)}`}
            aria-hidden="true"
          />
        </li>
      ))}
    </ul>
  );
}
