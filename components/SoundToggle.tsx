'use client';

import React from 'react';
import { Volume2, Radio } from 'lucide-react';
import { useTempleAudio } from './AudioContext';

interface SoundToggleProps {
  className?: string;
  iconClassName?: string;
  showTextOnMobile?: boolean;
}

export default function SoundToggle({
  className = '',
  iconClassName = 'text-pink-400',
  showTextOnMobile = false,
}: SoundToggleProps) {
  const { isPlaying, toggleAudio } = useTempleAudio();

  return (
    <button
      onClick={toggleAudio}
      className={`flex items-center gap-2 rounded-full backdrop-blur-md transition-all text-xs font-medium tracking-wide shadow-sm cursor-pointer ${className}`}
    >
      {isPlaying ? (
        <Volume2 size={14} className={`animate-pulse ${iconClassName}`} />
      ) : (
        <Radio size={14} />
      )}
      <span className={showTextOnMobile ? '' : 'hidden sm:inline'}>
        {isPlaying ? 'Sound On' : 'Sound Off'}
      </span>
    </button>
  );
}
