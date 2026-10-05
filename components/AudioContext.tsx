'use client';

import React from 'react';
import { usePathname } from 'next/navigation';

const ASSETS = {
  ambientAudio: 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/heartandangel/Drift%20of%20Glass.mp3',
};

interface AudioContextType {
  isPlaying: boolean;
  toggleAudio: () => void;
}

const initialAudioContext: AudioContextType = {
  isPlaying: false,
  toggleAudio: () => {},
};

const AudioContext = React.createContext(initialAudioContext);

export const useTempleAudio = () => React.useContext(AudioContext);

export function GlobalAudioProvider(props: React.PropsWithChildren<{}>) {
  // Убран дженерик <HTMLAudioElement | null>, используется as
  const audioRef = React.useRef(null) as { current: HTMLAudioElement | null };
  const [isPlaying, setIsPlaying] = React.useState(false);
  const pathname = usePathname() || '';
  const inTemple = pathname === '/temple' || pathname === '/vigil' || pathname === '/absolution' || pathname === '/tribute' || pathname === '/heartandangel/calm' || pathname === '/heartandangel/letitgo';

  React.useEffect(() => {
    if (!inTemple && audioRef.current && !audioRef.current.paused) {
      audioRef.current.pause();
      setIsPlaying(false);
    }
  }, [inTemple]);

  const toggleAudio = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().then(() => {
        setIsPlaying(true);
      }).catch((err: unknown) => {
        console.log('Audio play error:', err);
      });
    }
  };

  const contextValue = { isPlaying, toggleAudio };

  return (
    <AudioContext.Provider value={contextValue}>
      {props.children}
      <audio ref={audioRef as any} src={ASSETS.ambientAudio} loop preload="none" />
    </AudioContext.Provider>
  );
}
