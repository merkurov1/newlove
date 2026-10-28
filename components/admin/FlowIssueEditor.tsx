"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";

export type EditableIssueEntryData = {
  id: string;
  type: string;
  title: string;
  body: string;
  description: string;
  alt: string;
  caption: string;
  url: string | null;
  publishedAt: string;
};

export type EditableIssueData = {
  id: string;
  title: string;
  slug: string;
  lang: "ru" | "en";
  number: number | null;
  previewHtml: string;
  lead: EditableIssueEntryData | null;
  latest: EditableIssueEntryData[];
  links: EditableIssueEntryData[];
  videos: EditableIssueEntryData[];
  photos: EditableIssueEntryData[];
};

type ArraySection = "latest" | "links" | "videos" | "photos";

type SectionsState = {
  lead: EditableIssueEntryData | null;
  latest: EditableIssueEntryData[];
  links: EditableIssueEntryData[];
  videos: EditableIssueEntryData[];
  photos: EditableIssueEntryData[];
};

const SECTION_LABELS: Record<ArraySection, string> = {
  latest: "Последнее в потоке",
  links: "Ссылки",
  videos: "Видео",
  photos: "Кадры",
};

function formatDate(value: string): string {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function cloneIssue(issue: EditableIssueData): SectionsState {
  return {
    lead: issue.lead ? { ...issue.lead } : null,
    latest: issue.latest.map((entry) => ({ ...entry })),
    links: issue.links.map((entry) => ({ ...entry })),
    videos: issue.videos.map((entry) => ({ ...entry })),
    photos: issue.photos.map((entry) => ({ ...entry })),
  };
}

function editableEntry(entry: EditableIssueEntryData) {
  return {
    id: entry.id,
    title: entry.title,
    body: entry.body,
    description: entry.description,
    alt: entry.alt,
    caption: entry.caption,
  };
}

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.14em] text-[#89827B]">
      {children}
    </span>
  );
}

function EntryCard({
  entry,
  index,
  section,
  total,
  onMove,
  onRemove,
  onChange,
}: {
  entry: EditableIssueEntryData;
  index: number;
  section: ArraySection;
  total: number;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
  onChange: (
    field:
      | "title"
      | "body"
      | "description"
      | "alt"
      | "caption",
    value: string,
  ) => void;
}) {
  return (
    <article className="border-t border-[#EAE6E1] py-5 first:border-t-0 first:pt-0">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[#89827B]">
          <span className="rounded bg-[#F4EFEA] px-2 py-0.5 text-[#1C1A1B]">
            {entry.type || "item"}
          </span>
          <span>{formatDate(entry.publishedAt)}</span>
          {entry.url && (
            <a
              href={entry.url}
              target="_blank"
              rel="noreferrer"
              className="normal-case tracking-normal text-[#990F3D] hover:underline"
            >
              источник ↗
            </a>
          )}
        </div>

        <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.12em]">
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={index === 0}
            className="text-[#89827B] hover:text-[#1C1A1B] disabled:opacity-25"
            aria-label="Переместить выше"
          >
            ↑
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={index === total - 1}
            className="text-[#89827B] hover:text-[#1C1A1B] disabled:opacity-25"
            aria-label="Переместить ниже"
          >
            ↓
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="text-[#89827B] hover:text-red-700"
          >
            убрать
          </button>
        </div>
      </div>

      <div className="space-y-3">
        <label className="block">
          <FieldLabel>Заголовок</FieldLabel>
          <input
            value={entry.title}
            onChange={(event) =>
              onChange("title", event.target.value)
            }
            className="w-full border border-[#D9D3CD] bg-white px-3 py-2 text-sm outline-none focus:border-[#990F3D]"
          />
        </label>

        <label className="block">
          <FieldLabel>Текст</FieldLabel>
          <textarea
            value={entry.body}
            onChange={(event) =>
              onChange("body", event.target.value)
            }
            rows={3}
            className="w-full resize-y border border-[#D9D3CD] bg-white px-3 py-2 text-sm leading-6 outline-none focus:border-[#990F3D]"
          />
        </label>

        {section === "links" && (
          <label className="block">
            <FieldLabel>Описание ссылки</FieldLabel>
            <textarea
              value={entry.description}
              onChange={(event) =>
                onChange("description", event.target.value)
              }
              rows={2}
              className="w-full resize-y border border-[#D9D3CD] bg-white px-3 py-2 text-sm leading-6 outline-none focus:border-[#990F3D]"
            />
          </label>
        )}

        {section === "photos" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <FieldLabel>Alt</FieldLabel>
              <input
                value={entry.alt}
                onChange={(event) =>
                  onChange("alt", event.target.value)
                }
                className="w-full border border-[#D9D3CD] bg-white px-3 py-2 text-sm outline-none focus:border-[#990F3D]"
              />
            </label>
            <label className="block">
              <FieldLabel>Подпись</FieldLabel>
              <input
                value={entry.caption}
                onChange={(event) =>
                  onChange("caption", event.target.value)
                }
                className="w-full border border-[#D9D3CD] bg-white px-3 py-2 text-sm outline-none focus:border-[#990F3D]"
              />
            </label>
          </div>
        )}
      </div>
    </article>
  );
}

