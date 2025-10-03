#!/bin/bash

# 🚀 VERCEL DEPLOYMENT MIGRATION SCRIPT
# Автоматический запуск миграций при деплое на Vercel

set -e  # Останавливаемся при любой ошибке

echo "🚀 НАЧИНАЕМ DEPLOYMENT МИГРАЦИЙ"
echo "================================"

# Проверяем, что мы в production окружении
if [ "$VERCEL_ENV" = "production" ]; then
    echo "🎯 Production deployment обнаружен"
    
    # Проверяем наличие DATABASE_URL
    if [ -z "$DATABASE_URL" ]; then
        echo "❌ ОШИБКА: DATABASE_URL не задан"
        exit 1
    fi
    
    echo "📊 Проверяем статус миграций..."
    
    # Запускаем миграции с таймаутом
    timeout 60s npx prisma migrate deploy || {
        echo "❌ ОШИБКА: Не удалось применить миграции за 60 секунд"
        echo "🔄 Проверьте состояние базы данных вручную"
        exit 1
    }
    
    echo "✅ Миграции применены успешно"
    
    # Генерируем Prisma Client
    echo "🔧 Генерируем Prisma Client..."
    npx prisma generate
    
    echo "✅ Prisma Client сгенерирован"
    
elif [ "$VERCEL_ENV" = "preview" ]; then
    echo "🔍 Preview deployment - пропускаем миграции"
    
    # Только генерируем клиент для preview
    echo "🔧 Генерируем Prisma Client для preview..."
    npx prisma generate
    
else
    echo "🔧 Development deployment - только генерация клиента"
    npx prisma generate
fi

echo "🎉 DEPLOYMENT МИГРАЦИЙ ЗАВЕРШЁН УСПЕШНО!"