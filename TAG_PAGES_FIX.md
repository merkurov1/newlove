# Исправление страниц тегов

## Проблема
Страницы тегов (например, `/tags/Auction`) не отображают статьи - пусто.

## Причина
В базе данных отсутствуют RPC функции `get_articles_by_tag` и `get_tag_by_slug`, которые используются в коде.

## Решение

### 1. Применить SQL миграцию
Необходимо выполнить SQL из файла `sql/create_tag_functions.sql` в Supabase:

**Вариант A: Через Supabase Dashboard**
1. Откройте https://supabase.com/dashboard
2. Выберите проект merkurov.love
3. Перейдите в SQL Editor
4. Скопируйте содержимое `sql/create_tag_functions.sql`
5. Вставьте и нажмите **RUN**

**Вариант B: Через psql**
```bash
psql 'postgresql://postgres:[PASSWORD]@[PROJECT-REF].supabase.co:5432/postgres' \
  -f sql/create_tag_functions.sql
```

### 2. Что создается
Миграция создает 3 RPC функции:
- `get_tag_by_slug(tag_slug TEXT)` - поиск тега по slug
- `get_articles_by_tag(tag_slug TEXT, limit INT)` - получение статей по тегу
- `get_articles_by_tag_slug(tag_slug TEXT, limit INT)` - алиас для обратной совместимости

### 3. Резервный механизм
Код в `lib/tagHelpers.ts` обновлен с дополнительными fallback-механизмами:
- Пробует несколько имен таблиц: `articles`, `Article`, `article`
- Пробует прямой запрос к junction-таблице `_ArticleToTag` если RPC недоступен
- Толерантен к различным схемам данных

### 4. Проверка
После применения миграции проверьте:
```bash
curl https://www.merkurov.love/tags/Auction
```

Страница должна показать статьи с тегом "Auction".

## Файлы изменены
- `lib/tagHelpers.ts` - добавлен fallback для разных имен таблиц
- `sql/create_tag_functions.sql` - новый файл с SQL миграцией
- `scripts/apply-tag-migration.sh` - helper-скрипт с инструкциями

## Коммиты
- Локальные изменения готовы к коммиту
