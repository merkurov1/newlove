import React from 'react';
import { Volume2, Radio } from 'lucide-react';
import { useTempleAudio } from '@/components/AudioContext';

interface SoundToggleProps {
  className?: string;
}

export default function SoundToggle({ className = '' }: SoundToggleProps) {
  const { isPlaying, toggleAudio } = useTempleAudio();

  return (
    <button
      onClick={toggleAudio}
      className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-mono uppercase tracking-wider transition-all cursor-pointer bg-white/80 backdrop-blur-md border border-stone-200 shadow-sm hover:bg-stone-100 ${className}`}
      title={isPlaying ? 'Pause ambient audio' : 'Play ambient audio'}
    >
      {isPlaying ? (
        <>
          <Volume2 className="w-4 h-4 text-emerald-600 animate-pulse" />
          <span>Sound: On</span>
        </>
      ) : (
        <>
          <Radio className="w-4 h-4 text-stone-400" />
          <span>Sound: Off</span>
        </>
      )}
    </button>
  );
}
