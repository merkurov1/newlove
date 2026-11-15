import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { unstable_noStore as noStore } from 'next/cache';

import { getCurrentUser } from '@/lib/serverAuth';
import { sanitizeMetadata } from '@/lib/metadataSanitize';
import {
  getQuestionDashboardRows,
  type QuestionDashboardRow,
} from '@/lib/question/dashboard';
import styles from './dashboard.module.css';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export const metadata: Metadata = sanitizeMetadata({
  title: 'Question — дашборд',
  robots: { index: false, follow: false },
});

const dateFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Moscow',
  timeZoneName: 'short',
});

function formatDate(value: string | null): string {
  if (!value) return '—';

  const time = Date.parse(value);
  return Number.isFinite(time) ? dateFormatter.format(new Date(time)) : '—';
}

function pluralAnswers(value: number): string {
  const mod10 = value % 10;
  const mod100 = value % 100;

  if (mod10 === 1 && mod100 !== 11) return `${value} ответ`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return `${value} ответа`;
  return `${value} ответов`;
}

function synthesisLabel(row: QuestionDashboardRow): { text: string; tone: string } {
  if (row.answerCount === 0) return { text: '—', tone: styles.muted };
  if (row.synthesis.status === 'error') return { text: 'Ошибка', tone: styles.bad };
  if (row.synthesis.status === 'running') return { text: 'Обновляется', tone: styles.pending };
  if (row.synthesis.status === 'queued') return { text: 'В очереди', tone: styles.pending };
  if (row.synthesis.version === 0) return { text: 'Нет синтеза', tone: styles.bad };
  if (row.synthesis.answerCount < row.answerCount) return { text: 'Устарел', tone: styles.pending };
  return { text: `Готов · v${row.synthesis.version}`, tone: styles.good };
}

function attentionLabel(row: QuestionDashboardRow): string {
  if (row.synthesis.status === 'error') return 'Ошибка синтеза';
  if (row.synthesis.version === 0) return 'Нет синтеза';
  if (row.synthesis.answerCount < row.answerCount) return 'Синтез устарел';
  return 'Нужно обновить';
}

