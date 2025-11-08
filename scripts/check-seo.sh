#!/bin/bash
# Проверка SEO для merkurov.love

echo "==================================="
echo "SEO Audit для merkurov.love"
echo "==================================="
echo ""

# 1. Проверка главной страницы
echo "1. Проверка главной страницы:"
echo "-----------------------------------"
curl -sL https://merkurov.love/ | grep -E "(<title>|<meta name=\"description\"|<h1>)" | head -5
echo ""

# 2. Проверка robots.txt
echo "2. Проверка robots.txt:"
echo "-----------------------------------"
curl -s https://merkurov.love/robots.txt | head -20
echo ""

# 3. Проверка sitemap.xml
echo "3. Проверка sitemap.xml:"
echo "-----------------------------------"
curl -s https://merkurov.love/sitemap.xml 2>&1 | head -30
echo ""

# 4. Проверка страницы статьи
echo "4. Проверка страницы статьи (как пример):"
echo "-----------------------------------"
curl -sL https://merkurov.love/articles 2>&1 | grep -E "(<title>|<h1>|<article)" | head -10
echo ""

# 5. Проверка что контент рендерится на сервере
echo "5. Проверка SSR (Server-Side Rendering):"
echo "-----------------------------------"
RESPONSE=$(curl -sL https://merkurov.love/)
if echo "$RESPONSE" | grep -q "Anton Merkurov"; then
  echo "✅ SSR работает - контент присутствует в HTML"
else
  echo "❌ SSR НЕ работает - контент отсутствует"
fi
echo ""

# 6. Проверка структурированных данных
echo "6. Проверка JSON-LD (структурированные данные):"
echo "-----------------------------------"
curl -sL https://merkurov.love/ | grep -A 20 'application/ld+json' | head -25
echo ""

# 7. Проверка Open Graph
echo "7. Проверка Open Graph метатегов:"
echo "-----------------------------------"
curl -sL https://merkurov.love/ | grep -E 'property="og:' | head -10
echo ""

echo "==================================="
echo "Audit завершен"
echo "==================================="
