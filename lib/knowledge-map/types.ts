export type GraphNodeType =
  | 'table'
  | 'record'
  | 'file'
  | 'person'
  | 'artwork'
  | 'project'
  | 'concept'
  | 'event'
  | 'website'
  | 'other';

export type GraphEdgeType =
  | 'contains'
  | 'references'
  | 'related_to'
  | 'created_by'
  | 'part_of'
  | 'mentions'
  | 'derived_from'
  | 'depends_on';

export interface KnowledgeNode {
  id: string;
  type: GraphNodeType;
  label: string;
  description?: string;
  sourceKeys: string[];
  confidence: number;
  metadata?: Record<string, unknown>;
}

export interface KnowledgeEdge {
  id: string;
  source: string;
  target: string;
  type: GraphEdgeType;
  label?: string;
  evidence: string[];
  confidence: number;
  origin: 'database' | 'model' | 'file';
}

export interface KnowledgeGraph {
  schemaVersion: 1;
  generatedAt: string;
  version: number;
  model: string;
  nodes: KnowledgeNode[];
  edges: KnowledgeEdge[];
  stats: {
    tables: number;
    records: number;
    files: number;
    nodes: number;
    edges: number;
  };
}

export interface SourceRecord {
  source_key: string;
  source_type: string;
  source_table: string | null;
  source_path: string | null;
  content_hash: string;
  content: string;
  metadata: Record<string, unknown>;
  processed_hash: string | null;
}

export interface ExtractionResult {
  nodes: Array<{
    id: string;
    type: GraphNodeType;
    label: string;
    description?: string;
    confidence: number;
  }>;
  edges: Array<{
    source: string;
    target: string;
    type: GraphEdgeType;
    label?: string;
    evidence: string;
    confidence: number;
  }>;
}