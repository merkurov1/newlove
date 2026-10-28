import Link from "next/link";
import { notFound } from "next/navigation";
import { getServerSupabaseClient } from "@/lib/serverAuth";
import FlowIssueEditor, {
  type EditableIssueData,
  type EditableIssueEntryData,
} from "@/components/admin/FlowIssueEditor";
import type { IssuePayload } from "@/lib/flow-issue/types";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Flow Issue Editor — Admin",
  robots: {
    index: false,
    follow: false,
  },
};

type PageProps = {
  params: Promise<{ id: string }> | { id: string };
};

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function editableEntry(value: unknown): EditableIssueEntryData | null {
  if (!isRecord(value) || typeof value.id !== "string") {
    return null;
  }

  const clean = (field: string) =>
    typeof value[field] === "string" ? value[field] : "";

  return {
    id: value.id,
    type: clean("type"),
    title: clean("title"),
    body: clean("body"),
    description: clean("description"),
    alt: clean("alt"),
    caption: clean("caption"),
    url: typeof value.url === "string" ? value.url : null,
    publishedAt: clean("publishedAt"),
  };
}

function editableList(value: unknown): EditableIssueEntryData[] {
  if (!Array.isArray(value)) return [];

  return value
    .map(editableEntry)
    .filter(
      (entry): entry is EditableIssueEntryData =>
        entry !== null,
    );
}

export default async function FlowIssueEditorPage({
  params,
}: PageProps) {
  const { id } = await params;
  const supabase = getServerSupabaseClient({
    useServiceRole: true,
  });

  const { data, error } = await supabase
    .from("letters")
    .select(
      "id,title,slug,kind,status,published,number,lang,payload,html_web",
    )
    .eq("id", id)
    .eq("kind", "issue")
    .maybeSingle();

  if (error || !data) notFound();

  if (
    data.status !== "draft" ||
    data.published ||
    !isRecord(data.payload)
  ) {
    return (
      <div className="mx-auto max-w-2xl border border-[#1C1A1B]/15 bg-white p-8">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-[#990F3D]">
          Flow / Issue
        </p>
        <h1 className="mt-3 font-serif text-3xl">
          Выпуск недоступен для редактирования
        </h1>
        <p className="mt-3 text-sm leading-6 text-[#1C1A1B]/65">
          Опубликованные выпуски и выпуски без payload не
          редактируются, чтобы сохранить архив неизменным.
        </p>
        <div className="mt-6 flex flex-wrap gap-4 text-sm">
          <Link
            href="/admin/flow-issues"
            className="text-[#990F3D] hover:underline"
          >
            ← К выпускам
          </Link>
          {data.slug && (
            <a
              href={`/letters/${data.slug}`}
              target="_blank"
              rel="noreferrer"
              className="text-[#1C1A1B] hover:underline"
            >
              Открыть выпуск ↗
            </a>
          )}
        </div>
      </div>
    );
  }

  const payload = data.payload as unknown as IssuePayload;

  const issue: EditableIssueData = {
    id: data.id,
    title: data.title || "Flow issue",
    slug: data.slug || "",
    lang: data.lang === "ru" ? "ru" : "en",
    number:
      typeof data.number === "number" ? data.number : null,
    previewHtml:
      typeof data.html_web === "string" ? data.html_web : "",
    lead: editableEntry(payload.lead),
    latest: editableList(payload.latest),
    links: editableList(payload.links),
    videos: editableList(payload.videos),
    photos: editableList(payload.photos),
  };

  return <FlowIssueEditor key={issue.id} issue={issue} />;
}
