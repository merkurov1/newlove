"use client";

import { useEffect } from 'react';
import { templeTrack } from '@/components/templeTrack';

export default function TempleEntry() {
  useEffect(() => {
    templeTrack('enter', 'User opened LetItGo page');
  }, []);

  return null;
}
