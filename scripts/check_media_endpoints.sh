#!/usr/bin/env bash
# Простой набор curl-команд для проверки API медиа
# Использование:
#   chmod +x scripts/check_media_endpoints.sh
#   ./scripts/check_media_endpoints.sh http://localhost:3000

BASE_URL=${1:-http://localhost:3000}

echo "GET $BASE_URL/api/media"
curl -sS "$BASE_URL/api/media" | jq || curl -sS "$BASE_URL/api/media"

echo
echo "Пример загрузки файла (раскомментируйте и замените path/to/file):"
echo "curl -v -F \"files=@path/to/file\" $BASE_URL/api/media/upload"

echo
echo "Пример удаления файла (POST/DELETE с JSON). ВНИМАНИЕ: удалит файл на сервере, используйте осторожно:"
echo "curl -v -X DELETE -H \"Content-Type: application/json\" -d '{\"fileName\":\"имя_файла.jpg\"}' $BASE_URL/api/media/delete"

exit 0
