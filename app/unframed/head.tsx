export default function Head() {
  const AUDIO = 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/Digitize_the_Death_Mask_Encrypt_Freedom_Never.m4a';
  const IMAGE = 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/Prompt_a_translucent_202512051450.jpeg';
  const TITLE = 'UNFRAMED — Anton Merkurov';
  const DESCRIPTION = 'UNFRAMED — a memoir and audio preview by Anton Merkurov.';

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
      <meta property="og:audio" content={AUDIO} />
      <meta property="og:audio:type" content="audio/mp4" />

      {/* Twitter */}
      <meta name="twitter:card" content="player" />
      <meta name="twitter:title" content={TITLE} />
      <meta name="twitter:description" content={DESCRIPTION} />
      <meta name="twitter:image" content={IMAGE} />
      <meta name="twitter:player" content="/unframed" />
      <meta name="twitter:player:stream" content={AUDIO} />
      <meta name="twitter:player:stream:content_type" content="audio/mp4" />

      <link rel="image_src" href={IMAGE} />
    </>
  );
}
