import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/**
 * A project opens its canonical conversation in the unified chat. There is no
 * separate project workspace or project folder.
 */
export default async function ProjectPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  redirect(`/admin/pierrot?project=${encodeURIComponent(slug)}`);
}
