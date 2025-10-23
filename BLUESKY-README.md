# 🦋 Bluesky Integration для merkurov.love

Полная интеграция с децентрализованной социальной сетью Bluesky через AT Protocol.

## 🚀 Быстрый старт

1. **Убедитесь что credentials настроены в `.env.local`:**
   ```bash
   BLUESKY_IDENTIFIER=merkurov.love
   BLUESKY_PASSWORD=nq2b-4iau-hkl5-lfo2
   ```

2. **Запустите сервер разработки:**
   ```bash
   npm run dev
   ```

3. **Откройте демо:**
   ```
   http://localhost:3000/lab/bluesky
   ```

## 📁 Структура файлов

```
/app/api/bluesky/posts/route.ts     # API endpoint для постов
/components/BlueskyFeed.tsx         # React компонент ленты
/app/lab/bluesky/page.tsx          # Демо страница
/docs/BLUESKY-INTEGRATION-COMPLETE.md  # Документация
```

## 🔧 API

### Получить ленту
```bash
GET /api/bluesky/posts?limit=10
```

### Создать пост  
```bash
POST /api/bluesky/posts
Content-Type: application/json

{"text": "Привет Bluesky! 🦋"}
```

## ✅ Что работает

- ✅ Получение ленты @merkurov.love
- ✅ Отображение постов с аватарами
- ✅ Создание новых постов
- ✅ Показ статистики (лайки, репосты)
- ✅ Адаптивный дизайн
- ✅ Обработка ошибок

## 🎯 Результат

Полнофункциональная интеграция с Bluesky готова! Демо доступно на `/lab/bluesky`.