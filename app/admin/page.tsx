import Link from 'next/link';

async function getStats() {
  try {
    const prisma = (await import('@/lib/prisma')).default;
    
    const [
      usersCount,
      articlesCount,
      projectsCount,
      lettersCount,
      subscribersCount,
      messagesCount,
      publishedArticlesCount,
      draftArticlesCount,
      publishedProjectsCount,
      totalTagsCount,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.article.count(),
      prisma.project.count(),
      prisma.letter.count(),
      prisma.subscriber.count(),
      prisma.message.count(),
      prisma.article.count({ where: { published: true } }),
      prisma.article.count({ where: { published: false } }),
      prisma.project.count({ where: { published: true } }),
      prisma.tag.count(),
    ]);

    // Получить недавние статьи и проекты
    const [recentArticles, recentProjects, recentUsers] = await Promise.all([
      prisma.article.findMany({
        take: 3,
        orderBy: { createdAt: 'desc' },
        select: { id: true, title: true, slug: true, createdAt: true, published: true }
      }),
      prisma.project.findMany({
        take: 3,
        orderBy: { createdAt: 'desc' },
        select: { id: true, title: true, slug: true, createdAt: true, published: true }
      }),
      prisma.user.findMany({
        take: 3,
        orderBy: { id: 'desc' },
        select: { id: true, name: true, email: true, role: true }
      })
    ]);

    return {
      counts: {
        users: usersCount,
        articles: articlesCount,
        projects: projectsCount,
        letters: lettersCount,
        subscribers: subscribersCount,
        messages: messagesCount,
        publishedArticles: publishedArticlesCount,
        draftArticles: draftArticlesCount,
        publishedProjects: publishedProjectsCount,
        totalTags: totalTagsCount,
      },
      recent: {
        articles: recentArticles,
        projects: recentProjects,
        users: recentUsers,
      }
    };
  } catch (error) {
    console.error('Error fetching stats:', error);
    // Возвращаем пустые данные вместо моковых
    return {
      counts: {
        users: 0,
        articles: 0,
        projects: 0,
        letters: 0,
        subscribers: 0,
        messages: 0,
        publishedArticles: 0,
        draftArticles: 0,
        publishedProjects: 0,
        totalTags: 0,
      },
      recent: {
        articles: [],
        projects: [],
        users: [],
      }
    };
  }
}

const StatCard = ({ icon, title, count, color, href }: {
  icon: string;
  title: string;
  count: number;
  color: string;
  href: string;
}) => (
  <Link href={href} className={`block p-6 rounded-lg shadow-md hover:shadow-lg transition-all duration-200 ${color} group`}>
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium opacity-80">{title}</p>
        <p className="text-3xl font-bold mt-1">{count}</p>
      </div>
      <div className="text-4xl opacity-60 group-hover:opacity-80 transition-opacity">
        {icon}
      </div>
    </div>
  </Link>
);

