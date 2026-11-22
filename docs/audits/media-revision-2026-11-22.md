# Media revision — 2026-11-22

Read-only inventory first, then focused code and data corrections. No production
database, storage bucket, deployment or credential was touched. The captured
inventory snapshot used here is `docs/audits/media-rag-reconciliation-inventory.csv`
(223 rows, captured 2026-10-30 with its companion report). A live re-run is
required before applying any follow-up import.

## Current verified state

The latest authoritative post-repair inventory is
`docs/audits/brain-media-final-audit.md` (2026-11-05, final state). It is stored
as machine-readable evidence in `data/media-audit/current-baseline.json`:

| Metric | Current value |
| --- | ---: |
| Media records | 265 |
| Published / draft | 263 / 2 |
| Full text with chunks | 231 |
| With a linked Brain document | 259 |
| Novaya manifest sources matched | 157 / 157 |
| Novaya sources already present / added | 118 / 39 |
| Ambiguous Novaya matches | 0 |
| Duplicate publications | 0 |
| Records with a NULL date | 0 |
| Public outlets / languages | 43 / 8 |

The reconciliation below starts from the older 2026-10-30 snapshot because it is
the last per-record CSV. Every one of its 40 historical Novaya gaps is now
accounted for: one source was added between the two snapshots and 39 were
inserted by the 2026-11-05 reconciliation. The detail is retained so the history
and provenance are auditable, not to imply that those 40 are still missing.

## Source map

| Layer | Source | Role | In this revision |
| --- | --- | --- | --- |
| Primary bibliographic records | `public.media_archive_records` (snapshot CSV) | Publication identity, outlet, date, language, kind, status | 223 rows inventoried |
| Derived full-text records | `knowledge_documents` where `media_record_id` is set | Chunks/embeddings and extraction state | 119 linked in snapshot |
| Derived graph/analysis | `media_analysis_*`, `media_record_relations`, `media_quotes` | Owner-only topics, roles, entities, quotes, reprints | Never public; only verified quotes are surfaced |
| Verified local fallback | `data/media.ts` | Public archive when Supabase is unavailable | 108 records total, 107 public, 1 draft retained, 0 duplicate URL/slug |
| Novaya Gazeta source manifest | `data/novaya-archive/authored-columns.json` | Verified authored columns from the public GitHub archive plus page verification | 157 sources |
| Legacy unused file | `data/mediaArchive.ts` | Older `m-*` list | Not imported by the application; left untouched |

`indexing_status`/`ingestion_status` in the database are internal Brain states.
They are **not** Google indexing statuses and are labelled as coverage/ingestion
below.

## Historical snapshot detail (2026-10-30)

### Publication status

| Status | Records |
| --- | --- |
| published | 223 |

No draft/archived row exists in this historical snapshot. The later
`2026-11-06_hide_duplicate_le_monde_reprint.sql` intentionally made the Le Temps
reprint a draft; it is not represented in this snapshot.

### Kind, topic, language

| Kind | Records |
| --- | --- |
| column | 82 |
| mention | 52 |
| blog | 49 |
| quote | 30 |
| interview | 6 |
| profile | 2 |
| radio | 1 |
| video | 1 |

| Topic | Records |
| --- | --- |
| Internet & Censorship | 157 |
| AI & Tech | 42 |
| Art & Culture | 18 |
| Fintech & Crypto | 6 |

The snapshot has no language column, so language totals are not asserted here.
Language is mapped per-row by `lib/mediaRecords.ts` and the Media catalogue.

### Extraction, text quality and ingestion (internal)

| Internal coverage state | Records |
| --- | --- |
| completed | 114 |
| unknown | 104 |
| failed | 3 |
| blocked | 1 |
| partial | 1 |

| Text quality | Records |
| --- | --- |
| full_text | 115 |
| unknown | 104 |
| blocked | 2 |
| partial_text | 2 |

| Corpus state | Records |
| --- | --- |
| indexed | 115 |
| metadata_only_queued | 100 |
| metadata_only_non_text | 4 |
| embeddings_pending | 2 |
| blocked | 1 |
| extraction_failed | 1 |

