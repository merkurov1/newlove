# Pierrot — perspective and biography correction

**Date:** 2026-11-02  
**Scope:** central perspective contract, owner identity, biography retrieval, Telegram personal mode.  
**Constraints preserved:** no Brain architecture change, no model routing change, no new provider, no new background job, no database schema change, no new UI.

---

## 1. Root causes found

1. **The prompt never contained a hard perspective rule.**
   - The public prompt described Pierrot as Anton’s “digital shadow” but did not explicitly forbid speaking about Anton in the first person or address the visitor as Anton.
   - The owner prompt said that Anton was speaking, but did not require second-person address. A question such as «Кто такой Антон Меркуров?» could therefore produce a third-person biography even in owner mode.

2. **Biography questions were not routed to biography sources.**
   - «Расскажи про меня», «Чем я занимаюсь?», «Кто такой Антон Меркуров?» and «Что ты обо мне знаешь?» were classified as `general` or did not request biography sources.
   - The production Brain contains an owner profile document, `Контекстный профиль Антона Меркюрова`, stored as `source_type = txt`. It was not included in biography retrieval filters.
   - The existing `BIOGRAPHY_TERMS` list did not include the natural Russian and English owner questions.

3. **The no-evidence prompt turned a retrieval gap into “no biography”.**
   - `buildUnframedUnavailablePrompt()` told the model that no relevant Brain passage existed and to say evidence was insufficient. The model could generalize this into “there is no ready biography”.

4. **The structured owner profile was not passed to the model.**
   - `getCurrentUser()` already returned `profile` (name, username, bio, website), but the route only used `currentUserId`. The profile was discarded.

5. **Telegram did not reach personal mode.**
   - The Telegram adapter sent `x-admin-key`, but the shared route deliberately does not treat that as an owner identity. A Telegram owner therefore continued in public mode.
   - The existing allowlist and internal secret were already present; the missing piece was a verified server-to-server owner header and route check.

---

## 2. Files changed

- `lib/pierrot/perspective.ts` — new central perspective contract, identity-question detection, owner profile context.
- `lib/pierrot/concepts.ts` — public identity anchor and related project concepts for biography questions.
- `lib/pierrot/offers.ts` — `/isakeyforall` added to verified public routes.
- `lib/knowledge/rag/queryRouting.ts` — biography/publication terms, text-profile classification, biography source filters, lexical stop words, recent-date parsing.
- `lib/knowledge/rag/pierrotContext.ts` — retrieval-gap prompt no longer implies that the owner has no biography.
- `lib/knowledge/rag/authorization.ts` — verified Telegram owner helper using the existing allowlist + internal secret.
- `app/api/pierrot-web/route.ts` — injects perspective, owner profile and identity guidance into every model prompt.
- `app/api/pierrot/route.ts` — sends the verified Telegram owner id in addition to the existing internal secret.
- Tests:
  - `lib/pierrot/__tests__/perspective.test.ts`
  - `lib/pierrot/__tests__/concepts.test.ts`
  - `lib/knowledge/rag/__tests__/queryRoutingBiography.test.ts`
  - `lib/knowledge/rag/__tests__/pierrotContext.test.ts`
  - `lib/knowledge/rag/__tests__/rag.test.ts`
  - `app/api/pierrot-web/__tests__/route.test.ts`

---

## 3. How Public / Personal mode is determined

The route still uses the existing verified identity layers, in this order:

1. Supabase cookie session with `users.role = ADMIN`;
2. Telegram Mini App initData / Bearer JWT whose profile is `ADMIN`;
3. Telegram webhook server-to-server request that has **both**:
   - the existing internal secret, and
   - an `x-telegram-owner-id` present in `TELEGRAM_ALLOWED_USER_IDS`.

The message text is never an authentication factor. Saying “I am Anton” in a public chat does not change the mode.

`ownerMode` is true only for a verified owner who has not explicitly selected the existing `mode: "site"` switch. Normal owner chat, `mode: "unframed"` and verified Telegram owner requests use **personal** perspective. Everyone else uses **public** perspective.

