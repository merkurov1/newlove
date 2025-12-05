export default function Head() {
  const IMAGE = 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/Prompt_a_translucent_202512051450.jpeg';
  const TITLE = 'UNFRAMED - Memoir by Anton Merkurov';
  const DESCRIPTION = 'UNFRAMED — a memoir by Anton Merkurov.';
  const URL = 'https://www.unframed.example/unframed';

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
      <meta property="og:image:alt" content="UNFRAMED — cover artwork" />
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