| Brain ingestion status | Records |
| --- | --- |
| completed | 115 |
| unknown | 104 |
| pending | 4 |

- Date range: 2010-02-25 — 2026-10-24.
- Records without a publication date: 2.
- Records with a linked knowledge document: 119.
- Published records without a linked document: 104.
- Non-published records that still have a document: 0.

Extraction-quality checks in the snapshot:

- Empty titles: 0; missing canonical URLs: 0; invalid canonical URLs: 0.
- Linked documents with zero chunks: 4.
- Records labelled `full_text` with zero chunks: 1; all text-quality contradictions: 1.
- The zero-chunk cases are blocked/paywall/embedding-pending sources; they are
  not presented as full-text indexed.

### Duplicates and provenance

- Duplicate canonical URLs: 0.
- Duplicate title + outlet + publication date: 0.
- Duplicate normalized titles: 1 — the two author pages
  (`Новая газета` and `Republic (Слон.ру)`) are different outlets and stay separate.

No record was deleted or merged. `media_record_relations` keeps reprint/related
links with provenance; the module reports `automaticMerge: false` for every
duplicate group.

## Novaya Gazeta archive reconciliation

- Manifest sources: 157.
- Matched to the snapshot: 117.
- Missing from the snapshot: 40.
- Ambiguous: 0.
- Titles that differ beyond an appended subtitle: 0.
- Date mismatches after correction: 0.

Every source is classified exactly once as `matched`, `missing` or `ambiguous`;
the machine-readable result is produced by `pnpm media:inventory`. These counts
describe the historical snapshot. The current baseline above records 157/157
matched with zero ambiguity after the follow-up import.

### Historical snapshot gaps (40, all since resolved)

A missing entry means “not found in the 2026-10-30 snapshot”, not “does not
exist”. The 2026-11-05 baseline records that all 157 sources are now matched
(118 existing + 39 inserted). The list is preserved as the audit trail and was
never reconstructed from a guess.

