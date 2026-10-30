import type { Metadata } from 'next';
import ClientPage from './ClientPage';
import { pageMetadata } from '@/lib/seo';

const NFT_DESCRIPTION =
  'Neutral Heart is a transmedia NFT experiment on Polygon by Anton Merkurov: transform the Neutral Heart into an Angel or a Demon and keep the choice.';

export const metadata: Metadata = pageMetadata({
  title: 'The Irreversible Choice — Heart & Angel NFT',
  description: NFT_DESCRIPTION,
  path: '/heartandangel/NFT',
  image:
    'https://bronze-main-tiger-8.mypinata.cloud/ipfs/bafybeihnx7kaue4ehbigi4koydoei43ojjykp2mhhh7xwx4qg3tntm5e5e',
  imageAlt: 'Neutral Heart — The Irreversible Choice',
  languages: { 'x-default': '/heartandangel/NFT', en: '/heartandangel/NFT' },
});

export default function NFTServerPage() {
  return <ClientPage />;
}
