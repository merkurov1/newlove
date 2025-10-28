# ✅ Чеклист миграции Vercel → Render

**Проект:** newlove  
**Дата начала:** ___________  
**Ответственный:** ___________

---

## 📋 ПЕРЕД НАЧАЛОМ

### Подготовка (30 минут)
- [ ] Прочитать `RENDER_MIGRATION.md`
- [ ] Убедиться, что все изменения закоммичены
- [ ] Создать backup базы данных Supabase
- [ ] Сохранить все переменные окружения из Vercel
- [ ] Убедиться, что сайт работает на Vercel
- [ ] Записать текущий URL: https://___________

### Сохранение переменных окружения
```bash
# На Vercel
vercel env pull .env.vercel

# Проверить файл
cat .env.vercel
```

**Список переменных для копирования:**
- [ ] `NEXT_PUBLIC_SUPABASE_URL`
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- [ ] `SUPABASE_SERVICE_ROLE_KEY`
- [ ] `DATABASE_URL`
- [ ] `RESEND_API_KEY`
- [ ] `STRIPE_SECRET_KEY`
- [ ] `STRIPE_WEBHOOK_SECRET`
- [ ] `NEXT_PUBLIC_SITE_URL`
- [ ] Другие: ___________

---

## 🚀 МИГРАЦИЯ

### Шаг 1: Коммит и пуш (5 минут)
```bash
git add .
git commit -m "feat: prepare for Render deployment

- Add render.yaml configuration
- Enable standalone output mode
- Add health check endpoint
- Add Dockerfile for optional Docker deployment
- Update documentation"
git push origin main
```

- [ ] Изменения закоммичены
- [ ] Изменения запушены в GitHub
- [ ] Проверить на GitHub: https://github.com/merkurov1/newlove

### Шаг 2: Создание проекта на Render (10 минут)
1. [ ] Зайти на https://render.com
2. [ ] Нажать "New +" → "Web Service"
3. [ ] Подключить GitHub репозиторий
4. [ ] Выбрать `merkurov1/newlove`
5. [ ] Render обнаружит `render.yaml` автоматически
6. [ ] Проверить настройки:
   - [ ] Name: `newlove`
   - [ ] Region: `Oregon` (или ближайший)
   - [ ] Branch: `main`
   - [ ] Build Command: `pnpm install && pnpm run build`
   - [ ] Start Command: `pnpm start`
7. [ ] Выбрать план: `Starter` ($7/месяц) или `Free` (для теста)

### Шаг 3: Переменные окружения (15 минут)
В Render Dashboard → Environment:

- [ ] `NODE_VERSION` = `22.0.0`
- [ ] `PNPM_VERSION` = `9`
- [ ] `NODE_ENV` = `production`
- [ ] `NEXT_TELEMETRY_DISABLED` = `1`
- [ ] `NEXT_PUBLIC_SUPABASE_URL` = `___________`
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY` = `___________`
- [ ] `SUPABASE_SERVICE_ROLE_KEY` = `___________`
- [ ] `DATABASE_URL` = `___________`
- [ ] `RESEND_API_KEY` = `___________`
- [ ] `STRIPE_SECRET_KEY` = `___________`
- [ ] `STRIPE_WEBHOOK_SECRET` = `___________`
- [ ] `NEXT_PUBLIC_SITE_URL` = `https://your-app.onrender.com`

### Шаг 4: Первый деплой (10 минут)
- [ ] Нажать "Create Web Service"
- [ ] Дождаться начала деплоя
- [ ] Следить за логами в реальном времени
- [ ] Дождаться "Live" статуса
- [ ] Записать URL: https://___________

### Шаг 5: Проверка health check (2 минуты)
```bash
curl https://your-app.onrender.com/api/health
```

Ожидаемый ответ:
```json
{
  "status": "ok",
  "timestamp": "2025-10-28T...",
  "uptime": 123.45,
  "environment": "production"
}
```

- [ ] Health check работает
- [ ] Статус: `ok`

---

## 🧪 ТЕСТИРОВАНИЕ

### Базовые проверки (15 минут)
- [ ] Главная страница загружается
- [ ] Навигация работает
- [ ] Изображения загружаются
- [ ] Стили применяются корректно
- [ ] Нет ошибок в консоли браузера

### Аутентификация (10 минут)
- [ ] Форма входа отображается
- [ ] Можно войти через Supabase
- [ ] Можно выйти
- [ ] Сессия сохраняется

