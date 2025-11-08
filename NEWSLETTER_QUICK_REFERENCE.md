# 📧 Newsletter System — Quick Reference

## ✅ Что исправлено (8 ноября 2025)

### 1. **Confirmation Email** — теперь отправляется ✅
**Проблема:** Пользователи подписывались, но не получали письмо с подтверждением.

**Решение:** Добавлен код отправки в `subscribeToNewsletter()`:
```javascript
const resend = new Resend(process.env.RESEND_API_KEY);
await resend.emails.send({
  from: 'Anton Merkurov <noreply@merkurov.love>',
  to: email,
  subject: 'Подтвердите подписку на рассылку',
  html: `... красивый HTML шаблон ...`
});
```

### 2. **Лимит увеличен с 20 до 100 подписчиков** ✅
**Проблема:** Рассылка отправлялась только 20 людям.

**Решение:**
- Увеличен лимит до 100 (configurable via `NEWSLETTER_SEND_LIMIT`)
- Добавлен детальный лог отправки (sent/failed)
- Автоматическая пометка письма как отправленного (`sentAt`)
- Улучшенные сообщения об ошибках

---

## 🔑 Environment Variables

### Локальная разработка (.env.local)
```bash
RESEND_API_KEY=re_dEqvvLFs_NqnWPygBdLHKL8WjLG9htyBu
NOREPLY_EMAIL=noreply@merkurov.love
NOREPLY_DISPLAY=Anton Merkurov
NEWSLETTER_SEND_LIMIT=100
```

### Production (Vercel)
Добавить через `vercel env add`:
```bash
vercel env add RESEND_API_KEY production
# Значение: re_dEqvvLFs_NqnWPygBdLHKL8WjLG9htyBu

vercel env add NOREPLY_EMAIL production
# Значение: noreply@merkurov.love

vercel env add NOREPLY_DISPLAY production
# Значение: Anton Merkurov

vercel env add NEWSLETTER_SEND_LIMIT production
# Значение: 100
```

---

## 📖 Как работает система

### 1. Подписка (Double Opt-in)
```
Пользователь → Форма подписки → subscribeToNewsletter()
  ↓
CREATE subscriber (isActive=false)
  ↓
GENERATE confirm token
  ↓
SEND confirmation email ✅ (исправлено)
  ↓
User clicks link → /api/newsletter-confirm?token=xxx
  ↓
UPDATE subscriber (isActive=true)
```

### 2. Отправка письма
```
Админ → /admin/letters/edit/[id] → SendLetterForm
  ↓
sendLetter() проверяет newsletter_jobs
  ↓
Если таблицы нет → fallback отправка до 100 писем
  ↓
Для каждого подписчика:
  - Генерация unsubscribe token
  - Рендеринг email через renderNewsletterEmail()
  - Отправка через Resend API
  ↓
UPDATE letters (sentAt = NOW())
```

### 3. Отписка
```
User clicks unsubscribe → /api/newsletter-unsubscribe?token=xxx
  ↓
MARK token as used
  ↓
UPDATE subscriber (isActive=false, unsubscribedAt=NOW())
```

---

## 🧪 Тестирование

### Тест 1: Подписка
```bash
# 1. Открыть сайт
https://merkurov.love

# 2. Нажать "Подписаться" в футере
# 3. Ввести email: your-email@example.com
# 4. Проверить почту:
#    - Должно прийти письмо "Подтвердите подписку"
#    - Кликнуть по ссылке
#    - Увидеть "Подписка успешно подтверждена!"

# 5. Проверить в БД:
SELECT * FROM subscribers WHERE email = 'your-email@example.com';
# isActive должно быть true
# confirmedAt должно быть заполнено
```

### Тест 2: Отправка письма
```bash
# 1. Создать письмо в /admin/letters/new
# 2. Опубликовать (published = true)
# 3. Открыть /admin/letters/edit/[id]
# 4. В разделе "Отправка рассылки":
#    - Ввести testEmail (опционально для теста)
#    - Нажать "Отправить рассылку"
# 5. Проверить:
#    - Должно появиться сообщение "✅ Успешно отправлено X подписчикам"
#    - Письмо должно прийти на email подписчика
#    - В письме должна быть ссылка Unsubscribe
```

