# Telegram Research: локальный анализ переписки

Модуль для локального, воспроизводимого исследования Telegram-диалогов. Первый кейс —
личный диалог `@Vorobievaya`, но команды принимают любой `--handle`.

Что делает модуль:

- выгружает **всю доступную** историю постранично через `tg messages list --fresh`, а исходные сообщения читает из `raw_json` локального кеша через read-only `tg sql`;
- не скачивает изображения, видео, аудио и другие медиа;
- сохраняет текст, подписи к медиа и метаданные медиа;
- хранит сырые ответы API отдельно от нормализованного корпуса;
- считает базовую статистику без LLM;
- готовит пакетный анализ DeepSeek, но не запускает его без явного `--run`;
- не пишет секреты, API-ключи и тексты переписки в Git.

На этом этапе **ничего не разворачивается в Vercel и не меняется в Supabase**. Модуль
работает только локально.

## Текущий статус (2026-10-24)

- Код модуля, документация и синтетические тесты добавлены.
- `tg` 0.5.0 и Bun 1.4.4 установлены user-local; существующие зависимости `newlove` не менялись.
- Telegram-вход выполнен вручную; активный аккаунт — Anton Merkurov (`@merkurov`, ID `1674900`).
- `@Vorobievaya` найден и подтверждён: Ирина Воробьева, private chat ID `276889507`.
- Полный экспорт завершён: **1 613 сообщений**, `2024-03-14T12:58:47Z` — `2026-10-22T10:15:40Z`.
- `verify --deep` подтвердил `status=complete`: достигнуто начало истории, голова стабильна, последнее видимое сообщение совпало, неразрешённых ошибок нет.
- Локальная статистика рассчитана: 379 сессий, 113 прямых ответов, 578 оценочных ответов (порог сессии 6 ч, timezone `Europe/Moscow`).
- DeepSeek план построен: 7 фрагментов, 404 802 символа, бюджет $1 / 100 запросов.
- DeepSeek-анализ завершён: 15 запросов, 345 089 input / 43 721 output токенов, оценка $0.156. Получено 30 редакционных событий, 7 повторяющихся тем, 6 наблюдений о языке.
- Публичный обезличенный кейс собран в `data/telegram-research-public/vorobievaya.json`; страницы `/research/telegram` и `/research/telegram/vorobievaya` рендерятся из этого JSON, но доступ к ним защищён серверной проверкой Supabase Auth + роли `ADMIN`.
- `data/telegram-research/` полностью исключён из Git; тексты переписки, raw-страницы, промежуточные LLM-ответы и сырые отчёты не коммитятся. Обезличенные public JSON публикуются только по явному решению.

### Второй кейс: `@baartello` (2026-10-24)

- Диалог подтверждён: **Belyshkin**, `@baartello`, private chat ID `494647953`.
- Экспорт завершён: **261 сообщение**, `2024-03-08T11:34:59Z` — `2026-10-24T11:49:26Z`, 4 страницы назад + 3 head-страницы, 289 дубликатов отброшено.
- `status=complete` на момент снимка; live-head проверка совпала с экспортированным максимумом (`187803`). Переписка активна, поэтому более поздние сообщения в этот срез не входят.
- Повторный экспорт подтвердил возобновление и идемпотентность: head sync подхватил новые сообщения, дубликаты не попали в корпус.
- Статистика: 36 сессий, 8 прямых ответов, 151 оценочный; timezone `Europe/Moscow`.
- DeepSeek: `deepseek-flash`, 3 запроса, 31 374 input / 8 111 output токенов, оценка $0.0191; 20 редакционных событий, 16 тем, 4 наблюдения о языке.
- Отчёт собран в `data/telegram-research-public/baartello.json` и закоммичен как обезличенный JSON (без сырых сообщений, Telegram ID и source message IDs), как и `vorobievaya.json`. Страница импортирует его статически, поэтому кейс доступен и на Vercel.

### Доступ к `/research/telegram`

- `app/research/telegram/layout.tsx` — серверная проверка: неавторизованный → `/login?next=%2Fresearch%2Ftelegram`, авторизованный без `ADMIN` → `/403`.
- Проверка использует существующий `getCurrentUser()` / `users.role = 'ADMIN'`; отдельного флага владельца в проекте нет.
- Страницы переведены в `force-dynamic`, `generateStaticParams` удалён: статическая копия отчёта не генерируется.
- `next.config.js` добавляет для `/research/telegram/:path*` заголовки `Cache-Control: private, no-store...` и `X-Robots-Tag: noindex, nofollow`.
- В `app/research` публичный тизер больше не раскрывает имя участника и число сообщений.

