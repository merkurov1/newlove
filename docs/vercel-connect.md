# Vercel Connect — API Key connector

Интеграция проекта `newlove` с [Vercel Connect](https://vercel.com/connect/api-key)
для хранения статических API-ключей вне кода и переменных окружения Vercel.
Приложение запрашивает секрет в рантайме, а Vercel выдаёт его только проекту,
которому разрешён доступ к коннектору.

## Что уже сделано

- Установлен SDK: `@vercel/connect@^2.9.3` (зависимость в `package.json`).
- Проект привязан к Vercel: `newlove` / команда `merkurov1s-projects`.
  Локально обновлён `VERCEL_OIDC_TOKEN` в `.env.local`.
- Добавлен серверный helper: `lib/vercelConnect.ts`.
- В `.env.example` описаны переменные `VERCEL_CONNECT_API_KEY` и
  `VERCEL_CONNECT_API_KEY_FALLBACK_ENV`.

## Что нужно сделать вручную (браузер)

CLI не умеет создавать коннекторы типа API Key — Vercel требует браузерный
flow (`vercel connect create api-key` возвращает
`API Key must be created via the dashboard browser flow`).

1. Откройте дашборд:
   https://vercel.com/d?to=%2F%5Bteam%5D%2F~%2Fconnect%3Fcreate%3Dapi-key
2. Выберите сервис (например, OpenAI, Resend, Gemini или «Custom») и имя
   коннектора. Имя формирует UID: `api-key/<name>`.
3. Вставьте секрет в поле ключа и сохраните. Секрет попадёт только в Vercel.
4. Привяжите коннектор к проекту и окружениям:

   ```bash
   vercel connect attach api-key/<name> --project newlove -e production -e preview -e development
   ```

5. Пропишите UID в переменные окружения проекта (значение не секретное):

   ```bash
   vercel env add VERCEL_CONNECT_API_KEY production
   # значение: api-key/<name>
   vercel env add VERCEL_CONNECT_API_KEY preview
   vercel env add VERCEL_CONNECT_API_KEY development
   ```

   Либо передавайте UID явно в коде (`getApiKeyFromConnect({ connector })`).

## Использование

```ts
import { getApiKeyFromConnect } from '@/lib/vercelConnect';

// UID берётся из VERCEL_CONNECT_API_KEY
const apiKey = await getApiKeyFromConnect();

// Явный коннектор + локальный fallback для разработки
const resendKey = await getApiKeyFromConnect({
  connector: 'api-key/resend',
  fallbackEnv: 'RESEND_API_KEY',
});
```

Правила:

- Вызывайте helper только на сервере (route handlers, server actions,
  серверные компоненты). Модуль защищён `assertServerOnly`.
- Не импортируйте `@vercel/connect` в клиентские компоненты.
- Секрет не логируйте и не возвращайте в ответах API.
- Для локальной разработки без `VERCEL_OIDC_TOKEN` используйте `fallbackEnv`:
  helper возьмёт обычную переменную и напишет предупреждение в лог.

## Проверка

```bash
vercel connect list --all-projects   # коннектор создан
vercel connect token api-key/<name>  # Vercel выдаёт секрет (только для отладки)
```

## Ротация и отзыв

- Ротация: обновите ключ в дашборде коннектора — код менять не нужно.
- Отзыв выданных токенов: `vercel connect revoke-tokens api-key/<name>`.
- Удаление доступа проекта: `vercel connect detach api-key/<name> --project newlove`.

## Ссылки

- Страница коннектора: https://vercel.com/connect/api-key
- SDK reference: https://vercel.com/docs/connect/ts-sdk-reference
- CLI: `vercel connect --help`
