import React from 'react';
import { GlobalAudioProvider } from '../../components/AudioContext';

export default function HeartAndAngelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <GlobalAudioProvider>
      {children}
    </GlobalAudioProvider>
  );
}
