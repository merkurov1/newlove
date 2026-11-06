import type { Metadata } from 'next';
import { requireAdmin } from '@/lib/serverAuth';
import { ensureHeartAndAngelProject, listPierrotProjects } from '@/lib/pierrot/projects/store';
import ProjectsWorkspace from '@/components/pierrot/workspace/ProjectsWorkspace';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'PROJECTS' };

export default async function ProjectsPage() {
  const admin = await requireAdmin();
  await ensureHeartAndAngelProject(admin.id);
  return <ProjectsWorkspace initialProjects={await listPierrotProjects(admin.id)} />;
}
