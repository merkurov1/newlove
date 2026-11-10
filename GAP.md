# GAP — выпуск Flow к макету issue 22

Дата: 2026-11-10  
Ветка: `feat/issue-v3`  
Этап: 1 (обследование, код выпуска не менялся)

## 0. Блокер: эталонные файлы отсутствуют в workspace

В корне репозитория нет файлов и каталогов, на которые ссылается задание:

- `reference/mockup-issue-22.html` — нет
- `reference/journal/page.tsx` — нет
- `reference/journal/FrontPage.tsx` — нет
- `core/core.ts` — нет
- `core/core.test.ts` — нет
- `fixtures/issue-22-mini.json` — нет
- `fixtures/issue-22-selection.json` — нет
- `check-structure.mjs` — нет
- `RULES.md` — нет

Проверено:

```bash
ls reference core fixtures check-structure.mjs RULES.md
# ls: cannot access ...: No such file or directory

find / -name 'issue-22-mini.json' -o -name 'core.test.ts' \
  -o -name 'check-structure.mjs' -o -name 'mockup-issue-22.html'
# ничего не найдено

git ls-tree -r origin/main --name-only | grep -E '^(reference/|core/|fixtures/)|check-structure|RULES.md'
# пусто
```

Следствие: на этом этапе невозможно:

1. Отрендерить `fixtures/issue-22-mini.json` текущим кодом.
2. Сохранить `tmp/issue-22.html`.
3. Выполнить `node check-structure.mjs tmp/issue-22.html`.
4. Скопировать `core/core.ts` в `lib/issues/core.ts` на этапе 2.
5. Сверить `expected` из `fixtures/issue-22-selection.json` на этапе 4.

В задании текстом приложены макет, текущий `renderIssue`, страницы `/journal` и JSON выбора, но нет `core.ts`, `mini.json`, `check-structure.mjs` и `RULES.md`. Их нужно добавить в workspace, иначе этапы 2–4 нельзя выполнить без выдумывания логики и данных.

## 1. Где что лежит

### Рендер выпуска

- `lib/flow-issue/render.ts` — `renderIssue`, `renderIssueWeb`, внутренние `renderWeb`,
  `renderEmail`, `renderText`.
- `components/flow-issues/FlowIssueArticle.tsx` — вставляет готовый HTML выпуска
  в публичную страницу, при наличии payload перерендеривает через `renderIssueWeb`.
- `components/flow-issues/FlowIssueDetail.tsx` — админ-просмотр выпуска.
- `components/flow-issues/FlowIssuesArchive.tsx` — архив выпусков.
- `lib/flow-issue/title.ts` — `buildIssueTitle`, заголовок из лида и даты.
- `lib/flow-issue/template.ts` — шаблон/тема/порядок секций (сейчас рендер
  зависит от него).

### Типы выпуска

- `lib/flow-issue/types.ts` — `IssuePayload` (`schemaVersion: 2`), `IssueEntry`,
  `IssueSectionKey`, `IssueTemplateSettings`, `IssueKind`, `IssueLang`.
- `lib/flow-issue/analysis.ts` — Zod-схема анализа отдельной записи.
- `lib/flow-issue/metadata.ts` — `buildSourceIndex`, презентация ссылок.

### Сборка payload

- `lib/flow-issue/build.ts` — `buildIssuePayload`, `calculateMetrics`,
  `resolveIssueWindow`, выборка опубликованных `items`, анализ, выбор материалов,
  перевод EN, narrative, `schemaVersion: 2`.
- `lib/flow-issue/editorial.ts` — правила выбора материалов.
- `lib/flow-issue/draft.ts` — сравнение состава черновиков.
- `lib/flow-issue/edit.ts` — ручное редактирование payload.
- `lib/flow-issue/narrative.ts` — локальный fallback колонки/саммари.
- `lib/flow-issue/deepseek.ts` — анализ, narrative и перевод через DeepSeek
  (OpenAI-совместимый клиент) с Gemini fallback.

### Кнопка «Собрать выпуск» и роуты

- `app/admin/flow-issues/page.tsx` — страница админки.
- `components/admin/FlowIssueAdmin.tsx` — кнопка «Собрать выпуск», выбор языка и
  периода, `POST /api/admin/flow-issues`.
