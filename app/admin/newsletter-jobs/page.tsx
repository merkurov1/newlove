import { getServerSupabaseClient, requireAdminFromRequest } from '@/lib/serverAuth';
import { cookies } from 'next/headers';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

async function getNewsletterJobs() {
  const supabase = getServerSupabaseClient({ useServiceRole: true });
  
  const { data: jobs, error } = await supabase
    .from('newsletter_jobs')
    .select(`
      *,
      letters (
        id,
        title,
        slug
      )
    `)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    console.error('Error fetching newsletter jobs:', error);
    return [];
  }

  return jobs || [];
}

export default async function NewsletterJobsPage() {
  // Verify admin
  try {
    const buildRequest = () => {
      const cookieHeader = cookies()
        .getAll()
        .map((c) => `${c.name}=${encodeURIComponent(c.value)}`)
        .join('; ');
      return new Request('http://localhost', { headers: { cookie: cookieHeader } });
    };
    await requireAdminFromRequest(buildRequest());
  } catch (error) {
    return (
      <div className="max-w-4xl mx-auto p-8">
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <p className="text-red-700">❌ Доступ запрещён. Только для администраторов.</p>
        </div>
      </div>
    );
  }

  const jobs = await getNewsletterJobs();

  const statusColors = {
    pending: 'bg-yellow-100 text-yellow-800 border-yellow-300',
    processing: 'bg-blue-100 text-blue-800 border-blue-300',
    completed: 'bg-green-100 text-green-800 border-green-300',
    failed: 'bg-red-100 text-red-800 border-red-300',
  };

  const statusIcons = {
    pending: '⏳',
    processing: '🔄',
    completed: '✅',
    failed: '❌',
  };

  return (
    <div className="max-w-7xl mx-auto p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">📊 Newsletter Jobs Monitor</h1>
        <p className="text-gray-600">Мониторинг отправки рассылок</p>
      </div>

      {jobs.length === 0 ? (
        <div className="bg-gray-50 border border-gray-200 rounded-md p-8 text-center">
          <p className="text-gray-600">Нет запланированных или выполненных рассылок</p>
          <Link
            href="/admin/letters"
            className="inline-block mt-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Создать письмо
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {jobs.map((job) => {
            const successRate = (job.sent_count + job.failed_count) > 0
              ? Math.round((job.sent_count / (job.sent_count + job.failed_count)) * 100)
              : 0;

            const progress = job.total_count > 0
              ? Math.round(((job.sent_count + job.failed_count) / job.total_count) * 100)
              : 0;

            return (
              <div
                key={job.id}
                className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span
                        className={`px-3 py-1 rounded-full text-sm font-medium border ${
                          statusColors[job.status] || statusColors.pending
                        }`}
                      >
                        {statusIcons[job.status]} {job.status}
                      </span>
                      <h3 className="text-lg font-semibold">
                        {job.letters?.title || 'Untitled Letter'}
                      </h3>
                    </div>
                    <div className="text-sm text-gray-600 space-y-1">
                      <div>Job ID: <code className="bg-gray-100 px-2 py-1 rounded">{job.id}</code></div>
                      {job.letters?.slug && (
                        <div>
                          Letter:{' '}
                          <Link
                            href={`/admin/letters/edit/${job.letter_id}`}
                            className="text-blue-600 hover:underline"
                          >
                            {job.letters.slug}
                          </Link>
                        </div>
                      )}
                      <div>Создано: {new Date(job.created_at).toLocaleString('ru-RU')}</div>
                      {job.started_at && (
                        <div>Начало: {new Date(job.started_at).toLocaleString('ru-RU')}</div>
                      )}
                      {job.completed_at && (
                        <div>Завершено: {new Date(job.completed_at).toLocaleString('ru-RU')}</div>
                      )}
                    </div>
                  </div>

                  {job.status !== 'pending' && (
                    <div className="text-right">
                      <div className="text-3xl font-bold text-gray-900">{progress}%</div>
                      <div className="text-xs text-gray-600">прогресс</div>
                    </div>
                  )}
                </div>

                {/* Progress Bar */}
                {job.status !== 'pending' && (
                  <div className="mb-4">
                    <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 ${
                          job.status === 'completed' ? 'bg-green-500' :
                          job.status === 'failed' ? 'bg-red-500' :
                          'bg-blue-500'
                        }`}
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Statistics */}
                <div className="grid grid-cols-4 gap-4">
                  <div className="text-center p-3 bg-gray-50 rounded-md">
                    <div className="text-2xl font-bold text-gray-900">{job.total_count || 0}</div>
                    <div className="text-xs text-gray-600">Всего</div>
                  </div>
                  <div className="text-center p-3 bg-green-50 rounded-md">
                    <div className="text-2xl font-bold text-green-600">{job.sent_count || 0}</div>
                    <div className="text-xs text-gray-600">Отправлено</div>
                  </div>
                  <div className="text-center p-3 bg-red-50 rounded-md">
                    <div className="text-2xl font-bold text-red-600">{job.failed_count || 0}</div>
                    <div className="text-xs text-gray-600">Ошибок</div>
                  </div>
                  <div className="text-center p-3 bg-blue-50 rounded-md">
                    <div className="text-2xl font-bold text-blue-600">{successRate}%</div>
                    <div className="text-xs text-gray-600">Success Rate</div>
                  </div>
                </div>

                {/* Error Message */}
                {job.error_message && (
                  <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md">
                    <p className="text-sm text-red-700">
                      <strong>Ошибка:</strong> {job.error_message}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Back Button */}
      <div className="mt-8">
        <Link
          href="/admin"
          className="inline-flex items-center gap-2 px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
        >
          ← Назад в админку
        </Link>
      </div>
    </div>
  );
}
