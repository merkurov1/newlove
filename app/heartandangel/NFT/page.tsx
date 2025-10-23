import dynamic from 'next/dynamic';

const title = 'Необратимый Выбор / THE IRREVERSIBLE CHOICE';
const description = 'Neutral Heart — трансмедийный NFT‑эксперимент на Polygon. Преобразуйте Neutral Heart в Ангела или Демона.';
const url = 'https://www.merkurov.love/heartandangel/NFT';
const image = 'https://bronze-main-tiger-8.mypinata.cloud/ipfs/bafybeihnx7kaue4ehbigi4koydoei43ojjykp2mhhh7xwx4qg3tntm5e5e';

export const metadata = {
  title,
  description,
  openGraph: {
    title,
    description,
    url,
    type: 'website',
    images: [
      {
        url: image,
        alt: 'Neutral Heart — Необратимый Выбор',
        width: 1200,
        height: 630
      }
    ]
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
    images: [image]
  }
};

const ClientPage = dynamic(() => import('./ClientPage'), { ssr: false });

export default function NFTServerPage() {
  return <ClientPage />;
}
