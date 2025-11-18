import dynamic from 'next/dynamic';

const title = 'THE IRREVERSIBLE CHOICE';
const description = 'Neutral Heart — a transmedia NFT experiment on Polygon. Transform Neutral Heart into an Angel or a Demon.';
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
        alt: 'Neutral Heart — The Irreversible Choice',
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
