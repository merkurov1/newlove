"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

type IssueLang = "ru" | "en";

type IssueRecord = {
  id: string;
  slug: string;
  title?: string;
  number?: number;
  lang?: IssueLang;
  status?: string;
  published?: boolean;
  sent_at?: string | null;
  sentAt?: string | null;
  publishedAt?: string | null;
  createdAt?: string | null;
  html_web?: string | null;
  html_email?: string | null;
  text_email?: string | null;
};

type IssueResponse = {
  ok?: boolean;
  error?: string;
  issue?: IssueRecord;
  issues?: IssueRecord[];
  jobId?: string;
  jobStatus?: string;
  activeSubscribers?: number;
  sentCount?: number;
  failedCount?: number;
  skippedCount?: number;
  queued?: boolean;
  alreadyQueued?: boolean;
  alreadyPublished?: boolean;
  sent_at?: string | null;
  message?: string;
};

function toLocalInputValue(date: Date): string {
  const local = new Date(
    date.getTime() - date.getTimezoneOffset() * 60_000,
  );
  return local.toISOString().slice(0, 16);
}

export default function FlowIssueAdmin() {
  const [lang, setLang] = useState<IssueLang>("ru");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState(() =>
    toLocalInputValue(new Date()),
  );

  const [loading, setLoading] = useState(false);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [issue, setIssue] = useState<IssueRecord | null>(null);
  const [existingIssues, setExistingIssues] = useState<IssueRecord[]>([]);
  const [activeSubscribers, setActiveSubscribers] = useState<number>(0);
  const [isLoadingIssues, setIsLoadingIssues] = useState(true);

  const [jobId, setJobId] = useState("");
  const [previewMode, setPreviewMode] = useState<"web" | "email" | "text">("web");

  const loadIssues = useCallback(async () => {
    try {
      setIsLoadingIssues(true);
      const res = await fetch("/api/admin/flow-issues", { cache: "no-store" });
      const data = (await res.json()) as IssueResponse;
      if (res.ok && Array.isArray(data.issues)) {
        setExistingIssues(data.issues);
        if (typeof data.activeSubscribers === "number") {
          setActiveSubscribers(data.activeSubscribers);
        }
      }
    } catch (err) {
      console.error("Failed to load issues:", err);
    } finally {
      setIsLoadingIssues(false);
    }
  }, []);

  useEffect(() => {
    void loadIssues();
  }, [loadIssues]);

  async function createIssue() {
    setLoading(true);
    setError("");
    setMessage("");
    setIssue(null);
    setJobId("");

    try {
      const response = await fetch("/api/admin/flow-issues", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          lang,
          periodStart: periodStart
            ? new Date(periodStart).toISOString()
            : null,
          periodEnd: periodEnd
            ? new Date(periodEnd).toISOString()
            : new Date().toISOString(),
        }),
      });

      const data = (await response.json()) as IssueResponse;

      if (!response.ok || !data.issue) {
        throw new Error(data.error || "Не удалось создать выпуск.");
      }

      setIssue(data.issue);
      setMessage(
        "Черновик создан. Проверьте веб-версию и письмо перед отправкой.",
      );
      await loadIssues();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Неизвестная ошибка.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function publishIssue(targetId?: string) {
    const idToPublish = targetId || issue?.id;
    if (!idToPublish) return;

    const confirmed = window.confirm(
      "Опубликовать выпуск? Он станет доступен на сайте. Письма отправлены не будут.",
    );

    if (!confirmed) return;

    setPublishingId(idToPublish);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/admin/flow-issues", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: idToPublish,
          action: "publish",
        }),
      });

      const data = (await response.json()) as IssueResponse;

      if (!response.ok) {
        throw new Error(data.error || "Не удалось опубликовать выпуск.");
      }

      if (issue && issue.id === idToPublish) {
        setIssue((current) =>
          current
            ? {
                ...current,
                ...data.issue,
                status: "published",
                published: true,
              }
            : current,
        );
      }

      setMessage("Выпуск опубликован на сайте.");
      await loadIssues();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Неизвестная ошибка.",
      );
    } finally {
      setPublishingId(null);
    }
  }

  async function sendIssue(targetId?: string) {
    const idToSend = targetId || issue?.id;
    if (!idToSend || sendingId) return;

    const target = existingIssues.find((i) => i.id === idToSend) || issue;
    const title = target?.title || "этот выпуск";

    const confirmed = window.confirm(
      `Отправить «${title}» всем активным подписчикам (${activeSubscribers})?\n\n` +
        `Выпуск будет опубликован автоматически и разослан через Resend.`,
    );

    if (!confirmed) return;

    setSendingId(idToSend);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/admin/flow-issues", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: idToSend,
          action: "send",
        }),
      });

      const data = (await response.json()) as IssueResponse;

      if (!response.ok) {
        throw new Error(data.error || "Не удалось отправить выпуск.");
      }

      if (data.jobId) {
        setJobId(data.jobId);
      }

      if (issue && issue.id === idToSend) {
        setIssue((current) =>
          current
            ? {
                ...current,
                ...data.issue,
                status: "published",
                published: true,
                sent_at: data.issue?.sent_at || new Date().toISOString(),
              }
            : current,
        );
      }

      setMessage(
        data.message ||
          `Выпуск успешно разослан ${data.sentCount ?? activeSubscribers} подписчикам!`,
      );

      await loadIssues();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Ошибка отправки рассылки.",
      );
    } finally {
      setSendingId(null);
    }
  }

  const previewContent =
    previewMode === "web"
      ? issue?.html_web
      : previewMode === "email"
        ? issue?.html_email
        : issue?.text_email;

  const isCurrentPublished = issue?.status === "published" || issue?.published;
  const isCurrentAlreadySent = Boolean(issue?.sent_at || issue?.sentAt);

  return (
    <main className="mx-auto w-full max-w-6xl px-5 py-10 text-[#1C1A1B]">
      <header className="mb-10 flex flex-col justify-between gap-4 border-b border-[#1C1A1B]/20 pb-6 sm:flex-row sm:items-baseline">
        <div>
          <p className="mb-2 font-mono text-xs uppercase tracking-[0.18em] text-[#990F3D]">
            FLOW / ADMIN
          </p>
          <h1 className="font-serif text-4xl tracking-tight sm:text-5xl">
            Газета Flow
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#1C1A1B]/65">
            Редактор и рассылка еженедельных выпусков газеты Flow.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="rounded-lg border border-[#E8E2D8] bg-[#F7F4EE] px-3.5 py-2 font-mono text-xs">
            <span className="text-[#89827B]">Подписчиков: </span>
            <strong className="text-[#990F3D]">{activeSubscribers}</strong>
          </div>

          <Link
            href="/admin/flow-issues/template"
            className="inline-flex items-center gap-1 border border-[#1C1A1B]/20 bg-white px-3.5 py-2 text-xs font-mono uppercase tracking-wider text-[#1C1A1B] transition hover:border-[#990F3D]"
          >
            Настройки шаблона ↗
          </Link>
        </div>
      </header>

      {error && (
        <div
          role="alert"
          className="mb-6 border-l-2 border-red-700 bg-red-50 px-4 py-3 text-sm text-red-900"
        >
          {error}
        </div>
      )}

      {message && (
        <div
          role="status"
          className="mb-6 border-l-2 border-[#990F3D] bg-[#FFF1E5] px-4 py-3 text-sm font-medium text-[#7E0C33]"
        >
          {message}
          {jobId && (
            <p className="mt-1 font-mono text-xs font-normal text-[#89827B]">
              Job ID: {jobId}
            </p>
          )}
        </div>
      )}

      {/* SECTION 1: Архив и управление существующими выпусками */}
      <section className="mb-12 border border-[#1C1A1B]/15 bg-white p-5 sm:p-7">
        <div className="mb-5 flex items-center justify-between border-b border-[#EAE6E1] pb-3">
          <h2 className="font-serif text-2xl">Архив выпусков</h2>
          <button
            type="button"
            onClick={() => void loadIssues()}
            disabled={isLoadingIssues}
            className="font-mono text-xs text-[#89827B] hover:text-[#990F3D]"
          >
            {isLoadingIssues ? "Обновление…" : "Обновить список ⟳"}
          </button>
        </div>

        {existingIssues.length === 0 ? (
          <p className="py-8 text-center text-sm text-[#89827B]">
            {isLoadingIssues
              ? "Загружаю список выпусков…"
              : "Выпусков ещё нет. Соберите первый выпуск ниже."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[#E8E2D8] font-mono text-[11px] uppercase tracking-wider text-[#89827B]">
                  <th className="pb-3 pr-4">Выпуск</th>
                  <th className="pb-3 pr-4">Язык</th>
                  <th className="pb-3 pr-4">Дата</th>
                  <th className="pb-3 pr-4">Статус</th>
                  <th className="pb-3 text-right">Действия</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0ECE7]">
                {existingIssues.map((item) => {
                  const sentDate = item.sent_at || item.sentAt;
                  const isSent = Boolean(sentDate);
                  const isPub = item.published || item.status === "published";
                  const isSendingThis = sendingId === item.id;
                  const isPublishingThis = publishingId === item.id;

                  return (
                    <tr key={item.id} className="hover:bg-[#FCFAF7] transition-colors">
                      <td className="py-4 pr-4">
                        <Link
                          href={`/letters/${item.slug}`}
                          target="_blank"
                          className="font-medium text-[#1C1A1B] hover:text-[#990F3D]"
                        >
                          {item.title || `Выпуск ${item.number || ""}`}
                        </Link>
                        <p className="font-mono text-[10px] text-[#89827B]">
                          /{item.slug}
                        </p>
                      </td>

                      <td className="py-4 pr-4 font-mono text-xs">
                        <span className="rounded bg-[#F4EFEA] px-2 py-0.5 text-[10px] uppercase">
                          {item.lang || "ru"}
                        </span>
                      </td>

                      <td className="py-4 pr-4 font-mono text-xs text-[#89827B]">
                        {item.publishedAt
                          ? new Date(item.publishedAt).toLocaleDateString("ru-RU")
                          : item.createdAt
                            ? new Date(item.createdAt).toLocaleDateString("ru-RU")
                            : "—"}
                      </td>

                      <td className="py-4 pr-4">
                        {isSent ? (
                          <span className="inline-flex items-center gap-1 font-mono text-xs text-[#356B4D]">
                            <span className="h-1.5 w-1.5 rounded-full bg-[#356B4D]" />
                            Разослан
                            <span className="text-[10px] text-[#89827B]">
                              ({new Date(sentDate!).toLocaleDateString("ru-RU")})
                            </span>
                          </span>
                        ) : isPub ? (
                          <span className="inline-flex items-center gap-1 font-mono text-xs text-[#990F3D]">
                            <span className="h-1.5 w-1.5 rounded-full bg-[#990F3D]" />
                            Опубликован
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 font-mono text-xs text-[#89827B]">
                            <span className="h-1.5 w-1.5 rounded-full bg-gray-400" />
                            Черновик
                          </span>
                        )}
                      </td>

                      <td className="py-4 text-right">
                        <div className="flex items-center justify-end gap-2.5">
                          <a
                            href={`/letters/${item.slug}`}
                            target="_blank"
                            rel="noreferrer"
                            className="font-mono text-xs text-[#89827B] hover:text-[#1C1A1B]"
                            title="Открыть страницу"
                          >
                            Веб ↗
                          </a>

                          {!isPub && (
                            <button
                              type="button"
                              onClick={() => void publishIssue(item.id)}
                              disabled={Boolean(publishingId) || Boolean(sendingId)}
                              className="font-mono text-xs text-[#1C1A1B] underline hover:text-[#990F3D] disabled:opacity-40"
                            >
                              {isPublishingThis ? "Публикация…" : "Опубликовать"}
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => void sendIssue(item.id)}
                            disabled={Boolean(sendingId) || isSent}
                            className={`inline-flex items-center px-3 py-1.5 font-mono text-xs font-semibold transition ${
                              isSent
                                ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                                : "bg-[#990F3D] text-white hover:bg-[#7E0C33] active:scale-95 shadow-sm"
                            }`}
                          >
                            {isSendingThis ? "Отправка…" : isSent ? "Отправлен" : "Отправить рассылку"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* SECTION 2: Сборка нового выпуска */}
      <section className="mb-10 border border-[#1C1A1B]/15 bg-white p-5 sm:p-7">
        <h2 className="mb-6 font-serif text-2xl">Собрать новый выпуск</h2>

        <div className="grid gap-6 sm:grid-cols-2">
          <label className="block">
            <span className="mb-2 block font-mono text-xs uppercase tracking-wider">
              Язык выпуска
            </span>

            <select
              value={lang}
              onChange={(event) => setLang(event.target.value as IssueLang)}
              disabled={loading}
              className="w-full rounded-none border border-[#1C1A1B]/25 bg-white px-3 py-3 text-sm outline-none focus:border-[#990F3D]"
            >
              <option value="ru">Русский</option>
              <option value="en">English</option>
            </select>
          </label>

          <div className="hidden sm:block" />

          <label className="block">
            <span className="mb-2 block font-mono text-xs uppercase tracking-wider">
              Период с
            </span>

            <input
              type="datetime-local"
              value={periodStart}
              onChange={(event) => setPeriodStart(event.target.value)}
              disabled={loading}
              className="w-full rounded-none border border-[#1C1A1B]/25 bg-white px-3 py-3 text-sm outline-none focus:border-[#990F3D]"
            />

            <span className="mt-2 block text-xs leading-5 text-[#1C1A1B]/55">
              Если оставить пустым, сервер определит начало периода по предыдущему выпуску.
            </span>
          </label>

          <label className="block">
            <span className="mb-2 block font-mono text-xs uppercase tracking-wider">
              Период по
            </span>

            <input
              type="datetime-local"
              value={periodEnd}
              onChange={(event) => setPeriodEnd(event.target.value)}
              disabled={loading}
              className="w-full rounded-none border border-[#1C1A1B]/25 bg-white px-3 py-3 text-sm outline-none focus:border-[#990F3D]"
            />
          </label>
        </div>

        <div className="mt-7 flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={createIssue}
            disabled={loading || Boolean(publishingId) || Boolean(sendingId) || !periodEnd}
            className="inline-flex min-h-12 items-center justify-center bg-[#990F3D] px-6 py-3 text-sm font-medium text-white transition hover:bg-[#7E0C33] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Собираю выпуск…" : "Собрать выпуск"}
          </button>

          <p className="text-xs leading-5 text-[#1C1A1B]/55">
            Сначала создаётся черновик. Вы сможете проверить все версии до публикации и отправки.
          </p>
        </div>
      </section>

      {/* SECTION 3: Предпросмотр созданного выпуска */}
      {issue && (
        <section className="border-t border-[#1C1A1B]/20 pt-7">
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
            <div>
              <p className="mb-2 font-mono text-xs uppercase tracking-wider text-[#990F3D]">
                {isCurrentAlreadySent
                  ? "Выпуск отправлен"
                  : isCurrentPublished
                    ? "Опубликованный выпуск"
                    : "Черновик"}
                {typeof issue.number === "number" ? ` / № ${issue.number}` : ""}
              </p>

              <h2 className="font-serif text-3xl">
                {issue.title || "Новый выпуск"}
              </h2>

              <p className="mt-2 break-all text-xs text-[#1C1A1B]/55">
                {issue.slug}
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <a
                href={`/letters/${issue.slug}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-10 items-center border border-[#1C1A1B]/25 px-4 py-2 text-sm hover:border-[#990F3D]"
              >
                Открыть страницу
              </a>

              {!isCurrentPublished && (
                <button
                  type="button"
                  onClick={() => void publishIssue(issue.id)}
                  disabled={Boolean(publishingId) || loading || Boolean(sendingId)}
                  className="inline-flex min-h-10 items-center bg-[#1C1A1B] px-4 py-2 text-sm text-white hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {publishingId === issue.id ? "Публикую…" : "Опубликовать"}
                </button>
              )}

              <button
                type="button"
                onClick={() => void sendIssue(issue.id)}
                disabled={Boolean(sendingId) || Boolean(publishingId) || loading || isCurrentAlreadySent}
                className={`inline-flex min-h-10 items-center px-4 py-2 text-sm font-medium transition ${
                  isCurrentAlreadySent
                    ? "bg-gray-200 text-gray-500 cursor-not-allowed"
                    : "bg-[#990F3D] text-white hover:bg-[#7E0C33] active:scale-95"
                }`}
              >
                {sendingId === issue.id
                  ? "Отправляю подписчикам…"
                  : isCurrentAlreadySent
                    ? "Уже отправлен"
                    : `Отправить рассылку (${activeSubscribers})`}
              </button>
            </div>
          </div>

          <div className="mt-7 flex flex-wrap gap-2 border-b border-[#1C1A1B]/15">
            {(
              [
                ["web", "Веб-версия"],
                ["email", "Email-версия"],
                ["text", "Текст письма"],
              ] as const
            ).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                onClick={() => setPreviewMode(mode)}
                className={`border-b-2 px-3 py-3 text-sm ${
                  previewMode === mode
                    ? "border-[#990F3D] text-[#990F3D]"
                    : "border-transparent text-[#1C1A1B]/60 hover:text-[#1C1A1B]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="mt-5 min-h-48 border border-[#1C1A1B]/10 bg-white">
            {previewMode === "text" ? (
              <pre className="whitespace-pre-wrap p-5 font-mono text-xs leading-6">
                {previewContent || "Текстовая версия пока отсутствует."}
              </pre>
            ) : previewContent ? (
              <iframe
                title={
                  previewMode === "web"
                    ? "Предпросмотр веб-версии"
                    : "Предпросмотр email-версии"
                }
                srcDoc={previewContent}
                sandbox=""
                className="min-h-[600px] w-full border-0 bg-white"
              />
            ) : (
              <p className="p-5 text-sm text-[#1C1A1B]/55">
                Предпросмотр отсутствует.
              </p>
            )}
          </div>
        </section>
      )}
    </main>
  );
}
