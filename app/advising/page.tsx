import type { Metadata } from 'next';
import AdvisingClient from './AdvisingClient';

export const metadata: Metadata = {
  title: "The Private Office & Advising | Merkurov",
  description: "Heritage Architecture, Art Advisory, and Digital Sovereignty for the Post-Digital Age.",
  openGraph: {
    title: "The Private Office & Advising | Merkurov",
    description: "Heritage Architecture, Art Advisory, and Digital Sovereignty.",
    url: "https://www.merkurov.love/advising",
    siteName: "Anton Merkurov",
    type: "website",
  }
};

export default function AdvisingPage() {
  return <AdvisingClient />;
}
