import React from 'react';
import TemplePageTransition from '@/components/TemplePageTransition';

export default function HeartAndAngelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <TemplePageTransition>{children}</TemplePageTransition>
  );
}
