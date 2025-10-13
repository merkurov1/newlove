
// lib/authOptions.ts

// Minimal, idempotent stub used during the migration to Supabase.
// Intentionally avoids importing NextAuth/Prisma to keep the build green.

const authOptions: Record<string, unknown> = {};

export { authOptions };
export default authOptions;

