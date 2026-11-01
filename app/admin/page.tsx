import Link from "next/link";
import { getServerSupabaseClient } from "@/lib/serverAuth";
import {
  loadRecentPierrotConversations,
  type RecentPierrotConversation,
} from "@/lib/analytics/adminRecentConversations";

export const dynamic = "force-dynamic";

type MetricItem = {
  label: string;
  value: number | null;
  href: string;
};

type FlowItemRow = {
  id: string;
  type: string | null;
  title: string | null;
  slug: string | null;
  status: string | null;
  visibility: string | null;
  published_at: string | null;
  created_at: string | null;
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

function Metric({ item }: { item: MetricItem }) {
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
    </Link>
  );
}

function Section({
  title,
  href,
  children,
}: {
  title: string;
  href?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="min-w-0">
      <div className="mb-3 flex items-center justify-between gap-3 border-b border-[#D9D3CD] pb-3">
        <h2 className="font-serif text-xl">{title}</h2>
        {href && (
          <Link
            href={href}
            className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-[#827B74] hover:text-[#990F3D]"
          >
            Все ↗
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function ConversationRow({ item }: { item: RecentPierrotConversation }) {
  return (
    <Link
      href={item.href}
      className="group flex items-center justify-between gap-4 border-b border-[#EAE6E1] py-3.5 transition-colors hover:border-[#990F3D]"
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-medium group-hover:text-[#990F3D]">
          {item.language.toUpperCase()} · {item.startPage}
        </p>
        <p className="mt-1 truncate font-mono text-[10px] text-[#89827B]">
          {formatDate(item.lastMessageAt || item.startedAt)} · {item.status}
          {item.messageCount !== null ? ` · ${item.messageCount} сообщ.` : ""}
          {item.lastMessageRole ? ` · ${item.lastMessageRole}` : ""}
        </p>
      </div>
      <span className="shrink-0 font-mono text-[10px] uppercase text-[#A29B94] group-hover:text-[#990F3D]">
        {item.id.slice(-8)}
      </span>
    </Link>
  );
}

export default async function AdminDashboard() {
  const supabase = getServerSupabaseClient({ useServiceRole: true });

  const [users, activeSubscribers, publishedItems, recentItemsResult, recentConversations] =
    await Promise.all([
      countRows(supabase, "users"),
      countRows(supabase, "subscribers", (q) => q.eq("isActive", true)),
      countRows(supabase, "items", (q) =>
        q.eq("status", "published").eq("visibility", "public"),
      ),
      supabase
        .from("items")
        .select("id,type,title,slug,status,visibility,published_at,created_at")
        .order("updated_at", { ascending: false })
        .limit(5),
      loadRecentPierrotConversations(supabase, 15),
    ]);

  const metrics: MetricItem[] = [
    {
      label: "Пользователи",
      value: users,
      href: "/admin/users",
    },
    {
      label: "Подписчики",
      value: activeSubscribers,
      href: "/admin/users",
    },
    {
      label: "Записи Flow",
      value: publishedItems,
      href: "/flow",
    },
  ];

  const recentItems = Array.isArray(recentItemsResult.data)
    ? (recentItemsResult.data as FlowItemRow[])
    : [];

  return (
    <div className="space-y-10 pb-10">
      <header className="border-b border-[#D9D3CD] pb-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <h1 className="font-serif text-4xl font-normal tracking-tight sm:text-5xl">
            Обзор
          </h1>

          <Link
            href="/admin/flow-issues"
            className="inline-flex items-center gap-2 border border-[#990F3D] bg-[#990F3D] px-4 py-2.5 text-xs font-medium text-white transition hover:bg-[#7E0C33] active:scale-95"
          >
            Газета: собрать &amp; отправить ↗
          </Link>
        </div>
      </header>

      <section className="grid grid-cols-1 gap-x-5 sm:grid-cols-3">
        {metrics.map((item) => (
          <Metric key={item.label} item={item} />
        ))}
      </section>

      <div className="grid grid-cols-1 gap-10 xl:grid-cols-2">
        <Section title="Последние записи Flow" href="/flow">
          {recentItems.length === 0 ? (
            <p className="py-6 text-sm text-[#89827B]">Записей не найдено.</p>
          ) : (
            <div>
              {recentItems.map((item) => (
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

        <Section title="Последние 15 диалогов Pierrot">
          {recentConversations.length === 0 ? (
            <p className="py-6 text-sm text-[#89827B]">Диалогов не найдено.</p>
          ) : (
            <div>
              {recentConversations.map((item) => (
                <ConversationRow key={item.id} item={item} />
              ))}
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}
