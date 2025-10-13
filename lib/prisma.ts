// Minimal Prisma stub to satisfy imports during migration.
// This does NOT implement database access. Replace with the real Prisma
// client or Supabase queries as part of the migration.

const prisma: any = new Proxy({}, {
  get() {
    return () => { throw new Error('prisma client stub: replace with real client or remove dependency'); };
  }
});

export default prisma;
