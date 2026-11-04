'use client';

/**
 * Short-lived, tab-local handoff for "В Brain" / "Во Flow".
 * It is not a history store and is cleared after reading or on logout.
 */
export const WORKSPACE_HANDOFF_KEY = 'pierrot_workspace_handoff_v1';

export type WorkspaceHandoff = {
  kind: 'brain' | 'flow';
  text: string;
  createdAt: number;
};

export function setWorkspaceHandoff(handoff: Omit<WorkspaceHandoff, 'createdAt'>): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(
      WORKSPACE_HANDOFF_KEY,
      JSON.stringify({ ...handoff, createdAt: Date.now() })
    );
  } catch {
    // The action remains available even if storage is unavailable.
  }
}

export function readWorkspaceHandoff(kind: WorkspaceHandoff['kind']): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(WORKSPACE_HANDOFF_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<WorkspaceHandoff>;
    if (parsed.kind !== kind || typeof parsed.text !== 'string') return null;
    window.sessionStorage.removeItem(WORKSPACE_HANDOFF_KEY);
    return parsed.text;
  } catch {
    window.sessionStorage.removeItem(WORKSPACE_HANDOFF_KEY);
    return null;
  }
}

export function clearWorkspaceHandoff(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(WORKSPACE_HANDOFF_KEY);
  } catch {
    // Ignore unavailable storage.
  }
}