The official perspective rules are injected as a separate central block into every model prompt:

- **Public:** third person about Anton (`he/his/him`, `он/его/ему`), never impersonate him, never call the visitor Anton.
- **Personal:** direct address (`you/your`, `ты/твой/тебе/у тебя`), never describe Anton to himself in the third person, including for the question «Кто такой Антон Меркуров?».

---

## 4. Biography handling

- A public identity anchor is now part of the canonical concept context: media expert, publicist, artist, art dealer; great-grandson of Sergey Merkurov; Heart & Angel, the memoir UNFRAMED, Heritage Archive, Media Archive, merkurov.love; public biography at `/isakeyforall`.
- Identity questions also receive the canonical project summaries, so the model does not invent media, dates, NFT claims or exhibition history.
- In personal mode the structured owner profile is supplied only to that owner. It excludes email and other unnecessary fields.
- Identity questions get explicit instructions to distinguish confirmed facts, professional activity, projects, publications, personal views and analytical interpretation.
- The prompt explicitly says that an empty `bio` field is not evidence that no biography exists.
- The no-evidence RAG prompt now says retrieval is limited and forbids converting that limitation into “there is no biography”.
- The production owner profile document is classified as `biography` from its `txt` title, and biography retrieval now includes `txt`/`text` profile documents plus the manuscript.
- Publication questions now request article sources and recent-date filtering. “Как менялись мои взгляды?” requests both the profile/manuscript and article sources, while the conversation history remains available to the model.
- No biography text was copied from Brain into the system prompt; the canonical concept is a short public identity anchor, and the full material remains in the existing retrieval layer.

---

## 5. Privacy verification

- Public prompts never receive `STRUCTURED_OWNER_PROFILE`, owner bio, email or private conversation data.
- Public identity guidance is derived only from public site concepts and the public `/isakeyforall` page.
- Public RAG remains public-scope only; owner Brain and the private manuscript are not available to public visitors.
- Telegram personal mode requires both the server-to-server secret and the existing allowlisted owner id.
- The legacy `x-admin-key` still does not unlock owner mode.
- Tests assert that a public identity answer does not contain a private owner bio or email.

---

## 6. Testing results

Automated:

- 39 relevant suites / 379 tests passed across `lib/knowledge/rag`, `lib/pierrot` and `app/api/pierrot-web`.
- New tests cover public third person, personal second person, full-name questions in owner mode, owner publication context, Telegram owner/non-owner access, profile privacy, biography routing and the no-biography regression.
- TypeScript has no errors in the changed production files. The repository retains pre-existing unrelated test-file type errors.

Live model smoke tests with the real configured provider:

| Mode | Query | Observed |
|---|---|---|
| Public | Who is Anton Merkurov? | Third person `he/his`; no owner profile; public facts only. |
| Public | Расскажи о проектах Антона | Third person `он/его`; canonical projects. |
| Personal | Расскажи про меня | Direct `Ты — …`, `твой`; no third-person biography. |
| Personal | Кто такой Антон Меркуров? | Direct `Ты — …`, despite the full-name wording. |
| Personal | Что я публиковал в последнее время? | Personal context; when retrieval is unavailable it names the publication-retrieval gap instead of asking him to restate his bibliography. |

The live test is a smoke test, not a deterministic unit test; the deterministic suite asserts the injected prompt contract and access boundaries.

---

## 7. Remaining limitations

- Production Brain retrieval depends on the existing `PIERROT_RAG_ENABLED` deployment flag and embedding provider availability. If retrieval is unavailable, Pierrot now answers from the verified profile and public identity anchor and names the specific retrieval gap; it no longer claims that no biography exists.
- The public identity anchor is deliberately short. It is not a substitute for the full public About page or the owner’s Brain profile.
- The model can still make a factual mistake; the prompt now constrains project descriptions and forbids invented titles, but factual discipline is not a substitute for source verification.
- Telegram owner mode depends on the existing `TELEGRAM_ALLOWED_USER_IDS` allowlist and a configured internal secret. If either is absent, Telegram remains public.
