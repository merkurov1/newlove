# Telegram Instant View — verification report (2026-11-28)

## Root cause fixed

`inspectInstantViewEditor()` only read `/my/` and matched a plain `?rhash=…`.
The real editor exposes the hash on the saved template detail/preview page
inside a Telegram share link:

```text
https://t.me/share/url?url=…t.me/iv…%26rhash%3D…
```

The hash is therefore percent-encoded twice. A missing hash on the listing page
was incorrectly reported as a production mismatch. The inspector now:

1. reads `/my/` with the encrypted owner session;
2. finds the saved `merkurov.love` template link;
3. opens the template detail page and one of its tracked sample URLs;
4. extracts the hash from the nested **View in Telegram** link;
5. follows only same-origin editor redirects and never forwards the cookie to
   another host;
6. compares the editor hash with the server secret only on the server.

The repository `merkurov.love.iv` was not modified.

## Diagnostic states

| Field / value                  | Meaning                                                      |
| ------------------------------ | ------------------------------------------------------------ |
| `verified`                     | Editor hash and server secret are identical.                 |
| `mismatch`                     | Both values exist and differ.                                |
| `missing_server_hash`          | Editor issued a hash; the server variable is absent.         |
| `unknown`                      | Editor hash could not be read. Never reported as a mismatch. |
| `detailStatus=loaded`          | The template detail/preview page was read successfully.      |
| `detailStatus=unavailable`     | Network/editor failure while reading the detail page.        |
| `detailStatus=unauthenticated` | The detail page rejected the stored session.                 |

Neither the hash nor the cookie appears in the public status, UI, API response,
logs or persisted diagnostic fields. `templateUrl` is rebuilt from an allowlist
and contains no hash.

## Automated evidence

- `pnpm typecheck` — passed.
- `pnpm lint` — passed (0 errors; repository-wide pre-existing warnings only).
- `pnpm test --runInBand` — 635 suites passed, 10 tests skipped; the touched
  Telegram/Flow/admin suites were re-run after the final change and also passed.
- `pnpm build` — passed with build-only placeholder Supabase variables. A bare
  `pnpm build` fails in the unrelated `/api/cast/capture` route when
  `NEXT_PUBLIC_SUPABASE_URL` is unset; CI provides the real build configuration.
- Regression coverage includes:
  - listing without a hash → detail/preview with an encoded hash → verified;
  - exact match; mismatch; missing server secret;
  - detail page without a hash → `unknown`, not `mismatch`;
  - another owner template's hash is never compared with our secret;
  - unavailable and unauthenticated detail pages;
  - expired editor session;
  - cross-origin redirect without cookie forwarding;
  - encrypted session persistence and status normalization;
  - hash/cookie redaction in the API and UI.
- Existing publisher tests still verify `t.me/iv` generation for text, Markdown,
  image/caption, links and video, plus the Mini App/canonical fallback.

## Read-only production checks performed

The public canonical pages were fetched and checked for the hooks required by
the template:

| Case             | URL slug                            | Result                                                    |
| ---------------- | ----------------------------------- | --------------------------------------------------------- |
| Text / note      | `zdravstvui-…-be53b`                | 200, `article[data-flow-item]`, title, hero, canonical OK |
| Markdown article | `pierrot-fkbcj`                     | 200, article/title/hero, links, canonical OK              |
| Image + caption  | `heart-angel-40s5l`                 | 200, 16 image hooks, figure/caption, canonical OK         |
| Link post        | `the-road-to-the-temple-ja1n6`      | 200, article/title/hero, link card, canonical OK          |
| Video / embed    | `deepseek-merkurov-x-pierrot-bv2zi` | 200, video iframe, figure, canonical OK                   |

The public Telegram channel preview (`t.me/s/unframed_am`) currently contains
canonical `merkurov.love/flow/…` links and no `t.me/iv` links. This is consistent
with the production hash not yet being present/matching at the time of this
attempt; it is not proof either way and no production secret was read or
changed.

## What remains owner-only / not verified here

This execution environment has no owner editor session, no Vercel access and no
Telegram client, and the execution contract forbids production deployment or
secret changes. Therefore the following acceptance items are **not verified**:

- a live editor inspection showing `verified` with the real production secret;
- a live Telegram client opening `t.me/iv` for a public Flow post;
- visual confirmation of title, text, Markdown, image/caption, links and video
  inside Telegram.

## Owner completion checklist (no secrets in chat)

1. Open Admin → Integrations → Telegram Instant View and press
   **Проверить шаблон и hash**.
2. If the result is `mismatch` or `missing_server_hash`, open the saved
   `merkurov.love` template in <https://instantview.telegram.org/my/>, copy the
   `rhash` from **View in Telegram**, and update only
   `TELEGRAM_INSTANT_VIEW_TEMPLATE_HASH` in Vercel → Project → Settings →
   Environment Variables, then redeploy.
3. If the result is `unknown`, open the saved template/preview in the editor
   once (so it has a tracked sample URL) and repeat the inspection. Do not
   change the secret blindly.
4. Publish or retry one public Flow crosspost and open the `[ Flow ]` link in a
   Telegram client. Repeat for a text/Markdown post, an image/caption post and
   a link/video post.
5. Confirm the same URLs still open normally at their canonical
   `https://www.merkurov.love/flow/<slug>` addresses and that the Mini App
   fallback still works when Instant View is unavailable.
