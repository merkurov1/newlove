// lib/sanitizeHtml.ts

import createDOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';

// SSR: создаём window для DOMPurify
const { window } = new JSDOM('');
const DOMPurify = createDOMPurify(window as any);

export function sanitizeHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty, { USE_PROFILES: { html: true } });
}
