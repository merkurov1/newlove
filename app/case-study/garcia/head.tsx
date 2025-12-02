export default function Head() {
  const title = "Aimée García — Untitled (Woman with Globe) | Case Study";
  const description = "Aimée García, 1995 — a cinematic case study exploring provenance, material, and the acquisition protocol for Lot 59.";
  const image = "https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/IMG_1047.jpeg";
  const url = "https://www.merkurov.love/case-study/garcia";
  const author = "Anton Merkurov / Merkurov";
  const keywords = "Aimée García, case study, art, provenance, auction, Lot 59, Merkurov";

  return (
    <>
      <title>{title}</title>
      <meta name="description" content={description} />
      <meta name="author" content={author} />
      <meta name="keywords" content={keywords} />

      {/* Open Graph */}
      <meta property="og:type" content="article" />
      <meta property="og:locale" content="en_US" />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={image} />
      <meta property="og:image:alt" content="Aimée García — Untitled (Woman with Globe), photographic detail" />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:url" content={url} />
      <meta property="og:site_name" content="Merkurov" />

      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:creator" content="@merkurov_love" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={image} />

      {/* Canonical */}
      <link rel="canonical" href={url} />

      {/* JSON-LD Article structured data for richer previews */}
      <script type="application/ld+json">
        {JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'Article',
          headline: title,
          description: description,
          image: [image],
          author: { '@type': 'Person', name: author },
          publisher: { '@type': 'Organization', name: 'Merkurov', logo: { '@type': 'ImageObject', url: image } },
          url,
        })}
      </script>
    </>
  );
}
