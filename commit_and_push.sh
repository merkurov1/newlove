#!/bin/bash

# Check git status first
echo "Checking git status..."
git status

# Add all changes
echo "Adding all changes to staging..."
git add .

# Commit with message
echo "Creating commit..."
git commit -m "Fix Russian error messages and setup book reader

- Translate all error.tsx messages from Russian to English  
- Fix /unframed/book/ route to display errors in English
- Copy Unframed.markdown to public directory for proper book reading
- Clean up markdown formatting consistency
- Now book reader displays properly without Russian error messages"

# Push to remote
echo "Pushing to origin main..."
git push origin main

echo "Done!"