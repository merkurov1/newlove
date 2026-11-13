import { z } from 'zod';

import {
  PIERROT_RESPONSE_VERSION,
  type PierrotResponse,
} from '@/lib/pierrot/response/types';

const shortText = z.string().trim().min(1).max(400);
const mediumText = z.string().trim().min(1).max(2_000);
const longText = z.string().trim().min(1).max(20_000);
const optionalText = z.string().trim().max(2_000).optional();
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const scalar = z.union([z.string().max(2_000), z.number().finite(), z.null()]);

const base = {
  title: optionalText,
  description: optionalText,
};

const textBlock = z.object({
  ...base,
  type: z.literal('text'),
  markdown: longText,
});

const headingBlock = z.object({
  ...base,
  type: z.literal('heading'),
  level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  text: shortText,
});

const metricItem = z.object({
  label: shortText,
  value: z.union([z.number().finite(), z.string().max(400), z.null()]),
  unit: z
    .enum(['count', 'percent', 'seconds', 'position', 'ratio', 'currency', 'text'])
    .optional(),
  previous: z.number().finite().nullable().optional(),
  changePercent: z.number().finite().nullable().optional(),
  period: optionalText.nullable().optional(),
  interpretation: optionalText.nullable().optional(),
  source: optionalText.nullable().optional(),
  confidence: z.enum(['measured', 'calculated', 'estimated', 'unknown']).optional(),
  unavailableReason: optionalText.nullable().optional(),
});

const metricBlock = z.object({
  ...base,
  type: z.literal('metric'),
  metrics: z.array(metricItem).min(1).max(12),
});

const chartSeries = z.object({
  key: z.string().trim().min(1).max(64),
  label: shortText,
  color: hexColor.optional(),
  unit: z.string().trim().max(32).optional(),
});

const chartBlock = z.object({
  ...base,
  type: z.literal('chart'),
  chart: z.enum(['line', 'bar', 'area', 'stacked_bar', 'scatter', 'pie']),
  data: z.array(z.record(z.string().max(64), scalar)).min(0).max(500),
  xKey: z.string().trim().min(1).max(64),
  series: z.array(chartSeries).min(1).max(8),
  unit: z.string().trim().max(32).optional(),
  referenceLines: z
    .array(
      z.object({
        key: z.string().max(64),
        label: shortText,
        value: z.number().finite(),
      })
    )
    .max(6)
    .optional(),
  annotations: z
    .array(
      z.object({
        key: z.string().max(64),
        label: shortText,
        value: z.number().finite(),
      })
    )
    .max(12)
    .optional(),
});

const tableColumn = z.object({
  key: z.string().trim().min(1).max(64),
  label: shortText,
  align: z.enum(['left', 'right', 'center']).optional(),
  format: z.enum(['text', 'number', 'percent', 'date']).optional(),
});

const tableBlock = z.object({
  ...base,
  type: z.literal('table'),
  columns: z.array(tableColumn).min(1).max(12),
  rows: z.array(z.record(z.string().max(64), scalar)).min(0).max(200),
  caption: optionalText,
  compact: z.boolean().optional(),
  highlightRow: z.number().int().min(0).max(199).nullable().optional(),
});

const timelineEvent = z.object({
  date: z.string().trim().min(1).max(80),
  title: shortText,
  description: optionalText,
  category: z.string().trim().max(80).optional(),
  status: z.string().trim().max(80).optional(),
  source: optionalText.nullable().optional(),
  url: z.string().trim().max(2_000).nullable().optional(),
});

const timelineBlock = z.object({
  ...base,
  type: z.literal('timeline'),
  events: z.array(timelineEvent).min(1).max(100),
});

const diagramNode = z.object({
  id: z.string().trim().min(1).max(64),
  label: shortText,
  detail: optionalText,
  group: z.string().trim().max(80).optional(),
});

const diagramEdge = z.object({
  from: z.string().trim().min(1).max(64),
  to: z.string().trim().min(1).max(64),
  label: z.string().trim().max(120).optional(),
  kind: z.enum(['direct', 'inference', 'reference']).optional(),
});

const diagramBlock = z.object({
  ...base,
  type: z.literal('diagram'),
  diagram: z.enum(['flow', 'relationship', 'hierarchy', 'sequence']),
  nodes: z.array(diagramNode).min(1).max(40),
  edges: z.array(diagramEdge).max(80),
  caption: optionalText,
});

const comparisonColumn = z.object({
  id: z.string().trim().min(1).max(64),
  title: shortText,
  subtitle: optionalText,
});

const comparisonRow = z.object({
  label: shortText,
  values: z.record(z.string().max(64), scalar),
});

const comparisonBlock = z.object({
  ...base,
  type: z.literal('comparison'),
  columns: z.array(comparisonColumn).min(2).max(4),
  rows: z.array(comparisonRow).min(1).max(40),
});

const quoteBlock = z.object({
  ...base,
  type: z.literal('quote'),
  text: longText,
  attribution: optionalText,
  source: optionalText,
  url: z.string().trim().max(2_000).optional(),
});

