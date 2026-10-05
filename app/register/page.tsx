import { redirect } from 'next/navigation';

export const metadata = {
  title: 'Create Profile | Anton Merkurov',
  description: 'Create your Merkurov profile.',
  robots: { index: false, follow: false },
};

export default function RegisterPage({ searchParams }: { searchParams?: { next?: string } }) {
  const next = searchParams?.next && searchParams.next.startsWith('/') && !searchParams.next.startsWith('//')
    ? searchParams.next
    : '/profile';
  redirect(`/login?mode=register&next=${encodeURIComponent(next)}`);
}
