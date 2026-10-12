
"use client";

import { useEffect, useState } from "react";
import {
  DEFAULT_ISSUE_TEMPLATE,
  ISSUE_SECTION_KEYS,
  normalizeIssueTemplate,
  type IssueSectionKey,
  type IssueTemplateSettings,
} from "@/lib/flow-issue/template";

const SECTION_NAMES: Record<IssueSectionKey, string> = {
  lead: "Главное",
  latest: "Последнее в потоке",
  links: "Читать",
  videos: "Смотреть",
  photos: "Кадр",
  metrics: "Цифры",
  sources: "Источники",
  subscribe: "Подписка",
};

type Lang = "ru" | "en";

export default function FlowIssueTemplateAdmin() {
  const [config, setConfig] = useState<IssueTemplateSettings>(
    DEFAULT_ISSUE_TEMPLATE,
  );
  const [version, setVersion] = useState(0);
  const [language, setLanguage] = useState<Lang>("ru");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch(
          "/api/admin/flow-issues/template",
          { cache: "no-store" },
        );
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Не удалось загрузить настройки");
        }

        if (!cancelled) {
          setConfig(normalizeIssueTemplate(data.config));
          setVersion(Number(data.version) || 0);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Ошибка загрузки",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  function updateTheme(
    key: keyof IssueTemplateSettings["theme"],
    value: string | number,
  ) {
    setConfig((current) => ({
      ...current,
      theme: { ...current.theme, [key]: value },
    }));
  }

  function updateLimit(
    key: keyof IssueTemplateSettings["limits"],
    value: string,
  ) {
    setConfig((current) => ({
      ...current,
      limits: {
        ...current.limits,
        [key]: value === "" ? 0 : Number(value),
      },
    }));
  }

  function updateLabel(
    key: keyof IssueTemplateSettings["labels"]["ru"],
    value: string,
  ) {
    setConfig((current) => ({
      ...current,
      labels: {
        ...current.labels,
        [language]: {
          ...current.labels[language],
          [key]: value,
        },
      },
    }));
  }

  function toggleSection(key: IssueSectionKey, checked: boolean) {
    setConfig((current) => ({
      ...current,
      sections: {
        ...current.sections,
        enabled: {
          ...current.sections.enabled,
          [key]: checked,
        },
      },
    }));
  }

  function moveSection(key: IssueSectionKey, delta: number) {
    setConfig((current) => {
      const order = [...current.sections.order];
      const index = order.indexOf(key);
      const nextIndex = index + delta;

      if (index < 0 || nextIndex < 0 || nextIndex >= order.length) {
        return current;
      }

      [order[index], order[nextIndex]] = [
        order[nextIndex],
        order[index],
      ];

      return {
        ...current,
        sections: { ...current.sections, order },
      };
    });
  }

  async function save() {
    setSaving(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch(
        "/api/admin/flow-issues/template",
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ config }),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Не удалось сохранить шаблон");
      }

      setConfig(normalizeIssueTemplate(data.config));
      setVersion(Number(data.version) || version + 1);
      setMessage(
        `Сохранена версия ${data.version}. Она будет применяться к следующим выпускам.`,
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Ошибка сохранения",
      );
    } finally {
      setSaving(false);
    }
  }

  function resetDefaults() {
    if (
      !window.confirm(
        "Заменить текущие настройки стандартными? Будет создана новая версия.",
      )
    ) {
      return;
    }

    setConfig(DEFAULT_ISSUE_TEMPLATE);
    setMessage("");
    setError("");
  }

  const labels = config.labels[language];

  if (loading) {
    return <main className="p-8">Загружаю настройки шаблона…</main>;
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-5 py-10 text-[#1C1A1B]">
      <header className="mb-8 border-b border-black/20 pb-6">
        <p className="mb-3 font-mono text-xs uppercase tracking-[0.18em] text-[#990F3D]">
          FLOW / EDITION TEMPLATE
        </p>
        <h1 className="font-serif text-4xl tracking-tight">
          Настройки выпуска
        </h1>
        <p className="mt-3 text-sm leading-6 text-black/60">
          Эти настройки используются при сборке будущих выпусков.
          Уже опубликованные выпуски остаются неизменными.
        </p>
        <p className="mt-3 font-mono text-xs text-black/50">
          Активная версия: {version || "стандартная"}
        </p>
      </header>

      {error && (
        <p role="alert" className="mb-5 border-l-2 border-red-700 bg-red-50 p-3 text-sm text-red-900">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="mb-5 border-l-2 border-[#990F3D] bg-[#FFF1E5] p-3 text-sm">
          {message}
        </p>
      )}

      <section className="mb-8 border border-black/15 p-5">
        <h2 className="mb-5 font-serif text-2xl">Внешний вид</h2>

        <div className="grid gap-5 sm:grid-cols-2">
          {(
            [
              ["accent", "Акцентный цвет"],
              ["paper", "Фон"],
              ["ink", "Основной текст"],
              ["muted", "Вторичный текст"],
              ["rule", "Линии и разделители"],
            ] as const
          ).map(([key, title]) => (
            <label key={key} className="block">
              <span className="mb-2 block text-sm">{title}</span>
              <div className="flex gap-3">
                <input
                  type="color"
                  value={config.theme[key]}
                  onChange={(event) => updateTheme(key, event.target.value)}
                  className="h-11 w-14 border border-black/20 bg-white p-1"
                />
                <input
                  value={config.theme[key]}
                  onChange={(event) => updateTheme(key, event.target.value)}
                  className="min-w-0 flex-1 border border-black/20 px-3 py-2 font-mono text-sm"
                  maxLength={7}
                />
              </div>
            </label>
          ))}

          <label className="block">
            <span className="mb-2 block text-sm">Ширина страницы (px)</span>
            <input
              type="number"
              min={480}
              max={1120}
              value={config.theme.maxWidth}
              onChange={(event) =>
                updateTheme("maxWidth", Number(event.target.value))
              }
              className="w-full border border-black/20 px-3 py-3 text-sm"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm">Шрифт заголовков и текста</span>
            <input
              value={config.theme.serifFont}
              onChange={(event) =>
                updateTheme("serifFont", event.target.value)
              }
              className="w-full border border-black/20 px-3 py-3 text-sm"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm">Шрифт интерфейсных подписей</span>
            <input
              value={config.theme.sansFont}
              onChange={(event) =>
                updateTheme("sansFont", event.target.value)
              }
              className="w-full border border-black/20 px-3 py-3 text-sm"
            />
          </label>
        </div>

        <div
          className="mt-6 border-t pt-5"
          style={{
            backgroundColor: config.theme.paper,
            color: config.theme.ink,
            borderColor: config.theme.rule,
          }}
        >
          <p
            className="font-mono text-xs uppercase tracking-widest"
            style={{ color: config.theme.accent }}
          >
            Предпросмотр цветов
          </p>
          <h3
            className="mt-2 text-3xl"
            style={{ fontFamily: config.theme.serifFont }}
          >
            {labels.masthead}
          </h3>
          <p style={{ color: config.theme.muted }}>
            Так будут выглядеть основные цвета выбранного шаблона.
          </p>
        </div>
      </section>

      <section className="mb-8 border border-black/15 p-5">
        <h2 className="mb-5 font-serif text-2xl">Состав выпуска</h2>
        <p className="mb-4 text-sm text-black/60">
          Выключайте ненужные рубрики и меняйте их порядок. Пустые рубрики
          всё равно не будут выводиться.
        </p>

        <div className="space-y-2">
          {config.sections.order.map((key, index) => (
            <div
              key={key}
              className="flex flex-wrap items-center gap-3 border-b border-black/10 py-3"
            >
              <input
                type="checkbox"
                checked={config.sections.enabled[key]}
                onChange={(event) => toggleSection(key, event.target.checked)}
                aria-label={`Показывать рубрику ${SECTION_NAMES[key]}`}
              />
              <span className="min-w-0 flex-1 text-sm">
                {index + 1}. {SECTION_NAMES[key]}
              </span>
              <button
                type="button"
                disabled={index === 0}
                onClick={() => moveSection(key, -1)}
                className="border border-black/20 px-3 py-1 text-sm disabled:opacity-30"
              >
                ↑
              </button>
              <button
                type="button"
                disabled={index === config.sections.order.length - 1}
                onClick={() => moveSection(key, 1)}
                className="border border-black/20 px-3 py-1 text-sm disabled:opacity-30"
              >
                ↓
              </button>
            </div>
          ))}
        </div>

        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          {(
            [
              ["latest", "Количество последних записей"],
              ["links", "Количество ссылок"],
              ["videos", "Количество видео"],
              ["photos", "Количество фотографий"],
            ] as const
          ).map(([key, title]) => (
            <label key={key} className="block">
              <span className="mb-2 block text-sm">{title}</span>
              <input
                type="number"
                min={0}
                max={30}
                value={config.limits[key]}
                onChange={(event) => updateLimit(key, event.target.value)}
                className="w-full border border-black/20 px-3 py-3 text-sm"
              />
            </label>
          ))}
        </div>
      </section>

      <section className="mb-8 border border-black/15 p-5">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-serif text-2xl">Тексты и названия рубрик</h2>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setLanguage("ru")}
              className={`border px-3 py-2 text-sm ${language === "ru" ? "border-[#990F3D] text-[#990F3D]" : "border-black/20"}`}
            >
              Русский
            </button>
            <button
              type="button"
              onClick={() => setLanguage("en")}
              className={`border px-3 py-2 text-sm ${language === "en" ? "border-[#990F3D] text-[#990F3D]" : "border-black/20"}`}
            >
              English
            </button>
          </div>
        </div>

        {(
          [
            ["masthead", "Название газеты"],
            ["lead", "Рубрика «Главное»"],
            ["latest", "Рубрика последних записей"],
            ["links", "Рубрика чтения"],
            ["videos", "Рубрика видео"],
            ["photos", "Рубрика фотографий"],
            ["metrics", "Рубрика статистики"],
            ["sources", "Рубрика источников"],
            ["subscribe", "Рубрика подписки"],
          ] as const
        ).map(([key, title]) => (
          <label key={key} className="mb-4 block">
            <span className="mb-2 block text-sm">{title}</span>
            <input
              value={labels[key]}
              onChange={(event) => updateLabel(key, event.target.value)}
              className="w-full border border-black/20 px-3 py-3 text-sm"
            />
          </label>
        ))}

        <label className="block">
          <span className="mb-2 block text-sm">Текст подписки</span>
          <textarea
            value={labels.subscribeCopy}
            onChange={(event) =>
              updateLabel("subscribeCopy", event.target.value)
            }
            rows={3}
            className="w-full border border-black/20 px-3 py-3 text-sm"
          />
        </label>
      </section>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="min-h-12 bg-[#990F3D] px-6 py-3 text-sm font-medium text-white disabled:opacity-50"
        >
          {saving ? "Сохраняю…" : "Сохранить новую версию"}
        </button>
        <button
          type="button"
          onClick={resetDefaults}
          disabled={saving}
          className="min-h-12 border border-black/25 px-5 py-3 text-sm"
        >
          Вернуть стандартные настройки
        </button>
        <a
          href="/admin/flow-issues"
          className="inline-flex min-h-12 items-center border border-black/25 px-5 py-3 text-sm"
        >
          К сборке выпусков
        </a>
      </div>
    </main>
  );
}
