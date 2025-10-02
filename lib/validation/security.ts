// lib/validation/security.ts

import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/authOptions';

// Проверка аутентификации
export async function requireAuth(req?: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    throw new Error('Authentication required');
  }
  return session;
}

// Проверка прав администратора
export async function requireAdmin(req?: NextRequest) {
  const session = await requireAuth(req);
  if (session.user.role !== 'ADMIN') {
    throw new Error('Admin rights required');
  }
  return session;
}

// Валидация email
export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Валидация slug (URL-friendly)
export function validateSlug(slug: string): boolean {
  const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  return slugRegex.test(slug);
}

// Санитизация HTML-контента
export function sanitizeHtml(html: string): string {
  // Базовая санитизация - удаление опасных тегов
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+="[^"]*"/gi, '');
}

// Валидация размера файла
export function validateFileSize(file: File, maxSizeInMB: number = 5): boolean {
  const maxSizeInBytes = maxSizeInMB * 1024 * 1024;
  return file.size <= maxSizeInBytes;
}

// Валидация типа файла
export function validateFileType(file: File, allowedTypes: string[]): boolean {
  return allowedTypes.includes(file.type);
}

// Защита от SQL injection для строковых параметров
export function sanitizeString(str: string): string {
  if (typeof str !== 'string') return '';
  return str.replace(/['"\\]/g, '');
}

// Лимитирование длины строки
export function limitString(str: string, maxLength: number): string {
  return str.length > maxLength ? str.substring(0, maxLength) : str;
}