#!/usr/bin/env python3
import sys

# Read the file
with open('/workspaces/newlove/app/api/admin/parse-url/route.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace smart quotes with regular quotes
content = content.replace(''', "'")
content = content.replace(''', "'")
content = content.replace('"', '"')
content = content.replace('"', '"')

# Write back
with open('/workspaces/newlove/app/api/admin/parse-url/route.ts', 'w', encoding='utf-8') as f:
    f.write(content)

print("Smart quotes replaced successfully")