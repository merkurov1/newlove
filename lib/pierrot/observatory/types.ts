/**
 * Client-safe Decision Observatory contract.
 *
 * The observatory looks for evidence after a decision. It never converts
 * temporal order into causality.
 */

export type ObservationConfidence = 'confirmed' | 'supported' | 'temporal_only' | 'insufficient';

export type DecisionObservation = {
  decisionId: string;
  title: string;
  kind: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  project: string | null;
  assumption: string | null;
  assumptionSource: 'rationale' | 'not_recorded';
  expectedResult: string;
  expectedSource: 'explicit' | 'inferred_from_decision' | 'not_recorded';
  observedResult: string;
  confirmations: string[];
  discrepancies: string[];
  confidence: number;
  confidenceLabel: ObservationConfidence;
  causality: 'not_established';
  conclusions: string[];
};

export type DecisionObservatoryReport = {
  generatedAt: string;
  decisionCount: number;
  eventCount: number;
  observations: DecisionObservation[];
  summary: {
    confirmed: number;
    supported: number;
    temporalOnly: number;
    insufficient: number;
    current: number;
    completed: number;
    superseded: number;
    rejected: number;
  };
  limitations: string[];
  dataSources: string[];
  /** True when there is not enough evidence for a useful cross-decision view. */
  insufficientData: boolean;
};

export type DecisionObservatoryRun = {
  id: string;
  generatedAt: string;
  decisionCount: number;
  eventCount: number;
  report: DecisionObservatoryReport;
};
