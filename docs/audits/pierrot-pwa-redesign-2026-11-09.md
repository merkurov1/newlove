# Pierrot PWA — editorial redesign

Date: 2026-11-09

Scope: `/admin/pierrot` in `merkurov1/newlove`; read-only audit of `merkurov1/Pierrot` (Expo).

## 1. Before the change

- The web shell was `WorkspaceShell`: a permanent left rail with
  CHAT / FLOW / ART / HEART & ANGEL and BRAIN / DASH / DEV.
- The conversation history lived in a left drawer inside `ChatWorkspace`.
- Memory lived in a right-side panel.
- Source inspection lived in a second right-side panel.
- Flow was a separate route (`/admin/pierrot/flow`).
- Brain injection was a separate route (`/admin/pierrot/brain`).
- Dev was a separate route (`/admin/pierrot/dev`).
- Art Engine was a separate route (`/admin/pierrot/art-engine`).
- The projects route was previously reduced to a redirect.
- The empty chat showed the dashboard-like `HomeOverview` with three metric
  indicators.

The Expo client already had a single conversation list and no project-folder
navigation; it was not modified.

## 2. New structure

### Top bar

Only three elements remain:

1. Pierrot avatar.
2. Chat.
3. Projects.

Avatar starts a new MAIN-chat session. In a project chat it returns to a new
main session instead of creating a second project chat. If there is unsent
draft text, the user is asked before it is discarded.

### Projects

`/admin/pierrot/projects` is a real editorial catalog again:

- one row per project;
- name, short description, status, last activity, optional owner rating;
- no card grid;
- no project folder in the sidebar;
- clicking a project opens its canonical chat through `?project=<slug>`;
- the Art Engine project exposes a compact Art Engine action.

### Chat

- The central conversation is the only permanent working surface.
- Empty state is an invitation to speak, not a dashboard.
- History is hidden by default and opens as a compact popover from the chat
  header.
- The previous session and history navigation is preserved.
- The source inspector is now a modal sheet, not a permanent right panel.
- No right-side Chat/Flow/Art panel remains.

### Left panel

One left drawer contains exactly two sections:

- **Memory** — existing memory records, search/status/filter/edit/archive/delete;
  project chats pass `project` to the existing memory API.
- **Flow** — the existing `FlowWorkspace` feed embedded in the panel, with
  existing publish/edit/delete/read actions and Telegram/Bluesky logic.

The panel does not reset or unmount the active chat.

### Technical contexts

- Dev is removed from primary navigation.
- Brain and diagnostics remain reachable from a compact footer inside the
  Memory side panel.
- Dev route remains available for existing functionality, but is not part of
  the main interface.
- Art Engine remains available from the Art Engine project context.

## 3. Reused, not duplicated

Reused:

- `ChatWorkspace` session/history/streaming/memory logic;
- `FlowWorkspace` and existing NewPostModal / Flow API;
- `ProjectsWorkspace` project API and project creation endpoint;
- `WorkspaceMarkdown`, `HomeOverview`, `PierrotAvatar`;
- `workspace/status.ts`, project canonical/history APIs;
- all existing Supabase tables and API contracts.

No new tables, no API contract changes, no mock data.

## 4. Removed / replaced UI

- Removed permanent left rail navigation.
- Removed right memory panel.
- Removed right source inspector.
- Removed project card grid from the catalog.
- Removed dashboard cards from the empty chat.
- Removed Flow/Art/Brain/Dash/Dev from primary navigation.
- Old `/admin/pierrot/projects/[slug]` still redirects to the canonical chat;
  no second project workspace is created.

Old components are not deleted: `BrainWorkspace`, `DevWorkspace`,
`ProjectOverview`, `WorkspaceHealthCard`, etc. remain available for direct
routes and future contextual use until dependency checks are complete.

## 5. Tests and checks

Added/updated:

- `lib/pierrot/workspace/__tests__/navigation.test.ts`
  — only Chat and Projects are primary.
- `components/pierrot/workspace/__tests__/WorkspaceShell.test.tsx`
  — top bar contains avatar + Chat + Projects; no rail/Flow/Art/Dev links.
- `components/pierrot/workspace/__tests__/HomeOverview.test.tsx`
  — empty chat is not a dashboard.
- `components/pierrot/workspace/__tests__/ProjectsWorkspace.test.tsx`
  — editorial project rows; project chat links; Art Engine context action.

Results:

```text
TypeScript: tsc --noEmit -> 0 errors
Jest:       307 suites, 2133 tests passed
Build:      not run (explicitly out of scope for this run)
```

## 6. Limitations

- Real Safari/iPad/PWA visual testing was not possible in this environment;
  responsive CSS and safe-area rules were implemented but not physically
  verified on device.
- The existing Flow full page and Dev direct route remain in the codebase as
  compatibility routes; they are no longer primary navigation.
- The left Flow panel uses the existing full `FlowWorkspace` component, so its
  visual density is still governed by the existing Flow styles.
- No production migration or deployment was performed.
