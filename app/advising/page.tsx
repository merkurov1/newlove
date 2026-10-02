import type { Metadata } from 'next';
import AdvisingClient from './AdvisingClient';

export const metadata: Metadata = {
  title: "The Private Office & Advising | Anton Merkurov",
  description: "Heritage Architecture, Art Advisory, and Digital Sovereignty for the Post-Digital Age.",
  alternates: {
    canonical: "https://www.merkurov.love/advising",
  },
  openGraph: {
    title: "The Private Office & Advising | Anton Merkurov",
    description: "Heritage Architecture, Art Advisory, and Digital Sovereignty for the Post-Digital Age.",
    url: "https://www.merkurov.love/advising",
    siteName: "Anton Merkurov",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "The Private Office & Advising | Anton Merkurov",
    description: "Heritage Architecture, Art Advisory, and Digital Sovereignty for the Post-Digital Age.",
    creator: "@merkurov",
    site: "@merkurov",
  },
};

export default function AdvisingPage() {
  return <AdvisingClient />;
}