const galleryImage = z.object({
  src: z.string().trim().min(1).max(2_000),
  alt: z.string().trim().min(1).max(400),
  caption: optionalText,
  source: optionalText,
  kind: z.enum(['photo', 'artwork', 'document', 'screenshot']).optional(),
  width: z.number().int().positive().max(10_000).optional(),
  height: z.number().int().positive().max(10_000).optional(),
});

const galleryBlock = z.object({
  ...base,
  type: z.literal('gallery'),
  images: z.array(galleryImage).min(1).max(12),
  layout: z.enum(['single', 'grid', 'carousel']).optional(),
});

const codeBlock = z.object({
  ...base,
  type: z.literal('code'),
  code: z.string().min(1).max(20_000),
  language: z.string().trim().max(40).optional(),
  filename: z.string().trim().max(200).optional(),
  showLineNumbers: z.boolean().optional(),
});

const insightBlock = z.object({
  ...base,
  type: z.literal('insight'),
  label: z.string().trim().max(80).optional(),
  text: mediumText,
});

const sourceItem = z.object({
  label: shortText,
  source: optionalText,
  url: z.string().trim().max(2_000).nullable().optional(),
  date: z.string().trim().max(80).nullable().optional(),
  excerpt: optionalText.nullable().optional(),
  confidence: z.enum(['measured', 'calculated', 'estimated', 'unknown']).optional(),
  method: z.string().trim().max(80).nullable().optional(),
});

const sourceBlock = z.object({
  ...base,
  type: z.literal('source'),
  sources: z.array(sourceItem).min(1).max(24),
  coverage: optionalText.nullable().optional(),
  limitations: z.array(z.string().trim().max(400)).max(8).optional(),
});

const warningBlock = z.object({
  ...base,
  type: z.literal('warning'),
  level: z.enum(['info', 'warning', 'critical']),
  text: mediumText,
});

const progressItem = z.object({
  label: shortText,
  value: z.number().finite(),
  target: z.number().finite().nullable().optional(),
  unit: z
    .enum(['count', 'percent', 'seconds', 'position', 'ratio', 'currency', 'text'])
    .optional(),
  status: z.enum(['on_track', 'at_risk', 'blocked', 'complete', 'unknown']).optional(),
  note: optionalText.nullable().optional(),
});

const progressBlock = z.object({
  ...base,
  type: z.literal('progress'),
  items: z.array(progressItem).min(1).max(12),
  period: optionalText.nullable().optional(),
});

const projectWorkstream = z.object({
  name: shortText,
  entityType: z.string().trim().min(1).max(40),
  status: z.string().trim().max(40).nullable().optional(),
  openTasks: z.number().int().min(0).max(100_000).nullable().optional(),
  completedTasks: z.number().int().min(0).max(100_000).nullable().optional(),
  deliverables: z.number().int().min(0).max(100_000).nullable().optional(),
  note: optionalText.nullable().optional(),
});

const projectStatusBlock = z.object({
  ...base,
  type: z.literal('project_status'),
  projectName: shortText,
  status: z.enum([
    'PROPOSED',
    'IN_PROGRESS',
    'BLOCKED',
    'COMPLETED',
    'CANCELLED',
    'ARCHIVED',
  ]),
  statusReason: optionalText.nullable().optional(),
  workstreams: z.array(projectWorkstream).max(20).optional(),
  completed: z.number().int().min(0).max(100_000).nullable().optional(),
  remaining: z.number().int().min(0).max(100_000).nullable().optional(),
  decisions: z.number().int().min(0).max(100_000).nullable().optional(),
  period: optionalText.nullable().optional(),
  href: z.string().trim().max(2_000).nullable().optional(),
});

/** A graph edge may only reference a node in the same block. */
const diagramBlockChecked = diagramBlock.superRefine((value, context) => {
  const ids = new Set(value.nodes.map((node) => node.id));

  for (const edge of value.edges) {
    if (!ids.has(edge.from) || !ids.has(edge.to)) {
      context.addIssue({
        code: 'custom',
        path: ['edges'],
        message: 'Diagram edge references an unknown node.',
      });
      return;
    }
  }
});

const blockSchema = z.discriminatedUnion('type', [
  textBlock,
  headingBlock,
  metricBlock,
  chartBlock,
  tableBlock,
  timelineBlock,
  diagramBlockChecked,
  comparisonBlock,
  quoteBlock,
  galleryBlock,
  codeBlock,
  insightBlock,
  sourceBlock,
  warningBlock,
  progressBlock,
  projectStatusBlock,
]);

export const pierrotResponseSchema = z.object({
  version: z.literal(PIERROT_RESPONSE_VERSION),
  language: z.enum(['ru', 'en']).optional(),
  blocks: z.array(blockSchema).min(1).max(24),
});

/**
 * Validates and strips unknown fields. Returns null for malformed payloads so
 * the caller can keep the Markdown fallback visible.
 */
export function parsePierrotResponse(value: unknown): PierrotResponse | null {
  const parsed = pierrotResponseSchema.safeParse(value);
  if (!parsed.success) return null;
  return parsed.data as PierrotResponse;
}

export function isPierrotResponseLike(value: unknown): boolean {
  return parsePierrotResponse(value) !== null;
}
