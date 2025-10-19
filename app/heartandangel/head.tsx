export default function Head() {
  const title = '#HEARTANDANGEL — Необратимый выбор';
  const description = 'Heart & Angel — трансмедийный проект и эксперимент о природе выбора. Получите Neutral Heart и сделайте необратимый выбор — трансформируйте его в Ангела или Демона.';
  const url = 'https://www.merkurov.love/heartandangel';
  const image = 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/1759212266765-IMG_0514.png';

  return (
    <>
      <title>{title}</title>
      <meta name="description" content={description} />

      {/* Open Graph */}
      <meta property="og:type" content="website" />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={url} />
      <meta property="og:image" content={image} />

      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={image} />
    </>
  );
}
