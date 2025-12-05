export default function Head() {
  const IMAGE = 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/Prompt_a_translucent_202512051450.jpeg';
  const TITLE = 'UNFRAMED';
  const DESCRIPTION = 'UNFRAMED — a memoir by Anton Merkurov.';

  return (
    <>
      <title>{TITLE}</title>
      <meta name="description" content={DESCRIPTION} />

      {/* Open Graph */}
      <meta property="og:title" content={TITLE} />
      <meta property="og:description" content={DESCRIPTION} />
      <meta property="og:type" content="website" />
      <meta property="og:image" content={IMAGE} />
      <meta property="og:image:alt" content="UNFRAMED cover art" />

      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={TITLE} />
      <meta name="twitter:description" content={DESCRIPTION} />
      <meta name="twitter:image" content={IMAGE} />

      <link rel="image_src" href={IMAGE} />
    </>
  );
}
