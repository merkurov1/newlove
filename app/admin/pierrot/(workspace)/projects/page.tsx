import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/**
 * Projects are contexts inside the one conversation stream, not a separate
 * workspace. Old bookmarks keep working by opening the unified chat.
 */
export default function ProjectsPage() {
  redirect('/admin/pierrot');
}
