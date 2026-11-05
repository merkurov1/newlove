import React from 'react';
import type { Metadata } from 'next';
import LobbyPageView, { lobbyMetadata } from '@/app/lobby/LobbyPageView';

export const metadata: Metadata = lobbyMetadata('ru');

export default function Page() {
  return <LobbyPageView lang="ru" />;
}
