import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/serverAuth';
import { getPierrotProjectSnapshot } from '@/lib/pierrot/projects/store';
import ProjectOverview from '@/components/pierrot/workspace/ProjectOverview';

export const dynamic = 'force-dynamic';

export default async function ProjectPage({ params }: { params: { slug: string } }) {
  const admin = await requireAdmin();
  const project = await getPierrotProjectSnapshot(admin.id, params.slug);
  if (!project) notFound();
  return <ProjectOverview project={project} />;
}
