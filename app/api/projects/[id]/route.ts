

import { prisma } from '@/lib/prisma';
import { ProjectSchema } from '@/lib/validation/project';
import { handleApiError } from '@/lib/middleware/errorHandler';
import { withValidation } from '@/lib/middleware/validate';
import { withRateLimit } from '@/lib/middleware/rateLimit';
import { withHelmet } from '@/lib/middleware/helmet';
import { requireAdmin } from '@/lib/middleware/auth';

export const GET = handleApiError(async (req: any, { params }: { params: { id: string } }) => {
  const project = await prisma.project.findUnique({ where: { id: params.id } });
  if (!project) return Response.json({ error: 'Not found' }, { status: 404 });
  return Response.json(project);
});

export const PUT = withHelmet(withRateLimit(handleApiError(withValidation(ProjectSchema, async (req: any, data: any, { params }: { params: { id: string } }) => {
  const auth = await requireAdmin(req);
  if (auth) return auth;
  const { title, slug, content, authorId, published = false } = data;
  const project = await prisma.project.update({
    where: { id: params.id },
    data: { title, slug, content, authorId, published },
  });
  return Response.json(project);
}))));

export const POST = withHelmet(withRateLimit(handleApiError(withValidation(ProjectSchema, async (req: any, data: any) => {
  const auth = await requireAdmin(req);
  if (auth) return auth;
  const { title, slug, content, authorId, published = false } = data;
  const project = await prisma.project.create({
    data: { title, slug, content, authorId, published },
  });
  return Response.json(project);
}))));
