# Media Archive remediation — 2026-11-10

Read-only audit performed against production before changes; the only data mutation
was the `knowledge_documents.media_outlet` consistency repair described below.

## Snapshot

| Metric | Value |
| --- | --- |
| Media records | 265 |
| Published / draft | 262 / 3 |
| Own publications | 203 |
| External mentions | 62 |
| Outlets / languages | 43 / 8 |
| Date range | 2010-02-25 — 2026-11-03 |
| Full text / partial / metadata-only / blocked | 233 / 7 / 11 / 10 |
| No linked Brain document | 4 |
| Indexing completed / failed / partial / blocked / not_indexed | 233 / 16 / 7 / 5 / 4 |
| Documents without chunks | 21 |
| Missing embeddings | 0 |
| Current quotes / topics / entities / relations | 143 / 63 / 476 / 265 |
| Brain documents without Media | 26 |
| Duplicate canonical / title / content_hash / quotes | 0 / 0 / 0 / 0 |

## Problem records

Every row below is a Media record whose extraction/indexing state is not a clean
full-text completion, or which has no linked Brain document.

| ID | Title | Outlet | Date | Coverage | Text quality | Error | Class | Retry | Recommended action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| be90c969-83ca-45e4-a38f-2eaaa0bf5a2a | Vladimir Putin tiene un problema con la inteligencia artificial | El Grand Continent | 2026-07-11 | blocked | blocked | paywall_detected | paywall | no | Не обходить paywall. Сохранить метаданные и пометить текст как недоступный. |
| e21e4d16-194e-4264-a683-f3f9ccae34f4 | Russian Trolls Were Sloppy, but Indictment Still Points at Kremlin | The New York Times | 2018-02-17 | blocked | blocked | http_status_403 | access_blocked | no | Не обходить ограничение доступа. Оставить метаданные и явно показывать отсутствие текста. |
| 51665622-6888-4498-a839-52c5f3619e9e | Telegram: Kritiker des Gesetzes fürchten Missbrauch | DIE ZEIT | 2017-07-01 | blocked | blocked | http_status_403 | access_blocked | no | Не обходить ограничение доступа. Оставить метаданные и явно показывать отсутствие текста. |
| c113b0e2-0a22-4ca6-b075-5d4349053c6b | О том, почему блокировка RuTracker не имеет для вас никакого значения | Эхо Москвы | 2015-11-10 | blocked | blocked | http_status_403 | access_blocked | no | Не обходить ограничение доступа. Оставить метаданные и явно показывать отсутствие текста. |
| 76150bff-e5a6-422e-9171-10cbaad903a4 | Skype не ответил | РБК | 2015-09-22 | blocked | blocked | http_status_401 | access_blocked | no | Не обходить ограничение доступа. Оставить метаданные и явно показывать отсутствие текста. |
| 0ce50a84-da0c-48d3-9323-0726de400a09 | Les frappes ukrainiennes sur des data centers perturbent les services en ligne en Russie | Le Monde | 2026-10-13 | failed | blocked | http_status_402 | paywall | no | Не обходить paywall. Сохранить метаданные и пометить текст как недоступный. |
| 0b5bb3f2-f9bb-4bd9-8d55-168af4b563ff | Почему все говорят про китайский ИИ? | Новая газета | 2025-02-05 | failed | metadata_only | metadata_only | metadata_only | no | Полный текст не был получен. Дозагрузить разрешённый источник или оставить metadata-only. |
| 0dfd6190-151b-46a7-b56b-171e4df0cd69 | Барельефы Сергея Меркурова остались на «Динамо» | The Art Newspaper Russia | 2023-01-12 | failed | blocked | fetch_failed | fetch_error | yes | Повторить один раз; при повторе ошибки оставить метаданные. |
| 03205703-debd-4b1d-a4ee-17f7899b0430 | Zajadła wojna Rosji z internetem. To próba generalna | Rzeczpospolita | 2021-03-12 | failed | metadata_only | metadata_only | metadata_only | no | Полный текст не был получен. Дозагрузить разрешённый источник или оставить metadata-only. |
| 1e5da14c-629c-4ae2-af10-e4c19e678b6f | The Russian government just managed to hack itself | The Washington Post | 2018-04-19 | failed | blocked | fetch_timeout | temporary | yes | Повторить с ограниченным backoff и лимитом попыток. |
| 05b34ada-67c8-4a80-9c39-f25f3484f645 | Неча на сети пенять | Коммерсантъ | 2018-01-28 | failed | metadata_only | metadata_only | metadata_only | no | Полный текст не был получен. Дозагрузить разрешённый источник или оставить metadata-only. |
| 4ffb73d0-faec-4d04-9ff1-5f756d052426 | Thousands march through Moscow for internet freedom as Russia cracks down ahead of election | ABC News (Australia) | 2017-07-24 | failed | blocked | http_status_404 | source_unavailable | no | Источник удалён или переехал; проверить канонический URL вручную. |
| 4910fd1c-bcab-4524-99d2-bf43486b946d | Internetzensur in Russland - Enger Spielraum für Blogger und Journalisten | Deutschlandfunk | 2017-05-10 | failed | metadata_only | metadata_only | metadata_only | no | Полный текст не был получен. Дозагрузить разрешённый источник или оставить metadata-only. |
| bb7d6c2f-7727-4275-901f-e3db4a97bca5 | Russisches Internet - Nicht alles unter Kontrolle | Deutschlandfunk Kultur | 2017-05-05 | failed | metadata_only | metadata_only | metadata_only | no | Полный текст не был получен. Дозагрузить разрешённый источник или оставить metadata-only. |
| 2746a71b-b98f-48af-a38c-d71db5dbeea0 | Presentation by Anton Merkurov | OSCE | 2016-07-06 | failed | metadata_only | metadata_only | metadata_only | no | Полный текст не был получен. Дозагрузить разрешённый источник или оставить metadata-only. |
| a8e80ba5-ef70-4440-ac9d-045dcc74bdfb | W Rosji tworzą Ripedię - konkurecję dla Wikipedii | Bankier.pl | 2015-08-27 | failed | metadata_only | metadata_only | metadata_only | no | Полный текст не был получен. Дозагрузить разрешённый источник или оставить metadata-only. |
| 3c1232a1-9854-4513-b7fb-e1503cd34792 | В погоне за кадром | Коммерсантъ | 2015-05-25 | failed | metadata_only | metadata_only | metadata_only | no | Полный текст не был получен. Дозагрузить разрешённый источник или оставить metadata-only. |
| e6f897c1-639a-4222-bda0-b1b115b95f26 | Интернет под надзором | Радио Свобода | 2014-07-31 | failed | metadata_only | metadata_only | metadata_only | no | Полный текст не был получен. Дозагрузить разрешённый источник или оставить metadata-only. |
| 6f4286e4-4dea-48e7-8237-31f188c34693 | "Не думайте о ее национальности" | Радио Свобода | 2013-11-19 | failed | metadata_only | metadata_only | metadata_only | no | Полный текст не был получен. Дозагрузить разрешённый источник или оставить metadata-only. |
| 69e448e4-6b63-4b8f-8c36-1b01233b6f3b | "Луркоморье" вернулось в сеть | Коммерсантъ | 2012-11-13 | failed | metadata_only | metadata_only | metadata_only | no | Полный текст не был получен. Дозагрузить разрешённый источник или оставить metadata-only. |
| 79cee792-f7d1-4834-ac48-aa0cc5cacf23 | Антон Меркуров — авторская страница | Republic | 2012-11-09 | failed | blocked | fetch_failed | fetch_error | yes | Повторить один раз; при повторе ошибки оставить метаданные. |
| cd42abb0-4789-44a8-8add-8126ec6fdf44 | Les frappes ukrainiennes sur des data centers perturbent les services en ligne en Russie | Le Temps | 2026-10-14 | partial | partial_text | paywall_detected | paywall | no | Не обходить paywall. Сохранить метаданные и пометить текст как недоступный. |
| 16e75aec-be8a-485e-99f0-fb95bc625d96 | Putin's war fuels the growing role of Russia's FSB intelligence agency | Le Monde | 2026-05-31 | partial | partial_text | paywall_detected | paywall | no | Не обходить paywall. Сохранить метаданные и пометить текст как недоступный. |
| f034fe6a-9569-4630-9d4e-0c83468514fc | Is Russia set to oust Telegram and WhatsApp from its internet? | The Christian Science Monitor | 2026-03-25 | partial | partial_text | paywall_detected | paywall | no | Не обходить paywall. Сохранить метаданные и пометить текст как недоступный. |
| 825e2907-e027-46a9-9493-3e6bf04c993f | Mobile Internet switched off in Moscow | Eurotopics | 2026-03-13 | partial | partial_text | needs_review | manual_review | no | Требуется ручная проверка качества извлечения. |
| c58db469-3d3e-4d7f-a74a-2419eb0f7085 | Государство течет | Новая газета | 2025-01-09 | partial | partial_text | truncated_content | incomplete_text | no | Текст извлечён частично; проверить источник и пометить partial_text. |
| 9ba15ece-10b2-4c8c-8352-2602c2c3f66b | Интернет-эксперт Антон Меркуров в Твери прокомментировал закон о суверенном Рунете - Караван Ярмарка | Караван Ярмарка | 2019-04-29 | partial | partial_text | needs_review | manual_review | no | Требуется ручная проверка качества извлечения. |
| 65c8fcf0-e7b6-4b1b-98d4-bdcfee22ed76 | Catch me if you can: Russia internet chaos as Telegram ban backfires | Euronews | 2018-04-17 | partial | partial_text | needs_review | manual_review | no | Требуется ручная проверка качества извлечения. |
| d7030ecf-0f59-4386-94a0-c20c27960efc | Антон Меркуров — авторская страница | Новая газета | 2022-01-01 | no-document | no-text | — | missing_media_link | no | Создать связь с документом Brain или подтвердить metadata-only статус. |
| 8ba16939-2661-461d-bdbb-65638cb8a8ab | К ЧЕМУ ИДУТ МЕДИА? Встреча с Антоном Меркуровым | СТК РГГУ | 2017-04-28 | no-document | no-text | — | missing_media_link | no | Создать связь с документом Brain или подтвердить metadata-only статус. |
| dafb751e-c089-4fa5-b99f-83519347b0f7 | Какие сервисы следующими попадут под запрет? | Эхо Москвы | 2017-04-16 | no-document | no-text | — | missing_media_link | no | Создать связь с документом Brain или подтвердить metadata-only статус. |
| 55966c24-3c18-455c-9008-172587ede44f | Антон Меркуров — профиль автора | Forbes.ru | 2011-03-01 | no-document | no-text | — | missing_media_link | no | Создать связь с документом Brain или подтвердить metadata-only статус. |

