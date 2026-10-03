'use client';

import React from 'react';

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
      <audio ref={audioRef as any} src={ASSETS.ambientAudio} loop preload="auto" />
    </AudioContext.Provider>
  );
}
