# 🛡️ BULLETPROOF DATABASE MIGRATION SYSTEM

**Максимально надёжная система управления миграциями для проекта с Prisma + Supabase + Vercel**

## 🎯 Основные принципы

✅ **Безопасность данных** - автоматические бэкапы перед каждой операцией  
✅ **Стабильность** - таймауты и повторные попытки  
✅ **Автоматизация** - минимум ручного вмешательства  
✅ **Масштабируемость** - поддержка частых изменений  

---

## 🚀 Быстрый старт

### 1. Проверка текущего состояния
```bash
npm run db:status      # Статус миграций
npm run db:validate    # Валидация схемы
```

### 2. Создание новой миграции
```bash
npm run db:create add_user_bio    # Создать миграцию
npm run db:deploy                 # Применить миграции
```

### 3. Полный рабочий процесс
```bash
npm run db:workflow add_new_feature    # Полный цикл с новой миграцией
npm run db:workflow                    # Только применить существующие
```

---

## 📋 Все доступные команды

| Команда | Описание | Безопасность |
|---------|----------|--------------|
| `npm run db:status` | Проверить статус миграций | ✅ Только чтение |
| `npm run db:validate` | Валидировать схему Prisma | ✅ Только чтение |
| `npm run db:generate` | Сгенерировать Prisma Client | ✅ Безопасно |
| `npm run db:create <name>` | Создать новую миграцию | ⚠️ Создаёт файлы |
| `npm run db:deploy` | Применить миграции | 🔥 Изменяет БД |
| `npm run db:backup` | Создать бэкап | ✅ Только чтение |
| `npm run db:workflow [name]` | Полный процесс | 🔥 Изменяет БД |
| `npm run db:help` | Показать справку | ✅ Информация |

---

## 🔄 Рабочие процессы

### 🟢 Разработка (Development)

1. **Изменяем схему** в `prisma/schema.prisma`
2. **Создаём миграцию**:
   ```bash
   npm run db:create add_user_preferences
   ```
3. **Проверяем SQL файл** в `prisma/migrations/`
4. **Применяем локально**:
   ```bash
   npm run db:deploy
   ```

### 🔵 Деплой на Vercel (Production)

1. **Push в main** - автоматически запускается `vercel-build`
2. **Миграции применяются** автоматически через `npm run db:deploy`
3. **Rollback при ошибке** - проверить логи Vercel

### 🟡 Экстренные ситуации

#### Если миграция зависла:
```bash
# Прервите процесс (Ctrl+C)
npm run db:status     # Проверьте статус
npm run db:backup     # Создайте бэкап
npm run db:deploy     # Повторите применение
```

#### Если нужен откат:
```bash
# Откатите изменения в schema.prisma
git checkout HEAD~1 -- prisma/schema.prisma
npm run db:workflow   # Повторно примените состояние
```

---

## 🛡️ Система безопасности

### Автоматические бэкапы
- **Схема Prisma** сохраняется в `./backups/schema-backup-*.prisma`
- **SQL дамп** создаётся в `./backups/db-backup-*.sql` (если БД доступна)
- **Retention**: бэкапы хранятся 30 дней

### Валидация и проверки
- ✅ Схема валидируется перед каждой операцией
- ✅ Таймауты предотвращают зависание команд
- ✅ GitHub Actions проверяют PR автоматически

### Мониторинг
- 📊 Логи всех операций
- 🔔 Уведомления об ошибках через Sentry
- 📈 Метрики времени выполнения

---

## 🔧 Конфигурация

### Переменные окружения (.env.local)
```bash
DATABASE_URL="postgresql://user:pass@host:port/db"
NEXTAUTH_SECRET="your-secret"
SUPABASE_URL="https://your-project.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="your-service-key"
```

### Настройки таймаутов (.env.migration)
```bash
MIGRATION_TIMEOUT=30000          # 30 секунд на операцию
MIGRATION_DB_TIMEOUT=60000       # 60 секунд на БД операции
MIGRATION_MAX_RETRIES=3          # Максимум повторов
```

---

## 🚨 Troubleshooting

### Проблема: "Database connection timeout"
```bash
# Решение:
npm run db:status     # Проверить доступность БД
npm run db:validate   # Проверить схему локально
```

### Проблема: "Migration already applied"
```bash
# Решение:
npm run db:status     # Посмотреть статус
# Пропустить повторное применение
```

### Проблема: "Schema validation failed"
```bash
# Решение:
npm run db:validate   # Детали ошибки
# Исправить schema.prisma
npm run db:generate   # Пересоздать клиент
```

---

## 📚 Best Practices

### ✅ DO (Делайте)
- Всегда создавайте бэкап перед изменениями
- Проверяйте SQL файлы миграций
- Тестируйте миграции на staging
- Используйте описательные имена миграций
- Применяйте миграции в рабочее время

### ❌ DON'T (Не делайте)  
- Не редактируйте существующие миграции
- Не пропускайте валидацию схемы
- Не применяйте миграции без бэкапа
- Не используйте generic имена типа "update"
- Не запускайте миграции в 3 часа ночи

---

## 🎯 Расширенные сценарии

### Добавление нового поля (безопасно)
```sql
-- Хорошо: nullable поле
ALTER TABLE "User" ADD COLUMN "bio" TEXT;

-- Плохо: not null без default
ALTER TABLE "User" ADD COLUMN "required_field" TEXT NOT NULL;
```

### Удаление поля (опасно)
```sql
-- 1. Сначала сделайте поле nullable
ALTER TABLE "User" ALTER COLUMN "old_field" DROP NOT NULL;

-- 2. В следующей миграции удалите
ALTER TABLE "User" DROP COLUMN "old_field";
```

### Переименование таблицы (очень опасно)
```sql
-- 1. Создайте новую таблицу
CREATE TABLE "NewUsers" AS SELECT * FROM "User";

-- 2. Переключите приложение
-- 3. Удалите старую таблицу в следующей миграции
```

---

## 🚀 CI/CD Integration

### GitHub Actions
- Автоматическая валидация PR
- Создание бэкапов при push
- Проверка схемы на каждый коммит

### Vercel Deployment
- Автоматические миграции при деплое
- Fallback при неудаче
- Логирование всех операций

---

## 📞 Поддержка

Если возникли проблемы:

1. **Проверьте логи**: `npm run db:status`
2. **Создайте бэкап**: `npm run db:backup`  
3. **Проверьте схему**: `npm run db:validate`
4. **Обратитесь за помощью** с деталями ошибки

**Помните**: Лучше потратить 5 минут на проверку, чем 5 часов на восстановление данных! 🛡️