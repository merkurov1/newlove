/**
 * Lightweight server-only guard for modules that use service-role clients or
 * private persistence. It fails fast if such a module is executed in a browser.
 *
 * This is not a replacement for keeping secrets out of client bundles; it is a
 * defensive check for accidental imports.
 */
export function assertServerOnly(moduleName: string): void {
  if (typeof window !== 'undefined') {
    throw new Error(`${moduleName} must never be imported from a Client Component.`);
  }
}
