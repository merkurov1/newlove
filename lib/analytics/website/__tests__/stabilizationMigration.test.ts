/** @jest-environment node */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from '@jest/globals';

const tick = fs.readFileSync(
  path.join(process.cwd(), 'migrations', '2026-11-13_stabilize_brain_worker_tick.sql'),
  'utf8'
);
const index = fs.readFileSync(
  path.join(process.cwd(), 'migrations', '2026-11-13_analytics_metrics_provider_date_idx.sql'),
  'utf8'
);

describe('stabilization migrations', () => {
  it('does not POST workers when every durable queue is empty', () => {
    expect(tick).toContain("'status', 'idle'");
    expect(tick).toContain('brain_ingestion_jobs');
    expect(tick).toContain('brain_graph_jobs');
    expect(tick).toContain('media_analysis_runs');
    expect(tick).toContain('IF v_brain THEN');
  });

  it('indexes the analytics provider/date read path', () => {
    expect(index).toContain('analytics_metrics_daily_provider_date_idx');
    expect(index).toContain('(provider, metric_date)');
  });
});
