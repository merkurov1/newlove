import type { Metadata } from 'next';
import Link from 'next/link';

import SubscriptionStateSync from '@/components/question/SubscriptionStateSync';
import styles from '@/components/question/question.module.css';
import { isQuestionId } from '@/lib/question/validation';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = {
  title: 'Подписка на ответы — Question',
  robots: { index: false, follow: false },
};

type SubscriptionPageProps = {
  searchParams?: {
    state?: string | string[];
    q?: string | string[];
  };
};

function first(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
}

function contentFor(state: string | null): { title: string; copy: string } {
  switch (state) {
    case 'email_confirmed':
      return {
        title: 'Email подтверждён.',
        copy: 'Теперь вы получите одно письмо, когда на этот вопрос ответит новый человек. Ответы, которые уже были, не рассылаются.',
      };
    case 'email_unsubscribed':
      return {
        title: 'Email-уведомления отключены.',
        copy: 'Telegram и другие подписки это не затрагивает. Вернуться к вопросу можно в любой момент.',
      };
    case 'telegram_unsubscribed':
      return {
        title: 'Telegram-уведомления отключены.',
        copy: 'Email и другие подписки это не затрагивает.',
      };
    case 'unsubscribed':
      return {
        title: 'Вы отписались.',
        copy: 'Уведомления по этому вопросу больше не будут приходить.',
      };
    case 'used':
      return {
        title: 'Ссылка уже использована.',
        copy: 'Одноразовая ссылка срабатывает только один раз. Запросите новую на странице вопроса.',
      };
    case 'expired':
      return {
        title: 'Срок действия ссылки истёк.',
        copy: 'Запросите новую ссылку на странице вопроса.',
      };
    default:
      return {
        title: 'Ссылка недействительна.',
        copy: 'Возможно, она уже использована или повреждена. Запросите новую на странице вопроса.',
      };
  }
}

export default function QuestionSubscriptionPage({ searchParams }: SubscriptionPageProps) {
  const state = first(searchParams?.state);
  const requestedQuestionId = first(searchParams?.q);
  const questionId = isQuestionId(requestedQuestionId) ? requestedQuestionId : null;
  const content = contentFor(state);

  return (
    <main className={styles.page}>
      <div className={styles.inner}>
        <header className={styles.masthead}>
          <span className={styles.kicker}>Question</span>
          <Link href="/question/about" className={styles.mastheadLink}>
            О проекте
          </Link>
        </header>

        <article className={styles.about}>
          <h1 className={styles.aboutTitle}>{content.title}</h1>
          <p className={styles.aboutLead}>{content.copy}</p>
          <p className={styles.aboutText}>
            <Link
              className={styles.mastheadLink}
              href={questionId ? `/question?q=${encodeURIComponent(questionId)}` : '/question'}
            >
              Вернуться к вопросу
            </Link>
          </p>
        </article>
      </div>

      <SubscriptionStateSync questionId={questionId} state={state} />
    </main>
  );
}
