import Link from "next/link";
import { getServerSupabaseClient } from "@/lib/serverAuth";
import { loadAdminRagOverview } from "@/lib/analytics/adminRagOverview";

export const dynamic = "force-dynamic";

type CountResult = {
  label: string;
  value: number | null;
  href: string;
  detail?: string;
};

async function countRows(
  supabase: ReturnType<typeof getServerSupabaseClient>,
  table: string,
  configure?: (query: any) => any,
): Promise<number | null> {
  try {
    let query = supabase.from(table).select("id", {
      count: "exact",
      head: true,
    });

    if (configure) query = configure(query);

    const { count, error } = await query;
    if (error) {
      console.error(`[admin] count ${table}:`, error.message);
      return null;
    }

    return count ?? 0;
  } catch (error) {
    console.error(`[admin] count ${table}:`, error);
    return null;
  }
}

function Metric({ item }: { item: CountResult }) {
  return (
    <Link
      href={item.href}
      className="group block border-t border-[#D9D3CD] py-5 transition-colors hover:border-[#990F3D]"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="text-sm text-[#746D66] group-hover:text-[#211F1F]">
          {item.label}
        </span>
        <span className="text-xs text-[#A29B94] transition group-hover:text-[#990F3D]">
          ↗
        </span>
      </div>
      <div className="mt-3 font-serif text-3xl font-normal tracking-tight text-[#211F1F] sm:text-4xl">
        {item.value === null ? "—" : item.value.toLocaleString("en-GB")}
      </div>
      {item.detail && (
        <p className="mt-1 text-xs text-[#89827B]">{item.detail}</p>
      )}
    </Link>
  );
}

