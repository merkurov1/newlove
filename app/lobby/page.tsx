import React from 'react';
import type { Metadata } from 'next';
import LobbyPageView, { lobbyMetadata } from './LobbyPageView';

export const metadata: Metadata = lobbyMetadata('en');

export default function LobbyPage() {
  return <LobbyPageView lang="en" />;
}
