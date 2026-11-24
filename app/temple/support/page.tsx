import type { Metadata } from 'next';
import TempleSupportClient from './TempleSupportClient';

const SUPPORT_URL = 'https://www.merkurov.love/temple/support';

export const metadata: Metadata = {
  title: 'Support the Temple — Digital Temple',
  description:
    'Choose an amount and continue to the secure Stripe checkout for the Digital Temple.',
  alternates: {
    canonical: SUPPORT_URL,
  },
  robots: {
    index: false,
    follow: false,
  },
};

export default function TempleSupportPage() {
  return <TempleSupportClient />;
}
