export default async function TestProjectPage() {
  return (
    <div className="max-w-4xl mx-auto p-8">
      <h1 className="text-3xl font-bold mb-6">Тестовая страница проекта</h1>
      <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4">
        ✅ Роутинг /projects/test работает!
      </div>
      <p>Если вы видите эту страницу, значит роутинг проектов настроен правильно.</p>
      <p className="mt-4">
        <a href="/projects" className="text-blue-600 underline">← Назад к списку проектов</a>
      </p>
    </div>
  );
}