import { redirect } from 'next/navigation';
import { sanitizeMetadata } from '@/lib/metadataSanitize';
import { safeLoginReturnPath } from '@/lib/auth/returnPath';

export const metadata = sanitizeMetadata({
  title: 'Create Profile | Anton Merkurov',
  description: 'Create your Merkurov profile.',
  robots: { index: false, follow: false },
});

type RegisterSearchParams = {
  next?: string | string[];
};

export default async function RegisterPage({
  searchParams,
}: {
  searchParams?: Promise<RegisterSearchParams>;
}) {
  const params = (await searchParams) ?? {};
  const requested = Array.isArray(params.next) ? params.next[0] : params.next;
  const next = safeLoginReturnPath(requested) ?? '/profile';

  redirect(`/login?mode=register&next=${encodeURIComponent(next)}`);
}
