/**
 * Versioned, client-safe Pierrot response contract.
 *
 * The plain `reply` Markdown string remains the transport and historical
 * fallback. A `response` is an optional, validated composition of content
 * blocks. The model/application never sends JSX, HTML, scripts or component
 * names: only these data shapes, rendered by a closed registry.
 */

export const PIERROT_RESPONSE_VERSION = 1 as const;

export type PierrotResponseLanguage = 'ru' | 'en';

export type PierrotBlockBase = {
  title?: string;
  description?: string;
};

export type PierrotTextBlock = PierrotBlockBase & {
  type: 'text';
  markdown: string;
};

export type PierrotHeadingBlock = PierrotBlockBase & {
  type: 'heading';
  level: 1 | 2 | 3;
  text: string;
};

export type PierrotMetricUnit =
  | 'count'
  | 'percent'
  | 'seconds'
  | 'position'
  | 'ratio'
  | 'currency'
  | 'text';

export type PierrotMetricItem = {
  label: string;
  value: number | string | null;
  unit?: PierrotMetricUnit;
  previous?: number | null;
  changePercent?: number | null;
  period?: string | null;
  interpretation?: string | null;
  source?: string | null;
  confidence?: 'measured' | 'calculated' | 'estimated' | 'unknown';
  unavailableReason?: string | null;
};

export type PierrotMetricBlock = PierrotBlockBase & {
  type: 'metric';
  metrics: PierrotMetricItem[];
};

export type PierrotChartKind =
  | 'line'
  | 'bar'
  | 'area'
  | 'stacked_bar'
  | 'scatter'
  | 'pie';

export type PierrotChartSeries = {
  key: string;
  label: string;
  color?: string;
  unit?: string;
};

export type PierrotChartPoint = Record<string, string | number | null>;

export type PierrotChartBlock = PierrotBlockBase & {
  type: 'chart';
  chart: PierrotChartKind;
  data: PierrotChartPoint[];
  xKey: string;
  series: PierrotChartSeries[];
  unit?: string;
  referenceLines?: Array<{ key: string; label: string; value: number }>;
  annotations?: Array<{ key: string; label: string; value: number }>;
};

export type PierrotTableColumn = {
  key: string;
  label: string;
  align?: 'left' | 'right' | 'center';
  format?: 'text' | 'number' | 'percent' | 'date';
};

export type PierrotTableBlock = PierrotBlockBase & {
  type: 'table';
  columns: PierrotTableColumn[];
  rows: Array<Record<string, string | number | null>>;
  caption?: string;
  compact?: boolean;
  highlightRow?: number | null;
};

export type PierrotTimelineEvent = {
  date: string;
  title: string;
  description?: string;
  category?: string;
  status?: string;
  source?: string | null;
  url?: string | null;
};

export type PierrotTimelineBlock = PierrotBlockBase & {
  type: 'timeline';
  events: PierrotTimelineEvent[];
};

export type PierrotDiagramNode = {
  id: string;
  label: string;
  detail?: string;
  group?: string;
};

export type PierrotDiagramEdge = {
  from: string;
  to: string;
  label?: string;
  kind?: 'direct' | 'inference' | 'reference';
};

export type PierrotDiagramBlock = PierrotBlockBase & {
  type: 'diagram';
  diagram: 'flow' | 'relationship' | 'hierarchy' | 'sequence';
  nodes: PierrotDiagramNode[];
  edges: PierrotDiagramEdge[];
  caption?: string;
};

export type PierrotComparisonColumn = {
  id: string;
  title: string;
  subtitle?: string;
};

export type PierrotComparisonRow = {
  label: string;
  values: Record<string, string | number | null>;
};

export type PierrotComparisonBlock = PierrotBlockBase & {
  type: 'comparison';
  columns: PierrotComparisonColumn[];
  rows: PierrotComparisonRow[];
};

export type PierrotQuoteBlock = PierrotBlockBase & {
  type: 'quote';
  text: string;
  attribution?: string;
  source?: string;
  url?: string;
};

export type PierrotGalleryImage = {
  src: string;
  alt: string;
  caption?: string;
  source?: string;
  kind?: 'photo' | 'artwork' | 'document' | 'screenshot';
  width?: number;
  height?: number;
};

export type PierrotGalleryBlock = PierrotBlockBase & {
  type: 'gallery';
  images: PierrotGalleryImage[];
  layout?: 'single' | 'grid' | 'carousel';
};

export type PierrotCodeBlock = PierrotBlockBase & {
  type: 'code';
  code: string;
  language?: string;
  filename?: string;
  showLineNumbers?: boolean;
};

export type PierrotInsightBlock = PierrotBlockBase & {
  type: 'insight';
  label?: string;
  text: string;
};

export type PierrotContentBlock =
  | PierrotTextBlock
  | PierrotHeadingBlock
  | PierrotMetricBlock
  | PierrotChartBlock
  | PierrotTableBlock
  | PierrotTimelineBlock
  | PierrotDiagramBlock
  | PierrotComparisonBlock
  | PierrotQuoteBlock
  | PierrotGalleryBlock
  | PierrotCodeBlock
  | PierrotInsightBlock;

export type PierrotResponse = {
  version: typeof PIERROT_RESPONSE_VERSION;
  language?: PierrotResponseLanguage;
  blocks: PierrotContentBlock[];
};

export type PierrotContentBlockType = PierrotContentBlock['type'];