## Media records without a linked Brain document (4)

| ID | Title | Outlet | Date | Kind | Recommended action |
| --- | --- | --- | --- | --- | --- |
| d7030ecf-0f59-4386-94a0-c20c27960efc | Антон Меркуров — авторская страница | Новая газета | 2022-01-01 | profile | Создать связь с документом Brain или подтвердить metadata-only статус. |
| 8ba16939-2661-461d-bdbb-65638cb8a8ab | К ЧЕМУ ИДУТ МЕДИА? Встреча с Антоном Меркуровым | СТК РГГУ | 2017-04-28 | video | Создать связь с документом Brain или подтвердить metadata-only статус. |
| dafb751e-c089-4fa5-b99f-83519347b0f7 | Какие сервисы следующими попадут под запрет? | Эхо Москвы | 2017-04-16 | radio | Создать связь с документом Brain или подтвердить metadata-only статус. |
| 55966c24-3c18-455c-9008-172587ede44f | Антон Меркуров — профиль автора | Forbes.ru | 2011-03-01 | profile | Создать связь с документом Brain или подтвердить metadata-only статус. |

These are profile/author pages, a radio page and a video page. Their metadata is
available; no full text was ever captured. They are intentionally left without a
fake Brain document and are reported as `metadata_only`/`no-document`.

