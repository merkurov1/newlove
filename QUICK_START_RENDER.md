# 🚀 Быстрый старт: Деплой на Render

**Время:** 15-30 минут  
**Сложность:** Легко

---

## ✅ ЧТО УЖЕ ГОТОВО

- [x] Конфигурация `render.yaml`
- [x] `output: 'standalone'` включен
- [x] Health check endpoint `/api/health`
- [x] Dockerfile (опционально)
- [x] Все изменения закоммичены

---

## 📝 ШАГ 1: ПУШ В GITHUB (2 минуты)

```bash
git push origin main
```

Проверьте на GitHub: https://github.com/merkurov1/newlove

---

## 🎯 ШАГ 2: СОЗДАНИЕ ПРОЕКТА НА RENDER (5 минут)

1. Зайдите на https://render.com
2. Нажмите **"New +"** → **"Web Service"**
3. Подключите GitHub репозиторий
4. Выберите `merkurov1/newlove`
5. Render автоматически обнаружит `render.yaml`
6. Выберите план:
   - **Free** - для теста (спит после 15 мин)
   - **Starter ($7/мес)** - рекомендуется для production

---

## 🔐 ШАГ 3: ПЕРЕМЕННЫЕ ОКРУЖЕНИЯ (10 минут)

### Получить переменные из Vercel:

```bash
# На Vercel
vercel env pull .env.vercel

# Посмотреть
cat .env.vercel
```

### Добавить в Render Dashboard:

**Settings → Environment → Add Environment Variable**

**Обязательные:**
```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
DATABASE_URL=postgresql://...
```

**Опциональные (если используются):**
```
RESEND_API_KEY=re_...
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_SITE_URL=https://your-app.onrender.com
```

---

## 🚀 ШАГ 4: ПЕРВЫЙ ДЕПЛОЙ (5-10 минут)

1. Нажмите **"Create Web Service"**
2. Render начнет деплой автоматически
3. Следите за логами в реальном времени
4. Дождитесь статуса **"Live"**

**Ваш URL:** `https://your-app.onrender.com`

---

## ✅ ШАГ 5: ПРОВЕРКА (2 минуты)

### Health Check:
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

### Проверьте в браузере:
- Главная страница
- Аутентификация
- API endpoints

---

## 🌐 ШАГ 6: CUSTOM DOMAIN (опционально, 15 минут)

### В Render:
1. **Settings → Custom Domain**
2. Добавить `merkurov.love`
3. Скопировать CNAME значение

### У регистратора домена:
```
Type: CNAME
Name: @ (или www)
Value: your-app.onrender.com
TTL: 3600
```

### Дождаться:
- Распространения DNS (5-30 минут)
- SSL сертификата (автоматически)

---

## 🔄 ШАГ 7: ОТКЛЮЧЕНИЕ VERCEL (опционально)

**⚠️ Делайте это только после полного тестирования!**

### Вариант 1: Пауза (рекомендуется)
1. Vercel Dashboard → Project Settings
2. General → **Pause Deployments**

### Вариант 2: Удаление
1. Vercel Dashboard → Project Settings
2. General → **Delete Project**

---

## 🎉 ГОТОВО!

Ваш сайт теперь работает на Render!

**Следующие шаги:**
- Протестируйте все функции
- Настройте мониторинг
- Обновите документацию
- Следите за логами первые 24 часа

---

## 📊 ПОЛЕЗНЫЕ КОМАНДЫ

```bash
# Посмотреть логи
# Render Dashboard → Logs

# Перезапустить сервис
# Render Dashboard → Manual Deploy → Deploy latest commit

# Откатиться к предыдущей версии
# Render Dashboard → Deploys → Rollback
```

---

## ⚠️ ВОЗМОЖНЫЕ ПРОБЛЕМЫ

### Build fails
```bash
# Проверить локально
pnpm install
pnpm run build
```

### Environment variables missing
Проверьте все переменные в Render Dashboard

### Database connection fails
Проверьте `DATABASE_URL` и firewall rules в Supabase

### Cold starts (Free tier)
Upgrade до Starter ($7/мес)

---

## 📞 ПОДДЕРЖКА

- **Render Docs:** https://render.com/docs
- **Render Support:** https://render.com/support
- **Next.js on Render:** https://render.com/docs/deploy-nextjs-app

---

## 📚 ДОПОЛНИТЕЛЬНАЯ ДОКУМЕНТАЦИЯ

- `RENDER_MIGRATION.md` - Полное руководство по миграции
- `MIGRATION_CHECKLIST.md` - Детальный чеклист
- `REFACTORING_SUMMARY.md` - Что было сделано

---

**Время выполнения:** 15-30 минут  
**Downtime:** 0 минут (при правильной настройке DNS)  
**Сложность:** ⭐⭐☆☆☆

Удачи! 🚀
