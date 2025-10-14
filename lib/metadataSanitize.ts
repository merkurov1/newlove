// lib/metadataSanitize.ts
// Ensure metadata values are serializable for Next.js (no React elements, functions, symbols).
export function sanitizeMetadata(input: any): any {
  // EMERGENCY: Always return minimal safe metadata to guarantee serialization
  // Remove this after root cause is fixed and verified in production
  return { title: 'Untitled', description: '' };
}

