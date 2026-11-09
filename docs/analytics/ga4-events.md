# GA4 events

One property only: `G-J1F4ZTK9ND`. The loader lives in
`components/analytics/GoogleAnalytics.tsx` and is mounted once in
`app/layout.tsx`.

## Loading rules

- The gtag script is rendered only when `NODE_ENV === 'production'`.
- `gtag('config', ...)` uses `send_page_view: false`.
- `page_view` is sent by the App Router tracker exactly once per `pathname`.
  The `useRef` guard prevents duplicate events from React strict mode.
- If gtag has not loaded yet, the event is queued on `window.dataLayer` in GA4
  object form. It is never sent twice.

## Event catalogue

| Event | Where | Safe parameters |
|---|---|---|
| `page_view` | every App Router navigation | `page_path`, `page_location`, `page_title` |
| `section_view` | Journal archive | `section` |
| `project_view` | Heart & Angel hub | `project`, `section` |
| `flow_view` | Flow feed | `section` |
| `flow_subscribe_start` | Flow join form submit | `method`, `language`, `source` |
| `flow_subscribe_complete` | Flow join response | `method`, `language`, `status`, `source` |
| `ritual_enter` | Heart & Angel Keep Calm / Let It Go | `ritual`, `project` |
| `art_engine_view` | Art Engine and Vault pages | `section`, `project` |
| `art_engine_interaction` | Art Engine access actions | `action`, `section` |
| `artifact_interaction` | reserved for public artifact actions | `artifact_type`, `action` |
| `outbound_click` | reserved for external links | `domain` |

## Privacy rules

`lib/analytics/ga4.ts` sanitizes every payload:

- keys matching email/message/prompt/conversation/intake/food/drink/brain/
  token/secret/user_id/owner/phone/notes/query/name are dropped;
- objects and arrays are dropped;
- strings are capped at 100 characters;
- event names must match `^[a-z][a-z0-9_]{0,39}$`.

Pierrot dialogue content, food records, private messages, emails, Brain data,
owner identifiers and secrets are never sent.

## Verification

1. Deploy to a production-like environment with `NODE_ENV=production`.
2. Open DevTools → Network and confirm one request to
   `googletagmanager.com/gtag/js?id=G-J1F4ZTK9ND`.
3. In GA4 DebugView, navigate between sections and confirm exactly one
   `page_view` per pathname.
4. Submit the Flow form and confirm `flow_subscribe_start` and
   `flow_subscribe_complete` with no email value.
5. Open Heart & Angel rituals and Art Engine and confirm their events.

Do not claim production GA4 collection works until these steps pass against the
live property.
