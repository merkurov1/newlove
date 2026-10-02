import type { Metadata } from 'next';
import ArtEngineClient from './ArtEngineClient';

export const metadata: Metadata = {
  title: "Art Intelligence Terminal | Anton Merkurov",
  description: "Institutional-grade art advisory and automated market intelligence terminal for family offices and fine art banking.",
  alternates: {
    canonical: "https://www.merkurov.love/art-engine",
  },
  openGraph: {
    title: "Art Intelligence Terminal | Anton Merkurov",
    description: "Institutional-grade art advisory and automated market intelligence terminal.",
    url: "https://www.merkurov.love/art-engine",
    siteName: "Anton Merkurov",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Art Intelligence Terminal | Anton Merkurov",
    description: "Institutional-grade art advisory and automated market intelligence terminal.",
    creator: "@merkurov",
    site: "@merkurov",
  },
};

export default function ArtEnginePage() {
  return <ArtEngineClient />;
}