### Тест 3: Отписка
```bash
# 1. Получить письмо из рассылки
# 2. Прокрутить вниз до футера
# 3. Кликнуть "Отписаться от рассылки"
# 4. Должна открыться страница с сообщением:
#    "Вы успешно отписались от рассылки."
# 5. Проверить в БД:
SELECT * FROM subscribers WHERE email = 'your-email@example.com';
# isActive должно быть false
# unsubscribedAt должно быть заполнено
```

---

## 📊 Мониторинг

### Проверка активных подписчиков
```sql
SELECT 
  COUNT(*) FILTER (WHERE "isActive" = true) as active,
  COUNT(*) FILTER (WHERE "isActive" = false AND "confirmedAt" IS NULL) as pending_confirmation,
  COUNT(*) FILTER (WHERE "unsubscribedAt" IS NOT NULL) as unsubscribed,
  COUNT(*) as total
FROM public.subscribers;
```

### Проверка отправленных писем
```sql
SELECT 
  id,
  title,
  "sentAt",
  published
FROM public.letters
WHERE "sentAt" IS NOT NULL
ORDER BY "sentAt" DESC
LIMIT 10;
```

### Проверка токенов
```sql
-- Неиспользованные токены подтверждения (старше 24 часов = проблема)
SELECT 
  st.token,
  st.type,
  st.created_at,
  s.email
FROM subscriber_tokens st
JOIN subscribers s ON s.id = st.subscriber_id
WHERE st.used = false 
  AND st.type = 'confirm'
  AND st.created_at < NOW() - INTERVAL '24 hours';
```

---

## 🐛 Troubleshooting

### Письмо не приходит
```bash
# 1. Проверить логи Vercel:
vercel logs --prod

# 2. Искать строки:
# - "Confirmation email sent to"
# - "Failed to send confirmation email"
# - "RESEND_API_KEY not configured"

# 3. Проверить Resend Dashboard:
https://resend.com/emails

# 4. Проверить спам папку
```

### Ошибка "RESEND_API_KEY not configured"
```bash
# Добавить в Vercel env:
vercel env add RESEND_API_KEY production

# Или в .env.local для локальной разработки:
echo "RESEND_API_KEY=re_dEqvvLFs_NqnWPygBdLHKL8WjLG9htyBu" >> .env.local
```

### Отправка застревает на 100 подписчиках
```bash
# Временное решение: увеличить лимит
vercel env add NEWSLETTER_SEND_LIMIT production
# Значение: 500

# Долгосрочное решение: создать newsletter_jobs таблицу
# См. NEWSLETTER_SYSTEM_AUDIT.md → "План действий"
```

---

## 🔒 Безопасность

### ✅ Реализовано:
- Double opt-in (защита от спама)
- Уникальные unsubscribe токены (CUID2)
- RLS на всех таблицах
- Service role только server-side

### ⚠️ Требует внимания:
- [ ] Rate limiting на /api/newsletter-confirm
- [ ] Expiry time для токенов (например, 7 дней)
- [ ] SPF/DKIM для домена merkurov.love
- [ ] CAPTCHA на форме подписки (опционально)

---

## 📚 Дополнительная документация

- **Полный аудит:** `NEWSLETTER_SYSTEM_AUDIT.md`
- **Resend Docs:** https://resend.com/docs
- **Supabase RLS:** https://supabase.com/docs/guides/auth/row-level-security

---

## 🚀 Следующие шаги

### Срочно:
- [x] Отправка confirmation email ✅
- [x] Увеличение лимита до 100 ✅
- [ ] Добавить env в Vercel
- [ ] Протестировать полный цикл

### Важно (следующая неделя):
- [ ] Создать `newsletter_jobs` таблицу
- [ ] Написать worker для фоновой отправки
- [ ] Добавить `newsletter_logs` для аналитики
- [ ] Dashboard с метриками

### Улучшения:
- [ ] Preview письма перед отправкой
- [ ] Tracking opens/clicks
- [ ] Шаблоны писем
- [ ] Сегментация по тегам
