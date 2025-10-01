// lib/sanitizeHtml.ts
import createDOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';

// SSR: создаём window для DOMPurify
const window = new JSDOM('').window as unknown as Window;
const DOMPurify = createDOMPurify(window);

export function sanitizeHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty, { USE_PROFILES: { html: true } });
}
