'use client';

import React, { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';

import { useAuth } from '@/components/AuthContext';
import {
  QUESTION_DRAFT_STORAGE_PREFIX,
  QUESTION_MAX_CHARS,
  QUESTION_MIN_WORDS,
  type PublicQuestion,
  type PublicSynthesis,
} from '@/lib/question/constants';
import { countQuestionWords, validateQuestionAnswer } from '@/lib/question/validation';
import QuestionSynthesis from './QuestionSynthesis';
import styles from './question.module.css';

const ModernLoginModal = dynamic(() => import('@/components/ModernLoginModal'), {
  ssr: false,
});

type QuestionExperienceProps = {
  question: PublicQuestion | null;
  synthesis: PublicSynthesis | null;
  hasAnswers: boolean;
  isAuthenticated: boolean;
  hasAnswered: boolean;
  requestedQuestionId: string | null;
};

type AnswerResponse = {
  ok?: unknown;
  error?: unknown;
  synthesis?: { content?: unknown } | null;
};

function draftKey(questionId: string) {
  return `${QUESTION_DRAFT_STORAGE_PREFIX}${questionId}`;
}

function returnFlagKey(questionId: string) {
  return `question:return:${questionId}`;
}

function clearDraft(questionId: string) {
  try {
    window.sessionStorage.removeItem(draftKey(questionId));
  } catch {
    // Private browsing may deny storage. Submission still works.
  }
}

function errorMessage(code: unknown, wordCount: number): string {
  if (code === 'too_short' || code === 'empty_answer') {
    return `Нужно не меньше ${QUESTION_MIN_WORDS} слов. Сейчас ${wordCount}.`;
  }

  if (code === 'too_long') {
    return `Ответ слишком длинный. Максимум ${QUESTION_MAX_CHARS.toLocaleString('ru-RU')} символов.`;
  }

  if (code === 'question_unavailable') {
    return 'Этот вопрос больше не активен. Обновите страницу.';
  }

  if (code === 'already_answered') {
    return 'Вы уже ответили на этот вопрос.';
  }

  return 'Не удалось сохранить ответ. Попробуйте ещё раз.';
}

export default function QuestionExperience({
  question,
  synthesis: initialSynthesis,
  hasAnswers,
  isAuthenticated,
  hasAnswered: initialHasAnswered,
  requestedQuestionId,
}: QuestionExperienceProps) {
  const { user, isLoading } = useAuth();

  const [content, setContent] = useState('');
  const [wordCount, setWordCount] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loginOpen, setLoginOpen] = useState(false);
  const [hasAnswered, setHasAnswered] = useState(initialHasAnswered);
  const [confirmed, setConfirmed] = useState(false);
  const [localHasAnswers, setLocalHasAnswers] = useState(hasAnswers);
  const [synthesis, setSynthesis] = useState<PublicSynthesis | null>(initialSynthesis);
  const [authFallback, setAuthFallback] = useState(isAuthenticated);

  const questionId = question?.id || '';
  const authenticated = Boolean(user) || authFallback;

  useEffect(() => {
    if (!isLoading) setAuthFallback(Boolean(user));
  }, [isLoading, user]);

  useEffect(() => {
    if (user && loginOpen) setLoginOpen(false);
  }, [user, loginOpen]);

  // Restore a draft after an OAuth round-trip. The draft is scoped to this
  // question and kept in sessionStorage, never sent anywhere before submission.
  useEffect(() => {
    if (!questionId || hasAnswered) return;

    try {
      const stored = window.sessionStorage.getItem(draftKey(questionId));
      if (stored) {
        setContent(stored);
        setWordCount(countQuestionWords(stored));
      }
    } catch {
      // Storage is optional.
    }
  }, [questionId, hasAnswered]);

  // Consume the login-return marker. The server has already rendered the same
  // question; the query parameter is removed so the next refresh is random
  // again, as the product requires.
  useEffect(() => {
    if (!questionId || !requestedQuestionId) return;

    try {
      if (window.sessionStorage.getItem(returnFlagKey(questionId)) !== '1') return;

      window.sessionStorage.removeItem(returnFlagKey(questionId));

      const url = new URL(window.location.href);
      if (url.searchParams.get('q') === questionId) {
        url.searchParams.delete('q');
        window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
      }
    } catch {
      // The URL may stay canonical with ?q; it is still a valid page.
    }
  }, [questionId, requestedQuestionId]);

  const saveDraft = useCallback(() => {
    if (!questionId) return;

    try {
      window.sessionStorage.setItem(draftKey(questionId), content);
    } catch {
      // The flow still works without draft persistence.
    }
  }, [content, questionId]);

  const prepareLogin = useCallback(() => {
    if (!questionId) return;

    saveDraft();

    const returnPath = `/question?q=${encodeURIComponent(questionId)}`;

    try {
      window.localStorage.setItem('login_redirect_path', returnPath);
      window.sessionStorage.setItem(returnFlagKey(questionId), '1');
    } catch {
      // ModernLoginModal still uses the current browser context.
    }

    try {
      const url = new URL(window.location.href);
      url.searchParams.set('q', questionId);
      window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
    } catch {
      // The current URL remains valid.
    }

    setError(null);
    setLoginOpen(true);
  }, [questionId, saveDraft]);

  const handleContentChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const next = event.target.value;
    setContent(next);
    setWordCount(countQuestionWords(next));
    if (error) setError(null);

    if (questionId) {
      try {
        window.sessionStorage.setItem(draftKey(questionId), next);
      } catch {
        // Storage is optional.
      }
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!questionId || hasAnswered || submitting) return;

    const validation = validateQuestionAnswer(content);

    if (!validation.ok) {
      setError(errorMessage(validation.reason, validation.wordCount));
      return;
    }

    if (!authenticated) {
      prepareLogin();
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/question/answer', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ questionId, content: validation.content }),
      });

      if (response.status === 401) {
        prepareLogin();
        return;
      }

      const payload = (await response.json().catch(() => null)) as AnswerResponse | null;

      if (response.status === 409) {
        setHasAnswered(true);
        setConfirmed(true);
        setLocalHasAnswers(true);
        clearDraft(questionId);
        return;
      }

      if (!response.ok) {
        setError(errorMessage(payload?.error, validation.wordCount));
        return;
      }

      setHasAnswered(true);
      setConfirmed(true);
      setLocalHasAnswers(true);
      clearDraft(questionId);

      const nextContent =
        payload?.synthesis && typeof payload.synthesis.content === 'string'
          ? payload.synthesis.content
          : '';

      if (nextContent) {
        setSynthesis({
          content: nextContent,
          updatedAt: new Date().toISOString(),
          version: (synthesis?.version || 0) + 1,
        });
      }
    } catch {
      setError('Не удалось отправить ответ. Проверьте соединение и попробуйте ещё раз.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!question) {
    return (
      <main className={styles.page}>
        <div className={styles.inner}>
          <header className={styles.masthead}>
            <span className={styles.kicker}>Question</span>
            <Link href="/question/about" className={styles.mastheadLink}>
              О проекте
            </Link>
          </header>
          <div className={styles.emptyPage}>
            <h1 className={styles.emptyTitle}>Пока нет активных вопросов.</h1>
            <p className={styles.emptyCopy}>Загляните сюда позже.</p>
          </div>
        </div>
      </main>
    );
  }

  const canSubmit =
    !submitting &&
    wordCount >= QUESTION_MIN_WORDS &&
    content.length <= QUESTION_MAX_CHARS &&
    content.trim().length > 0;

  return (
    <main className={styles.page}>
      <div className={styles.inner}>
        <header className={styles.masthead}>
          <span className={styles.kicker}>Question</span>
          <Link href="/question/about" className={styles.mastheadLink}>
            О проекте
          </Link>
        </header>

        <article>
          <section aria-labelledby="question-title">
            <h1 id="question-title" className={styles.question}>
              {question.text}
            </h1>
          </section>

          <div className={styles.sections}>
            <section className={styles.section} aria-labelledby="your-answer-title">
              <div className={styles.sectionHead}>
                <span className={styles.sectionIndex}>01</span>
                <h2 id="your-answer-title" className={styles.sectionTitle}>
                  Ваш ответ
                </h2>
              </div>

              {hasAnswered ? (
                <div className={styles.confirmation} role="status" aria-live="polite">
                  <p className={styles.confirmationTitle}>
                    {confirmed ? 'Ответ сохранён.' : 'Вы уже ответили на этот вопрос.'}
                  </p>
                  <p className={styles.confirmationCopy}>
                    Спасибо. Ваш текст остаётся приватным: другие посетители его не увидят.
                  </p>
                </div>
              ) : (
                <form className={styles.form} onSubmit={handleSubmit} noValidate>
                  <label className={styles.srOnly} htmlFor="question-answer">
                    Ваш ответ
                  </label>
                  <textarea
                    id="question-answer"
                    name="answer"
                    className={styles.textarea}
                    value={content}
                    onChange={handleContentChange}
                    placeholder="Напишите ответ…"
                    rows={8}
                    maxLength={QUESTION_MAX_CHARS}
                    autoComplete="off"
                    spellCheck
                  />

                  <div className={styles.formMeta}>
                    <span
                      className={
                        wordCount > 0 && wordCount < QUESTION_MIN_WORDS
                          ? styles.wordCountShort
                          : styles.wordCount
                      }
                      aria-live="polite"
                    >
                      {wordCount === 0
                        ? `Минимум ${QUESTION_MIN_WORDS} слов`
                        : `${wordCount} ${wordCount === 1 ? 'слово' : wordCount < 5 ? 'слова' : 'слов'}`}
                    </span>
                    <span className={styles.charCount}>
                      {content.length.toLocaleString('ru-RU')} /{' '}
                      {QUESTION_MAX_CHARS.toLocaleString('ru-RU')}
                    </span>
                  </div>

                  {error && (
                    <p className={styles.error} role="alert">
                      {error}
                    </p>
                  )}

                  <div className={styles.actions}>
                    <p className={styles.hint}>
                      {wordCount >= QUESTION_MIN_WORDS
                        ? 'Один ответ на вопрос. После отправки текст нельзя изменить.'
                        : `Ещё ${Math.max(0, QUESTION_MIN_WORDS - wordCount)} до минимума.`}
                    </p>
                    <button type="submit" className={styles.submit} disabled={!canSubmit}>
                      {submitting ? 'Отправляем…' : 'Отправить'}
                    </button>
                  </div>
                </form>
              )}
            </section>

            <section className={styles.section} aria-labelledby="pierrot-answer-title">
              <div className={styles.sectionHead}>
                <span className={styles.sectionIndex}>02</span>
                <h2 id="pierrot-answer-title" className={styles.sectionTitle}>
                  Ответ Пьеро
                </h2>
                {synthesis && <span className={styles.sectionNote}>синтез</span>}
              </div>

              {!localHasAnswers ? (
                <p className={styles.emptyState}>Никто пока не ответил на этот вопрос.</p>
              ) : synthesis ? (
                <QuestionSynthesis content={synthesis.content} />
              ) : (
                <p className={styles.pendingState}>Ответ Пьеро ещё не готов.</p>
              )}
            </section>
          </div>
        </article>
      </div>

      {loginOpen && (
        <ModernLoginModal language="ru" onClose={() => setLoginOpen(false)} />
      )}
    </main>
  );
}
