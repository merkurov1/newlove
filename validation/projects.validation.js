// validation/projects.validation.js
const { z } = require('zod');

exports.projectIdParamSchema = z.object({
  id: z.string().uuid(),
});

exports.projectCreateSchema = z.object({
  title: z.string().min(1).max(255),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  content: z.array(z.object({ type: z.string(), data: z.any() })).min(1),
  published: z.boolean().optional(),
  authorId: z.string().uuid(),
  previewImage: z.object({
    url: z.string().url(),
    alt: z.string().optional(),
  }).optional(),
  tags: z.array(z.string()).optional(),
});

exports.projectUpdateSchema = exports.projectCreateSchema.partial();
