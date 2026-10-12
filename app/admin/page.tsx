import Link from "next/link";
import { getServerSupabaseClient } from "@/lib/serverAuth";

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
        <span className="text-sm text-[#746D66]">{item.label}</span>
        <span className="text-xs text-[#A29B94] transition group-hover:text-[#990F3D]">
          ↗
        </span>
      </div>
      <div className="mt-3 font-serif text-4xl font-normal tracking-tight text-[#211F1F]">
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
          Open ↗
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
    subscribers,
    items,
    publishedItems,
    drafts,
    projects,
    articles,
    letters,
    newsletterJobs,
    postcards,
    postcardOrders,
    lots,
    templeEvents,
    recentItemsResult,
    recentProjectsResult,
    recentLettersResult,
  ] = await Promise.all([
    countRows(supabase, "users"),
    countRows(supabase, "subscribers"),
    countRows(supabase, "items"),
    countRows(supabase, "items", (q) =>
      q.eq("status", "published").eq("visibility", "public"),
    ),
    countRows(supabase, "items", (q) => q.eq("status", "draft")),
    countRows(supabase, "projects"),
    countRows(supabase, "articles"),
    countRows(supabase, "letters"),
    countRows(supabase, "newsletter_jobs"),
    countRows(supabase, "postcards"),
    countRows(supabase, "postcard_orders"),
    countRows(supabase, "lots"),
    countRows(supabase, "temple_log"),
    supabase
      .from("items")
      .select("id,type,title,slug,status,visibility,published_at,created_at")
      .order("updated_at", { ascending: false })
      .limit(6),
    supabase
      .from("projects")
      .select("id,title,slug,published,createdAt")
      .order("createdAt", { ascending: false })
      .limit(5),
    supabase
      .from("letters")
      .select("id,title,slug,published,createdAt")
      .order("createdAt", { ascending: false })
      .limit(5),
  ]);

  const metrics: CountResult[] = [
    { label: "Users", value: users, href: "/admin/users" },
    {
      label: "Subscribers",
      value: subscribers,
      href: "/admin/users",
      detail: "Subscriber records",
    },
    {
      label: "Public Flow items",
      value: publishedItems,
      href: "/flow",
      detail: `${drafts ?? "—"} drafts · ${items ?? "—"} total`,
    },
    { label: "Projects", value: projects, href: "/admin/projects" },
    {
      label: "Legacy articles",
      value: articles,
      href: "/admin/selection",
    },
    {
      label: "Newsletter archive",
      value: letters,
      href: "/admin/letters",
    },
    {
      label: "Delivery jobs",
      value: newsletterJobs,
      href: "/admin/newsletter-jobs",
    },
    {
      label: "Postcards",
      value: postcards,
      href: "/admin/postcards",
      detail: `${postcardOrders ?? "—"} orders`,
    },
    { label: "Art lots", value: lots, href: "/admin/ai-selection" },
    {
      label: "Temple events",
      value: templeEvents,
      href: "/temple",
      detail: "Recorded activity",
    },
  ];

  const recentItems = Array.isArray(recentItemsResult.data)
    ? recentItemsResult.data
    : [];
  const recentProjects = Array.isArray(recentProjectsResult.data)
    ? recentProjectsResult.data
    : [];
  const recentLetters = Array.isArray(recentLettersResult.data)
    ? recentLettersResult.data
    : [];

  const queryErrors = [
    recentItemsResult.error,
    recentProjectsResult.error,
    recentLettersResult.error,
  ].filter(Boolean);

  return (
    <div className="space-y-12 pb-10">
      <header className="border-b border-[#D9D3CD] pb-7">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#89827B]">
          MERKUROV.LOVE / CONTROL ROOM
        </p>
        <div className="mt-4 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <h1 className="font-serif text-4xl font-normal tracking-tight sm:text-5xl">
              Overview
            </h1>
            <p className="mt-2 max-w-xl text-sm text-[#746D66]">
              Content, audience, projects and distribution.
            </p>
          </div>
          <Link
            href="/flow"
            className="inline-flex w-fit items-center gap-3 border border-[#990F3D] bg-[#990F3D] px-4 py-3 text-xs text-white transition hover:bg-[#7E0C33]"
          >
            Open Flow <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </header>

      {queryErrors.length > 0 && (
        <div
          role="status"
          className="border border-[#E7C9D2] bg-[#FFF1E5] px-4 py-3 text-sm text-[#7E0C33]"
        >
          Some recent-content lists could not be loaded. The affected database
          query is logged on the server.
        </div>
      )}

      <section>
        <div className="mb-5 flex items-end justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#89827B]">
              Database
            </p>
            <h2 className="mt-2 font-serif text-2xl">Project statistics</h2>
          </div>
          <span className="text-xs text-[#89827B]">Live counts</span>
        </div>
        <div className="grid grid-cols-2 gap-x-5 gap-y-1 sm:grid-cols-3 xl:grid-cols-5">
          {metrics.map((item) => (
            <Metric key={item.label} item={item} />
          ))}
        </div>
      </section>

      <section>
        <div className="mb-5 border-b border-[#D9D3CD] pb-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#89827B]">
            Actions
          </p>
          <h2 className="mt-2 font-serif text-2xl">Workspace</h2>
        </div>
        <div className="grid grid-cols-1 gap-0 sm:grid-cols-2 xl:grid-cols-3">
          {[
            {
              href: "/admin/users",
              number: "01",
              title: "Users & access",
              detail: "Accounts, roles and subscriptions",
            },
            {
              href: "/flow",
              number: "02",
              title: "Flow",
              detail: "Write, edit and publish stream items",
            },
            {
              href: "/admin/projects",
              number: "03",
              title: "Projects",
              detail: "Manage existing project pages",
            },
            {
              href: "/admin/letters",
              number: "04",
              title: "Newsletter archive",
              detail: "Review existing letters and delivery",
            },
            {
              href: "/admin/postcards",
              number: "05",
              title: "Postcards",
              detail: "Catalogue and availability",
            },
            {
              href: "/admin/newsletter-jobs",
              number: "06",
              title: "Delivery logs",
              detail: "Review newsletter jobs",
            },
          ].map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className="group border-b border-[#D9D3CD] py-5 pr-4 transition hover:bg-[#FFF1E5] sm:odd:pr-6 sm:even:pl-6 xl:odd:pr-8"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="font-mono text-[10px] text-[#A29B94]">
                  {action.number}
                </span>
                <span className="text-sm text-[#A29B94] group-hover:text-[#990F3D]">
                  ↗
                </span>
              </div>
              <h3 className="mt-4 font-serif text-xl">{action.title}</h3>
              <p className="mt-1 text-xs text-[#746D66]">{action.detail}</p>
            </Link>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-10 xl:grid-cols-2">
        <Section title="Recent Flow" href="/flow">
          {recentItems.length === 0 ? (
            <p className="py-6 text-sm text-[#89827B]">No items found.</p>
          ) : (
            <div>
              {recentItems.map((item: any) => (
                <div
                  key={item.id}
                  className="flex min-w-0 items-center justify-between gap-4 border-b border-[#EAE6E1] py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm">
                      {item.title || "Untitled"}
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

        <Section title="Recent projects" href="/admin/projects">
          {recentProjects.length === 0 ? (
            <p className="py-6 text-sm text-[#89827B]">No projects found.</p>
          ) : (
            <div>
              {recentProjects.map((project: any) => (
                <div
                  key={project.id}
                  className="flex items-center justify-between gap-4 border-b border-[#EAE6E1] py-3"
                >
                  <div className="min-w-0">
                    <Link
                      href={`/admin/projects/edit/${project.id}`}
                      className="block truncate text-sm hover:text-[#990F3D]"
                    >
                      {project.title || "Untitled project"}
                    </Link>
                    <p className="mt-1 truncate font-mono text-[10px] text-[#89827B]">
                      /{project.slug}
                    </p>
                  </div>
                  <span className="shrink-0 text-[10px] uppercase text-[#89827B]">
                    {project.published ? "Published" : "Draft"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section title="Newsletter archive" href="/admin/letters">
          {recentLetters.length === 0 ? (
            <p className="py-6 text-sm text-[#89827B]">No letters found.</p>
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

        <Section title="Legacy systems" href="/admin/ai-selection">
          <div className="border-b border-[#EAE6E1] py-4">
            <Link
              href="/admin/ai-selection"
              className="text-sm hover:text-[#990F3D]"
            >
              AI selection / Art Engine legacy ↗
            </Link>
            <p className="mt-1 text-xs text-[#746D66]">
              Keep available until the current lot workflow is verified.
            </p>
          </div>
          <div className="border-b border-[#EAE6E1] py-4">
            <Link
              href="/admin/monitor"
              className="text-sm hover:text-[#990F3D]"
            >
              Auction monitor legacy ↗
            </Link>
            <p className="mt-1 text-xs text-[#746D66]">
              Retained for inspection; do not use as the primary import flow.
            </p>
          </div>
          <div className="border-b border-[#EAE6E1] py-4">
            <Link
              href="/admin/selection"
              className="text-sm hover:text-[#990F3D]"
            >
              Existing article archive ↗
            </Link>
            <p className="mt-1 text-xs text-[#746D66]">
              Preserve existing records; new stream content belongs in Flow.
            </p>
          </div>
        </Section>
      </div>
    </div>
  );
}