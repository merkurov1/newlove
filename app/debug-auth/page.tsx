// Minimal debug-auth page during migration.
// next-auth/react usage removed to avoid TS errors; implement Supabase client checks later.
export default function DebugAuthPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">🔍 Debug Auth (migration stub)</h1>
      <p className="text-gray-600">Auth stack is being migrated to Supabase/Onboard. Implement session debug UI using Supabase client.</p>
    </div>
  );
}