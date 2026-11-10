# Pierrot — response intelligence & quality upgrade

Дата: 2026-11-10  
Статус: реализовано, unit/integration/route tests проходят.

## 1. Аудит фактического pipeline

Вход: `components/pierrot/PierrotContext.tsx` → `POST /api/pierrot-web` (Telegram — тонкий адаптер в `app/api/pierrot/route.ts`).

```text
message + bounded history
  → rate limit / consent / identity / ownerMode
  → buildPierrotExecutionPlan
      → understandPierrotQuery (intent, period, document title, sources)
      → detectOwnerTool (website / media / graph / commercial / stats / …)
  → owner tool early return (deterministic read-only report)
  → decideWebSearch (parallel)
  → retrieval by plan
      → Journal/Flow tables
      → Media semantic/catalogue
      → Brain document lookup / Brain v2/v1
      → public RAG
  → generationSystemPrompt + evidence prompts
  → callPierrotModel / streamPierrotModel
  → guardUnverifiedActionClaims
  → guardAnswerEvidence (source status, unknown links, limitations)
  → persistence + retrieval analytics
```

Точки, где реально терялся контекст или подменялся источник:

1. **Follow-up определялся по первым словам.** «Как …», «Почему …» считались продолжением, поэтому новый самостоятельный вопрос мог унаследовать старый intent.
2. **Коррекция наследовала только последнюю пользовательскую реплику.** После цепочки «Bluesky» → «А подробнее?» → «Перечитай вопрос» исходный запрос уже не находился.
3. **Коррекция с словом «статистика» попадала в `stats`.** `detectOwnerTool` срабатывал на общее слово раньше, чем восстанавливался исходный источник (Bluesky / Media / Graph).
4. **`/flow` считался editorial Flow.** `detectJournalFlowIntent` видел слово `flow` в URL и направлял запрос в таблицу `items`, а не в метрики страницы.
5. **Graph demo и Graph status были одним инструментом.** «Покажи, как работает граф» возвращал количество сущностей и очередь.
6. **Media period inventory без явного media-слова** мог уйти в semantic retrieval с лимитом 8.
7. **Bluesky report начинался с общего статуса сайта**, потому что `renderReport` всегда добавлял site headline.
8. **Source-specific analytics не имела точного URL-скоупа**: «посещаемость /flow» отвечала проектом Flow (`/flow`, `/subscribe`, `/newsletter`), а не страницей `/flow`.
9. **Коррекция не сообщала, что данные перечитаны.** deterministic tool просто повторял отчёт; model turn не получал отдельной инструкции вернуться к исходному вопросу.

## 2. Что изменено

### Intent, follow-up, correction

- `lib/pierrot/queryUnderstanding.ts`
  - follow-up больше не срабатывает на «как», «почему», «how», «why»;
  - наследование intent разрешено только для неклассифицированной реплики (`general`);
  - добавлен `previousSubstantiveUserMessage`: коррекция идёт назад по истории и пропускает `«А подробнее?»`, `«Не то»` и другие служебные реплики;
  - добавлены website/source analytics intents и `graphDemo`;
  - URL-пути (`/flow`) исключены из editorial-детекторов.
- `lib/pierrot/correction.ts`
  - «проверь ещё раз», «перепроверь» добавлены к correction-сигналам.
- `lib/pierrot/ownerTools.ts`
  - `detectOwnerTool` разделён на базовый детектор и bounded recovery из контекста;
  - recovery разрешён только для correction/follow-up или intent, унаследованного из истории;
  - общий `stats` больше не перекрывает восстановленный Bluesky/Media/Graph tool;
  - новый инструмент `graph_demo`.
- `lib/pierrot/executionPlan.ts`
  - операция `graph.demo`;
  - `recoveredFromContext` в плане;
  - контекст восстановления расширен до 4 последних пользовательских реплик.
- `app/api/pierrot-web/route.ts`
  - retrieval anchor — последний содержательный запрос, а не «А подробнее?»;
  - correction-turn получает явную инструкцию вернуться к исходному вопросу и не защищать прошлый ответ;
  - deterministic correction начинается с краткого «Перепроверил исходный запрос … и заново получил данные».

### Источники и аналитика

- `lib/analytics/website/question.ts`, `types.ts`, `tools.ts`, `answer.ts`
  - точный `pagePath` и scope `page`;
  - URL-path имеет приоритет над проектом.