export default async function AdminDashboard() {
  const stats = await getStats();
  const { counts, recent } = stats;

  return (
    <div className="space-y-10 pb-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-2 md:gap-6 mb-2">
        <div>
          <h1 className="text-4xl font-extrabold text-blue-800 tracking-tight mb-1">Админ-панель</h1>
          <p className="text-gray-500 text-base">Добро пожаловать! Здесь — вся статистика и быстрые действия.</p>
        </div>
        <div className="flex flex-wrap gap-2 mt-2 md:mt-0">
          <Link href="/admin/articles/new" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white font-semibold shadow hover:bg-blue-700 transition-all">
            ✍️ Новая статья
          </Link>
          <Link href="/admin/projects/new" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-600 text-white font-semibold shadow hover:bg-purple-700 transition-all">
            🚀 Новый проект
          </Link>
          <Link href="/admin/letters/new" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-yellow-500 text-white font-semibold shadow hover:bg-yellow-600 transition-all">
            💌 Новое письмо
          </Link>
          <Link href="/admin/postcards" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-orange-500 text-white font-semibold shadow hover:bg-orange-600 transition-all">
            🖼️ Открытки
          </Link>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 md:gap-6">
        <StatCard icon="📄" title="Статьи" count={counts.articles} color="bg-blue-50 text-blue-900 hover:bg-blue-100" href="/admin/articles" />
        <StatCard icon="🚀" title="Проекты" count={counts.projects} color="bg-purple-50 text-purple-900 hover:bg-purple-100" href="/admin/projects" />
        <StatCard icon="💌" title="Письма" count={counts.letters} color="bg-yellow-50 text-yellow-900 hover:bg-yellow-100" href="/admin/letters" />
        <StatCard icon="🖼️" title="Открытки" count={0} color="bg-orange-50 text-orange-900 hover:bg-orange-100" href="/admin/postcards" />
        <StatCard icon="👥" title="Пользователи" count={counts.users} color="bg-green-50 text-green-900 hover:bg-green-100" href="/admin/users" />
        <StatCard icon="📧" title="Подписчики" count={counts.subscribers} color="bg-red-50 text-red-900 hover:bg-red-100" href="/admin/subscribers" />
      </div>

      {/* Extended Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl border shadow-sm flex flex-col items-center">
          <div className="text-sm text-gray-500 mb-1">Опубликовано статей</div>
          <div className="text-3xl font-extrabold text-green-600">{counts.publishedArticles}</div>
          <div className="text-xs text-gray-400">из {counts.articles} всего</div>
        </div>
        <div className="bg-white p-5 rounded-xl border shadow-sm flex flex-col items-center">
          <div className="text-sm text-gray-500 mb-1">Черновики статей</div>
          <div className="text-3xl font-extrabold text-yellow-600">{counts.draftArticles}</div>
          <div className="text-xs text-gray-400">не опубликованы</div>
        </div>
        <div className="bg-white p-5 rounded-xl border shadow-sm flex flex-col items-center">
          <div className="text-sm text-gray-500 mb-1">Опубл. проекты</div>
          <div className="text-3xl font-extrabold text-purple-600">{counts.publishedProjects}</div>
          <div className="text-xs text-gray-400">из {counts.projects} всего</div>
        </div>
        <div className="bg-white p-5 rounded-xl border shadow-sm flex flex-col items-center">
          <div className="text-sm text-gray-500 mb-1">Всего тегов</div>
          <div className="text-3xl font-extrabold text-blue-600">{counts.totalTags}</div>
          <div className="text-xs text-gray-400">для организации</div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-8">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-3">Последние статьи</h3>
          <div className="space-y-2">
            {recent.articles.length > 0 ? (
              recent.articles.map((article) => (
                <Link key={article.id} href={`/admin/articles/${article.id}`} className="block p-3 rounded-xl hover:bg-blue-50 transition-colors border border-blue-100">
                  <div className="flex justify-between items-start">
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-gray-900 truncate">{article.title}</h4>
                      <p className="text-xs text-gray-400 mt-1">
                        {new Date(article.createdAt).toLocaleDateString('ru-RU')}
                      </p>
                    </div>
                    <span className="text-xs bg-blue-100 px-2 py-1 rounded-full ml-2 flex-shrink-0">
                      {article.published ? '✅ Published' : '📝 Draft'}
                    </span>
                  </div>
                </Link>
              ))
            ) : (
              <p className="text-gray-400 text-sm py-4 text-center">Статей пока нет</p>
            )}
          </div>
        </div>
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-3">Последние проекты</h3>
          <div className="space-y-2">
            {recent.projects.length > 0 ? (
              recent.projects.map((project) => (
                <Link key={project.id} href={`/admin/projects/${project.id}`} className="block p-3 rounded-xl hover:bg-purple-50 transition-colors border border-purple-100">
                  <div className="flex justify-between items-start">
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-gray-900 truncate">{project.title}</h4>
                      <p className="text-xs text-gray-400 mt-1">
                        {new Date(project.createdAt).toLocaleDateString('ru-RU')}
                      </p>
                    </div>
                    <span className="text-xs bg-purple-100 px-2 py-1 rounded-full ml-2 flex-shrink-0">
                      {project.published ? '✅ Published' : '📝 Draft'}
                    </span>
                  </div>
                </Link>
              ))
            ) : (
              <p className="text-gray-400 text-sm py-4 text-center">Проектов пока нет</p>
            )}
          </div>
        </div>
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-3">Новые пользователи</h3>
          <div className="space-y-2">
            {recent.users.length > 0 ? (
              recent.users.map((user) => (
                <Link key={user.id} href="/admin/users" className="block p-3 rounded-xl hover:bg-green-50 transition-colors border border-green-100">
                  <div className="flex justify-between items-start">
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-gray-900 truncate">{user.name || user.email}</h4>
                      <p className="text-sm text-gray-500 truncate">{user.email}</p>
                    </div>
                    <span className="text-xs bg-green-100 px-2 py-1 rounded-full ml-2 flex-shrink-0">
                      {user.role === 'ADMIN' ? '👑 Admin' : '👤 User'}
                    </span>
                  </div>
                </Link>
              ))
            ) : (
              <p className="text-gray-400 text-sm py-4 text-center">Пользователей пока нет</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}