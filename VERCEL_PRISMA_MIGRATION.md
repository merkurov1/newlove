# Vercel Post-Deployment Prisma Migration

To ensure your database schema is always up-to-date in production, Prisma migrations should be run automatically after each deployment on Vercel.

## How to set up

1. **Set the DATABASE_URL variable**
   - In your Vercel project settings, add the environment variable `DATABASE_URL` with your production database connection string.

2. **Configure Post-Deployment Command**
   - In Vercel, go to your project settings → "Deploy Hooks" or "Build & Development Settings".
   - Set the **"Post-Deployment Command"** to:
     
     ```sh
     npx prisma migrate deploy
     ```
   - This will apply all pending migrations to your production database after each deployment.

3. **Local Development**
   - Do not run `prisma migrate dev` locally unless you want to test migrations on your local database.
   - For local development, you can use `prisma generate` to update the Prisma client after pulling schema changes.

---

**Result:**
- Migrations are only applied in production (on Vercel), not during local development.
- Your production database schema will always match your latest Prisma schema.

For more details, see the [Prisma docs on Vercel deployment](https://www.prisma.io/docs/guides/deployment/deployment-guides/deploying-to-vercel).
