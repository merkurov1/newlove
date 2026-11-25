'use client';

// Historical duplicate kept for importers that resolve `.tsx` first. It points
// at the same implementation as `components/useIsTelegram.ts`.
export {
  default,
  detectTelegramEnvironment,
  getTelegramEnvironmentSnapshot,
  isTelegramMiniApp,
  readTelegramInitData,
  useTelegramEnvironment,
  __refreshTelegramEnvironmentForTests,
  __resetTelegramEnvironmentForTests,
  type TelegramEnvironment,
  type TelegramEnvironmentStatus,
} from '@/lib/telegram/detection';
