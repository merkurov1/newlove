import React from 'react';
import type { Metadata } from 'next';
import LobbyPageView, { lobbyMetadata } from '@/app/lobby/LobbyPageView';

export const metadata: Metadata = lobbyMetadata('de');

export default function Page() {
  return <LobbyPageView lang="de" />;
}
