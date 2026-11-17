'use client';

import React, { useCallback, useEffect, useState } from 'react';

import type {
  QuestionChannelStatus,
  QuestionSubscriptionStatus,
} from '@/lib/question/constants';
import {
  readLocalSubscriptionState,
  writeLocalSubscriptionState,
} from '@/lib/question/subscriptionStorage';
import styles from './question.module.css';

type QuestionSubscriptionProps = {
  questionId: string;
  isAuthenticated: boolean;
};

const EMPTY_STATUS: QuestionSubscriptionStatus = {
  email: { state: 'none', available: true },
  telegram: { state: 'none', available: false },
};

function asChannel(value: unknown): QuestionChannelStatus | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const state = record.state;

  if (
    state !== 'none' &&
    state !== 'pending' &&
    state !== 'active' &&
    state !== 'disabled' &&
    state !== 'error' &&
    state !== 'unavailable'
  ) {
    return null;
  }

  return {
    state,
    available: record.available === true,
    deepLinkUrl: typeof record.deepLinkUrl === 'string' ? record.deepLinkUrl : undefined,
    devConfirmationUrl:
      typeof record.devConfirmationUrl === 'string' ? record.devConfirmationUrl : undefined,
    code: typeof record.code === 'string' ? record.code : undefined,
  };
}

function parseStatus(value: unknown): QuestionSubscriptionStatus | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const email = asChannel(record.email);
  const telegram = asChannel(record.telegram);

  if (!email || !telegram) return null;
  return { email, telegram };
}

function mergeLocal(questionId: string, status: QuestionSubscriptionStatus) {
  const local = readLocalSubscriptionState(questionId);
  const next: QuestionSubscriptionStatus = {
    email: { ...status.email },
    telegram: { ...status.telegram },
  };

  if (next.email.state === 'none' && local.email) next.email.state = local.email;
  if (next.telegram.state === 'none' && local.telegram) next.telegram.state = local.telegram;

  return next;
}

function emailMessage(status: QuestionChannelStatus): string | null {
  if (status.state === 'pending') {
    return 'Проверьте почту: подписка включится после подтверждения ссылки.';
  }

  if (status.state === 'active') {
    return 'Email уже подтверждён — уведомления включены.';
  }

  if (status.state === 'unavailable') {
    return 'Уведомления по email сейчас не настроены.';
  }

  if (status.state === 'error') {
    if (status.code === 'invalid_email') return 'Проверьте адрес электронной почты.';
    if (status.code === 'email_send_failed') {
      return 'Не удалось отправить письмо. Попробуйте ещё раз позже.';
    }
    if (status.code === 'email_not_configured') {
      return 'Уведомления по email сейчас не настроены.';
    }
    return 'Не удалось создать подписку. Попробуйте ещё раз.';
  }

  return null;
}

