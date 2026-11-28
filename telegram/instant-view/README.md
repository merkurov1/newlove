# Telegram Instant View for Flow

This directory contains the Telegram Instant View template for public Flow
posts on `merkurov.love`.

- Template: [`merkurov.love.iv`](./merkurov.love.iv)
- Canonical page: `https://www.merkurov.love/flow/<public-slug>`
- Template domain: `merkurov.love`
- Crosspost helper: [`lib/telegram/instantView.ts`](../../lib/telegram/instantView.ts)

The template is the single source of truth for the domain. The production
template hash has already been issued by the Telegram Instant View editor and
is already configured as the server-side Vercel environment variable
`TELEGRAM_INSTANT_VIEW_TEMPLATE_HASH`. The hash value is deliberately **not**
stored in this repository and must never be added to a `NEXT_PUBLIC_*`
variable, HTML, analytics or logs.

Do not edit the rules, selectors, extraction order or syntax in
[`merkurov.love.iv`](./merkurov.love.iv). If the production markup changes,
adapt the SSR markup in `app/flow/[slug]/page.tsx` to the template instead.
Changing the template invalidates the issued hash and requires owner
re-verification and a new editor hash.

## What the template extracts

| Source                                                      | Instant View property/body       |
| ----------------------------------------------------------- | -------------------------------- |
| `<article data-flow-item data-flow-title>`                  | `title`                          |
| `data-flow-author`                                          | `author`                         |
| `<time datetime>`                                           | `published_date`                 |
| Flow page `og:description`, `og:image`, `og:site_name`      | link preview metadata            |
| `[data-flow-hero]`                                          | article body                     |
| Flow body headings, paragraphs, lists, quotes, code, tables | simplified article nodes         |
| Flow image figures                                          | IV Image media + caption         |
| YouTube iframe / video figure                               | IV Embed / link media            |
| Flow link cards                                             | related links inside the article |

Navigation, the reader bar, progress controls, share buttons, the newer/older
pager, the site footer and the "Pierrot Context" block are outside
`[data-flow-hero]` and are never part of the body. The only template fallback is
the old `flow-item__hero` class; there is no fallback to the whole page.

The title rule reads the Flow post's own `data-flow-title`, then its in-article
heading, then the Flow page's own `og:title`. It never reads a linked page's
preview title from the link card.

## Owner authorization from Admin → Integrations

The worker must not attempt the editor with an anonymous request. A `401` from
`https://instantview.telegram.org/my/` only means that the worker has no owner
session; it is not evidence that the template is missing.

The owner connects the official editor session from the site:

1. Sign in to `/admin` as the owner.
2. Open **Admin → Integrations → Telegram Instant View**.
3. Enter the owner's phone number in international format and start the
   connection. This only calls the official editor `/auth/request` endpoint.
4. Confirm the login inside the official Telegram app. There are no password,
   OTP or 2FA fields in the admin UI; Telegram handles the confirmation.
5. The admin page polls the official `/auth/login` endpoint until the session
   is confirmed, verifies `/my/`, then stores the cookie encrypted at rest.
6. Use **Проверить сессию** and **Проверить шаблон и hash** to verify the
   worker can read `/my/`, open the saved template detail/preview page, and
   that the editor-issued `rhash` matches the server-only production value.

No long-lived browser or Playwright daemon is required: the official editor's
login is a server-side phone-confirmation challenge (`/auth/request` then
`/auth/login`), and the confirmed cookie is the only browser state that must
persist. The app performs that challenge server-side and stores the resulting
cookie. This is deliberately not a custom password/OTP/2FA form and not the
Telegram Login Widget.

The session is stored as ciphertext in the existing private
`ops_runtime_settings` row `telegram_instant_view_session` (RLS enabled,
service-role only, no anon/authenticated grants). No schema migration is
required. The encryption key is `TELEGRAM_INSTANT_VIEW_SESSION_KEY` when set;
otherwise it is derived from the server-only `SUPABASE_SERVICE_ROLE_KEY`. The
cookie never enters the browser bundle, HTML, analytics, logs, GitHub Actions
artifacts or a public API response.

Disconnecting from the same page deletes the stored ciphertext immediately.
The session survives Vercel invocations and GitHub Actions worker restarts
because it is read from the private settings row on each run, not held in
process memory.

Server-side worker code uses the same module without any browser state:

```ts
import {
  inspectInstantViewEditor,
  readInstantViewSessionCookie,
} from '@/lib/telegram/instantViewAuth';

const session = await readInstantViewSessionCookie();
if (!session) {
  // Owner must connect from Admin → Integrations → Telegram Instant View.
}

const status = await inspectInstantViewEditor();
// status.template.rhashPresent / hashMatchesEnv are safe booleans.
// The cookie value is never returned to the client, logged or persisted as
// workflow output.
```

`inspectInstantViewEditor()` reads `/my/` with the encrypted session, so the
worker no longer receives `401` once the owner has connected. If the listing
page does not expose a hash, it follows the saved template detail/preview link
(and one of its tracked sample URLs) and reads the real **View in Telegram**
link. The editor encodes that link as
`https://t.me/share/url?url=…t.me/iv…%26rhash%3D…`, so the hash is parsed from
the nested encoded URL, not from the listing HTML. It never writes to the
editor and never rewrites the template.

The owner diagnostics distinguish four hash outcomes:

| `hashStatus`          | Meaning                                                                      |
| --------------------- | ---------------------------------------------------------------------------- |
| `verified`            | Editor hash and server secret are identical.                                 |
| `mismatch`            | Both values exist and differ.                                                |
| `missing_server_hash` | The editor issued a hash, but the server variable is not configured.         |
| `unknown`             | The editor hash could not be read. This is **never** reported as a mismatch. |

`detailStatus` additionally reports whether the template detail/preview page
was `loaded`, `unavailable` (network/editor failure) or `unauthenticated`
(the detail page rejected the session). A missing hash on a listing page is not
evidence that the production secret is wrong.

If `hashStatus` is `mismatch`, the owner must copy the exact `rhash` from the
editor's **View in Telegram** link and update only
`TELEGRAM_INSTANT_VIEW_TEMPLATE_HASH` in Vercel → Project → Settings →
Environment Variables, then redeploy. If it is `missing_server_hash`, add the
same variable. If it is `unknown`, do not change the secret blindly: open the
saved template in the editor and retry the inspection. Never paste the hash or
a cookie into chat, an issue, a public database field or a client variable.

## Re-verify the template in Telegram's editor

The template is already saved in the editor and the hash has already been
issued, so do not paste a different rules file over it. To re-verify after an
SSR markup change:

1. Sign in at <https://instantview.telegram.org/my/> with the owner's Telegram
   account, or use the owner-only admin connection above and inspect the saved
   template without rewriting it.
2. Open the saved `merkurov.love` template and one Flow post URL.
3. Confirm the Rules pane matches [`merkurov.love.iv`](./merkurov.love.iv)
   byte-for-byte. If it differs, stop: do not overwrite the repository copy
   with the editor copy or the editor copy with the repository copy. Record the
   difference and let the owner decide which copy is authoritative.
4. Check the rendered preview and the status line. The page must be valid, with
   no warnings and no "unsupported element" errors.
5. Repeat on the representative public posts below. Never edit the template to
   fit the markup; fix the SSR markup instead.

### Representative posts

Use current public posts, or these recent examples:

| Case                        | Public URL                                                                                                                                                                                |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Text-only note              | `https://www.merkurov.love/flow/%D0%B7%D0%B4%D1%80%D0%B0%D0%B2%D1%81%D1%82%D0%B2%D1%83%D0%B8-%D0%B4%D0%BE%D1%80%D0%BE%D0%B3%D0%BE%D0%B8-%D0%B4%D0%BD%D0%B5%D0%B2%D0%BD%D0%B8%D0%BA-be53b` |
| Markdown article with links | `https://www.merkurov.love/flow/pierrot-fkbcj`                                                                                                                                            |
| Image post / caption        | `https://www.merkurov.love/flow/heart-angel-40s5l`                                                                                                                                        |
| Link-containing post        | `https://www.merkurov.love/flow/flow-mwz3stch`                                                                                                                                            |
| Video / supported media     | `https://www.merkurov.love/flow/deepseek-merkurov-x-pierrot-bv2zi`                                                                                                                        |

For each case verify:

- the title is the Flow post title, not the first link preview title;
- author/date appear where the source page provides them;
- article text and headings are present, without the site header, reader bar,
  share row, pager, footer or Pierrot context;
- images keep their captions and click-through URL;
- YouTube/video content is represented by a supported embed or link;
- a link-only post still has a readable body.

