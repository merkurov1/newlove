# 🚀 Настройка Environment Variables в Vercel

## 📝 Инструкция

### 1. Открыть Vercel Dashboard

```
https://vercel.com/merkurov1/newlove/settings/environment-variables
```

### 2. Добавить переменные

Для каждой переменной ниже:

1. Нажать **"Add New"**
2. Ввести **Key** (имя переменной)
3. Ввести **Value** (значение)
4. Выбрать **Environment**: Production, Preview, Development (все три)
5. Нажать **"Save"**

---

## 🔑 Переменные для добавления

### RESEND_API_KEY

```
Key: RESEND_API_KEY
Value: re_dEqvvLFs_NqnWPygBdLHKL8WjLG9htyBu
Environments: ✓ Production ✓ Preview ✓ Development
```

**Назначение:** API ключ для отправки email через Resend

---

### NOREPLY_EMAIL

```
Key: NOREPLY_EMAIL
Value: noreply@merkurov.love
Environments: ✓ Production ✓ Preview ✓ Development
```

**Назначение:** Email адрес отправителя (From)

---

### NOREPLY_DISPLAY

```
Key: NOREPLY_DISPLAY
Value: Anton Merkurov
Environments: ✓ Production ✓ Preview ✓ Development
```

**Назначение:** Отображаемое имя отправителя

---

### NEWSLETTER_SEND_LIMIT

```
Key: NEWSLETTER_SEND_LIMIT
Value: 100
Environments: ✓ Production ✓ Preview ✓ Development
```

**Назначение:** Максимальное количество подписчиков для одной отправки

---

## ✅ После добавления

### 1. Redeploy Production

После добавления всех переменных, необходимо сделать redeploy:

```
Settings → Deployments → Latest Production → "..." → Redeploy
```

### 2. Проверить переменные

Зайти в последний deployment и проверить логи:

```
Deployments → Latest → Function Logs
```

Искать строки:

- `subscribeToNewsletter env`
- `hasServiceRole`
- `RESEND_API_KEY not configured` (не должно быть)

---

## 🧪 Тестирование после деплоя

### 1. Тест подписки

```bash
# Открыть сайт
https://merkurov.love

# Подписаться на рассылку
# Проверить почту — должно прийти "Подтвердите подписку"
```

### 2. Тест отправки письма (только для админов)

```bash
# Зайти в админку
https://merkurov.love/admin/letters

# Создать тестовое письмо
# Отправить на тестовый email
# Проверить delivery в Resend Dashboard
```

### 3. Проверить Resend Dashboard

```
https://resend.com/emails

# Должны появиться отправленные письма
# Status: "Delivered"
```

---

## 🐛 Troubleshooting

### Письма не отправляются

1. Проверить логи Vercel: `Functions → Logs`
2. Искать ошибки: `"Failed to send"`
3. Проверить Resend Dashboard → API Keys (активен ли ключ)

### "RESEND_API_KEY not configured"

1. Убедиться что переменная добавлена в Production
2. Сделать redeploy
3. Проверить заново

### Письма уходят в спам

1. Настроить SPF record для домена:
   ```
   TXT @ "v=spf1 include:_spf.resend.com ~all"
   ```
2. Настроить DKIM в Resend Dashboard
3. Добавить домен в Resend: https://resend.com/domains

---

## 📊 Мониторинг

После настройки следить за:

- Resend Dashboard → Emails (delivery rate)
- Vercel Analytics → API Routes (/api/newsletter-\*)
- Supabase → Table Editor → subscribers (рост подписчиков)

---

## ⏭️ Следующие шаги

После успешного тестирования:

- [ ] Запустить миграции для newsletter_jobs
- [ ] Создать worker для фоновой обработки
- [ ] Добавить аналитику (opens/clicks)