---

## 1. Окружение и установка

Проверено в Codespace:

| Компонент                                | Версия                   | Где                |
| ---------------------------------------- | ------------------------ | ------------------ |
| Node.js                                  | 22.x                     | системный          |
| Bun                                      | 1.4.4                    | `~/.local/bin/bun` |
| telegram-sync-cli (`tg`)                 | 0.5.0, standalone binary | `~/.local/bin/tg`  |
| Python/FFmpeg и остальной стек `newlove` | не изменялись            | —                  |

Проверка:

```bash
node --version
bun --version
tg --version
```

Если `tg` или `bun` не найдены, установите их в пользовательский каталог, не меняя
зависимости проекта:

```bash
# tg: официальный standalone-бинарник
mkdir -p ~/.local/bin
curl -fL -o /tmp/tg-linux-x64 \
  https://github.com/neoromantic/telegram-sync-cli/releases/download/v0.5.0/tg-linux-x64
curl -fL -o /tmp/tg-checksums.txt \
  https://github.com/neoromantic/telegram-sync-cli/releases/download/v0.5.0/checksums.txt
grep 'tg-linux-x64' /tmp/tg-checksums.txt
sha256sum /tmp/tg-linux-x64
install -m 0755 /tmp/tg-linux-x64 ~/.local/bin/tg

# Bun >= 1.4 (нужен для запуска TypeScript-скриптов модуля)
curl -fL -o /tmp/bun.zip \
  https://github.com/oven-sh/bun/releases/download/bun-v1.4.4/bun-linux-x64.zip
unzip -q /tmp/bun.zip -d /tmp/bun-extract
install -m 0755 /tmp/bun-extract/bun-linux-x64/bun ~/.local/bin/bun
```

Убедитесь, что `~/.local/bin` есть в `PATH`.

### Что проверено в v0.5.0

- `tg --help`, `tg auth --help`, `tg chats --help`, `tg messages list --help`,
  `tg api --help`, `tg sql --help`.
- `tg sql print-schema --format json` возвращает список таблиц и колонок. Флаг
  `--output=sql` из upstream-документации в v0.5.0 отклоняется: команда принимает только
  `tg sql` — read-only; модуль использует его для чтения `messages_cache.raw_json`. Источник истории — `tg messages list --fresh`, а не `tg api messages.getHistory`.
- `tg auth status` и `tg accounts list` (на момент проверки аккаунтов нет).
- Формат сообщений сверен с исходниками CLI v0.5.0 и покрыт синтетическими тестами.
  Реальный ответ Telegram будет проверен первым экспортом после ручного входа.

---

## 2. Авторизация Telegram (только вручную)

Модуль **никогда** не выполняет вход и не запрашивает коды подтверждения. Авторизация
делается один раз вами в терминале.

1. Получите `api_id` и `api_hash` на <https://my.telegram.org/apps>.
2. Экспортируйте их только в текущую оболочку. Не записывайте в репозиторий и не
   коммитьте. Удобный вариант — отдельный файл вне репозитория:

```bash
mkdir -p ~/.config/telegram-research
chmod 700 ~/.config/telegram-research
# создайте ~/.config/telegram-research/env вручную, chmod 600:
#   export TELEGRAM_API_ID=...
#   export TELEGRAM_API_HASH=...
set -a
. ~/.config/telegram-research/env
set +a
```

3. Войдите:

```bash
tg auth login --phone +<ваш_номер_в_международном_формате>
```

Альтернатива без SMS-кода:

```bash
tg auth login-qr
```

4. Проверьте:

```bash
tg auth status
# ожидается: {"success":true,"data":{"authenticated":true,...}}
```

Сессия и кеш `tg` хранятся в `~/.telegram-sync-cli/` (вне репозитория). Модуль не копирует
их в `data/telegram-research`.

Если авторизация не выполнена, `find` и `export` завершатся с `AUTH_REQUIRED` и не начнут
экспорт.

---

## 3. Найти диалог и подтвердить контакт

