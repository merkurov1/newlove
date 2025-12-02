export default function Head() {
  const title = "Aimée García — The Anatomy of Quietude | Merkurov";
  const description = "Case study: Aimée García — Untitled (Woman with Globe), 1995. A cinematic briefing with provenance and acquisition details.";
  const image = "https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/IMG_1047.jpeg";
  const url = "https://www.merkurov.love/case-study/garcia";

  return (
    <>
      <title>{title}</title>
      <meta name="description" content={description} />

      {/* Open Graph */}
      <meta property="og:type" content="article" />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={image} />
      <meta property="og:url" content={url} />
      <meta property="og:site_name" content="Merkurov" />

      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={image} />

      {/* Canonical */}
      <link rel="canonical" href={url} />
    </>
  );
}
