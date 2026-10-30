
import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import ReadMoreOrLoginClient from "@/components/letters/ReadMoreOrLoginClient";
import { parseRichTextContent } from "@/lib/contentParser";
import { sanitizeMetadata } from "@/lib/metadataSanitize";

const SITE = "https://www.merkurov.love";

type PageProps = {
  params: { slug: string } | Promise<{ slug: string }>;
};

function getIssueBody(html: string): string | null {
  const match = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
  return match?.[1] ?? null;
}

function getIssueStyles(html: string): string {
  const match = html.match(/<style\b[^>]*>([\s\S]*?)<\/style>/i);
  return match?.[1] ?? "";
}

function isRecord(value: unknown): value is Record<string, any> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function getIssueOgImage(payload: unknown): string {
  const data = isRecord(payload) ? payload : {};
  const lead = isRecord(data.lead) ? data.lead : {};
  const metadata = isRecord(lead.metadata) ? lead.metadata : {};
  const linkPreview = isRecord(metadata.link_preview)
    ? metadata.link_preview
    : isRecord(metadata.linkPreview)
      ? metadata.linkPreview
      : {};

  const firstLink = Array.isArray(data.links)
    ? data.links.find(
        (entry: unknown) =>
          isRecord(entry) &&
          typeof entry.image === "string" &&
          entry.image.trim(),
      )
    : null;

  const firstVideo = Array.isArray(data.videos)
    ? data.videos.find(
        (entry: unknown) =>
          isRecord(entry) &&
          typeof entry.image === "string" &&
          entry.image.trim(),
      )
    : null;

  const firstPhoto = Array.isArray(data.photos)
    ? data.photos.find(
        (entry: unknown) =>
          isRecord(entry) &&
          typeof entry.image === "string" &&
          entry.image.trim(),
      )
    : null;

  const images = Array.isArray(metadata.images)
    ? metadata.images
    : [];

  const firstMetadataImage = images
    .map((entry: unknown) => {
      if (typeof entry === "string") return entry;
      if (!isRecord(entry)) return null;

      return (
        entry.url ||
        entry.public_url ||
        entry.publicUrl ||
        entry.image_url ||
        entry.imageUrl ||
        entry.src ||
        null
      );
    })
    .find(
      (value: unknown) =>
        typeof value === "string" && value.trim(),
    );

  const candidates: unknown[] = [
    metadata.og_image,
    metadata.ogImage,
    metadata.public_url,
    metadata.publicUrl,
    metadata.image_url,
    metadata.imageUrl,
    metadata.image,
    metadata.preview_image,
    metadata.previewImage,
    linkPreview.image,
    linkPreview.image_url,
    linkPreview.imageUrl,
    firstMetadataImage,
    firstLink && isRecord(firstLink) ? firstLink.image : null,
    firstVideo && isRecord(firstVideo) ? firstVideo.image : null,
    firstPhoto && isRecord(firstPhoto) ? firstPhoto.image : null,
  ];

  for (const candidate of candidates) {
    if (typeof candidate !== "string" || !candidate.trim()) {
      continue;
    }

    try {
      const url = new URL(candidate.trim(), SITE);

      if (url.protocol === "https:" || url.protocol === "http:") {
        return url.toString();
      }
    } catch {
      // Ignore invalid image paths and try the next candidate.
    }
  }

  return `${SITE}/default-og.png`;
}

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;

  try {
    const supabase = createClient({ useServiceRole: true });

    const { data: issue } = await supabase
      .from("letters")
      .select("title,slug,kind,status,published,html_web,payload,content")
      .eq("slug", slug)
      .eq("published", true)
      .maybeSingle();

    if (issue?.kind === "issue" && issue.status === "published") {
      const title = issue.title || "Flow | Anton Merkurov";
      const lang = issue.payload?.lang === "ru" ? "ru" : "en";
      const period = issue.payload?.period;

      const description = period
        ? lang === "ru"
          ? `Выпуск Flow за период ${new Date(period.start).toLocaleDateString(
              "ru-RU",
              { timeZone: "UTC" },
            )} — ${new Date(period.end).toLocaleDateString("ru-RU", {
              timeZone: "UTC",
            })}.`
          : `Flow issue, ${new Date(period.start).toLocaleDateString(
              "en-GB",
              { timeZone: "UTC" },
            )} — ${new Date(period.end).toLocaleDateString("en-GB", {
              timeZone: "UTC",
            })}.`
        : "Flow newspaper issue.";

      const canonical = `${SITE}/journal/${encodeURIComponent(slug)}`;
      const ogImage = getIssueOgImage(issue.payload);

      return sanitizeMetadata({
        title,
        description,
        alternates: { canonical },
        openGraph: {
          title,
          description,
          url: canonical,
          images: [
            {
              url: ogImage,
              alt: title,
              width: 1200,
              height: 630,
            },
          ],
          type: "article",
        },
        twitter: {
          card: "summary_large_image",
          title,
          description,
          images: [ogImage],
        },
      });
    }

    const { data: letter, error } = await supabase
      .from("letters")
      .select("title,content")
      .eq("slug", slug)
      .eq("published", true)
      .maybeSingle();

    if (error || !letter) {
      return sanitizeMetadata({
        title: "Letter | Anton Merkurov",
      });
    }

    const title = letter.title || "Letter";
    const description = String(
      parseRichTextContent(letter.content || ""),
    ).slice(0, 160);
    const canonical = `${SITE}/journal/${encodeURIComponent(slug)}`;
    const fallbackImage = `${SITE}/default-og.png`;

    return sanitizeMetadata({
      title,
      description,
      openGraph: {
        title,
        description,
        url: canonical,
        images: [fallbackImage],
        type: "article",
      },
      alternates: { canonical },
      twitter: {
        card: "summary_large_image",
        title,
        description,
        images: [fallbackImage],
      },
    });
  } catch (error) {
    console.error("[Letters] Metadata generation failed:", error);

    return sanitizeMetadata({
      title: "Letter | Anton Merkurov",
    });
  }
}