| Date | Title | Source |
| --- | --- | --- |
| 2024-09-24 | На вас охотится пылесос | https://novayagazeta.ru/articles/2024/09/24/na-vas-okhotitsia-pylesos |
| 2024-10-02 | Перезвоните позже | https://novayagazeta.ru/articles/2024/10/02/perezvonite-pozzhe |
| 2024-10-08 | Решето и море | https://novayagazeta.ru/articles/2024/10/08/resheto-i-more |
| 2024-10-09 | Разрушение матрицы | https://novayagazeta.ru/articles/2024/10/09/razrushenie-matritsy |
| 2024-10-11 | Блокировки страшны только тем, кто с ними смирился | https://novayagazeta.ru/articles/2024/10/11/blokirovki-strashny-tolko-tem-kto-s-nimi-smirilsia |
| 2025-02-05 | Почему все говорят про китайский ИИ? | https://novayagazeta.ru/articles/2025/02/05/pochemu-vse-govoriat-pro-kitaiskii-ii |
| 2025-02-06 | Маск в посудной лавке | https://novayagazeta.ru/articles/2025/02/06/mask-v-posudnoi-lavke |
| 2025-06-21 | От себя до святого Иакова | https://novayagazeta.ru/articles/2025/06/21/ot-sebia-do-sviatogo-iakova |
| 2025-07-09 | Блэкауты не в сетях, а в головах | https://novayagazeta.ru/articles/2025/07/09/blekauty-ne-v-setiakh-a-v-golovakh |
| 2025-07-10 | До 16 интернет запрещен | https://novayagazeta.ru/articles/2025/07/10/do-16-internet-zapreshchen |
| 2025-07-12 | Эх, Яблочко | https://novayagazeta.ru/articles/2025/07/12/ekh-iablochko |
| 2025-07-16 | Grok «впал в расизм», а чиновники — в маразм | https://novayagazeta.ru/articles/2025/07/16/grok-vpal-v-rasizm-a-chinovniki-v-marazm |
| 2025-07-17 | Быстрые какие… | https://novayagazeta.ru/articles/2025/07/17/bystrye-kakie |
| 2025-07-25 | Безумный Макс | https://novayagazeta.ru/articles/2025/07/25/bezumnyi-maks |
| 2025-08-05 | У вас матрица отклеилась | https://novayagazeta.ru/articles/2025/08/05/u-vas-matritsa-otkleilas |
| 2025-08-06 | Ломают все | https://novayagazeta.ru/articles/2025/08/06/lomaiut-vse |
| 2025-08-09 | Конец крипто-зимы, или Три закона о свободе | https://novayagazeta.ru/articles/2025/08/09/konets-kripto-zimy-ili-tri-zakona-o-svobode |
| 2025-08-15 | Чем звонить изволите? | https://novayagazeta.ru/articles/2025/08/15/chem-zvonit-izvolite |
| 2025-08-27 | Ударим планом по интернет-мошенникам! | https://novayagazeta.ru/articles/2025/08/27/udarim-planom-po-internet-moshennikam |
| 2025-09-02 | Прощай, «Алиса»! Теперь ты «мусор»? | https://novayagazeta.ru/articles/2025/09/02/proshchai-alisa-teper-ty-musor |
| 2025-09-04 | МАХнем 100 грамм за русский инстаграм | https://novayagazeta.ru/articles/2025/09/04/makhnem-100-gramm-za-russkii-instagram |
| 2025-09-09 | Не смотрели — и не надо | https://novayagazeta.ru/articles/2025/09/09/ne-smotreli-i-ne-nado |
| 2025-09-10 | Еще одно слово из трех букв | https://novayagazeta.ru/articles/2025/09/10/eshche-odno-slovo-iz-trekh-bukv |
| 2025-09-20 | Выйти из ума | https://novayagazeta.ru/articles/2025/09/20/vyiti-iz-uma |
| 2025-09-24 | Дома хорошо, а в роуминге заблокируют | https://novayagazeta.ru/articles/2025/09/24/doma-khorosho-a-v-rouminge-zablokiruiut |
| 2025-09-27 | ИИ виляет собакой | https://novayagazeta.ru/articles/2025/09/27/ii-viliaet-sobakoi |
| 2025-10-02 | Крест на лайках | https://novayagazeta.ru/articles/2025/10/02/krest-na-laikakh |
| 2025-10-04 | «Главная ценность, которую никогда не смогу воспроизвести, — это идея» | https://novayagazeta.ru/articles/2025/10/04/glavnaia-tsennost-kotoruiu-nikogda-ne-smogu-vosproizvesti-eto-ideia |
| 2025-10-10 | Цензура выходит ботом | https://novayagazeta.ru/articles/2025/10/10/tsenzura-vykhodit-botom |
| 2025-10-11 | Отсель звонить не будем шведу | https://novayagazeta.ru/articles/2025/10/11/otsel-zvonit-ne-budem-shvedu |
| 2025-10-13 | Живи играючи | https://novayagazeta.ru/articles/2025/10/13/zhivi-igraiuchi |
| 2025-10-27 | Вам нет Телеграма | https://novayagazeta.ru/articles/2025/10/27/vam-net-telegrama |
| 2025-11-03 | Не выносите СОРМ из избы | https://novayagazeta.ru/articles/2025/11/03/ne-vynosite-sorm-iz-izby |
| 2025-11-11 | Для слежки в детской — карты в руки | https://novayagazeta.ru/articles/2025/11/11/dlia-slezhki-v-detskoi-karty-v-ruki |
| 2025-11-12 | В темноте насиловать проще | https://novayagazeta.ru/articles/2025/11/12/v-temnote-nasilovat-proshche |
| 2025-11-13 | Три года права переписки | https://novayagazeta.ru/articles/2025/11/13/tri-goda-prava-perepiski |
| 2025-11-25 | «Правда» в «Матрешке» | https://novayagazeta.ru/articles/2025/11/25/pravda-v-matreshke |
| 2026-10-14 | Облака-то на земле! | https://novayagazeta.ru/articles/2026/10/14/oblaka-to-na-zemle |
| 2026-10-28 | Агенты ухватились за язык | https://novayagazeta.ru/articles/2026/10/28/agenty-ukhvatilis-za-iazyk |
| 2026-11-03 | Искусственное прерывание прогресса | https://novayagazeta.ru/articles/2026/11/03/iskusstvennoe-preryvanie-progressa |