## Brain documents without a Media link (26)

| ID | Title | Source type | Ingestion status | Why |
| --- | --- | --- | --- | --- |
| doc_article_b435e4a869c7df3f547c767d50c09dc1 | Heart & Angel — A Living Digital Mythology | article | completed | Документ Brain без записи Media Archive; проверить происхождение. |
| doc_text_21eeabcfb99ea9d6eb62e2d7aafd91eb | Антон Меркуров — фактическое досье | text | completed | Личный текст/файл Brain; не является публикацией Media Archive. |
| doc_text_946877eb92d49ed7277c5f74309f6f46 | КРАСНОПЕВЦЕВ / ФЁДОРОВ | text | completed | Личный текст/файл Brain; не является публикацией Media Archive. |
| doc_text_32b02fb9ef86316d123f67e6296b7b1a | Pierrot --- reader/writer matrix | text | completed | Личный текст/файл Brain; не является публикацией Media Archive. |
| doc_text_3f8708a16dab184c669e3e917f121a71 | Pierrot database map | text | completed | Личный текст/файл Brain; не является публикацией Media Archive. |
| doc_text_915f69306e4430c4c688690435f8dc7d | Геном Антона Меркурова v5 — обзор и индекс | text | completed | Личный текст/файл Brain; не является публикацией Media Archive. |
| doc_text_0ecf07f781da90c5755200b493b1b146 | Геном Антона Меркурова v5 — ключевые SNP | text | completed | Личный текст/файл Brain; не является публикацией Media Archive. |
| doc_text_9032ea9e6ca8b26b4dc492602d7a618a | Здравствуй, Пьеро. | text | completed | Личный текст/файл Brain; не является публикацией Media Archive. |
| doc_text_af21327992a8bdd06e6357d680656063 | ANTON MERKUROV | text | completed | Личный текст/файл Brain; не является публикацией Media Archive. |
| doc_text_450a71a0b1d4a21295a3aaac6b7c9c76 | Anton Merkurov — Weekly Review | text | completed | Личный текст/файл Brain; не является публикацией Media Archive. |
| doc_txt_623f57d8a45759afe9adf8cf70d348e5 | Контекстный профиль Антона Меркюрова | txt | completed | Личный текст/файл Brain; не является публикацией Media Archive. |
| doc_txt_796c0ad49a1cf96bc4b38d0830abe4d5 | 2019 | txt | completed | Личный текст/файл Brain; не является публикацией Media Archive. |
| doc_txt_594d44051198dad211982311a1c59470 | 2018 | txt | completed | Личный текст/файл Brain; не является публикацией Media Archive. |
| doc_article_24a8ccd1afec83505aa8cde3d87bf062 | Две кнопки, научившие нас общаться. Ода Skype, чья кончина уже прописана в его коде — Новая газета | article | superseded | Устаревший дубль; заменён связанным документом Media. |
| doc_article_1aece5b9b1a47828b245001cf727bad2 | Персональные сданные. Персональные данные россиян давно сданы в полное распоряжение государства. За рассылку своего ФИО можно и пострадать — Новая газета | article | superseded | Устаревший дубль; заменён связанным документом Media. |
| doc_article_b433ffc0d504b25d430f8ea5c2a26b10 | Галочка по умолчанию. Министерство юстиции США требует разделения Google. В том числе и продажу Chrome. Ради пользователей, которым все равно — Новая газета | article | superseded | Устаревший дубль; заменён связанным документом Media. |
| doc_article_74d52e7ac0d348f72047665c5d3b77a9 | YouTube Шредингера. Последствия то ли замедления, то ли блокировки сервиса вызывают споры. Что случилось с аудиторией, как власти повлияли на рынок? Разбираемся — Новая газета | article | superseded | Устаревший дубль; заменён связанным документом Media. |
| doc_text_361bb3b99afbb7e6cb51cf74fbd931c1 | The Curator's Judgment | text | completed | Личный текст/файл Brain; не является публикацией Media Archive. |
| doc_text_8aeedff5d2d8e6b815904213263d7db0 | Artificial Intelligence as an Instrument of Human Autonomy | text | completed | Личный текст/файл Brain; не является публикацией Media Archive. |
| doc_text_669eb090de4c9b2880c300d0b9655a13 | Art, Commerce and the Independence of the Artist | text | completed | Личный текст/файл Brain; не является публикацией Media Archive. |
| doc_text_f46f5ea82d91bdf6a1fd653e44cf53fb | Heart & Angel | text | completed | Личный текст/файл Brain; не является публикацией Media Archive. |
| doc_text_6416f8a3b7968b79d0ac7d95ea8db65b | Building an Independent World | text | completed | Личный текст/файл Brain; не является публикацией Media Archive. |
| doc_text_6c2570dd9f1ae141e424108542858927 | Media, Technology and the Politics of Information | text | completed | Личный текст/файл Brain; не является публикацией Media Archive. |
| doc_text_021c315e10166f6a244c7044787a20f1 | Selection Is a Demonstration of Taste | text | completed | Личный текст/файл Brain; не является публикацией Media Archive. |
| doc_text_5e120ce50ac87886a3041b12af15633b | Манифест отторжения и фильтры восприятия | text | completed | Личный текст/файл Brain; не является публикацией Media Archive. |
| doc_unframed_manuscript | UNFRAMED | manuscript | completed | Рукопись Brain; не является публикацией Media Archive. |