export default async function LetterPage({ params }: PageProps) {
  const { slug } = await params;

  // Published Flow issues are public and do not use ordinary-letter auth rules.
  const supabasePublic = createClient({ useServiceRole: true });

  const { data: issue, error: issueError } = await supabasePublic
    .from("letters")
    .select(
      "id,title,slug,kind,status,published,html_web,payload,publishedAt,createdAt",
    )
    .eq("slug", slug)
    .eq("kind", "issue")
    .eq("status", "published")
    .eq("published", true)
    .maybeSingle();

  if (issueError) {
    console.error("[Flow issue] Failed to load issue:", issueError);
  }

  if (issue) {
    const html = String(issue.html_web || "");
    const body = getIssueBody(html);
    const styles = getIssueStyles(html);

    if (!body) {
      console.error(
        `[Flow issue] Published issue ${slug} has no HTML body`,
      );
      notFound();
    }

    const issueDate = issue.publishedAt || issue.createdAt || undefined;
    const lang = issue.payload?.lang === "ru" ? "ru" : "en";
    const period = issue.payload?.period;
    const ogImage = getIssueOgImage(issue.payload);

    const articleSchema = {
      "@context": "https://schema.org",
      "@type": "NewsArticle",
      headline: issue.title || "Flow",
      datePublished: issueDate,
      image: [ogImage],
      inLanguage: lang,
      mainEntityOfPage: {
        "@type": "WebPage",
        "@id": `${SITE}/letters/${slug}`,
      },
      author: {
        "@type": "Person",
        name: "Anton Merkurov",
        url: SITE,
      },
      publisher: {
        "@type": "Person",
        name: "Anton Merkurov",
        url: SITE,
      },
      ...(period
        ? {
            temporalCoverage: `${period.start}/${period.end}`,
          }
        : {}),
    };

    return (
      <div
        lang={lang}
        className="flow-issue-page min-h-screen text-[#1C1A1B]"
      >
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(articleSchema).replace(
              /</g,
              "\\u003c",
            ),
          }}
        />
        <style>{styles}</style>
        <style>{`
          body:has(.flow-issue-page) .site-header,
          body:has(.flow-issue-page) .site-footer {
            display: none !important;
          }
          body:has(.flow-issue-page) {
            background: #FAF8F5 !important;
          }
          .flow-issue-page {
            padding-top: 5rem;
          }
          @supports selector(:has(*)) {
            body:has(.flow-issue-page) .flow-issue-page {
              padding-top: 0;
            }
          }
          .flow-issue-back {
            position: relative;
            z-index: 11;
            max-width: 1120px;
            margin: 0 auto;
            padding: 14px 20px 0;
            display: flex;
            align-items: center;
            gap: 10px;
            font: 12px ui-monospace, monospace;
            letter-spacing: .08em;
            text-transform: uppercase;
            color: #52525B;
          }
          .flow-issue-back a {
            color: inherit;
            text-decoration: none;
            border-bottom: 1px solid transparent;
          }
          .flow-issue-back a:hover {
            border-bottom-color: currentColor;
          }
          .flow-issue-back span {
            color: #D4D4D8;
          }
        `}</style>
        <div className="flow-issue-back">
          <a href="/flow">← Flow</a>
          <span>·</span>
          <a href="/letters">Все выпуски</a>
        </div>
        <div dangerouslySetInnerHTML={{ __html: body }} />
      </div>
    );
  }

  // Original behaviour for ordinary letters remains unchanged.
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect(`/letters/${slug}/full`);
  }

  const { data: letter, error } = await supabasePublic
    .from("letters")
    .select(
      "id,title,slug,content,published,publishedAt,createdAt,authorId,users(name)",
    )
    .eq("slug", slug)
    .eq("published", true)
    .maybeSingle();

  if (error || !letter) {
    notFound();
  }

  const letterAuthor = Array.isArray(letter.users)
    ? letter.users[0]
    : letter.users;

  const plainContent = parseRichTextContent(letter.content || "");
  const previewContent = plainContent.slice(0, 300);
  const hasMore = plainContent.length > 300;
  const datePublished = letter.publishedAt || letter.createdAt;

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: SITE,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Letters",
        item: `${SITE}/letters`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: letter.title,
        item: `${SITE}/letters/${slug}`,
      },
    ],
  };

  const letterArticleSchema = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: letter.title,
    description: previewContent,
    datePublished,
    author: {
      "@type": "Person",
      name: letterAuthor?.name || "Anton Merkurov",
      url: SITE,
    },
    publisher: {
      "@type": "Person",
      name: "Anton Merkurov",
      url: SITE,
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": `${SITE}/letters/${slug}`,
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(letterArticleSchema).replace(
            /</g,
            "\\u003c",
          ),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(breadcrumbSchema).replace(
            /</g,
            "\\u003c",
          ),
        }}
      />

      <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
        <div className="mx-auto max-w-3xl px-4 py-12">
          <article className="rounded-2xl border border-blue-100 bg-white p-8 shadow-sm">
            <header className="mb-8">
              <h1 className="mb-3 text-3xl font-bold text-gray-900">
                {letter.title}
              </h1>

              <div className="flex items-center gap-4 text-sm text-gray-500">
                <span>{letterAuthor?.name || "Author"}</span>
                <span>•</span>
                <time dateTime={datePublished}>
                  {datePublished
                    ? new Date(datePublished).toLocaleDateString(
                        "en-US",
                        {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                        },
                      )
                    : ""}
                </time>
              </div>
            </header>

            <div className="prose prose-lg max-w-none">
              <div className="leading-relaxed text-gray-700">
                {previewContent}
                {hasMore && "..."}
              </div>
            </div>

            {hasMore && (
              <div className="mt-8 border-t border-gray-200 pt-8">
                <ReadMoreOrLoginClient />
              </div>
            )}
          </article>
        </div>
      </div>
    </>
  );
}
