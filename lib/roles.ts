// lib/roles.ts
import { Role } from '@/types/next-auth.d';

export const ROLE_EMOJIS = {
  [Role.USER]: '',
  [Role.ADMIN]: '👑',
  [Role.SUBSCRIBER]: '❤️',
  [Role.PATRON]: '💖',
  [Role.PREMIUM]: '💝', 
  [Role.SPONSOR]: '❤️‍🔥',
} as const;

export const ROLE_NAMES = {
  [Role.USER]: 'User',
  [Role.ADMIN]: 'Administrator',
  [Role.SUBSCRIBER]: 'Subscriber',
  [Role.PATRON]: 'Patron',
  [Role.PREMIUM]: 'Premium',
  [Role.SPONSOR]: 'Sponsor',
} as const;

export const ROLE_DESCRIPTIONS = {
  [Role.USER]: 'Standard user',
  [Role.ADMIN]: 'Full administrative access',
  [Role.SUBSCRIBER]: 'Supports the project ❤️',
  [Role.PATRON]: 'Patron supporter 💖',
  [Role.PREMIUM]: 'Premium support 💝',
  [Role.SPONSOR]: 'Lead sponsor ❤️‍🔥',
} as const;

export function getRoleEmoji(role?: Role | string | null): string {
  if (!role) return '';
  // Normalize to lowercase to match enum values
  const normalizedRole = String(role).toLowerCase() as Role;
  return ROLE_EMOJIS[normalizedRole] || '';
}

export function getRoleName(role?: Role | string | null): string {
  if (!role) return 'Guest';
  // Normalize to lowercase to match enum values
  const normalizedRole = String(role).toLowerCase() as Role;
  return ROLE_NAMES[normalizedRole] || 'Unknown role';
}

export function getRoleDescription(role?: Role | string | null): string {
  if (!role) return 'Not authenticated';
  // Normalize to lowercase to match enum values
  const normalizedRole = String(role).toLowerCase() as Role;
  return ROLE_DESCRIPTIONS[normalizedRole] || 'Description unavailable';
}

// Проверка иерархии ролей (для будущего использования)
export function hasRoleAccess(userRole?: Role | null, requiredRole?: Role): boolean {
  if (!userRole) return false;
  if (userRole === Role.ADMIN) return true; // Админ имеет доступ ко всему
  if (!requiredRole) return true;
  
  const hierarchy = [Role.USER, Role.SUBSCRIBER, Role.PATRON, Role.PREMIUM, Role.SPONSOR];
  const userLevel = hierarchy.indexOf(userRole);
  const requiredLevel = hierarchy.indexOf(requiredRole);
  
  return userLevel >= requiredLevel;
}