```bash
bun run scripts/telegram-research/cli.ts find --handle @Vorobievaya
```

Команда выводит метаданные: ID, тип, название, username, имя, ваш аккаунт. Проверьте, что
это нужный человек. Метаданные сохраняются в
`data/telegram-research/<slug>/discovery.json`.

Экспорт **не стартует** без явного подтверждения:

```bash
bun run scripts/telegram-research/cli.ts export \
  --handle @Vorobievaya \
  --confirm <ID_из_find>
```

Можно подтвердить и `--confirm @Vorobievaya`, но ID надёжнее: username может быть изменён.
Несовпадение ID/username с найденным диалогом останавливает экспорт. После подтверждения
пишется `approval.json` только с метаданными, без текста сообщений.

Для другого диалога достаточно заменить `--handle`.

---

## 4. Полный экспорт истории

```bash
bun run scripts/telegram-research/cli.ts export \
  --handle @Vorobievaya \
  --confirm <ID_из_find>
```

Дополнительные параметры:

| Параметр           | По умолчанию | Назначение                               |
| ------------------ | -----------: | ---------------------------------------- |
| `--page-size`      |        `100` | размер страницы, максимум Telegram — 100 |
| `--max-pages`      |      `10000` | предохранитель от бесконечной пагинации  |
| `--max-head-pages` |         `50` | предохранитель проверки головы           |
| `--max-messages`   |    `1000000` | предохранитель по размеру корпуса        |
| `--max-retries`    |          `5` | повторы временных ошибок                 |
| `--account`        |     активный | аккаунт `tg`                             |

### Как устроена пагинация

- Используется `tg messages list --fresh` с `--before`; страницы идут от новых к старым. После каждой страницы raw-сообщения читаются из `messages_cache.raw_json` через `tg sql`.
- Следующий `offsetId` — минимальный ID на странице. Пустая страница подтверждает начало.
- Повторы: экспоненциальная пауза, отдельная пауза при `FLOOD_WAIT_N`.
- После основного прохода выполняется **head sync**: страницы с самого нового сообщения
  вниз до уже выгруженного диапазона. Это добавляет сообщения, пришедшие во время экспорта,
  и подтверждает, что голова стабильна.
- Каждая страница пишется атомарно в `raw/pages/backward-NNNNNN.json` или
  `raw/pages/head-NNNNNN.json`; чекпоинт — в `export-state.json`.
- При повторном запуске уже скачанные страницы читаются с диска, дубликаты удаляются по
  ключу `chatId:messageId`, затем экспорт продолжается с сохранённого `offsetId`.
- Дубликаты внутри страниц и между страницами не попадают в корпус.
- Сортировка корпуса: по времени, затем по ID сообщения.

### Что сохраняется

Нормализованное сообщение (`corpus.jsonl`, одна JSON-строка на сообщение):

```json
{
  "schemaVersion": 1,
  "id": 12345,
  "chatId": 987654321,
  "date": "2024-01-01T10:00:00.000Z",
  "dateUnix": 1704103200,
  "dateMs": 1704103200000,
  "sender": { "id": 987654321, "username": "example", "displayName": "Example", "isSelf": false },
  "text": "Текст сообщения или подпись к медиа",
  "isCaption": false,
  "textLength": 28,
  "wordCount": 4,
  "links": ["https://example.com/"],
  "media": null,
  "hasMedia": false,
  "reply": { "toMessageId": 12340, "threadId": 12340, "quote": null },
  "forward": null,
  "isOutgoing": false,
  "isService": false,
  "isEdited": false,
  "editDate": null,
  "editUnix": null,
  "isDeleted": false,
  "rawKind": "message",
  "sourcePage": 1
}
```

Для медиа сохраняются только метаданные: тип, ID, MIME, имя файла, размер, размеры,
длительность, web page, poll, geo, sticker. Файлы не скачиваются. Если у медиа есть
подпись, она лежит в `text`, а `isCaption = true`.

`isDeleted` отражает только то, что вернул API. Telegram не отдаёт удалённые сообщения через
`messages list`, поэтому исторические удаления в корпус не попадают.

### Часовой пояс

- Все timestamps в корпусе — **UTC ISO-8601**; исходный Telegram timestamp — Unix seconds.
- Часовой пояс отображения статистики задаётся при запуске (`--timezone`, по умолчанию
  `UTC`) и записывается в отчёт. Исходные timestamps не переписываются.
