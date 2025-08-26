/* eslint-disable @next/next/no-img-element */
import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabase";
import Header from "@/app/header";
import styles from "./article.module.css"; // CSS module for styling

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

  // Handle errors or missing article
  if (error || !article) {
    console.error("Error fetching article:", {
      slug: articleSlug,
      error: error?.message || "Article not found",
    });
    notFound();
  }

  return (
    <div>
      <Header />
      <main className={styles.articleMain}>
        <article className={styles.articleContainer}>
          <h1 className={styles.articleTitle}>{article.title}</h1>
          <div
            className={styles.articleContent}
            dangerouslySetInnerHTML={{ __html: article.content }}
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
    slug: [article.slug], // Return slug as an array for catch-all route
  }));
}