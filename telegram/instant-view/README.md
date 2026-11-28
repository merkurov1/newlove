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

## Re-verify the template in Telegram's editor

The template is already saved in the editor and the hash has already been
issued, so do not paste a different rules file over it. To re-verify after an
SSR markup change:

1. Sign in at <https://instantview.telegram.org/my/> with the owner's Telegram
   account.
2. Open the saved `merkurov.love` template and one Flow post URL.
3. Confirm the Rules pane matches [`merkurov.love.iv`](./merkurov.love.iv)
   byte-for-byte. If it differs, stop: the repository copy is wrong, not the
   saved template.
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
