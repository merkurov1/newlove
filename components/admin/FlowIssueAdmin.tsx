
"use client";

import { useState } from "react";

type IssueLang = "ru" | "en";

type IssueResponse = {
  ok?: boolean;
  error?: string;
  issue?: {
    id: string;
    slug: string;
    title?: string;
    number?: number;
    lang?: IssueLang;
    status?: string;
    html_web?: string | null;
    html_email?: string | null;
    text_email?: string | null;
  };
};

function toLocalInputValue(date: Date): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export default function FlowIssueAdmin() {
  const [lang, setLang] = useState<IssueLang>("ru");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState(() =>
    toLocalInputValue(new Date()),
  );

  const [loading, setLoading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [issue, setIssue] = useState<IssueResponse["issue"] | null>(null);
  const [previewMode, setPreviewMode] = useState<
    "web" | "email" | "text"
  >("web");

  async function createIssue() {
    setLoading(true);
    setError("");
    setMessage("");
    setIssue(null);

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
      setMessage("Черновик выпуска создан. Проверьте содержимое перед публикацией.");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Неизвестная ошибка.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function publishIssue() {
    if (!issue?.id) return;

    const confirmed = window.confirm(
      "Опубликовать выпуск? Он станет доступен читателям на сайте. Рассылка не запускается.",
    );

    if (!confirmed) return;

    setPublishing(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/admin/flow-issues", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: issue.id,
          action: "publish",
        }),
      });

      const data = (await response.json()) as IssueResponse;

      if (!response.ok) {
        throw new Error(data.error || "Не удалось опубликовать выпуск.");
      }

      setIssue((current) =>
        current
          ? {
              ...current,
              ...data.issue,
              status: "published",
            }
          : current,
      );

      setMessage("Выпуск опубликован. Рассылка не отправлялась.");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Неизвестная ошибка.",
      );
    } finally {
      setPublishing(false);
    }
  }

  const previewContent =
    previewMode === "web"
      ? issue?.html_web
      : previewMode === "email"
        ? issue?.html_email
        : issue?.text_email;

  const isPublished = issue?.status === "published";

  return (
    <main className="mx-auto w-full max-w-6xl px-5 py-10 text-[#1C1A1B]">
      <header className="mb-10 border-b border-[#1C1A1B]/20 pb-6">
        <p className="mb-3 font-mono text-xs uppercase tracking-[0.18em] text-[#990F3D]">
          FLOW / ADMIN
        </p>

        <h1 className="font-serif text-4xl tracking-tight sm:text-5xl">
          Газета
        </h1>

        <p className="mt-4 max-w-2xl text-sm leading-6 text-[#1C1A1B]/65">
          Соберите выпуск из опубликованных материалов Flow, проверьте
          веб- и email-версии, затем опубликуйте его отдельно от рассылки.
        </p>
      </header>

      <section className="mb-10 border border-[#1C1A1B]/15 p-5 sm:p-7">
        <h2 className="mb-6 font-serif text-2xl">Новый выпуск</h2>

        <div className="grid gap-6 sm:grid-cols-2">
          <label className="block">
            <span className="mb-2 block font-mono text-xs uppercase tracking-wider">
              Язык выпуска
            </span>

            <select
              value={lang}
              onChange={(event) =>
                setLang(event.target.value as IssueLang)
              }
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
              Можно оставить пустым: сервер определит начало периода
              по предыдущему опубликованному выпуску этого языка.
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
            disabled={loading || publishing || !periodEnd}
            className="inline-flex min-h-12 items-center justify-center bg-[#990F3D] px-6 py-3 text-sm font-medium text-white transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Собираю выпуск…" : "Собрать выпуск"}
          </button>

          <p className="text-xs leading-5 text-[#1C1A1B]/55">
            Создаётся черновик. Публикация и отправка писем не запускаются.
          </p>
        </div>
      </section>

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
          className="mb-6 border-l-2 border-[#990F3D] bg-[#FFF1E5] px-4 py-3 text-sm"
        >
          {message}
        </div>
      )}

      {issue && (
        <section className="border-t border-[#1C1A1B]/20 pt-7">
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
            <div>
              <p className="mb-2 font-mono text-xs uppercase tracking-wider text-[#990F3D]">
                {isPublished ? "Опубликованный выпуск" : "Черновик"}
                {typeof issue.number === "number"
                  ? ` / № ${issue.number}`
                  : ""}
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

              {!isPublished && (
                <button
                  type="button"
                  onClick={publishIssue}
                  disabled={publishing || loading}
                  className="inline-flex min-h-10 items-center bg-[#1C1A1B] px-4 py-2 text-sm text-white hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {publishing ? "Публикую…" : "Опубликовать"}
                </button>
              )}
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

          <p className="mt-4 text-xs leading-5 text-[#1C1A1B]/55">
            Публикация делает выпуск доступным на сайте. Отправка рассылки —
            отдельная операция и здесь не выполняется.
          </p>
        </section>
      )}
    </main>
  );
}