export default function QuestionSubscription({
  questionId,
  isAuthenticated,
}: QuestionSubscriptionProps) {
  const [status, setStatus] = useState<QuestionSubscriptionStatus>(EMPTY_STATUS);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState<
    'email' | 'telegram' | 'disable-email' | 'disable-telegram' | 'disable-all' | null
  >(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    (async () => {
      try {
        const response = await fetch(
          `/api/question/subscription?questionId=${encodeURIComponent(questionId)}`,
          {
            credentials: 'same-origin',
            cache: 'no-store',
            headers: { Accept: 'application/json' },
            signal: controller.signal,
          }
        );

        if (!response.ok) return;
        const payload = parseStatus(await response.json().catch(() => null));
        if (!active || !payload) return;
        setStatus(mergeLocal(questionId, payload));
      } catch {
        // The form still works if the status read fails.
      }
    })();

    return () => {
      active = false;
      controller.abort();
    };
  }, [questionId, isAuthenticated]);

  const subscribeEmail = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      const value = email.trim();
      if (!questionId || !value || busy) return;

      setBusy('email');
      setMessage(null);

      try {
        const response = await fetch('/api/question/subscription', {
          method: 'POST',
          credentials: 'same-origin',
          cache: 'no-store',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({ questionId, email: value }),
        });

        const payload = await response.json().catch(() => null);
        const next = asChannel((payload as Record<string, unknown> | null)?.email);

        if (!next) {
          setMessage('Не удалось создать подписку. Попробуйте ещё раз.');
          return;
        }

        setStatus((previous) => ({ ...previous, email: next }));

        if (next.state === 'pending' || next.state === 'active') {
          writeLocalSubscriptionState(questionId, { email: next.state });
          setEmail('');
        }

        setMessage(emailMessage(next));
      } catch {
        setMessage('Не удалось отправить запрос. Проверьте соединение.');
      } finally {
        setBusy(null);
      }
    },
    [busy, email, questionId]
  );

  const subscribeTelegram = useCallback(async () => {
    if (!questionId || busy) return;

    setBusy('telegram');
    setMessage(null);

    try {
      const response = await fetch('/api/question/subscription', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ questionId, telegram: true }),
      });

      const payload = await response.json().catch(() => null);
      const next = asChannel((payload as Record<string, unknown> | null)?.telegram);

      if (!next) {
        setMessage('Не удалось создать привязку Telegram. Попробуйте ещё раз.');
        return;
      }

      setStatus((previous) => ({ ...previous, telegram: next }));

      if (next.state === 'pending') {
        writeLocalSubscriptionState(questionId, { telegram: 'pending' });
        setMessage(
          next.deepLinkUrl
            ? 'Откройте Telegram по ссылке ниже и нажмите Start.'
            : 'Не удалось получить ссылку Telegram. Попробуйте ещё раз.'
        );
      } else if (next.state === 'unavailable') {
        setMessage('Telegram пока не подключён: привязка не настроена.');
      } else if (next.state === 'error') {
        setMessage('Не удалось создать привязку Telegram. Попробуйте ещё раз.');
      }
    } catch {
      setMessage('Не удалось отправить запрос. Проверьте соединение.');
    } finally {
      setBusy(null);
    }
  }, [busy, questionId]);

  const disableChannel = useCallback(
    async (channel: 'email' | 'telegram' | 'all') => {
      if (!questionId || busy) return;

      setBusy(
        channel === 'all'
          ? 'disable-all'
          : channel === 'email'
            ? 'disable-email'
            : 'disable-telegram'
      );
      setMessage(null);

      try {
        const response = await fetch('/api/question/subscription/disable', {
          method: 'POST',
          credentials: 'same-origin',
          cache: 'no-store',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({ questionId, channel }),
        });

        if (!response.ok) {
          setMessage('Не удалось отключить канал. Попробуйте ещё раз.');
          return;
        }

        setStatus((previous) => ({
          ...previous,
          email:
            channel === 'email' || channel === 'all'
              ? { ...previous.email, state: 'disabled' }
              : previous.email,
          telegram:
            channel === 'telegram' || channel === 'all'
              ? { ...previous.telegram, state: 'disabled' }
              : previous.telegram,
        }));

        writeLocalSubscriptionState(
          questionId,
          channel === 'all'
            ? { email: 'disabled', telegram: 'disabled' }
            : channel === 'email'
              ? { email: 'disabled' }
              : { telegram: 'disabled' }
        );

        setMessage(
          channel === 'all'
            ? 'Вы отписались от всех уведомлений по этому вопросу.'
            : channel === 'email'
              ? 'Email-уведомления отключены.'
              : 'Telegram-уведомления отключены.'
        );
      } catch {
        setMessage('Не удалось отправить запрос. Проверьте соединение.');
      } finally {
        setBusy(null);
      }
    },
    [busy, questionId]
  );

  const emailUnavailable = status.email.state === 'unavailable' || !status.email.available;
  const telegramUnavailable =
    status.telegram.state === 'unavailable' || !status.telegram.available;

  return (
    <section className={styles.section} aria-labelledby="question-subscription-title">
      <div className={styles.sectionHead}>
        <span className={styles.sectionIndex}>03</span>
        <h2 id="question-subscription-title" className={styles.sectionTitle}>
          Следить за ответами
        </h2>
        <span className={styles.sectionNote}>по желанию</span>
      </div>

      <p className={styles.subscriptionIntro}>
        Одно письмо или сообщение, когда на этот вопрос ответит новый человек. Мы не пересылаем
        текст чужого ответа — только приглашение открыть вопрос. Подписка начнёт работать после
        подтверждения канала.
      </p>

      <div className={styles.channelRow}>
        <div className={styles.channelHead}>
          <span className={styles.channelLabel}>Email</span>
          <span className={styles.channelState}>
            {status.email.state === 'active'
              ? 'включён'
              : status.email.state === 'pending'
                ? 'ожидает подтверждения'
                : status.email.state === 'disabled'
                  ? 'отключён'
                  : emailUnavailable
                    ? 'недоступен'
                    : 'не включён'}
          </span>
        </div>

        {status.email.state === 'active' ? (
          <div className={styles.channelActions}>
            {isAuthenticated ? (
              <button
                type="button"
                className={styles.miniButtonMuted}
                onClick={() => disableChannel('email')}
                disabled={busy !== null}
              >
                {busy === 'disable-email' ? 'Отключаем…' : 'Отключить email'}
              </button>
            ) : (
              <span className={styles.channelNote}>
                Отключить можно по ссылке в последнем письме.
              </span>
            )}
          </div>
        ) : emailUnavailable ? (
          <p className={styles.channelNote}>
            Приём писем сейчас не настроен. Другие каналы работают независимо.
          </p>
        ) : (
          <form className={styles.emailForm} onSubmit={subscribeEmail} noValidate>
            <label className={styles.srOnly} htmlFor="question-subscription-email">
              Email для уведомлений
            </label>
            <input
              id="question-subscription-email"
              className={styles.emailInput}
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              maxLength={320}
              disabled={busy !== null}
            />
            <button type="submit" className={styles.miniButton} disabled={busy !== null}>
              {busy === 'email'
                ? 'Отправляем…'
                : status.email.state === 'pending'
                  ? 'Отправить снова'
                  : 'Подписаться'}
            </button>
          </form>
        )}

        {status.email.devConfirmationUrl && (
          <p className={styles.devLink}>
            Режим разработки:{' '}
            <a href={status.email.devConfirmationUrl}>подтвердить без письма</a>
          </p>
        )}
      </div>

      <div className={styles.channelRow}>
        <div className={styles.channelHead}>
          <span className={styles.channelLabel}>Telegram</span>
          <span className={styles.channelState}>
            {status.telegram.state === 'active'
              ? 'включён'
              : status.telegram.state === 'pending'
                ? 'ожидает привязки'
                : status.telegram.state === 'disabled'
                  ? 'отключён'
                  : telegramUnavailable
                    ? 'недоступен'
                    : 'не включён'}
          </span>
        </div>

        {status.telegram.state === 'active' ? (
          <div className={styles.channelActions}>
            {isAuthenticated ? (
              <button
                type="button"
                className={styles.miniButtonMuted}
                onClick={() => disableChannel('telegram')}
                disabled={busy !== null}
              >
                {busy === 'disable-telegram' ? 'Отключаем…' : 'Отключить Telegram'}
              </button>
            ) : (
              <span className={styles.channelNote}>
                Отключить можно по ссылке в последнем сообщении.
              </span>
            )}
          </div>
        ) : telegramUnavailable ? (
          <p className={styles.channelNote}>
            Telegram пока не подключён. Канал появится только после проверки бота целиком.
          </p>
        ) : (
          <div className={styles.channelActions}>
            {status.telegram.deepLinkUrl && status.telegram.state === 'pending' ? (
              <a
                className={styles.miniButton}
                href={status.telegram.deepLinkUrl}
                target="_blank"
                rel="noreferrer noopener"
              >
                Открыть Telegram
              </a>
            ) : (
              <button
                type="button"
                className={styles.miniButton}
                onClick={subscribeTelegram}
                disabled={busy !== null}
              >
                {busy === 'telegram'
                  ? 'Готовим ссылку…'
                  : status.telegram.state === 'pending'
                    ? 'Новая ссылка'
                    : 'Подключить Telegram'}
              </button>
            )}
          </div>
        )}
      </div>

      {isAuthenticated &&
        (status.email.state === 'active' || status.telegram.state === 'active') && (
          <div className={styles.unsubscribeAll}>
            <button
              type="button"
              className={styles.miniButtonMuted}
              onClick={() => disableChannel('all')}
              disabled={busy !== null}
            >
              {busy === 'disable-all' ? 'Отписываем…' : 'Отписаться от всех уведомлений'}
            </button>
          </div>
        )}

      {message && (
        <p className={styles.channelMessage} role="status" aria-live="polite">
          {message}
        </p>
      )}
    </section>
  );
}
