# 🚀 Миграция с Vercel на Render

**Дата:** 28 октября 2025  
**Статус:** Готов к миграции

---

## 📋 ПЛАН МИГРАЦИИ

### Этап 1: Подготовка (Сейчас)
- [x] Создать конфигурацию Render (`render.yaml`)
- [x] Включить `output: 'standalone'` в `next.config.js`
- [x] Создать Dockerfile (опционально)
- [x] Создать health check endpoint (`/api/health`)
- [x] Закоммитить все изменения
- [ ] Запушить в GitHub

### Этап 2: Настройка Render (15-30 минут)
1. Зарегистрироваться на [render.com](https://render.com)
2. Подключить GitHub репозиторий
3. Создать новый Web Service
4. Выбрать репозиторий `merkurov1/newlove`
5. Render автоматически обнаружит `render.yaml`

### Этап 3: Переменные окружения (10-15 минут)
Скопировать все переменные из Vercel:

```bash
# На Vercel
vercel env pull .env.vercel

# Затем добавить в Render Dashboard:
# Settings → Environment → Add Environment Variable
```

**Обязательные переменные:**
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `DATABASE_URL`
- `RESEND_API_KEY` (если используется)
- `STRIPE_SECRET_KEY` (если используется)
- `STRIPE_WEBHOOK_SECRET` (если используется)

### Этап 4: Первый деплой (5-10 минут)
1. Render автоматически начнет деплой
2. Следить за логами в Dashboard
3. Проверить health check: `https://your-app.onrender.com/api/health`

### Этап 5: Тестирование (30-60 минут)
- [ ] Проверить главную страницу
- [ ] Проверить аутентификацию
- [ ] Проверить API endpoints
- [ ] Проверить загрузку изображений
- [ ] Проверить админку
- [ ] Проверить интеграции (Bluesky, Medium, YouTube)

### Этап 6: DNS и домен (15-30 минут)
1. В Render: Settings → Custom Domain
2. Добавить домен `merkurov.love`
3. Обновить DNS записи:
   ```
   Type: CNAME
   Name: @
   Value: your-app.onrender.com
   ```
4. Дождаться SSL сертификата (автоматически)

### Этап 7: Отключение Vercel (5 минут)
1. Убедиться, что Render работает стабильно
2. В Vercel: Project Settings → General → Delete Project
3. Или просто отключить auto-deploy

---

## 🔧 КОНФИГУРАЦИЯ RENDER

### render.yaml
```yaml
services:
  - type: web
    name: newlove
    runtime: node
    plan: starter
    region: oregon
    buildCommand: pnpm install && pnpm run build
    startCommand: pnpm start
    healthCheckPath: /api/health
    autoDeploy: true
```

### Настройки в Dashboard
- **Node Version:** 22.0.0
- **Build Command:** `pnpm install && pnpm run build`
- **Start Command:** `pnpm start`
- **Health Check:** `/api/health`
- **Auto Deploy:** Enabled (main branch)

---

## 💰 СРАВНЕНИЕ СТОИМОСТИ

### Vercel
- **Hobby (Free):** $0/месяц
  - 100 GB bandwidth
  - Serverless Functions
  - Automatic SSL
  - **Ограничения:** Image optimization quota

### Render
- **Free:** $0/месяц
  - 750 часов/месяц
  - Automatic SSL
  - **Ограничения:** Спит после 15 мин неактивности
  
- **Starter:** $7/месяц
  - Всегда активен
  - 512 MB RAM
  - Automatic SSL
  - **Рекомендуется для production**

- **Standard:** $25/месяц
  - 2 GB RAM
  - Больше CPU
  - Priority support

---

## ⚠️ ВАЖНЫЕ ОТЛИЧИЯ

### Vercel → Render

| Функция | Vercel | Render |
|---------|--------|--------|
| Serverless Functions | ✅ Да | ❌ Нет (Node.js server) |
| Edge Functions | ✅ Да | ❌ Нет |
| Image Optimization | ✅ Встроенная | ⚠️ Нужна настройка |
| Auto-scaling | ✅ Да | ⚠️ Ограничено |
| Cold starts | ❌ Нет | ✅ Да (Free tier) |
| Build time | ~2-3 мин | ~3-5 мин |
| Deploy time | ~30 сек | ~1-2 мин |

### Что нужно изменить:

1. **Output mode:**
   ```javascript
   // next.config.js
   output: 'standalone', // Обязательно для Render
   ```

2. **Image optimization:**
   - Vercel: автоматическая
   - Render: нужно настроить CDN или использовать Supabase Storage

3. **Environment variables:**
   - Копировать вручную из Vercel в Render

4. **Health checks:**
   - Создан endpoint `/api/health`

---

## 🔄 ОТКАТ (Rollback Plan)

Если что-то пойдет не так:

### Быстрый откат (5 минут)
1. В DNS вернуть CNAME на Vercel
2. В Vercel включить auto-deploy
3. Сайт вернется на Vercel

### Полный откат
1. Удалить `output: 'standalone'` из `next.config.js`
2. Закоммитить и запушить
3. Vercel автоматически задеплоит

---

## 📊 ЧЕКЛИСТ МИГРАЦИИ

### Перед миграцией
- [x] Создать `render.yaml`
- [x] Включить `output: 'standalone'`
- [x] Создать health check
- [x] Создать Dockerfile (опционально)
- [ ] Закоммитить изменения
- [ ] Запушить в GitHub
- [ ] Сделать backup базы данных

### Во время миграции
- [ ] Создать проект на Render
- [ ] Скопировать переменные окружения
- [ ] Дождаться первого деплоя
- [ ] Проверить health check
- [ ] Протестировать основные функции

### После миграции
- [ ] Обновить DNS записи
- [ ] Дождаться SSL сертификата
- [ ] Полное тестирование
- [ ] Мониторинг логов 24 часа
- [ ] Отключить Vercel (через 48 часов)

---

## 🚨 ВОЗМОЖНЫЕ ПРОБЛЕМЫ

### 1. Build fails
**Проблема:** Ошибка при сборке  
**Решение:**
```bash
# Проверить локально
pnpm install
pnpm run build
```

### 2. Environment variables missing
**Проблема:** Приложение не запускается  
**Решение:** Проверить все переменные в Render Dashboard

### 3. Database connection fails
**Проблема:** Не подключается к Supabase  
**Решение:** Проверить `DATABASE_URL` и firewall rules

### 4. Images not loading
**Проблема:** Изображения не загружаются  
**Решение:** Проверить `remotePatterns` в `next.config.js`

### 5. Cold starts (Free tier)
**Проблема:** Сайт "засыпает"  
**Решение:** Upgrade до Starter ($7/месяц)

---

## 📞 ПОДДЕРЖКА

### Render
- Документация: https://render.com/docs
- Support: https://render.com/support
- Community: https://community.render.com

### Next.js на Render
- Guide: https://render.com/docs/deploy-nextjs-app

---

## 🎯 РЕКОМЕНДАЦИИ

### Для production:
1. **Используйте Starter plan** ($7/месяц) - нет cold starts
2. **Настройте CDN** для статики (Cloudflare)
3. **Используйте Supabase Storage** для изображений
4. **Настройте мониторинг** (Sentry, LogRocket)
5. **Backup базы данных** регулярно

### Оптимизация:
1. Включить кеширование в Next.js
2. Использовать ISR (Incremental Static Regeneration)
3. Оптимизировать bundle size
4. Настроить CDN для статики

---

## ✅ ГОТОВНОСТЬ К МИГРАЦИИ

**Статус:** ✅ Готов  
**Риски:** Низкие  
**Время миграции:** 1-2 часа  
**Downtime:** 0-5 минут (при правильной настройке DNS)

**Следующий шаг:** Закоммитить изменения и запушить в GitHub