- Группировка по годам/месяцам/дням/часам учитывает переходы на летнее время через IANA.

### Структура данных

```
data/telegram-research/
└── vorobievaya/
    ├── discovery.json          # метаданные до подтверждения
    ├── approval.json           # факт подтверждения
    ├── export-state.json       # чекпоинт, ошибки, счётчики
    ├── corpus.jsonl            # нормализованный корпус
    ├── manifest.json           # полнота, диапазон дат, хеш корпуса
    ├── raw/
    │   ├── meta.json
    │   └── pages/
    │       ├── backward-000001.json
    │       └── head-000001.json
    └── analysis/
        ├── stats.json
        └── deepseek/
```

Каталог `data/telegram-research/` полностью исключён из Git. Сырые страницы могут содержать
служебные Telegram-идентификаторы и ссылки на файлы — обращайтесь с ними как с
конфиденциальными.

---

## 5. Проверка полноты архива

```bash
bun run scripts/telegram-research/cli.ts verify --handle @Vorobievaya
```

Проверяются:

- число строк корпуса совпадает с `manifest.corpus.messageCount`;
- SHA-256 корпуса совпадает с манифестом;
- все `chatId:messageId` уникальны;
- порядок хронологический;
- первый/последний ID и даты совпадают с манифестом;
- `manifest.completeness.status = "complete"`;
- нет неразрешённых ошибок.

Дополнительная сетевая проверка (свежий запрос к Telegram):

```bash
bun run scripts/telegram-research/cli.ts verify --handle @Vorobievaya --deep
```

Она сравнивает последнее видимое сообщение с экспортированным максимумом.

В `manifest.completeness.checks` должны быть `true`:

- `reachedEmptyPage` — пагинация дошла до пустой страницы;
- `headStable` — head sync завершился;
- `latestVisibleMessageMatched` — последнее видимое сообщение не новее экспортированного;
- `noUnresolvedErrors`;
- `withinLimits`;
- `corpusSortedAndUnique`.

Если статус `partial` или `incomplete`, причины перечислены в `completeness.reasons`,
а конкретные пропуски — в `completeness.gaps` (недостигнутое начало истории, нестабильная
голова, неразрешённые страницы, сработавший лимит, непроверенное последнее сообщение).
Повторный `export` продолжит с чекпоинта. Неразрешённые ошибки — в `export-state.json`.

`reachedEmptyPage` означает, что пагинация дошла до начала истории: пустая страница или
сообщение с ID 1. `headStable` — что head sync дошёл до уже выгруженного диапазона.

**Важно:** экспорт не объявляется полным только по количеству страниц. Нужны пустая
страница, стабильная голова и независимая проверка последнего видимого сообщения.

---

## 6. Локальная статистика без LLM

```bash
bun run scripts/telegram-research/cli.ts stats \
  --handle @Vorobievaya \
  --timezone Europe/Moscow \
  --session-gap-hours 6 \
  --long-pause-days 7
```

Отчёт: `data/telegram-research/<slug>/analysis/stats.json`. Полный JSON в stdout:
`--print`.

Что считается:

- число сообщений всего и по каждому участнику;
- активность по годам, месяцам, дням недели и часам (в выбранной IANA-зоне);
- распределение длины сообщений, слов и ссылок (min/mean/median/p90/p99 + гистограммы);
- интервалы между сообщениями;
- **прямые ответы** — только при наличии `replyToId` и найденной цели;
- **оценочные ответы** — следующее сообщение другого участника без reply в пределах
  `--estimate-window-hours` (по умолчанию 6 ч). Они хранятся отдельно и никогда не
  суммируются с прямыми;
- сессии с настраиваемым порогом разрыва `--session-gap-hours`;
- кто начинает сессии и кто возобновляет после паузы больше `--long-pause-days`;
- доля reply-связей и покрытие resolvable-ответов;
- динамика по месяцам: сообщения, участники, длина, ссылки, прямые ответы, сессии.

Ограничения и правила расчёта записываются в `methodology` и `dataQuality` отчёта.
Психолингвистических выводов в статистике нет — только наблюдаемые числовые признаки.

---

## 7. DeepSeek: подготовка и запуск

Проверены официальные параметры на 2026-10-24:

- base URL: `https://api.deepseek.com`;
- модель по умолчанию: `deepseek-flash` (served by DeepSeek-V4.1-Flash-1017);
- JSON mode: `response_format: {"type": "json_object"}`, слово `json` в промпте,
  ограничение `max_tokens`;
- цены Flash (USD за 1M токенов): input $0.15–0.30, output $0.60–1.20 в зависимости от
  peak/off-peak. По умолчанию модуль считает консервативно по peak: $0.30 / $1.20.

Переменные окружения:

| Переменная                        | По умолчанию               | Назначение                                              |
| --------------------------------- | -------------------------- | ------------------------------------------------------- |
| `DEEPSEEK_API_KEY`                | —                          | обязателен для `--probe` и `--run`; в логи не выводится |
| `DEEPSEEK_MODEL`                  | `deepseek-flash`           | модель                                                  |
| `DEEPSEEK_BASE_URL`               | `https://api.deepseek.com` | официальный API                                         |
| `DEEPSEEK_BUDGET_USD`             | `1`                        | жёсткий лимит оценки расходов                           |
| `DEEPSEEK_MAX_REQUESTS`           | `100`                      | лимит запросов                                          |
| `DEEPSEEK_MAX_OUTPUT_TOKENS`      | `6000`                     | максимум на ответ                                       |
| `DEEPSEEK_INPUT_USD_PER_MILLION`  | `0.3`                      | тариф для оценки                                        |
| `DEEPSEEK_OUTPUT_USD_PER_MILLION` | `1.2`                      | тариф для оценки                                        |
| `DEEPSEEK_THINKING`               | `disabled`                 | `enabled`/`disabled`                                    |

Ключ читается только из `DEEPSEEK_API_KEY`. Не добавляйте его в `.env.local`, Git,
манифесты или промпты.

### Шаг 1. План без запросов

```bash
bun run scripts/telegram-research/cli.ts plan --handle @Vorobievaya
```

Создаёт `analysis/deepseek/chunks.json` и `progress.json`: последовательные временные
фрагменты с перекрытием контекста (`--overlap`, по умолчанию 20 сообщений) и бюджетом.
Каждый фрагмент хранит `targetMessageIds` и `contextMessageIds`; целевые сообщения не
дублируются между фрагментами.

### Шаг 2. Проверка ключа и модели (бесплатный GET /models)

```bash
DEEPSEEK_API_KEY=... bun run scripts/telegram-research/cli.ts deepseek \
  --handle @Vorobievaya --probe
```

Проверяет доступность ключа и наличие модели. Запросы к `/chat/completions` не отправляются.

### Шаг 3. Пакетный анализ

```bash
DEEPSEEK_API_KEY=... bun run scripts/telegram-research/cli.ts deepseek \
  --handle @Vorobievaya \
  --run \
  --budget-usd 1 \
  --max-requests 60
```

Этапы:

1. `events` — редакционные поручения, сроки, сдача текстов, просьбы о правках,
   согласования, ссылки на публикации, завершение задач.
2. `topics` — тематическая классификация.
3. `synthesis` — итоговый синтез по уже извлечённым событиям и темам.

Каждый ответ проверяется Zod-схемой. Все `sourceMessageIds`/`evidenceMessageIds` должны
существовать в переданном фрагменте; выдуманные ID отклоняют результат. Для событий
сохраняется уверенность `confidence`; дедлайн без источника запрещён промптом и схемой.
Психолингвистические наблюдения делятся на `observable` и `interpretation`, у каждого есть
альтернативные трактовки и дисклеймер.

Повторный запуск:

```bash
# продолжить с места остановки, готовые фрагменты не трогать
DEEPSEEK_API_KEY=... bun run scripts/telegram-research/cli.ts deepseek \
  --handle @Vorobievaya --run

# повторно проанализировать только failed-фрагменты
DEEPSEEK_API_KEY=... bun run scripts/telegram-research/cli.ts deepseek \
  --handle @Vorobievaya --run --retry-failed
```

Без `--run` команда работает как dry-run и не отправляет запросы. Массовая отправка не
запускается автоматически.

---

## 8. Приватная витрина кейса

После локального экспорта и статистики можно собрать обезличенный публичный JSON:

```bash
bun run scripts/telegram-research/build-public-case.ts --handle @Vorobievaya
# или
npm run telegram:public-case
```

Результат:

```text
data/telegram-research-public/vorobievaya.json
```

В публичный JSON попадают только:

- агрегированные метрики;
- распределения по годам/месяцам/дням/часам;
- сводные показатели ответов и сессий;
- AI-сводки, темы, редакционные события и наблюдения;
- методология, ограничения и статус полноты.

Не попадают:

- тексты сообщений;
- `sourceMessageIds` и `evidenceMessageIds`;
- Telegram ID, `chatId`, `userId`;
- медиа, `raw_json`, пути к файлам;
- ключи, сессии и любые env-переменные.

Страница:

```text
/research/telegram
/research/telegram/vorobievaya
```

Она рендерится динамически из `data/telegram-research-public/*.json` и защищена серверной проверкой Supabase Auth + `users.role = 'ADMIN'` (см. `app/research/telegram/layout.tsx`). Страницы закрыты от индексации (`noindex`) и не кэшируются публично. Сырые данные остаются только в `data/telegram-research/`, который исключён из Git; обезличенные отчёты, явно одобренные для публикации, коммитятся.

---

## 9. Тесты и проверки

```bash
# типы только для модуля
npx tsc -p tsconfig.telegram-research.json

# тесты модуля (синтетические данные, без реальной переписки)
npx jest lib/telegram-research --runInBand

# линтер в режиме совместимости с текущим .eslintrc
ESLINT_USE_FLAT_CONFIG=false npx eslint --config .eslintrc.json \
  "lib/telegram-research/**/*.ts" "scripts/telegram-research/**/*.ts"

# форматирование
npx prettier --check "lib/telegram-research/**/*.ts" \
  "scripts/telegram-research/**/*.ts"
```

Тесты покрывают пагинацию, пустые страницы, дубликаты, порядок сообщений, временные зоны,
пустой текст, сообщения без текста, повторный запуск, повреждённые страницы/ответы API,
бюджет DeepSeek и отсутствие выдуманных message ID.

---

## 10. Безопасность и Git

`.gitignore` содержит точечные правила:

```gitignore
/data/telegram-research/
/data/telegram-research-*.zip
/data/telegram-research-*.tar.gz
/telegram-research-export-*.zip
/telegram-research-export-*.tar.gz
*.telegram-research.session
```

Проверка перед коммитом:

```bash
git status --short
git check-ignore -v data/telegram-research/vorobievaya/corpus.jsonl
```

В репозиторий не должны попадать: архивы, `corpus.jsonl`, `raw/`, `manifest.json`,
`stats.json`, результаты DeepSeek, `approval.json`, `discovery.json`, `.env*`, сессии `tg`.

---

## 11. Известные ограничения

- Telegram не возвращает удалённые сообщения через историю; `isDeleted` неполон.
- Секретные чаты и чаты, недоступные аккаунту, не экспортируются.
- Медиа не скачиваются, поэтому визуальный контент и расшифровки голоса не анализируются.
- Оценочные ответы — эвристика, а не доказательство ответа.
- При смене username слаг каталога может измениться; используйте `--handle` и проверяйте
  `find` заново.
- `tg api` требует сетевой доступ и действующую сессию; при `FLOOD_WAIT` экспорт ждёт и
  повторяет страницу.
- Психолингвистический анализ DeepSeek — только гипотезы с явной маркировкой, не факты.

---

## 12. Быстрый чек-лист

```bash
# 1. авторизация (вручную)
tg auth status

# 2. найти и проверить контакт
bun run scripts/telegram-research/cli.ts find --handle @Vorobievaya

# 3. подтвердить и выгрузить
bun run scripts/telegram-research/cli.ts export \
  --handle @Vorobievaya --confirm <ID>

# 4. проверить полноту
bun run scripts/telegram-research/cli.ts verify --handle @Vorobievaya --deep

# 5. статистика
bun run scripts/telegram-research/cli.ts stats \
  --handle @Vorobievaya --timezone Europe/Moscow

# 6. DeepSeek: план -> probe -> run
bun run scripts/telegram-research/cli.ts plan --handle @Vorobievaya
DEEPSEEK_API_KEY=... bun run scripts/telegram-research/cli.ts deepseek \
  --handle @Vorobievaya --probe
DEEPSEEK_API_KEY=... bun run scripts/telegram-research/cli.ts deepseek \
  --handle @Vorobievaya --run --budget-usd 1
```
