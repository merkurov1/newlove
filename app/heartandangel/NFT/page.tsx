import dynamic from 'next/dynamic';

export const metadata = {
  title: 'Необратимый Выбор / THE IRREVERSIBLE CHOICE',
  description: 'Neutral Heart — трансмедийный NFT‑эксперимент на Polygon. Преобразуйте Neutral Heart в Ангела или Демона.'
};

const ClientPage = dynamic(() => import('./ClientPage'), { ssr: false });

export default function NFTServerPage() {
  return <ClientPage />;
}