### API Endpoints (15 минут)
- [ ] `/api/health` работает
- [ ] `/api/articles` работает
- [ ] `/api/bluesky/posts` работает
- [ ] `/api/medium/posts` работает
- [ ] `/api/youtube/shorts` работает

### Админка (10 минут)
- [ ] `/admin` доступна (с правами)
- [ ] Можно создать статью
- [ ] Можно редактировать статью
- [ ] Можно загрузить изображение

### Интеграции (15 минут)
- [ ] Bluesky посты загружаются
- [ ] Medium статьи загружаются
- [ ] YouTube Shorts загружаются
- [ ] Email отправка работает (если настроена)
- [ ] Stripe работает (если настроен)

### Performance (5 минут)
- [ ] Время загрузки главной < 3 сек
- [ ] Lighthouse Score > 80
- [ ] Нет memory leaks в логах

---

## 🌐 DNS И ДОМЕН

### Настройка custom domain (20 минут)
1. [ ] В Render: Settings → Custom Domain
2. [ ] Добавить домен: `merkurov.love`
3. [ ] Скопировать CNAME значение
4. [ ] Обновить DNS у регистратора:
   ```
   Type: CNAME
   Name: @ (или www)
   Value: your-app.onrender.com
   TTL: 3600
   ```
5. [ ] Дождаться распространения DNS (5-30 минут)
6. [ ] Проверить: `dig merkurov.love`
7. [ ] Дождаться SSL сертификата (автоматически)
8. [ ] Проверить HTTPS: https://merkurov.love

### Проверка SSL (5 минут)
- [ ] HTTPS работает
- [ ] Сертификат валидный
- [ ] Нет предупреждений в браузере
- [ ] HTTP редиректит на HTTPS

---

## 📊 МОНИТОРИНГ (24 часа)

### Первые 2 часа
- [ ] Проверять логи каждые 15 минут
- [ ] Следить за ошибками
- [ ] Проверять uptime
- [ ] Тестировать основные функции

### Первые 24 часа
- [ ] Проверять логи каждые 2 часа
- [ ] Следить за performance
- [ ] Проверять memory usage
- [ ] Собирать feedback от пользователей

### Метрики для отслеживания
- [ ] Uptime: ___________
- [ ] Response time: ___________
- [ ] Error rate: ___________
- [ ] Memory usage: ___________

---

## ⚠️ ОТКАТ (если нужен)

### Быстрый откат (5 минут)
Если что-то пошло не так:

1. [ ] В DNS вернуть CNAME на Vercel
   ```
   Type: CNAME
   Name: @
   Value: cname.vercel-dns.com
   ```
2. [ ] В Vercel включить auto-deploy
3. [ ] Дождаться распространения DNS (5-15 минут)
4. [ ] Проверить, что сайт работает на Vercel

### Полный откат (15 минут)
Если нужно вернуться полностью:

1. [ ] Удалить `output: 'standalone'` из `next.config.js`
2. [ ] Закоммитить и запушить
3. [ ] Vercel автоматически задеплоит
4. [ ] Удалить проект на Render (опционально)

---

## ✅ ЗАВЕРШЕНИЕ МИГРАЦИИ

### После 48 часов стабильной работы
- [ ] Убедиться, что все работает стабильно
- [ ] Проверить все метрики
- [ ] Собрать feedback
- [ ] Отключить Vercel:
  - [ ] Project Settings → General → Pause Deployments
  - [ ] Или удалить проект полностью

### Документация
- [ ] Обновить README.md с новым URL
- [ ] Обновить документацию деплоя
- [ ] Записать lessons learned
- [ ] Обновить runbook

---

## 📝 ЗАМЕТКИ

### Проблемы и решения
```
Проблема 1: ___________
Решение: ___________

Проблема 2: ___________
Решение: ___________
```

### Время выполнения
- Начало: ___________
- Окончание: ___________
- Общее время: ___________
- Downtime: ___________

### Контакты
- Render Support: https://render.com/support
- Supabase Support: https://supabase.com/support
- GitHub Issues: https://github.com/merkurov1/newlove/issues

---

## 🎉 УСПЕШНАЯ МИГРАЦИЯ

- [ ] Все тесты пройдены
- [ ] DNS настроен
- [ ] SSL работает
- [ ] Мониторинг настроен
- [ ] Документация обновлена
- [ ] Vercel отключен

**Статус:** ✅ Миграция завершена  
**Дата завершения:** ___________  
**Подпись:** ___________
