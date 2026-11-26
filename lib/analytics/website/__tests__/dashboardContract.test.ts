/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';

import { fixtureDashboard, fixtureSearchConsole } from '../__fixtures__/dashboardFixture';
import {
  WEBSITE_DASHBOARD_CACHE_KEY,
  WEBSITE_DASHBOARD_SCHEMA_VERSION,
  normalizeNewsletterSignals,
  normalizeSearchConsoleSnapshot,
  normalizeWebsiteDashboard,
} from '../dashboardContract';

function datasetOf(payload: Record<string, unknown>): Record<string, unknown> {
  return payload.dataset as Record<string, unknown>;
}

describe('website dashboard cache contract', () => {
  it('versions the cache key and payload schema together', () => {
    expect(WEBSITE_DASHBOARD_SCHEMA_VERSION).toBe(2);
    expect(WEBSITE_DASHBOARD_CACHE_KEY).toBe('website-analytics-dashboard-v2');
  });

  it('normalizes a complete current-schema payload without changing real values', () => {
    const dashboard = normalizeWebsiteDashboard(fixtureDashboard());

    expect(dashboard).not.toBeNull();
    expect(dashboard?.schemaVersion).toBe(WEBSITE_DASHBOARD_SCHEMA_VERSION);
    expect(dashboard?.dataset.gsc.available).toBe(true);
    expect(dashboard?.dataset.gsc.dataState).toBe('complete');
    expect(dashboard?.dataset.gsc.totals.clicks.value).toBe(120);
    expect(dashboard?.dataset.gsc.totals.impressions.value).toBe(4000);
    expect(dashboard?.dataset.gsc.brand.available).toBe(true);
    expect(dashboard?.dataset.gsc.brand.brand.clicks).toBe(80);
    expect(dashboard?.dataset.internal.newsletter.subscribers.confirmed).toBe(42);
    expect(dashboard?.dataset.internal.newsletter.signals.available).toBe(true);
    expect(dashboard?.dataset.internal.newsletter.signals.deliveryFailures).toBe(5);
    expect(dashboard?.sessionsSeries).toEqual([250]);
    expect(dashboard?.clicksSeries).toEqual([60, 60]);
  });

  it('does not read an older cache payload as the current schema', () => {
    expect(normalizeWebsiteDashboard(fixtureDashboard({ schemaVersion: 1 }))).toBeNull();

    const legacy = fixtureDashboard();
    delete legacy.schemaVersion;
    expect(normalizeWebsiteDashboard(legacy)).toBeNull();

    expect(normalizeWebsiteDashboard(null)).toBeNull();
    expect(normalizeWebsiteDashboard({ period: fixtureDashboard().period })).toBeNull();
  });

  it('keeps GSC loaded when the stored payload has no brand split', () => {
    const payload = fixtureDashboard();
    const gsc = datasetOf(payload).gsc as Record<string, unknown>;
    delete gsc.brand;

    const dashboard = normalizeWebsiteDashboard(payload);
    const brand = dashboard?.dataset.gsc.brand;

    expect(dashboard).not.toBeNull();
    expect(dashboard?.dataset.gsc.available).toBe(true);
    expect(dashboard?.dataset.gsc.totals.clicks.value).toBe(120);
    expect(brand?.available).toBe(false);
    expect(brand?.unavailableReason).toMatch(/бренд/i);
    expect(brand?.brandTerms).toEqual([]);
  });

  it('uses null-safe newsletter signal defaults instead of fake zeroes', () => {
    const payload = fixtureDashboard();
    const internal = datasetOf(payload).internal as Record<string, unknown>;
    const newsletter = internal.newsletter as Record<string, unknown>;
    delete newsletter.signals;

    const dashboard = normalizeWebsiteDashboard(payload);
    const signals = dashboard?.dataset.internal.newsletter.signals;

    expect(dashboard).not.toBeNull();
    expect(dashboard?.dataset.internal.newsletter.subscribers.confirmed).toBe(42);
    expect(signals?.available).toBe(false);
    expect(signals?.deliveryFailures).toBeNull();
    expect(signals?.confirmationRate).toBeNull();
    expect(signals?.suspectedAutomated).toBeNull();
    expect(signals?.signupSpike).toBeNull();
    expect(signals?.unavailableReason).toMatch(/сигнал/i);
  });

  it('preserves a partial Search Console outage as partial, not unavailable or zero', () => {
    const payload = fixtureDashboard();
    datasetOf(payload).gsc = fixtureSearchConsole({
      dataState: 'partial',
      freshness: 'stale',
    });

    const dashboard = normalizeWebsiteDashboard(payload);

    expect(dashboard?.dataset.gsc.available).toBe(true);
    expect(dashboard?.dataset.gsc.dataState).toBe('partial');
    expect(dashboard?.dataset.gsc.totals.clicks.value).toBe(120);
    expect(dashboard?.dataset.gsc.totals.clicks.available).toBe(true);
    expect(dashboard?.dataset.gsc.brand.available).toBe(true);
  });

  it('keeps unavailable Search Console metrics unavailable instead of zero', () => {
    const gsc = normalizeSearchConsoleSnapshot({
      available: false,
      dataState: 'unavailable',
      totals: {},
    });

    expect(gsc.available).toBe(false);
    expect(gsc.totals.clicks.value).toBeNull();
    expect(gsc.totals.clicks.available).toBe(false);
    expect(gsc.brand.available).toBe(false);
  });

  it('normalizes missing signal objects to an explicit unavailable state', () => {
    const signals = normalizeNewsletterSignals(undefined);

    expect(signals.available).toBe(false);
    expect(signals.deliveryFailures).toBeNull();
    expect(signals.blockedReasons).toEqual({});
  });
});
