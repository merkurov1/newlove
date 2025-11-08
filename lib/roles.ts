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
  [Role.USER]: 'Пользователь',
  [Role.ADMIN]: 'Администратор',
  [Role.SUBSCRIBER]: 'Подписчик',
  [Role.PATRON]: 'Патрон',
  [Role.PREMIUM]: 'Премиум',
  [Role.SPONSOR]: 'Спонсор',
} as const;

export const ROLE_DESCRIPTIONS = {
  [Role.USER]: 'Базовый пользователь',
  [Role.ADMIN]: 'Полный доступ к управлению',
  [Role.SUBSCRIBER]: 'Поддерживает проект ❤️',
  [Role.PATRON]: 'Постоянный спонсор 💖',
  [Role.PREMIUM]: 'VIP поддержка 💝',
  [Role.SPONSOR]: 'Главный спонсор ❤️‍🔥',
} as const;

export function getRoleEmoji(role?: Role | string | null): string {
  if (!role) return '';
  // Normalize to lowercase to match enum values
  const normalizedRole = String(role).toLowerCase() as Role;
  return ROLE_EMOJIS[normalizedRole] || '';
}

export function getRoleName(role?: Role | string | null): string {
  if (!role) return 'Гость';
  // Normalize to lowercase to match enum values
  const normalizedRole = String(role).toLowerCase() as Role;
  return ROLE_NAMES[normalizedRole] || 'Неизвестная роль';
}

export function getRoleDescription(role?: Role | string | null): string {
  if (!role) return 'Не авторизован';
  // Normalize to lowercase to match enum values
  const normalizedRole = String(role).toLowerCase() as Role;
  return ROLE_DESCRIPTIONS[normalizedRole] || 'Описание недоступно';
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