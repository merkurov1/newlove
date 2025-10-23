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

export function getRoleEmoji(role?: Role | null): string {
  if (!role) return '';
  return ROLE_EMOJIS[role] || '';
}

export function getRoleName(role?: Role | null): string {
  if (!role) return 'Гость';
  return ROLE_NAMES[role] || 'Неизвестная роль';
}

export function getRoleDescription(role?: Role | null): string {
  if (!role) return 'Не авторизован';
  return ROLE_DESCRIPTIONS[role] || 'Описание недоступно';
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