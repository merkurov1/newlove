# 🎯 QUICK MIGRATION CHEATSHEET

## ⚡ Most Common Commands

```bash
# Check everything is OK
npm run db:status && npm run db:validate

# Add new feature with migration
npm run db:workflow add_user_avatar

# Emergency backup
npm run db:backup

# Check what changed
npm run db:status
```

## 🚨 Emergency Commands

```bash
# If migration hangs - press Ctrl+C, then:
npm run db:status     # Check state
npm run db:backup     # Create backup
npm run db:deploy     # Try again

# If schema is broken:
npm run db:validate   # See errors
npm run db:generate   # Regenerate client
```

## 🛡️ Safety Rules

1. **Always backup** before major changes
2. **Test locally** before production
3. **Use descriptive names** for migrations
4. **Check SQL files** before applying
5. **Monitor Vercel logs** after deploy

## 📞 Help
Need help? Run: `npm run db:help`

---
*Part of Bulletproof Migration System* 🛡️