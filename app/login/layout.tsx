import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sign In | Anton Merkurov',
  description: 'Sign in to your Merkurov profile and private workspace.',
  robots: { index: false, follow: false },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
