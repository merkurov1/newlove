/* eslint-disable @next/next/no-img-element */
import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabase";
import Header from "@/app/header";
import styles from "./article.module.css";
import sanitizeHtml from "sanitize-html";

export default async function Page({ params }) {
  // Extract slug from params
  const articleSlug = Array.isArray(params.slug) ? params.slug[0] : params.slug;

  // Fetch article from Supabase
  const { data: article, error } = await supabase
    .from("articles")
    .select("title, content")
    .eq("slug", articleSlug)
    .contains("tags", ["page"])
    .single();

  // Log for debugging
  console.log("Article fetch result:", { article, error, slug: articleSlug });

  // Handle errors or missing/incomplete article
  if (error || !article || !article.title || !article.content) {
    console.error("Error fetching article:", {
      slug: articleSlug,
      error: error?.message || "Article not found or incomplete",
      article,
    });
    notFound();
  }

  // Sanitize HTML content
  const sanitizedContent = sanitizeHtml(article.content, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img"]),
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      img: ["src", "alt", "width", "height"],
    },
  });

  return (
    <div>
      <Header />
      <main className={styles.articleMain}>
        <article className={styles.articleContainer}>
          <h1 className={styles.articleTitle}>{article.title}</h1>
          <div
            className={styles.articleContent}
            dangerouslySetInnerHTML={{ __html: sanitizedContent }}
          />
        </article>
      </main>
    </div>
  );
}

// Generate static paths for SSG
export async function generateStaticParams() {
  const { data: articles, error } = await supabase
    .from("articles")
    .select("slug")
    .contains("tags", ["page"]);

  // Log for debugging
  console.log("generateStaticParams result:", { articles, error });

  if (error || !articles || !Array.isArray(articles)) {
    console.error("Error generating static params:", {
      error: error?.message || "No articles found",
      articles,
    });
    return [];
  }

  return articles.map((article) => ({
    slug: [article.slug],
  }));
}

// Optional: Generate metadata for SEO
export async function generateMetadata({ params }) {
  const articleSlug = Array.isArray(params.slug) ? params.slug[0] : params.slug;
  const { data: article } = await supabase
    .from("articles")
    .select("title")
    .eq("slug", articleSlug)
    .single();

  return {
    title: article?.title || "Article Not Found",
  };
}