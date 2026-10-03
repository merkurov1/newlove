'use client';

import createContext from 'react';
import useContext from 'react';
import useRef from 'react';
import useState from 'react';

const ASSETS = {
  ambientAudio: 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/heartandangel/Drift%20of%20Glass.mp3',
};

interface AudioContextType {
  isPlaying: boolean;
  toggleAudio: () => void;
}

const initialContext: AudioContextType = {
  isPlaying: false,
  toggleAudio: () => {},
};

// Никаких <AudioContextType> внутри функции! Тип выводится из initialContext
const AudioContext = createContext(initialContext);

export const useTempleAudio = () => useContext(AudioContext);

export function GlobalAudioProvider({ children }: { children: React.ReactNode }) {
  // Используем `as` вместо передачи дженерика в useRef
  const audioRef = useRef(null) as { current: HTMLAudioElement | null };
  const [isPlaying, setIsPlaying] = useState(false);

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
      {children}
      <audio ref={audioRef as any} src={ASSETS.ambientAudio} loop preload="auto" />
    </AudioContext.Provider>
  );
}
