import PasskeyAuth from '@/components/PasskeyAuth';

export default function DebugAuthPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">🔍 Debug Auth</h1>
      <PasskeyAuth />
    </div>
  );
}