export default function FlowIssueEditor({
  issue,
}: {
  issue: EditableIssueData;
}) {
  const [title, setTitle] = useState(issue.title);
  const [sections, setSections] = useState<SectionsState>(() =>
    cloneIssue(issue),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [previewHtml, setPreviewHtml] = useState(
    issue.previewHtml,
  );
  const [showPreview, setShowPreview] = useState(false);

  const counts = useMemo(
    () => ({
      latest: sections.latest.length,
      links: sections.links.length,
      videos: sections.videos.length,
      photos: sections.photos.length,
    }),
    [sections],
  );

  function updateLead(field: "title" | "body", value: string) {
    setSections((current) =>
      current.lead
        ? {
            ...current,
            lead: { ...current.lead, [field]: value },
          }
        : current,
    );
  }

  function updateEntry(
    section: ArraySection,
    index: number,
    field:
      | "title"
      | "body"
      | "description"
      | "alt"
      | "caption",
    value: string,
  ) {
    setSections((current) => ({
      ...current,
      [section]: current[section].map((entry, entryIndex) =>
        entryIndex === index
          ? { ...entry, [field]: value }
          : entry,
      ),
    }));
  }

  function moveEntry(
    section: ArraySection,
    index: number,
    direction: -1 | 1,
  ) {
    setSections((current) => {
      const next = [...current[section]];
      const target = index + direction;

      if (target < 0 || target >= next.length) return current;

      [next[index], next[target]] = [
        next[target],
        next[index],
      ];

      return { ...current, [section]: next };
    });
  }

  function removeEntry(section: ArraySection, index: number) {
    setSections((current) => ({
      ...current,
      [section]: current[section].filter(
        (_, entryIndex) => entryIndex !== index,
      ),
    }));
  }

  async function save() {
    setSaving(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch(
        `/api/admin/flow-issues/${encodeURIComponent(issue.id)}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title,
            sections: {
              lead: sections.lead
                ? editableEntry(sections.lead)
                : null,
              latest: sections.latest.map(editableEntry),
              links: sections.links.map(editableEntry),
              videos: sections.videos.map(editableEntry),
              photos: sections.photos.map(editableEntry),
            },
          }),
        },
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.error || "Не удалось сохранить выпуск.",
        );
      }

      if (typeof data.htmlWeb === "string") {
        setPreviewHtml(data.htmlWeb);
        setShowPreview(true);
      }

      setMessage(
        "Сохранено. Веб-версия, email и текст пересобраны.",
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Не удалось сохранить выпуск.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <header className="border-b border-[#1C1A1B]/15 pb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#990F3D]">
              Flow / Issue editor
            </p>
            <h1 className="mt-3 font-serif text-4xl tracking-tight">
              Редактура выпуска
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#1C1A1B]/60">
              Можно править текст, менять порядок и убирать
              материалы. Состав источников фиксирован, а
              оригинальные записи Flow не изменяются.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs">
            <Link
              href="/admin/flow-issues"
              className="text-[#89827B] hover:text-[#1C1A1B]"
            >
              ← К выпускам
            </Link>
            <button
              type="button"
              onClick={() => setShowPreview((current) => !current)}
              disabled={!previewHtml}
              className="border border-[#1C1A1B]/20 px-3 py-2 font-mono uppercase tracking-wider hover:border-[#990F3D] disabled:opacity-40"
            >
              {showPreview ? "Скрыть предпросмотр" : "Предпросмотр"}
            </button>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-3 font-mono text-[10px] uppercase tracking-[0.12em] text-[#89827B]">
          <span>{issue.lang.toUpperCase()}</span>
          {issue.number != null && <span>№ {issue.number}</span>}
          <span>{issue.slug}</span>
        </div>
      </header>

      {showPreview && (
        <div className="mt-6 border border-[#1C1A1B]/15 bg-white">
          {previewHtml ? (
            <iframe
              title="Предпросмотр выпуска"
              srcDoc={previewHtml}
              sandbox=""
              className="h-[720px] w-full border-0 bg-white"
            />
          ) : (
            <p className="p-5 text-sm text-[#89827B]">
              Предпросмотр появится после сохранения.
            </p>
          )}
        </div>
      )}

      <section className="mt-8">
        <label className="block">
          <FieldLabel>Заголовок выпуска</FieldLabel>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="w-full border border-[#D9D3CD] bg-white px-4 py-3 font-serif text-2xl outline-none focus:border-[#990F3D]"
          />
        </label>
      </section>

      <section className="mt-10 border border-[#1C1A1B]/15 bg-white p-5 sm:p-7">
        <div className="mb-4 flex items-baseline justify-between border-b border-[#EAE6E1] pb-3">
          <h2 className="font-serif text-2xl">Lead</h2>
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#89827B]">
            {sections.lead ? "1 материал" : "нет"}
          </span>
        </div>

        {sections.lead ? (
          <article>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[#89827B]">
                <span className="rounded bg-[#F4EFEA] px-2 py-0.5 text-[#1C1A1B]">
                  {sections.lead.type || "item"}
                </span>
                <span>
                  {formatDate(sections.lead.publishedAt)}
                </span>
              </div>
              <button
                type="button"
                onClick={() =>
                  setSections((current) => ({
                    ...current,
                    lead: null,
                  }))
                }
                className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#89827B] hover:text-red-700"
              >
                убрать lead
              </button>
            </div>

            <div className="space-y-3">
              <label className="block">
                <FieldLabel>Заголовок</FieldLabel>
                <input
                  value={sections.lead.title}
                  onChange={(event) =>
                    updateLead("title", event.target.value)
                  }
                  className="w-full border border-[#D9D3CD] bg-white px-3 py-2 text-sm outline-none focus:border-[#990F3D]"
                />
              </label>
              <label className="block">
                <FieldLabel>Текст</FieldLabel>
                <textarea
                  value={sections.lead.body}
                  onChange={(event) =>
                    updateLead("body", event.target.value)
                  }
                  rows={6}
                  className="w-full resize-y border border-[#D9D3CD] bg-white px-3 py-2 text-sm leading-6 outline-none focus:border-[#990F3D]"
                />
              </label>
            </div>
          </article>
        ) : (
          <p className="text-sm text-[#89827B]">
            Lead удалён. Выпуск будет начинаться с рубрик.
          </p>
        )}
      </section>

      {(Object.keys(SECTION_LABELS) as ArraySection[]).map(
        (section) => (
          <section
            key={section}
            className="mt-8 border border-[#1C1A1B]/15 bg-white p-5 sm:p-7"
          >
            <div className="mb-4 flex items-baseline justify-between border-b border-[#EAE6E1] pb-3">
              <h2 className="font-serif text-2xl">
                {SECTION_LABELS[section]}
              </h2>
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#89827B]">
                {counts[section]} материалов
              </span>
            </div>

            {sections[section].length === 0 ? (
              <p className="text-sm text-[#89827B]">
                Пусто. Раздел будет скрыт в выпуске.
              </p>
            ) : (
              sections[section].map((entry, index) => (
                <EntryCard
                  key={entry.id}
                  entry={entry}
                  index={index}
                  section={section}
                  total={sections[section].length}
                  onMove={(direction) =>
                    moveEntry(section, index, direction)
                  }
                  onRemove={() => removeEntry(section, index)}
                  onChange={(field, value) =>
                    updateEntry(section, index, field, value)
                  }
                />
              ))
            )}
          </section>
        ),
      )}

      <div className="sticky bottom-4 z-10 mt-8 border border-[#1C1A1B]/15 bg-[#FAF8F5]/95 p-4 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0 text-sm">
            {error && (
              <p className="text-red-800" role="alert">
                {error}
              </p>
            )}
            {!error && message && (
              <p className="text-[#356B4D]" role="status">
                {message}
              </p>
            )}
            {!error && !message && (
              <p className="text-[#89827B]">
                Правки сохраняются только в выпуске, не в Flow.
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || !title.trim()}
            className="inline-flex min-h-11 items-center bg-[#990F3D] px-6 py-3 text-sm font-medium text-white transition hover:bg-[#7E0C33] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Сохраняю…" : "Сохранить выпуск"}
          </button>
        </div>
      </div>
    </div>
  );
}