## Informational consistency findings

- Derived analysis topic differs from the editorial archive topic: 12. Both values are retained; the derived value is not allowed to overwrite the editorial classification.
- Outlet mismatch: 0 (one "Pasted text" value was repaired to the archive outlet).
- Date mismatch: 0.
- Multiple current topics / roles: 0 / 0.
- Duplicate canonical / title+outlet+date / content hash / quote hash: 0 / 0 / 0 / 0.

### Topic differences

| Media record | Title | Outlet | Derived topic | Editorial topic |
| --- | --- | --- | --- | --- |
| 957663fe-97c4-4fd1-bbea-13443b59cd28 | 🏋🏼‍♂️ Дорога в облака | Ретроградный Меркуров | Art & Culture | Internet & Censorship |
| 40102a41-6898-4232-b8f7-e64e5b165119 | ⚛️ Между Марксом и Гегелем | Ретроградный Меркуров | AI & Tech | Internet & Censorship |
| 270869ae-ec63-4e4b-831b-245265cf5033 | 🚶🏿‍♂️Camino de Santiago | Ретроградный Меркуров | Art & Culture | Internet & Censorship |
| 50ae8418-b586-4c06-8640-d4c259d1ae03 | Знаете, что такое киберпанк? Так вот он — начинается | Новая газета | AI & Tech | Internet & Censorship |
| 5ebfae8c-8c7a-4126-a8f4-c8e380aa4480 | 🌚 Бытие определяет сознание | Ретроградный Меркуров | Art & Culture | Internet & Censorship |
| 29f5e82e-2ae1-44b3-892d-6177a7c61b8b | ❓Что день грядущий нам готовит? | Ретроградный Меркуров | Art & Culture | Internet & Censorship |
| 7a0de564-7d80-4054-8d39-41744249aa3c | ✨ Ты не Гуччи | Ретроградный Меркуров | Art & Culture | Internet & Censorship |
| 06b89f9f-e5fe-430a-aae2-fe221aa61bb5 | Нет ни совы, ни глобуса. Порвали обоих | Новая газета | Internet & Censorship | Art & Culture |
| 53a6d7dc-e028-44af-8c09-b8a2619957bf | Ну и дохните… | Новая газета | Fintech & Crypto | Internet & Censorship |
| 1ee2d537-1e82-4d6a-9ee3-ae039b166a4c | 🌝 Ночь простоять, да день продержаться | Ретроградный Меркуров | Art & Culture | Internet & Censorship |
| 89b3a44e-25bc-4539-8d5c-92f1558e7a09 | 🔚 Иногда так страшно, проснуться взрослым однажды | Ретроградный Меркуров | Art & Culture | Internet & Censorship |
| f8fba19a-c326-4758-a9af-57c7e849cbe3 | 😑 In the middle of something (Part II) | Ретроградный Меркуров | Art & Culture | Internet & Censorship |

