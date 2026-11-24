/**
 * Route-level decision for the Flow primary action.
 *
 * Client visibility is UX only; every write API still verifies the admin
 * session or signed Telegram initData server-side.
 */
export type FlowPrimaryAction =
  | { kind: 'native-write'; label: 'WRITE' }
  | { kind: 'fallback-write'; label: 'WRITE' }
  | { kind: 'hidden'; reason: 'not-owner' | 'not-telegram' | 'editing' };

export function resolveFlowPrimaryAction(input: {
  isTelegram: boolean;
  isAdmin: boolean;
  bottomButtonAvailable: boolean;
  editing: boolean;
  composerOpen: boolean;
}): FlowPrimaryAction {
  if (!input.isAdmin) return { kind: 'hidden', reason: 'not-owner' };
  if (!input.isTelegram) return { kind: 'hidden', reason: 'not-telegram' };
  if (input.editing || input.composerOpen) return { kind: 'hidden', reason: 'editing' };

  return input.bottomButtonAvailable
    ? { kind: 'native-write', label: 'WRITE' }
    : { kind: 'fallback-write', label: 'WRITE' };
}
