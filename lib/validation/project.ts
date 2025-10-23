import { z } from 'zod';

export const ProjectSchema = z.object({
  title: z.string().min(1).max(255),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  content: z.array(z.object({ type: z.string() })).min(1),
  published: z.boolean().optional(),
  authorId: z.string().uuid(),
});
