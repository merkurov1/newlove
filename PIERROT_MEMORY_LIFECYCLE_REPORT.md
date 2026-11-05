# Pierrot Memory Task Lifecycle — Fix Report

**Date:** 5 November 2026  
**Repository:** `merkurov1/newlove`  
**Scope:** owner memory/reminder/task completion, archive and permanent-delete confirmation.

---

## 1. Root causes found

1. Plain «удали / убери / сотри» was not mapped to `archive` in the memory intent.
   Only explicit archive/forget phrases were recognized, so ordinary delete
   language could fall through to an ordinary model answer.
2. Target extraction still carried fragments such as «про Heart&Angel» or the
   whole previous assistant answer into the search query.
3. There was no retained ID context for “эти”, “всё перечисленное” or
   “последние две”. The route searched the previous assistant text instead.
4. `recordDecisionEvent()` swallowed insert errors. A status update could be
   applied without its audit event while the assistant still claimed success.
5. Permanent deletion was executed immediately after an explicit
   “удали навсегда” command, without a separate confirmation turn.
6. A repeated completion/archive could write another event even though the
   record was already in the requested state.

---

## 2. Files changed

- `lib/pierrot/memory/intent.ts`
  - plain delete/remove/archive semantics;
  - completion forms «отметь», «пометь», «считай», English mark/done;
  - `listReference` (`all`, `last`, `last_two`, `these`);
  - target cleanup and list/placeholder detection;
  - `Почисти список` mapped to bounded cleanup.
- `lib/pierrot/memory/context.ts` _(new)_
  - reads the last displayed memory-list IDs from `assistant_replied` payloads;
  - reads/expires pending permanent-delete confirmations;
  - no new table or migration.
- `lib/pierrot/memory/store.ts`
  - `recordDecisionEvent()` now throws on failure;
  - status/content update is rolled back if the event cannot be written;
  - failed create removes the row instead of leaving it event-less;
  - repeated status write is idempotent and writes no duplicate event;
  - status events include `source`, `reason`, `from_status`, `to_status`.
- `app/api/pierrot-web/route.ts`
  - ordinary delete/remove commands now archive;
  - list-ID context used for batch operations;
  - completion/archive handled per record with DB-returned status verification;
  - permanent deletion requires a separate confirmation turn;
  - list/search replies persist actual record IDs for the next turn;
  - no success message when the event or status verification fails.
- `app/api/pierrot-web/__tests__/route.test.ts`
- `lib/pierrot/memory/__tests__/intent.test.ts`
- `lib/pierrot/memory/__tests__/temporal.test.ts`
- `docs/pierrot-production.md`

No migration was added or applied.

---

## 3. Behaviour fixed

### Completion

`status = completed` for:

- «Выполнено», «Сделано», «Готово»;
- «Отметь выполненной», «Пометь как выполненную»;
- «Считай задачу выполненной»;
- «Закрой задачу», «Заверши задачу»;
- «Это уже сделано, закрой»;
- English done/completed/finish/close/mark as complete.

Only `task` / `reminder` records are eligible for completion. Durable
`memory`, `constraint`, `preference` and similar records are not completed just
because their text resembles a task.

### Archive

`status = archived` for:

- «Удали», «Удалить», «Сотри», «Стереть», «Убери»;
- «Убери из списка», «Убери эту задачу»;
- «Забудь про эту запись»;
- «Архивируй», «Отправь в архив»;
- English delete/remove/discard/forget/archive.

An ordinary «удали» never physically deletes a Pierrot record.

### Permanent deletion

Physical deletion is possible only after explicit
«навсегда / безвозвратно / окончательно» and a separate confirmation turn:
«да, удалить», «подтверждаю», “yes, delete” or «отмена».

The pending target is stored in the existing `pierrot_events` payload; no new
table or migration is required. Pending confirmations expire after 10 minutes.

### Target resolution and batch operations

- Exact list/display context IDs are retained after memory list/search replies.
- “эти / всё перечисленное / archive all listed” uses those IDs.
- “последние две” uses exactly the last two listed records.
- Explicit title queries are extracted without command noise
  («Удали задачу про Heart&Angel» → `Heart&Angel`).
- Multiple matches and bare «удали» with several context records ask for a
  clarification and change nothing.
- “Удали этот текст” is not treated as a memory command.

### Consistency

- Status update is verified against the row returned by the database.
- `status_changed` event is written with old/new status, source and reason.
- If the event write fails, the row is restored and the assistant reports
  failure. No success claim.
- If create row succeeds but its event fails, the row is removed.
- Repeating completion/archival is idempotent: no duplicate status event.
- Brain status cache is invalidated after successful changed writes.

---

## 4. Tests run

```bash
npx jest lib/pierrot/memory app/api/pierrot-web/__tests__/route.test.ts \
  --runInBand --forceExit
```

- **5 suites passed**
- **138 tests passed**
- **0 failed**

Broader relevant run:

```bash
npx jest lib/pierrot app/api/pierrot-web app/api/pierrot \
  --runInBand --forceExit
```

- **73 suites passed**
- **663 tests passed**
- **0 failed**

Typecheck:

```bash
npx tsc --noEmit
```

- passes cleanly.

Lint:

```bash
npm run lint
```

- repository-wide lint still fails on existing debt in unrelated files;
- no errors reported for the changed memory, route or test files.

---

## 5. Migration

**No migration is required or prepared for this fix.**

The existing `pierrot_decisions`, `pierrot_decision_events` and
`pierrot_events` schema is sufficient. Pending permanent-delete confirmation
uses an existing `assistant_replied` event payload and expires deterministically.

---

## 6. Manual smoke tests after deployment

1. «Удали задачу про Heart&Angel» → archived, not deleted.
2. «Пометь задачу про Heart&Angel выполненной» → completed.
3. Show memory, then «Удали всё перечисленное» → all listed archived.
4. Show tasks, then «Отметь последние две задачи выполненными» → exactly two.
5. «Удали навсегда эту запись» → confirmation request, no deletion.
6. Reply «да, удалить» → permanent deletion only then.
7. «Удали» after several listed records → clarification.
8. “Удали этот текст” in an unrelated drafting conversation → normal answer,
   no memory operation.
