#!/bin/bash
# Скрипт для применения SQL миграций к Supabase через PostgREST/psql

set -e

echo "=== Применение миграции create_tag_functions.sql ==="
echo ""
echo "ВАЖНО: Эту миграцию нужно выполнить в Supabase Dashboard:"
echo "1. Откройте https://supabase.com/dashboard"
echo "2. Выберите проект merkurov.love"
echo "3. Перейдите в SQL Editor"
echo "4. Скопируйте содержимое файла sql/create_tag_functions.sql"
echo "5. Вставьте в редактор и нажмите RUN"
echo ""
echo "Или используйте psql напрямую:"
echo "psql 'postgresql://postgres:[YOUR-PASSWORD]@[YOUR-PROJECT-REF].supabase.co:5432/postgres' -f sql/create_tag_functions.sql"
echo ""
echo "Файл миграции находится здесь:"
echo "$(pwd)/sql/create_tag_functions.sql"
