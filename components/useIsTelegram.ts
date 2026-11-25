'use client';

// Both this file and the historical `.tsx` sibling re-export the same module so
// the shared readiness store cannot be duplicated by resolver differences.
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