- `app/api/admin/flow-issues/route.ts` — `GET` списка выпусков и `POST` сборки:
  `buildIssuePayload` → `renderIssue` → запись draft в `letters`.
- `app/api/admin/flow-issues/[id]/route.ts` — перерендер/обновление/публикация/
  отправка конкретного выпуска.
- `app/admin/flow-issues/[id]/page.tsx` — редактор выпуска.
- `app/admin/flow-issues/template/page.tsx` — редактор шаблона.
- `app/admin/letters/page.tsx`, `app/admin/letters/edit/[id]/page.tsx` — общий
  список писем и редактирование issue-письма.

### Публичные страницы `/letters` и `/journal`

- `app/letters/[slug]/page.tsx` — публичная страница выпуска/письма,
  `FlowIssueArticle`, `buildIssueTitle`.
- `app/letters/[slug]/full/page.tsx` — полная версия.
- `app/letters/page.tsx` — архив `JOURNAL` на старом визуальном стиле.
- `components/letters/*` — архив и клиенты писем.
- `app/journal/page.tsx` — текущая главная журнала: загружает published issues
  и Flow, рендерит `FrontPage`.
- `components/journal/FrontPage.tsx` — текущая React-главная журнала.
- `components/journal/JournalViewClient.tsx` — клиентский вариант журнала,
  кандидат на удаление после перехода на reference-версию.

### Клиенты DeepSeek/Gemini

- `lib/ai/gemini.ts` — `generateGeminiText`, настройки, таймауты, circuit breaker.
- `lib/flow-issue/deepseek.ts` — DeepSeek через OpenAI SDK, Gemini-first для
  анализа/narrative, fallback, JSON-схемы, перевод.
- `lib/flow-issue/analysis.ts` — схема и нормализация анализа записи.
- `lib/flow-issue/editorial.ts` — отбор лида/секций по анализу.
- ENV-имена не печатались и не менялись.

## 2. Попытка текущего рендера фикстуры

Команда, которую нужно было выполнить:

```bash
node --experimental-strip-types core/core.test.ts
# Cannot find module .../core/core.test.ts

test -f fixtures/issue-22-mini.json && echo present || echo missing
# missing
```

`tmp/issue-22.html` не создан: исходной фикстуры нет. Проверка структуры не
запускалась, потому что проверять нечего.

## 3. Сравнение: макет → текущий выпуск

