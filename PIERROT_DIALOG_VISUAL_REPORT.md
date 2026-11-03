# Pierrot Dialog Visual Refresh — Report

**Date:** 3 November 2026  
**Repository:** `merkurov1/newlove`  
**Scope:** message rendering inside the existing Pierrot dialog only.

---

## 1. Components changed

| File                                                      | Change                                                                                                           |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `components/pierrot/PierrotConversation.tsx`              | Markdown typography, tables, code, quotes, links, user bubble, feedback, actions/CTA/links, sources presentation |
| `components/pierrot/__tests__/PierrotNavigation.test.tsx` | Regression coverage for tables, quotes, lists, code, links and image fallback                                    |

No other production component was changed for this task.

> The working tree also contains unrelated changes from other work. They were not touched, committed or reverted by this task.

---

## 2. What improved visually

### User messages

- Slightly narrower and more compact (`max-w-[86%]` / `sm:max-w-[74%]`).
- Smaller type than Pierrot’s answers (`14.5px` / `15.5px`), keeping the reply as the reading focus.
- Clearer separation with a light warm outline and a slightly deeper existing paper tone.
- Retains the asymmetric bottom-right corner; no decorative card treatment.

### Pierrot answers

- Slightly smaller body size with more generous line-height (`15.5px/1.8`; `16.5px/1.8` on larger screens).
- More rhythm between paragraphs, headings, lists and quotes.
- Headings now use a consistent serif hierarchy (h1–h4), normal weight and tighter top spacing when first.
- Longer answers remain open text, not a sequence of cards.
- `min-w-0` prevents wide content from breaking the message column.

### Markdown

- Links are visibly underlined, using the existing warm brown palette; they remain text links, not buttons.
- Lists have slightly more breathing room and warm markers.
- Inline code uses a quieter paper background.
- Code blocks have a bounded width, internal horizontal scroll, consistent mono sizing and a nested-code reset.
- Blockquotes have a restrained warm background, left rule and italic text.
- Tables now render as actual tables: subtle header background, header rules, row separators, wrapping cells and horizontal scroll on narrow screens.
- Markdown images are still not loaded remotely. Their alt text is shown as `[Alt]`; this avoids tracking pixels and matches the current message contract.

### Feedback and actions

- Feedback is a quiet footer row: `Was this useful? Yes / No`.
- Selected states use very light existing green/rose tints instead of bordered tags.
- Actions and navigation links are separated by a thin rule and use smaller, lighter pills.
- The primary CTA remains the only dark pill, so it does not compete with long prose.
- Click/tracking logic was not changed.

### Sources and citations

- Sources are no longer a rounded card.
- The block uses a thin top rule, compact summary and 2.5px vertical rhythm.
- Media verification labels, metadata, excerpts and original-publication links are smaller and visually subordinate to the answer.
- Similarity values remain visible but muted.

---

## 3. Rich Content checked

| Type                    | Current support                      | Result                                                     |
| ----------------------- | ------------------------------------ | ---------------------------------------------------------- |
| Paragraphs              | Markdown                             | Improved rhythm                                            |
| H1–H4                   | Markdown                             | Consistent serif hierarchy                                 |
| Bold / italic           | Markdown                             | Preserved                                                  |
| Bullet / numbered lists | Markdown                             | Improved spacing and markers                               |
| Links                   | Markdown + internal route linkifier  | Visible but non-button styling                             |
| Blockquotes             | Markdown                             | Distinct quote treatment                                   |
| Tables                  | Markdown/GFM                         | Proper table rendering, wrapping, scroll                   |
| Inline code             | Markdown                             | Quieter, bounded                                           |
| Code blocks             | Markdown fenced code                 | Horizontal scroll, no width breakage                       |
| Images                  | Markdown syntax                      | **No remote image payload exists**; safe alt fallback only |
| Evidence sources        | `message.evidence`                   | Compact semantic source list                               |
| Media labels            | `verificationStatus` / `quoteType`   | Preserved, quieter                                         |
| Actions                 | `message.actions`                    | Lighter chips, separated from prose                        |
| Message links           | `message.links`                      | Lighter outlined chips                                     |
| CTA                     | `message.cta`                        | Single primary dark pill                                   |
| RAG status              | `message.ragOutcome`                 | Integrated limitation note                                 |
| Answer source/provider  | `message.answerSources` / `provider` | Muted footer metadata                                      |
| Feedback                | `AnswerFeedback`                     | Quieter, selected states                                   |
| Old saved messages      | Existing normalized message shape    | Rendered by the same path; no migration needed             |

**Important limitation:** there is no structured image field in the current `PierrotMessage` contract or API response. Markdown image syntax is deliberately suppressed for privacy/tracking reasons. No new image content type was added.

---

## 4. What was not changed

- Chat shell, modal size, position and portal.
- Header, avatar, reset/close controls.
- Empty state and onboarding copy.
- Composer/input and send button.
- Navigation and action business logic.
- `app/main.css` and global site styles.
- Backend, API routes, AI orchestration and system prompts.
- Supabase schema, data and migrations.
- Auth and owner/visitor identity.
- Commercial flows, offers, CTA destinations, tracking or storage.

All new styling is local Tailwind utility usage inside the dialog component.

---

## 5. Verification

| Check                      | Result                                                                                                                                       |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript                 | `tsc --noEmit` — PASS                                                                                                                        |
| Full Jest                  | 175 suites / 1199 tests — PASS                                                                                                               |
| Dialog-focused Jest        | `PierrotNavigation`, `PierrotChatViewport` — PASS                                                                                            |
| Markdown regression        | Headings, quote, list, table, code, link — PASS                                                                                              |
| Image privacy regression   | Remote markdown image not rendered; alt fallback shown — PASS                                                                                |
| Browser screenshots        | Desktop 1280px and mobile 390px, before/after captured                                                                                       |
| Playwright geometry matrix | Partial: several runs hit Chromium “Page crashed” in this environment; the two targeted dialog suites passed and screenshots verified layout |

Screenshots were written to `/tmp/opencode/`:

- `pierrot-dialog-before-desktop-top.png`
- `pierrot-dialog-before-mobile-bottom.png`
- `pierrot-dialog-desktop-top.png`
- `pierrot-dialog-mobile-bottom.png`

### Visual result

- Before: tables had no structure and collided on mobile (`Checked2 publications`, no borders); links were not visibly underlined; feedback was a bordered tag row; actions were heavier.
- After: table columns wrap and remain readable; links are visibly underlined; feedback, sources and actions recede behind the answer; long code scrolls inside its block.

---

## 6. Remaining limitations

1. Tables are horizontally scrollable on very narrow screens. `min-w-[340px]` keeps normal 3–4 column tables readable at 390px; larger tables scroll rather than break the dialog.
2. Remote Markdown images remain blocked by design. If image-rich answers become a product requirement, they need a separate verified image payload and allowlist, not arbitrary Markdown URLs.
3. The Playwright geometry matrix could not complete reliably because Chromium crashed during repeated page loads in this environment. The dialog viewport tests that did run passed; the chat shell was not modified.
4. No backend or message-format change was made, so existing saved conversations render through the same improved path.
