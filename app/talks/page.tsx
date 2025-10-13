import TalksClientPage from './TalksClientPage';

export const metadata = {
  title: 'Talks | Закрытое общение',
  description: 'Закрытый раздел для зарегистрированных пользователей',
};

export default function TalksPage() {
  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Talks</h1>
        <p className="text-gray-600 mt-2">Закрытое общение для зарегистрированных пользователей</p>
      </div>
      <TalksClientPage />
    </div>
  );
}