| В макете есть | В текущем выпуске |
|---|---|
| Шапка: `Поток` крупно, только название | Шапка содержит brand `Поток`, но также h1 с заголовком выпуска и период/номер. Нужна сверка с эталоном. |
| Фиксированный верх: период, `Выпуск №22`, UTC, без `Merkurov` | Верхняя строка есть, третьим элементом `merkurov.love/flow`; в шапке нет слова `Merkurov`. |
| Навигация: Главное, Ещё в выпуске, Читать, Кадр, Цифры, Подписка | Навигация строится из `template.sections.order`; пункты `Материалы/Читать/Смотреть/Кадр/Цифры/Источники/Подписка`, без «Главное»/«Ещё в выпуске». |
| **Главные цифры:** 5 чисел — опубликовано, записей о Пьеро, своих из всех, изображений, Facebook crossposts | 3 метрики: `published`, `flowActiveDays`, короткий `summary`. Новых `topics`, images и channels в шапке нет. |
| **Главное + колонка Пьеро:** лид слева 8 колонок, колонка Пьеро справа 4 колонки | Лид рендерится `c8`; `latest` может занимать `c4`, но это лента последних записей. Колонка Пьеро (`pierrotIntro`) выводится отдельной полноширинной секцией до материалов, без заголовка/подписи. |
| Колонка Пьеро: заголовок, 3 абзаца, позиция, подпись «Написано ИИ по 19 записям недели» | Есть `pierrotIntro` (2–3 коротких абзаца) и `summary`; нет `column.title`, нет 150–230 слов, нет подписи по числу записей. |
| **Ещё в выпуске:** ровно 3 карточки с заголовком, figures/крупными цифрами, цитатой | Секции `secondary` нет. Есть `latest` как feed-список, а не 3 карточки. |
| **Читать:** 3 карточки ссылок с превью/заголовком/мета | Есть `links`-карточки, число зависит от шаблона; поля `siteName`, `description`, `originalDate`, `ageDays` уже есть. Нет гарантированных 3 и нового отбора из selection. |
| **Кадр:** 6 кадров сеткой `v6`, подписи из даты/заголовка | Есть `photos` сеткой `v4`; число зависит от шаблона. Нет `frames` из selection, нет сетки 6, нет подписи из заголовка записи. |
| **Цифры подробнее:** записи по дням; что опубликовано + своё/чужое; темы (Пьеро/проекты/мир/прочее); часы UTC; кросспостинг по каналам | Есть perDay, byType, own/external, byKind, byUtcHour, quality, delays. Нет `topics` (pierrot/projects/world/other) и `channels` (Telegram/Bluesky/Facebook). Вместо тем — старый byKind. Дополнительно выводятся quality и delays, которых в макете нет. |
| **Указатель источников:** источник, материал, дата оригинала, дата в потоке | Таблица есть и структурно совпадает. |
| **Подписка:** заголовок, дека, кнопка | Секция есть, текст/CTA совпадают. |
| Порядок секций зашит в коде | Порядок материалов берётся из `payload.template.sections.order` (`materialOrder`), шаблон можно менять в админке. |
| Метрики и производные (topics, own/external, channels, frames, sourceIndex) считаются в `core.ts` | `core.ts` отсутствует. Текущий `calculateMetrics` даёт другой набор: total/published/drafts/days/delays/quality/byKind/byUtcHour/perDay/byType. |
| `schemaVersion: 3`, новые поля `lead`, `secondary`, `column`, `links`, `frames`, `stats` | `schemaVersion: 2`; `secondary`, `column`, `frames`, `stats.topics`, `stats.channels` отсутствуют. `lead`, `links`, `sourceIndex`, `stats.own/external`, `perDay`, `byUtcHour` уже есть. |
| Веб: светлая бумага, чёрный акцент | Уже светло и без цветного акцента; шаблон может переопределять цвета через `payload.template.design/tokens`. |
| Письмо: таблицы, inline-стили, 600 px | Уже таблицы/inline, ширина 600, но состав секций старый (3 метрики, intro, feed, старые stats). |
| Текстовая версия повторяет новый порядок и новые секции | Старый порядок: главные цифры, lead, latest, links, videos, photos, sources, join. Нет secondary/column/frames/topics/channels. |
| Пустые секции скрываются | В целом скрываются, но stats-секции и intro имеют свои условия; после добавления новых полей нужно проверить все ветки. |
| Выбор 3 материалов LLM + `validateSecondary` | Отдельного LLM-выбора secondary нет. `selectIssueContent` выбирает lead/latest/links/videos/photos по эвристикам/анализу. |
| Колонка Пьеро 150–230 слов + проверка `unsupportedNumbers` + 1 retry | Есть `generateIssueNarrative` → `summary` + 2–3 коротких абзаца (25–55 слов), без проверки чисел и без повторной попытки. |
| Главная `/journal` из reference | Текущая `/journal` уже близка к приложенному reference (supabase issues + Flow + FrontPage), но содержит дополнительные JsonLd/PageEvent и другой metadata-контур. Нужна точная замена после появления reference-файлов. |

## 4. Что не менялось

Код Flow, Pierrot, Art Engine и текущий конвейер выпусков не изменялись.
Создан только этот `GAP.md`. Незакоммиченные изменения пользователя в
media/knowledge/Pierrot не тронуты.

## 5. Что нужно для продолжения

Добавить в workspace отсутствующие эталонные файлы:

- `reference/mockup-issue-22.html`
- `reference/journal/page.tsx`
- `reference/journal/FrontPage.tsx`
- `core/core.ts`
- `core/core.test.ts`
- `fixtures/issue-22-mini.json`
- `fixtures/issue-22-selection.json`
- `check-structure.mjs`
- `RULES.md`

После этого этап 1 можно закрыть фактическим рендером фикстуры и проверкой
`STRUCTURE OK`.