### Confirmed correction

- `И поговорить негде…` had manifest date `2024-12-03` while the canonical URL
  path and `media_archive_records.published_date` both say `2024-12-02`.
  The manifest date was corrected to `2024-12-02`; the original time-of-day was
  retained and a `date_source` field records the evidence. No other date, title,
  language, URL or outlet was changed.

### Deliberately not changed

- 67 database titles contain the subtitle appended to the manifest title. These
  are title variants (`extended`), not errors, and were left as published.
- Two manifest records are explicitly marked as absent from the GitHub archive
  but verified from the publication page: `Легло в библейском масштабе` and
  `Искусственное прерывание прогресса`. The second is legitimately missing from
  the older snapshot and remains a review item.
- The Le Monde / Le Temps pair describes the same event but has different
  canonical URLs and outlets. It is not merged automatically; the existing
  soft-hide/relation path remains the reversible decision.

## Code changes for public retrieval

1. `MediaRecord` now carries an optional verified `author`. Local authored
   columns/blog posts are explicitly attributed to Anton Merkurov; external
   coverage keeps the database byline and never invents a journalist.
2. `/api/media/search` no longer drops verified local records that have no
   database id. Lexical fallback is available for every public record, while
   semantic results still resolve by database id.
3. Lexical search now matches title, author, outlet, program, topic, date,
   language and material type. Full dates such as `2026-10-13` are matched as a
   date instead of collapsing to the year.
4. The client archive search includes the author field and advertises it in the
   placeholder.
5. Fallback/database URL identity now normalizes `www.`, default ports and a
   trailing slash, so a database draft with a `www.` URL still suppresses the
   equivalent local public record.
6. Display dates are validated as real calendar dates. An impossible value such
   as `2026-02-30` is not displayed as verified; the timeline falls back to the
   archive creation date with an explicit note.
7. The local outage fallback now uses `publicRecords` (107) instead of raw
   `records` (108), so a draft record cannot reappear on `/media`, the OG image
   count or `llms.txt` when Supabase is unavailable.

## Public/private boundary

- `getMediaRecords` returns only `status = published`. Draft, archived and any
  other status are excluded, and a matching local fallback is removed.
- When the database is unavailable, the local fallback is built from
  `publicRecords`, not `records`. `Вечный зов` stays in the source file as
  draft history but is never served; this closes the outage path that could
  otherwise re-publish a record the owner had moved to draft.
- Public records are projected to an allow-list (`data/media.ts` shape). Owner
  fields such as `ai_metadata`, diagnostics, access class and internal status
  are not returned.
- Only quotes with `is_current = true` and `verification_status = verified` are
  exposed. Unverified model output cannot reach the public page.
- Semantic search keeps the SQL boundary `m.status = 'published'` and a non-null
  `media_record_id`; it cannot retrieve private Brain documents.
- No public-visibility flag was changed in bulk and no owner decision was
  automated.

## Verification

Run:

```bash
pnpm media:inventory
pnpm exec jest lib/knowledge/media/__tests__/archiveAudit.test.ts lib/__tests__/mediaRecords.test.ts app/api/media/search/__tests__/route.test.ts --runInBand
pnpm typecheck
```

## Remaining uncertainty

- The per-record snapshot is historical (2026-10-30); the current totals come
  from the 2026-11-05 final audit, not from a new live query. Re-run
  `pnpm media:inventory` against the live database before any new import.
- Current state (2026-11-05) still has 6 records without a linked Brain document
  and 231 full-text records against 263 published, so up to 32 published records
  may lack full text. They are metadata-visible but not full-text searchable and
  must not be described as indexed. Paywalled/blocked sources keep their
  bibliographic records.
- The historical snapshot had two records without a publication date (Le Monde
  and Le Temps); the later repair set both and the current baseline reports
  zero NULL dates.
- No live database or storage access was available in this workspace, so no
  production row was read back after the code change. A read-back must be run
  by the owner with the normal deployment credentials.

## Rollback

All changes are repository-only and reversible with Git. No migration, deletion,
merge or visibility update was performed. To undo the single data correction,
restore the previous manifest date for `i-pogovorit-negde`; nothing else depends
on it.