- `lib/analytics/website/report.ts`
  - `pageDetailSection`: просмотры страницы, landing sessions, Search Console clicks/impressions/CTR/position, диалоги и подписки — раздельно, с источником и определением;
  - отсутствие строки для URL явно не равно нулю;
  - Bluesky/newsletter отчёты начинаются с собственного заголовка, без site-wide headline;
  - page-отчёт не показывает общий статус сайта.
- `lib/pierrot/mediaCatalogIntent.ts`
  - «публикации в СМИ за 2026 год» → полный SQL catalogue (`list`, scope `all`), не semantic chunks.
- `lib/knowledge/rag/journalFlowRetrieval.ts`
  - `/flow` и traffic-вопросы не читают editorial `items`;
  - Journal inventory («статистика Journal») остаётся на `letters`.
- `lib/pierrot/ownerTools.ts` → `formatGraphDemo`
  - реальный `loadBrainGraph`;
  - реальные узлы и рёбра;
  - multi-hop path, если она есть;
  - прямые связи отделены от `inference=true`;
  - provenance документа и heading;
  - ссылка на существующую интерактивную визуализацию `/admin/brain/graph`;
  - пустая выборка/ошибка описываются честно, без подмены количеством сущностей.

## 3. Evidence и ограничения

- Для analytics каждая строка отчёта содержит источник и определение; смешивание page views, landing sessions, search clicks, conversations и subscriptions запрещено явным текстом.
- Bluesky totals сохраняют `precision`: публичные счётчики не равны охвату/просмотрам.
- Graph demo помечает `inference=true` как гипотезы и не выдаёт их за подтверждённые связи.
- Media/Journal/Flow/Brain/Web сохраняют существующий `guardAnswerEvidence`; для недоступного источника выводится ограничение, а не «пусто во всей базе».
- Production Supabase, env, cron, workers, PWA и дизайн сайта не изменялись.

## 4. Regression tests

Добавлены/расширены:

- `lib/pierrot/__tests__/queryUnderstanding.test.ts`
- `lib/pierrot/__tests__/executionPlan.test.ts`
- `lib/pierrot/__tests__/ownerTools.test.ts`
- `lib/pierrot/__tests__/graphDemo.test.ts`
- `lib/pierrot/__tests__/mediaCatalogIntent.test.ts`
- `lib/analytics/website/__tests__/question.test.ts`
- `lib/analytics/website/__tests__/pageMetrics.test.ts`
- `lib/knowledge/rag/__tests__/journalFlowRetrieval.test.ts`
- `app/api/pierrot-web/__tests__/route.test.ts`

Покрытые сценарии:

| # | Сценарий | Ожидание |
|---|---|---|
| 1 | «Расскажи про Bluesky» / «Покажи статистику по Bluesky» | только Bluesky analytics, без site report |
| 2 | «А подробнее?» | продолжает исходный Bluesky запрос |
| 3 | «Ты выдумал статистику» | повторный fetch источника + краткая пометка перепроверки |
| 4 | «Покажи статистику Journal» | Journal inventory + честный размер выборки |
| 5 | «Посещаемость /flow» | метрики URL `/flow`, не Flow stream |
| 6 | «Покажи, как работает граф» | реальный graph retrieval + direct/inference + визуализация |
| 7 | «Публикации в СМИ за 2026 год» | полный Media catalogue |
| 8 | «Перечитай вопрос» после цепочки follow-up | возврат к исходному Bluesky intent |
| 9 | Новый самостоятельный вопрос | не наследует старый tool/intent |
| 10 | Источник недоступен | ограничение/ошибка, без имитации успеха |

Проверки:

```bash
npx tsc --noEmit -p tsconfig.json
npx jest app/api/pierrot-web/__tests__/route.test.ts lib/pierrot lib/analytics/website lib/knowledge/rag --runInBand
npx jest lib/knowledge/graph lib/analytics --runInBand
```

Результат на момент изменения: TypeScript без ошибок; 1299 тестов в затронутых наборах, 139 тестов graph/analytics и полный прогон 2436 тестов — все проходят.

## 5. Что сознательно не делалось

- Не добавлялись новые внешние сервисы и платная инфраструктура.
- Не создавалась параллельная система памяти/маршрутизации: изменения встроены в существующие `understandPierrotQuery`, `buildPierrotExecutionPlan`, `detectOwnerTool`, `retrieveJournalFlowEvidence`, website analytics.
- Не изменялись production-данные ради тестов.
- Не заявляется, что Graph demo заменяет полноценный интерактивный UI: чат отдаёт проверенное текстовое представление и ссылку на существующую визуализацию.