## Failed analysis runs

| Run ID | Media record | Title | Status | Attempt | Error |
| --- | --- | --- | --- | --- | --- |
| 912253ad-a26b-47b2-944a-57322e2f08d2 | 6c294101-9b94-4a8e-813c-fb8f607fa0f2 | Под угрозой все — вот новая «фишка» Telegram | failed | 3/3 | deepseek_invalid_json |

## Safe retry plan

Retryable jobs with remaining budget: 2.

| Media record | Title | Outlet | Error | Attempts | Class |
| --- | --- | --- | --- | --- | --- |
| 7e013b7d-bd74-4138-987e-78abeebc97d9 | La campagna di alfabetizzazione dell'Unione Sovietica passò attraverso un alfabeto erotico che affascina ancora oggi | Edizioni del Frisco | embedding_auth_failed | 1/3 | embedding_error |
| cd42abb0-4789-44a8-8add-8126ec6fdf44 | Les frappes ukrainiennes sur des data centers perturbent les services en ligne en Russie | Le Temps | embedding_auth_failed | 1/3 | embedding_error |

The retryable jobs above were **not executed** in this workspace because the
embedding provider key is redacted here. After restoring `OPENROUTER_API_KEY`,
run `POST /api/admin/media/retry` with `{ "execute": true, "limit": 2 }`. The
operation is idempotent per `media_record_id` and preserves existing content.

## Remaining blockers

- `OPENROUTER_API_KEY` and `DEEPSEEK_API_KEY` in `.env.production.local` are redacted placeholders in this workspace. New query embeddings and model retries cannot be executed here. The migration and read-only RPC probes use existing production vectors and do not need those secrets.
- 3 blocked HTTP 401/403 sources, 1 paywall source, 1 HTTP 402 source and 1 HTTP 404 source cannot be recovered without changing access controls or the source URL. They are preserved as metadata-only/blocked and reported honestly.
- 11 records remain metadata-only because the source exposed no article body. They are not marked as full-text indexed.
