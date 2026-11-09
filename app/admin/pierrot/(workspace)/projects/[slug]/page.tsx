import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/**
 * A project opens its canonical conversation in the unified chat. There is no
 * separate project workspace or project folder.
 */
export default function ProjectPage({ params }: { params: { slug: string } }) {
  redirect(`/admin/pierrot?project=${encodeURIComponent(params.slug)}`);
}
