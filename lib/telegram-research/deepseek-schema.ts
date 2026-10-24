import { z } from 'zod';

const sourceIds = z.array(z.number().int().positive()).min(1);

export const eventTypeSchema = z.enum([
  'assignment',
  'deadline',
  'text_delivery',
  'revision_request',
  'approval',
  'publication_link',
  'task_completion',
  'other',
]);

export const eventStatusSchema = z.enum([
  'stated',
  'agreed',
  'in_progress',
  'completed',
  'cancelled',
  'uncertain',
]);

export const deadlineSchema = z.object({
  raw: z.string().min(1),
  /** ISO date only when the messages name or unambiguously imply one. */
  date: z.string().nullable(),
  /** explicit, relative or unclear; never invented. */
  kind: z.enum(['explicit', 'relative', 'unclear']),
  confidence: z.number().min(0).max(1),
  sourceMessageIds: sourceIds,
});

export const editorialEventSchema = z.object({
  type: eventTypeSchema,
  summary: z.string().min(1),
  sourceMessageIds: sourceIds,
  confidence: z.number().min(0).max(1),
  /** Event date mentioned in the messages, not the export date. */
  date: z.string().nullable(),
  deadline: deadlineSchema.nullable(),
  status: eventStatusSchema,
  participants: z.array(z.string()).default([]),
});

export const eventsResultSchema = z.object({
  events: z.array(editorialEventSchema),
  notes: z.array(z.string()).default([]),
});

export const topicsResultSchema = z.object({
  topics: z.array(
    z.object({
      label: z.string().min(1),
      description: z.string().min(1),
      sourceMessageIds: sourceIds,
      confidence: z.number().min(0).max(1),
    })
  ),
  notes: z.array(z.string()).default([]),
});

export const synthesisSchema = z.object({
  summary: z.string().min(1),
  timeline: z.array(
    z.object({
      date: z.string().nullable(),
      summary: z.string().min(1),
      sourceMessageIds: sourceIds,
      confidence: z.number().min(0).max(1),
    })
  ),
  editorialEvents: z.array(editorialEventSchema),
  recurringThemes: z.array(
    z.object({
      label: z.string().min(1),
      summary: z.string().min(1),
      sourceMessageIds: sourceIds,
      confidence: z.number().min(0).max(1),
    })
  ),
  openQuestions: z.array(z.string()),
  linguisticObservations: z.array(
    z.object({
      kind: z.enum(['observable', 'interpretation']),
      observation: z.string().min(1),
      evidenceMessageIds: sourceIds,
      confidence: z.number().min(0).max(1),
      alternativeInterpretations: z.array(z.string()).default([]),
    })
  ),
  limitations: z.array(z.string()),
  disclaimer: z.string().min(1),
});

export type EditorialEvent = z.infer<typeof editorialEventSchema>;
export type EventsResult = z.infer<typeof eventsResultSchema>;
export type TopicsResult = z.infer<typeof topicsResultSchema>;
export type SynthesisResult = z.infer<typeof synthesisSchema>;

export type DeepSeekResultSchema<T> =
  { success: true; data: T } | { success: false; error: string };

export function validateResult<T>(schema: z.ZodType<T>, value: unknown): DeepSeekResultSchema<T> {
  const parsed = schema.safeParse(value);
  if (parsed.success) return { success: true, data: parsed.data };
  const issues = parsed.error.issues
    .slice(0, 12)
    .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
    .join('; ');
  return { success: false, error: issues };
}

/** Source IDs must exist in the chunk; this blocks invented message links. */
export function invalidSourceIds(sourceMessageIds: number[], allowedIds: Set<number>): number[] {
  return sourceMessageIds.filter((id) => !allowedIds.has(id));
}
