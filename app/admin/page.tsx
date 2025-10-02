import Link from 'next/link';

async function getStats() {
  try {
    const prisma = (await import('@/lib/prisma')).default;
    
    const [
      usersCount,
      articlesCount,
      projectsCount,
      productsCount,
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
      prisma.product.count(),
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
        products: productsCount,
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
    // Возвращаем моковые данные для демо-версии
    return {
      counts: {
        users: 156,
        articles: 47,
        projects: 23,
        products: 12,
        letters: 8,
        subscribers: 1240,
        messages: 389,
        publishedArticles: 42,
        draftArticles: 5,
        publishedProjects: 19,
        totalTags: 28,
      },
      recent: {
        articles: [
          { id: 1, title: 'Как выбрать идеальный стек технологий', slug: 'tech-stack-guide', createdAt: new Date('2024-01-15'), published: true },
          { id: 2, title: 'Будущее веб-разработки в 2024', slug: 'web-dev-future', createdAt: new Date('2024-01-10'), published: true },
          { id: 3, title: 'Черновик статьи про AI', slug: 'ai-draft', createdAt: new Date('2024-01-08'), published: false },
        ],
        projects: [
          { id: 1, title: 'Персональный сайт-портфолио', slug: 'portfolio-site', createdAt: new Date('2024-01-12'), published: true },
          { id: 2, title: 'SaaS платформа для стартапов', slug: 'saas-platform', createdAt: new Date('2024-01-05'), published: true },
          { id: 3, title: 'Мобильное приложение', slug: 'mobile-app', createdAt: new Date('2024-01-03'), published: false },
        ],
        users: [
          { id: 1, name: 'Анна Петрова', email: 'anna@example.com', role: 'USER' },
          { id: 2, name: 'Михаил Иванов', email: 'mikhail@example.com', role: 'USER' },
          { id: 3, name: 'Елена Козлова', email: 'elena@example.com', role: 'ADMIN' },
        ],
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
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Панель управления</h1>
        <p className="text-gray-600 mt-1">Добро пожаловать в админ панель. Обзор вашего контента.</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <StatCard
          icon="📄"
          title="Статьи"
          count={counts.articles}
          color="bg-blue-50 text-blue-900 hover:bg-blue-100"
          href="/admin/articles"
        />
        <StatCard
          icon="🚀"
          title="Проекты"
          count={counts.projects}
          color="bg-purple-50 text-purple-900 hover:bg-purple-100"
          href="/admin/projects"
        />
        <StatCard
          icon="�️"
          title="Товары"
          count={counts.products}
          color="bg-orange-50 text-orange-900 hover:bg-orange-100"
          href="/admin/products"
        />
        <StatCard
          icon="�👥"
          title="Пользователи"
          count={counts.users}
          color="bg-green-50 text-green-900 hover:bg-green-100"
          href="/admin/users"
        />
        <StatCard
          icon="💌"
          title="Письма"
          count={counts.letters}
          color="bg-yellow-50 text-yellow-900 hover:bg-yellow-100"
          href="/admin/letters"
        />
        <StatCard
          icon="📧"
          title="Подписчики"
          count={counts.subscribers}
          color="bg-red-50 text-red-900 hover:bg-red-100"
          href="/admin/subscribers"
        />
        <StatCard
          icon="💬"
          title="Сообщения"
          count={counts.messages}
          color="bg-indigo-50 text-indigo-900 hover:bg-indigo-100"
          href="/admin/orders"
        />
      </div>

      {/* Extended Stats */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Детальная статистика</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-lg border shadow-sm">
            <div className="text-sm text-gray-600">Опубликованные статьи</div>
            <div className="text-2xl font-bold text-green-600">{counts.publishedArticles}</div>
            <div className="text-xs text-gray-500">из {counts.articles} всего</div>
          </div>
          <div className="bg-white p-4 rounded-lg border shadow-sm">
            <div className="text-sm text-gray-600">Черновики статей</div>
            <div className="text-2xl font-bold text-yellow-600">{counts.draftArticles}</div>
            <div className="text-xs text-gray-500">не опубликованы</div>
          </div>
          <div className="bg-white p-4 rounded-lg border shadow-sm">
            <div className="text-sm text-gray-600">Опубл. проекты</div>
            <div className="text-2xl font-bold text-purple-600">{counts.publishedProjects}</div>
            <div className="text-xs text-gray-500">из {counts.projects} всего</div>
          </div>
          <div className="bg-white p-4 rounded-lg border shadow-sm">
            <div className="text-sm text-gray-600">Всего тегов</div>
            <div className="text-2xl font-bold text-blue-600">{counts.totalTags}</div>
            <div className="text-xs text-gray-500">для организации</div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Быстрые действия</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Link href="/admin/articles/new" className="block p-4 rounded-lg border-2 border-dashed border-blue-300 hover:bg-blue-50 hover:border-solid transition-all duration-200 group">
            <div className="text-center">
              <div className="text-3xl mb-2 opacity-60 group-hover:opacity-80">✍️</div>
              <h3 className="font-semibold text-gray-800">Новая статья</h3>
              <p className="text-sm text-gray-600 mt-1">Создать статью</p>
            </div>
          </Link>
          <Link href="/admin/projects/new" className="block p-4 rounded-lg border-2 border-dashed border-purple-300 hover:bg-purple-50 hover:border-solid transition-all duration-200 group">
            <div className="text-center">
              <div className="text-3xl mb-2 opacity-60 group-hover:opacity-80">🚀</div>
              <h3 className="font-semibold text-gray-800">Новый проект</h3>
              <p className="text-sm text-gray-600 mt-1">Добавить проект</p>
            </div>
          </Link>
          <Link href="/admin/products" className="block p-4 rounded-lg border-2 border-dashed border-orange-300 hover:bg-orange-50 hover:border-solid transition-all duration-200 group">
            <div className="text-center">
              <div className="text-3xl mb-2 opacity-60 group-hover:opacity-80">🛍️</div>
              <h3 className="font-semibold text-gray-800">Новый товар</h3>
              <p className="text-sm text-gray-600 mt-1">Управление товарами</p>
            </div>
          </Link>
          <Link href="/admin/letters/new" className="block p-4 rounded-lg border-2 border-dashed border-yellow-300 hover:bg-yellow-50 hover:border-solid transition-all duration-200 group">
            <div className="text-center">
              <div className="text-3xl mb-2 opacity-60 group-hover:opacity-80">💌</div>
              <h3 className="font-semibold text-gray-800">Новое письмо</h3>
              <p className="text-sm text-gray-600 mt-1">Написать письмо</p>
            </div>
          </Link>
          <Link href="/admin/media" className="block p-4 rounded-lg border-2 border-dashed border-green-300 hover:bg-green-50 hover:border-solid transition-all duration-200 group">
            <div className="text-center">
              <div className="text-3xl mb-2 opacity-60 group-hover:opacity-80">🖼️</div>
              <h3 className="font-semibold text-gray-800">Медиафайлы</h3>
              <p className="text-sm text-gray-600 mt-1">Управление файлами</p>
            </div>
          </Link>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-3">Последние статьи</h3>
          <div className="space-y-2">
            {recent.articles.length > 0 ? (
              recent.articles.map((article) => (
                <Link key={article.id} href={`/admin/articles/${article.id}`} className="block p-3 rounded-lg hover:bg-gray-50 transition-colors border">
                  <div className="flex justify-between items-start">
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-gray-900 truncate">{article.title}</h4>
                      <p className="text-xs text-gray-400 mt-1">
                        {new Date(article.createdAt).toLocaleDateString('ru-RU')}
                      </p>
                    </div>
                    <span className="text-xs bg-gray-100 px-2 py-1 rounded-full ml-2 flex-shrink-0">
                      {article.published ? '✅ Published' : '📝 Draft'}
                    </span>
                  </div>
                </Link>
              ))
            ) : (
              <p className="text-gray-500 text-sm py-4 text-center">Статей пока нет</p>
            )}
          </div>
        </div>

        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-3">Последние проекты</h3>
          <div className="space-y-2">
            {recent.projects.length > 0 ? (
              recent.projects.map((project) => (
                <Link key={project.id} href={`/admin/projects/${project.id}`} className="block p-3 rounded-lg hover:bg-gray-50 transition-colors border">
                  <div className="flex justify-between items-start">
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-gray-900 truncate">{project.title}</h4>
                      <p className="text-xs text-gray-400 mt-1">
                        {new Date(project.createdAt).toLocaleDateString('ru-RU')}
                      </p>
                    </div>
                    <span className="text-xs bg-gray-100 px-2 py-1 rounded-full ml-2 flex-shrink-0">
                      {project.published ? '✅ Published' : '📝 Draft'}
                    </span>
                  </div>
                </Link>
              ))
            ) : (
              <p className="text-gray-500 text-sm py-4 text-center">Проектов пока нет</p>
            )}
          </div>
        </div>

        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-3">Новые пользователи</h3>
          <div className="space-y-2">
            {recent.users.length > 0 ? (
              recent.users.map((user) => (
                <Link key={user.id} href="/admin/users" className="block p-3 rounded-lg hover:bg-gray-50 transition-colors border">
                  <div className="flex justify-between items-start">
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-gray-900 truncate">{user.name || user.email}</h4>
                      <p className="text-sm text-gray-500 truncate">{user.email}</p>
                    </div>
                    <span className="text-xs bg-gray-100 px-2 py-1 rounded-full ml-2 flex-shrink-0">
                      {user.role === 'ADMIN' ? '👑 Admin' : '👤 User'}
                    </span>
                  </div>
                </Link>
              ))
            ) : (
              <p className="text-gray-500 text-sm py-4 text-center">Пользователей пока нет</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
