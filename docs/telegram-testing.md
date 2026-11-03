# Telegram testing — Pierrot

## 1. Automated tests

Run the focused suite:

```bash
npx jest lib/telegram lib/flow/__tests__/publish.test.ts \
  lib/flow/__tests__/crosspostMeta.test.ts \
  app/api/flow/crosspost/__tests__/route.test.ts --runInBand
```

Typecheck:

```bash
npx tsc --noEmit
```

Covered automatically:

- Telegram initData signature, stale/future timestamps, missing user;
- safe Mini App deep-link allowlist;
- Flow mode persistence, expiry and user/chat binding;
- direct Flow publication without draft;
- deterministic Telegram idempotency slug;
- automatic title through the shared Flow service;
- crosspost summary status;
- unsupported/invalid Flow input;
- existing Telegram formatting and button adapter;
- existing crosspost channels and admin API.

## 2. Security checks

### Forged webhook

With secret enforcement enabled, send a POST with no secret and with a wrong
secret. Both must return 401/403 and must not reach the bot handlers.

```bash
curl -i -X POST "https://www.merkurov.love/api/pierrot" \
  -H "Content-Type: application/json" \
  -d '{"update_id":1}'
```

Do not use a real bot token in the command. Telegram sends the real secret in
`X-Telegram-Bot-Api-Secret-Token`.

### Forged owner identity

Send a text message as a non-owner while claiming an owner ID in the JSON.
Owner-only commands must still reject it. The code never trusts `from.id` from
an unsigned webhook, and callback data is never authorization.

### initData

- Valid initData must open the Mini App session.
- A payload with one changed field must fail.
- initData older than 24 hours must fail.
- initData with `auth_date` in the future must fail.
- Sending only `user.id` without initData to `/api/temple/auth` must fail.

## 3. Real Telegram checklist

These checks require the real bot token and are intentionally not simulated in
CI.

### Bot commands

- [ ] `/start`
- [ ] `/help`
- [ ] `/privacy`
- [ ] `/privacy on`
- [ ] `/privacy off`
- [ ] `/delete`
- [ ] `/flow`
- [ ] `/cancel`
- [ ] Unknown command falls back to normal Pierrot answer.
- [ ] Owner sees `/status`, `/end`, `/human`, `/settings`.
- [ ] Visitor cannot use owner commands.

### Flow direct publish

- [ ] `/flow` shows Note, Link, Article, Media.
- [ ] Note: send text → item published immediately, no draft, no confirmation.
- [ ] Link: send text with URL → link item and source URL.
- [ ] Article: send long text → article item.
- [ ] Media: send photo + caption → photo item with public image URL.
- [ ] Result shows title, publication URL, crosspost status.
- [ ] Open publication opens the real `/flow/<slug>`.
- [ ] Share opens Telegram share.
- [ ] Publish another reopens the mode picker.
- [ ] `/cancel` clears the mode.
- [ ] Invalid link mode input creates no empty item.
- [ ] Unsupported attachment creates no empty item.
- [ ] Telegram redelivery of the same update does not create a duplicate.
- [ ] Crosspost failure is reported honestly, not as success.
- [ ] Without the Flow-state migration, the bot explains that publishing is
      temporarily unavailable and normal chat still works.

### Human handoff

- [ ] Visitor requests Anton.
- [ ] Owner receives notification with Accept / Decline.
- [ ] Accept starts the live conversation.
- [ ] Owner reply reaches the visitor.
- [ ] `/status` reflects the active conversation.
- [ ] `/end` closes it.
- [ ] Decline returns the visitor to Pierrot.

### Mini App

- [ ] Main Mini App opens `/lobby`.
- [ ] Menu Button opens `/lobby`.
- [ ] Deep link `lobby`, `flow`, `journal`, `temple`, `selection`, `art` works.
- [ ] Deep link to a concrete Flow slug works.
- [ ] Unknown/deep-link injection is rejected.
- [ ] BackButton follows real history.
- [ ] BackButton at `/lobby` closes or falls back safely.
- [ ] ThemeChanged updates theme variables.
- [ ] Safe Area / content safe area works on iOS.
- [ ] Fullscreen falls back gracefully when unsupported.
- [ ] Safari outside Telegram does not initialize Telegram UI.
- [ ] iOS, Android and Telegram Desktop checked.

### Voice and photos

- [ ] Voice message is downloaded, size-checked and transcribed.
- [ ] Transcription failure gives a text reply, not a crash.
- [ ] Missing `OPENAI_API_KEY` gives a clear fallback.
- [ ] Photo outside Flow Media gets an explicit explanation.
- [ ] Oversized photo is rejected without publishing.

## 4. Regression audit

After the Telegram tests, run:

```bash
npx jest lib/flow lib/telegram app/api/flow --runInBand
```

Check that existing Flow publication, crossposting, Pierrot web chat and admin
pages still work.
