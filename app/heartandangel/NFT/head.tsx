export default function Head() {
  const title = 'Необратимый Выбор — Neutral Heart (NFT)';
  const description = 'Transform your Neutral Heart into Angel or Demon — irreversible NFT experiment on Polygon.';
  const url = 'https://www.merkurov.love/heartandangel/NFT';
  const image = 'https://bronze-main-tiger-8.mypinata.cloud/ipfs/bafybeihnx7kaue4ehbigi4koydoei43ojjykp2mhhh7xwx4qg3tntm5e5e';

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
