# Telegram Instant View for Flow

This directory contains the Telegram Instant View template for public Flow
posts on `merkurov.love`.

- Template: [`merkurov.love.iv`](./merkurov.love.iv)
- Canonical page: `https://www.merkurov.love/flow/<public-slug>`
- Template domain: `merkurov.love`
- Crosspost helper: [`lib/telegram/instantView.ts`](../../lib/telegram/instantView.ts)

The template is deliberately **not** activated by a hash in this repository.
Telegram issues the hash from a logged-in Instant View editor, and the hash is
deployment configuration. Until a real, validated hash is configured, Telegram
crossposts keep using the existing Mini App link or the canonical Flow URL.

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

## Validate the template in Telegram's editor

1. Sign in at <https://instantview.telegram.org/my/> with the owner's Telegram
   account.
2. Enter `merkurov.love` as the target domain and open a Flow post URL.
3. Paste the contents of [`merkurov.love.iv`](./merkurov.love.iv) into the
   **Rules** pane. The editor attaches the rules to the domain, so the file
   intentionally contains no `@domain` rule.
4. Check the rendered preview and the status line. The page must be valid, with
   no warnings and no "unsupported element" errors.
5. Repeat on the representative public posts below. Adjust selectors only if
   the live markup changed; keep the canonical URL and public/private rules
   untouched.

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

## Obtain and configure the hash

The hash is the `rhash` value in the editor's **View in Telegram** link:

```text
https://t.me/iv?url=https%3A%2F%2Fwww.merkurov.love%2Fflow%2Fexample&rhash=<hash>
```

After at least the five representative posts validate:

1. Copy the real `rhash` from that link. Do not type a hash by hand and do not
   use a placeholder.
2. Set it as a server-side environment variable (never a public client value):

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

The helper validates the hash as 8–64 hexadecimal characters and only wraps
canonical `https://merkurov.love/flow/<slug>` (optionally `www`) URLs. If the
hash is absent, malformed, or the URL is not a public Flow post, the helper
returns `null`; the publisher then uses the existing Mini App URL or the
canonical web URL. A missing hash can never create a broken `t.me/iv` link.

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
  public rendering path.
- The URL helper rejects non-Flow/admin routes and non-HTTPS URLs.
- To roll back, unset `TELEGRAM_INSTANT_VIEW_TEMPLATE_HASH` (and the alias).
  Crossposts immediately fall back to the Mini App/canonical URL. Deleting the
  hash does not affect the canonical page, existing Telegram messages, or the
  database.
