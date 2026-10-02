import type { Metadata } from 'next';
import LobbyClient from './LobbyClient';

export const metadata: Metadata = {
  title: "Private Office & Access | Anton Merkurov",
  description: "Heritage Architecture for the Post-Digital Age.",
  alternates: {
    canonical: "https://www.merkurov.love/lobby",
  },
  openGraph: {
    title: "Private Office & Access | Anton Merkurov",
    description: "Heritage Architecture for the Post-Digital Age.",
    url: "https://www.merkurov.love/lobby",
    siteName: "Anton Merkurov",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Private Office & Access | Anton Merkurov",
    description: "Heritage Architecture for the Post-Digital Age.",
    creator: "@merkurov",
    site: "@merkurov",
  },
};

export default function LobbyPage() {
  return <LobbyClient />;
}
