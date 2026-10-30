import { z } from 'zod';

export const RawEntitySchema = z
  .object({
    name: z.string().min(1).max(300),
    type: z.string().max(60).optional(),
    description: z.string().max(2000).optional().nullable(),
    aliases: z.array(z.string().max(300)).max(10).optional(),
    confidence: z.number().min(0).max(1).optional(),
    chunk_id: z.string().max(200).optional(),
    evidence: z.string().max(1000).optional().nullable(),
  })
  .passthrough();

export const RawRelationshipSchema = z
  .object({
    source_name: z.string().min(1).max(300),
    source_type: z.string().max(60).optional(),
    target_name: z.string().min(1).max(300),
    target_type: z.string().max(60).optional(),
    relation_type: z.string().max(60).optional(),
    confidence: z.number().min(0).max(1).optional(),
    chunk_id: z.string().max(200).optional(),
    evidence: z.string().max(1000).optional(),
    inference: z.boolean().optional(),
  })
  .passthrough();

export const RawExtractionSchema = z
  .object({
    entities: z.array(RawEntitySchema).max(120).default([]),
    relationships: z.array(RawRelationshipSchema).max(160).default([]),
  })
  .passthrough();

export const RawDocumentSummarySchema = z
  .object({
    document_id: z.string().min(1).max(200),
    summary: z.string().min(1).max(4000),
    themes: z
      .array(
        z.object({
          name: z.string().min(1).max(300),
          type: z.string().max(60).optional(),
          note: z.string().max(500).optional(),
        })
      )
      .max(10)
      .optional(),
    confidence: z.number().min(0).max(1).optional(),
  })
  .passthrough();

export const RawSummaryBatchSchema = z
  .object({
    documents: z.array(RawDocumentSummarySchema).max(20).default([]),
  })
  .passthrough();

export const RawChapterSummarySchema = z
  .object({
    scope_key: z.string().min(1).max(300),
    title: z.string().min(1).max(500),
    summary: z.string().min(1).max(4000),
    confidence: z.number().min(0).max(1).optional(),
  })
  .passthrough();

export const RawChapterSummaryBatchSchema = z
  .object({
    chapters: z.array(RawChapterSummarySchema).max(30).default([]),
  })
  .passthrough();

export const RawThemeSummarySchema = z
  .object({
    scope_key: z.string().min(1).max(300),
    title: z.string().min(1).max(500),
    summary: z.string().min(1).max(4000),
    confidence: z.number().min(0).max(1).optional(),
  })
  .passthrough();

export const RawThemeSummaryBatchSchema = z
  .object({
    themes: z.array(RawThemeSummarySchema).max(30).default([]),
  })
  .passthrough();

export const RawRadarSchema = z
  .object({
    topics: z
      .array(
        z.object({
          cluster_id: z.string().max(100).optional(),
          topic: z.string().min(1).max(300),
          representative_question: z.string().min(1).max(1000),
          suggestion: z.string().min(1).max(2000),
          rationale: z.string().max(2000).optional(),
          missing_knowledge: z.boolean().optional(),
          confidence: z.number().min(0).max(1).optional(),
        })
      )
      .max(50)
      .default([]),
  })
  .passthrough();

export const RawResearchAnswerSchema = z
  .object({
    answer: z.string().min(1).max(8000),
    used_sources: z
      .array(
        z.object({
          document_id: z.string().min(1).max(200),
          chunk_id: z.string().min(1).max(200).optional(),
        })
      )
      .max(30)
      .optional(),
    caveat: z.string().max(1000).optional(),
    confidence: z.number().min(0).max(1).optional(),
  })
  .passthrough();