## Hash status and rotation

The production hash has already been issued by Telegram's Instant View editor
and is already configured in the Vercel project as the server-side
`TELEGRAM_INSTANT_VIEW_TEMPLATE_HASH` variable. It is not stored in this
repository. Do not create a second variable, do not add it to a `NEXT_PUBLIC_*`
variable, and do not print it in logs or analytics.

The hash is the `rhash` value in the editor's **View in Telegram** link:

```text
https://t.me/iv?url=https%3A%2F%2Fwww.merkurov.love%2Fflow%2Fexample&rhash=<hash>
```

Rotate it only if the template itself changes or the value is lost:

1. Copy the real `rhash` from that link. Do not type a hash by hand and do not
   use a placeholder.
2. Update the existing server-side environment variable (never a public client
   value):

   ```dotenv
   TELEGRAM_INSTANT_VIEW_TEMPLATE_HASH=<real editor hash>
   ```

   `TELEGRAM_INSTANT_VIEW_HASH` is accepted as an alias for deployments that
   already use that name.

3. Restart/redeploy the app so the Telegram publisher reads the new value.
4. Publish or retry one Flow crosspost and confirm the `[ Flow ]` link opens a
   `t.me/iv?...&rhash=...` wrapper and then the clean Instant View page.
5. Confirm the same post still opens normally at its canonical
   `https://www.merkurov.love/flow/<slug>` URL outside Telegram.

The admin inspection never returns the hash. It reports only whether the editor
issued an `rhash`, whether that value matches the server-only environment
variable, which detail/preview page was read, and the last check time. A real
mismatch is shown to the owner with the exact variable name to update; an
unreadable hash is shown as `unknown`, not as a mismatch. The UI deliberately
does not call the Vercel API or rewrite the secret automatically.

Required server-side configuration for the admin session:

```dotenv
# Preferred dedicated encryption key (server-only, never NEXT_PUBLIC_*)
TELEGRAM_INSTANT_VIEW_SESSION_KEY=<32+ byte random value>
# Optional previous key during rotation
TELEGRAM_INSTANT_VIEW_SESSION_KEY_PREVIOUS=<old value>
```

If the dedicated key is absent, the session is still encrypted with a key
derived from `SUPABASE_SERVICE_ROLE_KEY`. Rotating the service role therefore
invalidates the stored session and requires one owner reconnection.

The helper validates the hash as 8–64 hexadecimal characters and only wraps a
canonical `https://www.merkurov.love/flow/<slug>` URL. It rejects other hosts,
HTTP, userinfo, ports, query strings, fragments, encoded path separators,
reserved feed routes and private/admin routes. The publisher additionally
requires the row to be `status = published` and `visibility = public`. If the
hash is absent, malformed, the row is not public, or the URL is not a public
Flow post, the helper returns `null`; the publisher then uses the existing Mini
App URL or the canonical web URL. A missing hash can never create a broken
`t.me/iv` link.

Unit and contract tests use a fixture hash only. The production hash is never
committed and is never asserted in test output.

## Public approval

Sending `t.me/iv?url=...&rhash=...` with the editor hash makes the Instant View
available to recipients immediately, without waiting for public approval. For
Telegram to offer Instant View automatically on all links to the domain, submit
the template for review in the editor and wait for Telegram's approval. That is
a manual account step; no application deployment or database migration is
involved. If approval is pending or declined, the configured hash link still
works and the canonical page remains the fallback.

## Privacy and rollback

- The template only matches pages with `<article data-flow-item>`, which is
  rendered by the public Flow post route. Draft/private items do not use that
  public rendering path, and the publisher refuses to create an Instant View
  wrapper for a row whose explicit status/visibility is not published/public.
- The URL helper rejects other hosts, HTTP, userinfo, ports, query strings,
  fragments, encoded path separators, feed routes, admin routes and non-Flow
  paths. It always rebuilds the URL on `https://www.merkurov.love`.
- The hash is read server-side only by `lib/flow/telegram.ts`. Never import
  `lib/telegram/instantView.ts` from a client component.
- To roll back, unset `TELEGRAM_INSTANT_VIEW_TEMPLATE_HASH` (and the alias).
  Crossposts immediately fall back to the Mini App/canonical URL. Deleting the
  hash does not affect the canonical page, existing Telegram messages, or the
  database.
