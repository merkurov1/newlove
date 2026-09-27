import type { Metadata } from 'next';
import LobbyClient from './LobbyClient';

export const metadata: Metadata = {
  title: "Private Office | Merkurov",
  description: "Heritage Architecture for the Post-Digital Age.",
};

export default function LobbyPage() {
  return <LobbyClient />;
}