function Section({
  title,
  href,
  children,
}: {
  title: string;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <section className="min-w-0">
      <div className="mb-3 flex items-center justify-between gap-3 border-b border-[#D9D3CD] pb-3">
        <h2 className="font-serif text-xl">{title}</h2>
        <Link
          href={href}
          className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-[#827B74] hover:text-[#990F3D]"
        >
          Все ↗
        </Link>
      </div>
      {children}
    </section>
  );
}

export default async function AdminDashboard() {
  const supabase = getServerSupabaseClient({ useServiceRole: true });

  const [
    users,
    activeSubscribers,
    totalSubscribers,
    flowIssues,
    sentFlowIssues,
    mediaRecords,
    items,
    publishedItems,
    drafts,
    projects,
    letters,
    recentIssuesResult,
    recentMediaResult,
    recentItemsResult,
    recentLettersResult,
    ragOverview,
  ] = await Promise.all([
    countRows(supabase, "users"),
    countRows(supabase, "subscribers", (q) => q.eq("isActive", true)),
    countRows(supabase, "subscribers"),
    countRows(supabase, "letters", (q) => q.eq("kind", "issue")),
    countRows(supabase, "letters", (q) =>
      q.eq("kind", "issue").not("sent_at", "is", null),
    ),
    countRows(supabase, "media_archive_records"),
    countRows(supabase, "items"),
    countRows(supabase, "items", (q) =>
      q.eq("status", "published").eq("visibility", "public"),
    ),
    countRows(supabase, "items", (q) => q.eq("status", "draft")),
    countRows(supabase, "projects"),
    countRows(supabase, "letters", (q) => q.neq("kind", "issue")),
    supabase
      .from("letters")
      .select(
        "id,title,slug,number,lang,status,published,sent_at,publishedAt,createdAt",
      )
      .eq("kind", "issue")
      .order("createdAt", { ascending: false })
      .limit(5),
    supabase
      .from("media_archive_records")
      .select("id,title,outlet,kind,published_date,status,created_at")
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("items")
      .select("id,type,title,slug,status,visibility,published_at,created_at")
      .order("updated_at", { ascending: false })
      .limit(5),
    supabase
      .from("letters")
      .select("id,title,slug,published,createdAt")
      .neq("kind", "issue")
      .order("createdAt", { ascending: false })
      .limit(5),
    loadAdminRagOverview(supabase).catch((error) => {
      console.error("[admin] RAG overview failed:", error);
      return null;
    }),
  ]);

  const metrics: CountResult[] = [
    {
      label: "Пользователи",
      value: users,
      href: "/admin/users",
      detail: "Зарегистрированные профили",
    },
    {
      label: "Подписчики",
      value: activeSubscribers,
      href: "/admin/users",
      detail: `${totalSubscribers ?? "—"} всего в базе · Активные`,
    },
    {
      label: "Выпуски Flow",
      value: flowIssues,
      href: "/admin/flow-issues",
      detail: `${sentFlowIssues ?? 0} разослано`,
    },
    {
      label: "Медиа публикации",
      value: mediaRecords,
      href: "/admin/media",
      detail: "В архиве /media",
    },
    {
      label: "Flow записи",
      value: publishedItems,
      href: "/flow",
      detail: `${drafts ?? 0} черновиков`,
    },
    {
      label: "Проекты",
      value: projects,
      href: "/admin/projects",
      detail: "Архив проектов",
    },
  ];

  const recentIssues = Array.isArray(recentIssuesResult.data)
    ? recentIssuesResult.data
    : [];
  const recentMedia = Array.isArray(recentMediaResult.data)
    ? recentMediaResult.data
    : [];
  const recentItems = Array.isArray(recentItemsResult.data)
    ? recentItemsResult.data
    : [];
  const recentLetters = Array.isArray(recentLettersResult.data)
    ? recentLettersResult.data
    : [];

  return (
    <div className="space-y-12 pb-10">
      {/* Header with primary actions */}
      <header className="border-b border-[#D9D3CD] pb-7">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#89827B]">
          MERKUROV.LOVE / CONTROL ROOM
        </p>

        <div className="mt-4 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <h1 className="font-serif text-4xl font-normal tracking-tight sm:text-5xl">
              Обзор
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-[#746D66]">
              Управление выпуском газеты, добавление публикаций в Медиа, стрим Flow и аудитория.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/admin/flow-issues"
              className="inline-flex items-center gap-2 border border-[#990F3D] bg-[#990F3D] px-4 py-2.5 text-xs font-medium text-white transition hover:bg-[#7E0C33] active:scale-95 shadow-sm"
            >
              Газета: собрать & отправить ↗
            </Link>

            <Link
              href="/admin/media"
              className="inline-flex items-center gap-2 border border-[#D9D3CD] bg-white px-4 py-2.5 text-xs font-medium text-[#211F1F] transition hover:border-[#990F3D] hover:text-[#990F3D]"
            >
              Добавить в Медиа ↗
            </Link>

            <Link
              href="/flow"
              className="inline-flex items-center gap-1.5 px-2 py-2 text-xs font-mono uppercase tracking-wider text-[#827B74] transition hover:text-[#211F1F]"
            >
              Стрим Flow ↗
            </Link>
          </div>
        </div>
      </header>

      {/* Live key statistics: Users and Subscribers strictly separated */}
      <section>
        <div className="mb-5 flex items-end justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#89827B]">
              Статистика
            </p>
            <h2 className="mt-1 font-serif text-2xl">Ключевые показатели</h2>
          </div>
          <span className="text-xs text-[#89827B]">Live</span>
        </div>

        <div className="grid grid-cols-2 gap-x-5 gap-y-2 sm:grid-cols-3 xl:grid-cols-6">
          {metrics.map((item) => (
            <Metric key={item.label} item={item} />
          ))}
        </div>
      </section>

      {ragOverview && (
        <Section title="RAG / Brain" href="/admin/brain">
          <div className="mb-4 flex flex-wrap items-center gap-2 font-mono text-[9px] uppercase tracking-[0.14em] text-[#89827B]">
            <span>Window: last {ragOverview.retrieval.attempts} retrieval events</span>
            <span>·</span>
            <Link href="/admin/media/intelligence" className="underline hover:text-[#990F3D]">
              Media Intelligence
            </Link>
            <span>·</span>
            <Link href="/admin/pierrot" className="underline hover:text-[#990F3D]">
              Pierrot
            </Link>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="border-t border-[#D9D3CD] pt-3">
              <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#89827B]">
                Brain corpus
              </p>
              <p className="mt-2 font-serif text-3xl">{ragOverview.documents.total}</p>
              <p className="mt-1 text-xs text-[#746D66]">
                documents · {ragOverview.documents.chunks} chunks ·{' '}
                {ragOverview.documents.embeddedChunks} embedded
              </p>
              <p className="mt-2 text-[10px] leading-relaxed text-[#89827B]">
                {ragOverview.documents.bySourceType
                  .map((item) => `${item.key} ${item.value}`)
                  .join(" · ") || "no indexed documents"}
              </p>
            </div>

            <div className="border-t border-[#D9D3CD] pt-3">
              <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#89827B]">
                Ingestion queue
              </p>
              <p className="mt-2 text-sm leading-6 text-[#625D58]">
                queued <strong className="text-[#211F1F]">{ragOverview.queues.brain.queued}</strong> ·{" "}
                processing <strong>{ragOverview.queues.brain.processing}</strong> · failed{" "}
                <strong className={ragOverview.queues.brain.failed > 0 ? "text-[#990F3D]" : ""}>
                  {ragOverview.queues.brain.failed}
                </strong>
              </p>
              <p className="mt-1 text-xs text-[#89827B]">
                {ragOverview.queues.brain.completed} completed · {ragOverview.queues.brain.skipped} skipped
              </p>
              <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.1em] text-[#A29B94]">
                oldest queued:{" "}
                {ragOverview.queues.brain.oldestQueuedAt
                  ? new Date(ragOverview.queues.brain.oldestQueuedAt).toLocaleString("ru-RU")
                  : "—"}
              </p>
            </div>

            <div className="border-t border-[#D9D3CD] pt-3">
              <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#89827B]">
                Graph / media analysis
              </p>
              <p className="mt-2 text-sm leading-6 text-[#625D58]">
                graph queued <strong>{ragOverview.queues.graph.queued}</strong> · processing{" "}
                <strong>{ragOverview.queues.graph.processing}</strong> · failed{" "}
                <strong className={ragOverview.queues.graph.failed > 0 ? "text-[#990F3D]" : ""}>
                  {ragOverview.queues.graph.failed}
                </strong>
              </p>
              <p className="mt-1 text-xs text-[#89827B]">
                media analysis pending {ragOverview.queues.mediaAnalysis.queued} · processing{" "}
                {ragOverview.queues.mediaAnalysis.processing} · failed{" "}
                {ragOverview.queues.mediaAnalysis.failed}
              </p>
              <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.1em] text-[#A29B94]">
                oldest graph queued:{" "}
                {ragOverview.queues.graph.oldestQueuedAt
                  ? new Date(ragOverview.queues.graph.oldestQueuedAt).toLocaleDateString("ru-RU")
                  : "—"}
              </p>
            </div>

            <div className="border-t border-[#D9D3CD] pt-3">
              <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#89827B]">
                Retrieval · 30 days
              </p>
              <p className="mt-2 text-sm leading-6 text-[#625D58]">
                attempts <strong className="text-[#211F1F]">{ragOverview.retrieval.attempts}</strong> · relevant{" "}
                <strong>{ragOverview.retrieval.relevant}</strong> · no match{" "}
                <strong>{ragOverview.retrieval.noMatch}</strong>
              </p>
              <p className="mt-1 text-xs text-[#89827B]">
                unavailable {ragOverview.retrieval.unavailable} · errors {ragOverview.retrieval.errors} ·
                media {ragOverview.retrieval.media} · context used {ragOverview.retrieval.contextUsed}
              </p>
              <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.1em] text-[#A29B94]">
                avg latency:{" "}
                {ragOverview.retrieval.averageLatencyMs === null
                  ? "—"
                  : `${ragOverview.retrieval.averageLatencyMs} ms`}{" "}
                · last:{" "}
                {ragOverview.retrieval.lastAt
                  ? new Date(ragOverview.retrieval.lastAt).toLocaleDateString("ru-RU")
                  : "—"}
              </p>
            </div>
          </div>

          <div className="mt-3 grid gap-2 border-t border-[#EEE9E4] pt-3 text-[10px] text-[#89827B] sm:grid-cols-2 lg:grid-cols-4">
            <p>
              Media records: <strong>{ragOverview.media.records}</strong> · linked docs{" "}
              <strong>{ragOverview.media.withDocument}</strong>
            </p>
            <p>
              Quotes: <strong>{ragOverview.media.quotes}</strong> · topics{" "}
              <strong>{ragOverview.media.topics}</strong>
            </p>
            <p>
              Entities: <strong>{ragOverview.media.entities}</strong> · relations{" "}
              <strong>{ragOverview.media.relations}</strong>
            </p>
            <p>
              Retrieval sources:{" "}
              {ragOverview.retrieval.sources.length > 0
                ? ragOverview.retrieval.sources
                    .slice(0, 4)
                    .map((item) => `${item.key} ${item.value}`)
                    .join(" · ")
                : "—"}
            </p>
          </div>
        </Section>
      )}

      {/* Main Content Sections: Flow Issues, Media, Flow Posts, Letters */}
      <div className="grid grid-cols-1 gap-10 xl:grid-cols-2">
        {/* SECTION 1: Flow Issues */}
        <Section title="Выпуски газеты Flow" href="/admin/flow-issues">
          {recentIssues.length === 0 ? (
            <p className="py-6 text-sm text-[#89827B]">Выпуски ещё не созданы.</p>
          ) : (
            <div>
              {recentIssues.map((issueItem: any) => (
                <div
                  key={issueItem.id}
                  className="flex items-center justify-between gap-4 border-b border-[#EAE6E1] py-3.5"
                >
                  <div className="min-w-0">
                    <Link
                      href={`/letters/${issueItem.slug}`}
                      className="block truncate text-sm font-medium hover:text-[#990F3D]"
                    >
                      {issueItem.title || `Выпуск №${issueItem.number || ""}`}
                    </Link>
                    <p className="mt-1 truncate font-mono text-[10px] text-[#89827B]">
                      {issueItem.lang?.toUpperCase() || "RU"} ·{" "}
                      {issueItem.publishedAt
                        ? new Date(issueItem.publishedAt).toLocaleDateString("ru-RU")
                        : "Черновик"}
                    </p>
                  </div>

                  <span
                    className={[
                      "shrink-0 font-mono text-[10px] uppercase",
                      issueItem.sent_at
                        ? "text-[#356B4D]"
                        : issueItem.published
                          ? "text-[#990F3D]"
                          : "text-[#89827B]",
                    ].join(" ")}
                  >
                    {issueItem.sent_at
                      ? "Разослан"
                      : issueItem.published
                        ? "Опубликован"
                        : "Черновик"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* SECTION 2: Media Archive */}
        <Section title="Медиа публикации" href="/admin/media">
          {recentMedia.length === 0 ? (
            <p className="py-6 text-sm text-[#89827B]">
              Публикаций в каталоге пока нет.
            </p>
          ) : (
            <div>
              {recentMedia.map((record: any) => (
                <div
                  key={record.id}
                  className="flex items-center justify-between gap-4 border-b border-[#EAE6E1] py-3.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[#211F1F]">
                      {record.title || "Без заголовка"}
                    </p>
                    <p className="mt-1 truncate font-mono text-[10px] text-[#89827B]">
                      {record.outlet} · {record.kind || "статья"}
                    </p>
                  </div>

                  <span
                    className={[
                      "shrink-0 font-mono text-[10px] uppercase",
                      record.status === "published"
                        ? "text-[#356B4D]"
                        : "text-[#89827B]",
                    ].join(" ")}
                  >
                    {record.status === "published" ? "Опубликовано" : "Черновик"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* SECTION 3: Recent Flow Stream Items */}
        <Section title="Стрим Flow" href="/flow">
          {recentItems.length === 0 ? (
            <p className="py-6 text-sm text-[#89827B]">Записей не найдено.</p>
          ) : (
            <div>
              {recentItems.map((item: any) => (
                <div
                  key={item.id}
                  className="flex min-w-0 items-center justify-between gap-4 border-b border-[#EAE6E1] py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm">
                      {item.title || "Короткая мысль / заметка"}
                    </p>
                    <p className="mt-1 font-mono text-[10px] uppercase text-[#89827B]">
                      {item.type} · {item.status}
                    </p>
                  </div>
                  <span
                    className={[
                      "shrink-0 text-[10px] uppercase",
                      item.visibility === "public"
                        ? "text-[#356B4D]"
                        : "text-[#89827B]",
                    ].join(" ")}
                  >
                    {item.visibility || "—"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* SECTION 4: Newsletter Archive & Letters */}
        <Section title="Архив писем" href="/admin/letters">
          {recentLetters.length === 0 ? (
            <p className="py-6 text-sm text-[#89827B]">Писем не найдено.</p>
          ) : (
            <div>
              {recentLetters.map((letter: any) => (
                <div
                  key={letter.id}
                  className="flex items-center justify-between gap-4 border-b border-[#EAE6E1] py-3"
                >
                  <div className="min-w-0">
                    <Link
                      href={`/admin/letters/edit/${letter.id}`}
                      className="block truncate text-sm hover:text-[#990F3D]"
                    >
                      {letter.title || "Untitled letter"}
                    </Link>
                    <p className="mt-1 truncate font-mono text-[10px] text-[#89827B]">
                      /{letter.slug}
                    </p>
                  </div>
                  <span className="shrink-0 text-[10px] uppercase text-[#89827B]">
                    {letter.published ? "Published" : "Draft"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}
