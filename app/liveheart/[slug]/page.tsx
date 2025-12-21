import React from 'react';
import { createClient } from '../../../lib/supabase/server';
import SharedArtifact from '../SharedArtifactClient';

type Props = { params: { slug: string } };

export async function generateMetadata({ params }: Props) {
  const supabase = createClient({ useServiceRole: true });
  const { data } = await supabase.from('liveheart_shares').select('*').eq('slug', params.slug).single();

  if (!data) {
    return { title: 'LiveHeart' };
  }

  const title = data.title ?? data?.dna?.name ?? 'LiveHeart Artifact';
  const description = `A LiveHeart artifact — ${title}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: [
        `${process.env.NEXT_PUBLIC_SITE_URL ?? ''}/api/og/liveheart?slug=${params.slug}`,
      ],
      url: `${process.env.NEXT_PUBLIC_SITE_URL ?? ''}/liveheart/${params.slug}`,
    },
  };
}

export default async function Page({ params }: Props) {
  const supabase = createClient({ useServiceRole: true });
  const { data } = await supabase.from('liveheart_shares').select('*').eq('slug', params.slug).single();

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black text-white">
        <div className="max-w-screen-md p-6 text-center">
          <h1 className="text-2xl mb-4">Artifact not found</h1>
          <p>This LiveHeart artifact could not be found or was removed.</p>
        </div>
      </div>
    );
  }

  const dna = data.dna;

  return (
    <div className="min-h-screen bg-black text-white p-6">
      <div className="max-w-4xl mx-auto relative">
        <h1 className="text-4xl font-light mb-4 z-50 relative">{data.title ?? dna?.name ?? 'LiveHeart'}</h1>
        <p className="mb-6 text-sm text-gray-300 z-50 relative">Shareable LiveHeart artifact — created {new Date(data.created_at).toLocaleString()}</p>

        <div style={{height: '60vh'}} className="relative mb-6 z-40">
          {/* Client component renders the interactive/canvas artifact */}
          <SharedArtifact dna={dna} />
        </div>

        <div className="flex gap-3 z-50 relative">
          <a href="/liveheart" className="px-4 py-2 bg-white/10 border border-white/20">Open Generator</a>
          <a href={`https://twitter.com/intent/tweet?text=${encodeURIComponent('Check out my LiveHeart artifact')}&url=${encodeURIComponent(`${process.env.NEXT_PUBLIC_SITE_URL ?? ''}/liveheart/${params.slug}`)}`} target="_blank" rel="noreferrer" className="px-4 py-2 bg-blue-600 text-white">Share on Twitter</a>
        </div>
      </div>
    </div>
  );
}
