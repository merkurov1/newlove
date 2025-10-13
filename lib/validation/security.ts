// lib/validation/security.ts

import { NextRequest } from 'next/server';
import { getUserAndSupabaseFromRequest } from '@/lib/supabase-server';
import { requireAdminFromRequest } from '@/lib/serverAuth';

// Minimal compatibility wrappers that forward to the Supabase-based
// helpers implemented elsewhere in the codebase. These allow existing
// callers to keep using requireAuth/requireAdmin signatures while we
// finish migrating everything to Supabase.

export async function requireAuth(req?: NextRequest) {
  if (!req) throw new Error('Request is required for requireAuth');
  const { user } = await getUserAndSupabaseFromRequest(req as Request);
  if (!user || !user.id) throw new Error('Unauthorized');
  return user;
}

export async function requireAdmin(req?: NextRequest) {
  // Delegate to centralized requireAdminFromRequest which supports
  // cookie-based sessions and ADMIN_API_SECRET fallback.
  await requireAdminFromRequest(req as Request);
  return { ok: true };
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