import { describe, expect, it } from '@jest/globals';
import {
  parseScenarioId,
  scenarioFromSearchParams,
  scenarioPreset,
  scenarioToQuery,
} from '../scenarios';

describe('scenario reproducibility', () => {
  it('defaults to the comfortable preset and validates an unknown id', () => {
    expect(scenarioFromSearchParams({}).id).toBe('comfortable');
    expect(parseScenarioId('unknown')).toBe('comfortable');
    expect(parseScenarioId('lean')).toBe('lean');
  });

  it('applies URL overrides and clamps invalid numbers', () => {
    const scenario = scenarioFromSearchParams({
      scenario: 'lean',
      modelRequestsPerMonth: '5000',
      cacheHitShare: '2',
      activeUsers: '-3',
      vpsSku: 'not-a-sku',
    });
    expect(scenario.id).toBe('lean');
    expect(scenario.modelRequestsPerMonth).toBe(5_000);
    expect(scenario.cacheHitShare).toBe(1);
    expect(scenario.activeUsers).toBe(0);
    expect(scenario.vpsSku).toBe(scenarioPreset('lean').vpsSku);
  });

  it('round-trips only the overrides through the URL', () => {
    const scenario = scenarioPreset('comfortable');
    scenario.modelRequestsPerMonth = 12_345;
    scenario.vpsSku = 'vpsLite3';
    const query = scenarioToQuery(scenario, 'link');
    expect(query).toContain('modelRequestsPerMonth=12345');
    expect(query).toContain('vpsSku=vpsLite3');
    expect(query).not.toContain('avgContextTokens=');
    const parsed = scenarioFromSearchParams(
      Object.fromEntries(new URLSearchParams(query).entries())
    );
    expect(parsed.modelRequestsPerMonth).toBe(12_345);
    expect(parsed.vpsSku).toBe('vpsLite3');
    expect(parsed.budgetEur).toBe(scenario.budgetEur);
  });

  it('keeps the three presets distinct and overridable', () => {
    const lean = scenarioPreset('lean');
    const comfortable = scenarioPreset('comfortable');
    const intensive = scenarioPreset('intensive');
    expect(lean.modelRequestsPerMonth).toBeLessThan(comfortable.modelRequestsPerMonth);
    expect(comfortable.modelRequestsPerMonth).toBeLessThan(intensive.modelRequestsPerMonth);
    expect(lean.budgetEur).toBeLessThan(comfortable.budgetEur);
    expect(comfortable.budgetEur).toBeLessThan(intensive.budgetEur);
  });
});
