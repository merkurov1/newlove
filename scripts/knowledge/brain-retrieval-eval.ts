// @ts-nocheck
import dotenv from 'dotenv';
import { Client } from 'pg';

import { retrieveBrainEvidence } from '../../lib/knowledge/rag/brainRetrieval';
import { retrieveUnframedEvidence } from '../../lib/knowledge/rag/retrieval';
import { classifyBrainDocument } from '../../lib/knowledge/rag/queryRouting';
import { compareBrainSystems } from '../../lib/knowledge/evaluation/brain/evaluate';
import { BRAIN_EVALUATION_QUESTIONS } from '../../lib/knowledge/evaluation/brain/questions';
import type { BrainSearchRow } from '../../lib/knowledge/rag/types';

dotenv.config({ path: process.env.ENV_FILE || '.env.production.local' });

const model = 'baai/bge-m3';
const dimensions = 1024;
const questions = BRAIN_EVALUATION_QUESTIONS;

function vectorLiteral(values: number[]): string {
  return `[${values.join(',')}]`;
}

async function embedQueries(texts: string[]): Promise<number[][]> {
  const apiKey = (process.env.OPENROUTER_API_KEY || '').trim();

  if (!apiKey || apiKey.length < 20 || apiKey.includes('SENSITIVE')) {
    throw new Error('OPENROUTER_API_KEY is not configured with a usable key.');
  }

  const response = await fetch('https://openrouter.ai/api/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      input: texts,
      encoding_format: 'float',
    }),
  });

  const payload = (await response.json()) as {
    data?: Array<{ index: number; embedding: number[] }>;
    error?: unknown;
  };

  if (!response.ok || !payload.data) {
    throw new Error(`embedding failed ${response.status} ${JSON.stringify(payload.error)}`);
  }

  const ordered = [...payload.data].sort((a, b) => a.index - b.index);

  if (ordered.length !== texts.length) throw new Error('embedding count mismatch');

  return ordered.map((entry) => entry.embedding);
}

function toIso(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return typeof value === 'string' ? value : null;
}

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  try {
    const docsResult = await client.query(
      `select id,title,source_type,canonical_url,author,metadata from public.knowledge_documents`
    );
    const classById = new Map<string, string>();

    for (const doc of docsResult.rows) {
      classById.set(
        String(doc.id),
        classifyBrainDocument({
          source_type: doc.source_type,
          title: doc.title,
          canonical_url: doc.canonical_url,
          author: doc.author,
          metadata: doc.metadata,
        })
      );
    }

    const vectors = await embedQueries(questions.map((question) => question.question));
    const env = { ...process.env, UNFRAMED_EMBEDDING_MODEL: model };

    const oldRuns = [];
    const newRuns = [];

    for (let index = 0; index < questions.length; index += 1) {
      const question = questions[index];
      const vector = vectors[index];
      const embeddingClient = {
        modelId: model,
        dimensions,
        embed: async () => [vector],
      };

      const old = await retrieveUnframedEvidence({
        query: question.question,
        scope: 'owner',
        ownerAuthorized: true,
        enabled: true,
        env,
        embeddingClient,
        search: async (input) => {
          const result = await client.query(
            `select * from public.knowledge_search_unframed($1::vector,$2,$3,$4,$5,$6,$7)`,
            [
              vectorLiteral(input.queryEmbedding),
              input.modelId,
              input.dimensions,
              input.accessClass,
              input.documentId,
              input.topK,
              input.minSimilarity,
            ]
          );

          return result.rows.map((row) => ({
            chunk_id: row.chunk_id,
            document_id: row.document_id,
            content: row.content,
            heading: row.heading,
            section_path: row.section_path,
            section_index: row.section_index,
            line_start: row.line_start,
            line_end: row.line_end,
            similarity: Number(row.similarity),
          }));
        },
      });

      const newResult = await retrieveBrainEvidence({
        query: question.question,
        scope: 'owner',
        ownerAuthorized: true,
        enabled: true,
        env,
        embeddingClient,
        search: async (input) => {
          const result = await client.query(
            `select * from public.brain_search_hybrid($1::vector,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
            [
              vectorLiteral(input.queryEmbedding),
              input.modelId,
              input.dimensions,
              input.accessClass,
              input.queryText || null,
              input.sourceTypes || null,
              input.sourceDomains || null,
              input.authors || null,
              input.languages || null,
              input.documentIds || null,
              input.publishedFrom || null,
              input.publishedTo || null,
              input.matchCount || 40,
              input.minSimilarity,
            ]
          );

          return result.rows.map((row): BrainSearchRow => ({
            chunk_id: row.chunk_id,
            document_id: row.document_id,
            document_title: row.document_title,
            source_type: row.source_type,
            source_domain: row.source_domain,
            author: row.author,
            language: row.language,
            published_at: toIso(row.published_at),
            content: row.content,
            heading: row.heading,
            section_path: row.section_path || [],
            section_index: Number(row.section_index),
            line_start: Number(row.line_start),
            line_end: Number(row.line_end),
            similarity: Number(row.similarity),
            lexical_score: Number(row.lexical_score),
          }));
        },
      });

      oldRuns.push({
        questionId: question.id,
        outcome: old.outcome,
        hits: old.hits.map((hit) => ({
          documentId: hit.documentId,
          sourceClass: classById.get(hit.documentId),
        })),
        selectedSourceClasses: [],
      });

      newRuns.push({
        questionId: question.id,
        outcome: newResult.outcome,
        hits: newResult.hits.map((hit) => ({
          documentId: hit.documentId,
          sourceClass: hit.sourceClass,
        })),
        selectedSourceClasses: newResult.selectedSourceClasses,
      });

      console.log(
        `[${question.id}] old=${old.outcome}:${old.hits.length} new=${newResult.outcome}:${newResult.hits.length} sources=${newResult.selectedSourceClasses.join(',')}`
      );
    }

    const comparison = compareBrainSystems(questions, oldRuns, newRuns);

    console.log(
      JSON.stringify(
        {
          baseline: {
            recallAt5: comparison.baseline.recallAt5,
            precisionAt5: comparison.baseline.precisionAt5,
            sourceSelectionAccuracy: comparison.baseline.sourceSelectionAccuracy,
            retrievalFailureRate: comparison.baseline.retrievalFailureRate,
            falseAcceptRate: comparison.baseline.falseAcceptRate,
          },
          candidate: {
            recallAt5: comparison.candidate.recallAt5,
            precisionAt5: comparison.candidate.precisionAt5,
            sourceSelectionAccuracy: comparison.candidate.sourceSelectionAccuracy,
            retrievalFailureRate: comparison.candidate.retrievalFailureRate,
            falseAcceptRate: comparison.candidate.falseAcceptRate,
          },
          delta: comparison.delta,
          byCategory: comparison.candidate.byCategory,
        },
        null,
        2
      )
    );
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();
