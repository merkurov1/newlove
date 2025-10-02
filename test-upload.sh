#!/bin/bash
echo "Testing image upload API..."

# Create a small test image (1x1 pixel PNG)
echo "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChAI9jU7tCwAAAABJRU5ErkJggg==" | base64 -d > /tmp/test.png

# Test the API endpoint
echo "Sending POST request to /api/upload/editor-image..."
curl -X POST http://localhost:3001/api/upload/editor-image \
  -F "image=@/tmp/test.png" \
  -H "Content-Type: multipart/form-data" \
  -v 2>&1 | head -20

# Clean up
rm -f /tmp/test.png

echo "Test completed."