export default async function QuestionDashboardPage() {
  noStore();

  const user = await getCurrentUser();

  if (!user) {
    redirect(`/login?next=${encodeURIComponent('/question/dashboard')}`);
  }

  if (user.role !== 'ADMIN') {
    redirect('/403');
  }

  const rows = await getQuestionDashboardRows();
  const active = rows.filter((row) => row.status === 'active');
  const answeredActive = active.filter((row) => row.answerCount > 0);
  const unanswered = active.filter((row) => row.answerCount === 0);
  const ready = active.filter((row) => row.synthesis.version > 0);
  const pending = active.filter(
    (row) => row.answerCount > 0 && row.synthesis.version === 0
  );
  const outdated = active.filter(
    (row) =>
      row.answerCount > 0 &&
      row.synthesis.version > 0 &&
      row.synthesis.answerCount < row.answerCount
  );
  const failed = active.filter((row) => row.synthesis.status === 'error');

  const attentionIds = new Set(
    [...pending, ...outdated, ...failed].map((row) => row.id)
  );
  const attention = rows.filter((row) => attentionIds.has(row.id));

  const totalAnswers = rows.reduce((total, row) => total + row.answerCount, 0);
  const maxAnswers = Math.max(1, ...active.map((row) => row.answerCount));

  const popular = [...answeredActive]
    .sort((a, b) => {
      if (b.answerCount !== a.answerCount) return b.answerCount - a.answerCount;
      return String(b.lastAnswerAt || '').localeCompare(String(a.lastAnswerAt || ''));
    })
    .slice(0, 5);

  const unpopular = [...active]
    .sort((a, b) => {
      if (a.answerCount !== b.answerCount) return a.answerCount - b.answerCount;
      return a.text.localeCompare(b.text, 'ru');
    })
    .slice(0, 5);

  return (
    <main className={styles.page}>
      <div className={styles.inner}>
        <header className={styles.topbar}>
          <div>
            <span className={styles.kicker}>Question</span>
            <h1 className={styles.title}>Дашборд</h1>
          </div>
          <div className={styles.actions}>
            <span className={styles.owner}>Только для владельца</span>
            <Link href="/question" className={styles.backLink}>
              К вопросу
            </Link>
          </div>
        </header>

        <p className={styles.lead}>
          Сводка по вопросам, ответам и синтезу Пьеро. Тексты человеческих ответов здесь не
          показываются — только агрегаты.
        </p>

        <section className={styles.metrics} aria-label="Общие показатели">
          <div className={styles.metric}>
            <span className={styles.metricLabel}>Всего ответов</span>
            <span className={styles.metricValue}>{totalAnswers}</span>
            <span className={styles.metricNote}>по всем вопросам</span>
          </div>
          <div className={styles.metric}>
            <span className={styles.metricLabel}>Вопросов с ответами</span>
            <span className={styles.metricValue}>
              {answeredActive.length}
              <span className={styles.metricSuffix}> / {active.length}</span>
            </span>
            <span className={styles.metricNote}>активный банк</span>
          </div>
          <div className={styles.metric}>
            <span className={styles.metricLabel}>Без ответов</span>
            <span className={styles.metricValue}>{unanswered.length}</span>
            <span className={styles.metricNote}>активные вопросы</span>
          </div>
          <div className={styles.metric}>
            <span className={styles.metricLabel}>Синтезов готово</span>
            <span className={styles.metricValue}>{ready.length}</span>
            <span className={styles.metricNote}>сохранённые ответы Пьеро</span>
          </div>
          <div className={styles.metric}>
            <span className={styles.metricLabel}>Требуют внимания</span>
            <span className={styles.metricValue}>{attention.length}</span>
            <span className={styles.metricNote}>нет синтеза, устарел или ошибка</span>
          </div>
        </section>

        <div className={styles.grid}>
          <section className={styles.panel} aria-labelledby="popular-questions">
            <div className={styles.panelHead}>
              <h2 id="popular-questions" className={styles.panelTitle}>
                Больше всего ответов
              </h2>
              <span className={styles.panelNote}>топ-5</span>
            </div>

            {popular.length === 0 ? (
              <p className={styles.empty}>Пока нет ни одного ответа.</p>
            ) : (
              <ol className={styles.rankList}>
                {popular.map((row, index) => (
                  <li key={row.id} className={styles.rankItem}>
                    <span className={styles.rankNumber}>{String(index + 1).padStart(2, '0')}</span>
                    <div className={styles.rankBody}>
                      <Link href={`/question?q=${row.id}`} className={styles.rankTitle}>
                        {row.text}
                      </Link>
                      <div className={styles.bar} aria-hidden="true">
                        <span
                          className={styles.barFill}
                          style={{ width: `${Math.round((row.answerCount / maxAnswers) * 100)}%` }}
                        />
                      </div>
                    </div>
                    <span className={styles.rankValue}>{row.answerCount}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className={styles.panel} aria-labelledby="unpopular-questions">
            <div className={styles.panelHead}>
              <h2 id="unpopular-questions" className={styles.panelTitle}>
                Меньше всего ответов
              </h2>
              <span className={styles.panelNote}>активные</span>
            </div>

            {unpopular.length === 0 ? (
              <p className={styles.empty}>Нет активных вопросов.</p>
            ) : (
              <ol className={styles.rankList}>
                {unpopular.map((row, index) => (
                  <li key={row.id} className={styles.rankItem}>
                    <span className={styles.rankNumber}>{String(index + 1).padStart(2, '0')}</span>
                    <div className={styles.rankBody}>
                      <Link href={`/question?q=${row.id}`} className={styles.rankTitle}>
                        {row.text}
                      </Link>
                      <span className={styles.rankMeta}>
                        {row.answerCount === 0 ? 'Никто не ответил' : pluralAnswers(row.answerCount)}
                      </span>
                    </div>
                    <span className={styles.rankValue}>{row.answerCount}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        <section className={styles.attentionSection} aria-labelledby="attention-title">
          <div className={styles.panelHead}>
            <h2 id="attention-title" className={styles.panelTitle}>
              Требуют внимания
            </h2>
            <span className={styles.panelNote}>
              {attention.length === 0 ? 'всё синхронизировано' : `${attention.length}`}
            </span>
          </div>

          {attention.length === 0 ? (
            <p className={styles.empty}>Нет вопросов, где синтез Пьеро отстаёт от ответов.</p>
          ) : (
            <ul className={styles.attentionList}>
              {attention.map((row) => (
                <li key={row.id} className={styles.attentionItem}>
                  <div className={styles.attentionMain}>
                    <Link href={`/question?q=${row.id}`} className={styles.attentionTitle}>
                      {row.text}
                    </Link>
                    <span className={styles.attentionMeta}>
                      {pluralAnswers(row.answerCount)} · синтез:{' '}
                      {row.synthesis.version > 0 ? `v${row.synthesis.version}` : 'нет'}
                    </span>
                  </div>
                  <span className={styles.attentionState}>{attentionLabel(row)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={styles.tableSection} aria-labelledby="all-questions">
          <div className={styles.panelHead}>
            <h2 id="all-questions" className={styles.panelTitle}>
              Все вопросы
            </h2>
            <span className={styles.panelNote}>{rows.length}</span>
          </div>

          {rows.length === 0 ? (
            <p className={styles.empty}>В банке пока нет вопросов.</p>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">Вопрос</th>
                    <th scope="col">Статус</th>
                    <th scope="col">Ответы</th>
                    <th scope="col">Пьеро</th>
                    <th scope="col">Последний ответ</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const synthesis = synthesisLabel(row);

                    return (
                      <tr key={row.id}>
                        <td className={styles.questionCell}>
                          {row.status === 'active' ? (
                            <Link href={`/question?q=${row.id}`}>{row.text}</Link>
                          ) : (
                            <span>{row.text}</span>
                          )}
                        </td>
                        <td>
                          <span
                            className={
                              row.status === 'active' ? styles.statusActive : styles.statusArchived
                            }
                          >
                            {row.status === 'active' ? 'активен' : 'архив'}
                          </span>
                        </td>
                        <td className={styles.numberCell}>{row.answerCount}</td>
                        <td>
                          <span className={synthesis.tone}>{synthesis.text}</span>
                        </td>
                        <td className={styles.dateCell}>{formatDate(row.lastAnswerAt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <p className={styles.footerNote}>
          Данные обновляются при открытии страницы. Вопросы редактируются напрямую в Supabase.
        </p>
      </div>
    </main>
  );
}
