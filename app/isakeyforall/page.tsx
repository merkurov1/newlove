import { sanitizeMetadata } from '@/lib/metadataSanitize';

export const metadata = sanitizeMetadata({
  title: 'Love is a Key for All | Anton Merkurov',
  description: 'Anton Merkurov: Artist. Digital Architect. Humanist. Operating at the intersection of legacy and future.',
});

export default function IsAKeyForAllPage() {
  return (
    <main className="min-h-screen bg-white">
      <div className="w-full max-w-3xl mx-auto px-4 sm:px-6 py-12 sm:py-20">
        {/* Hero Title */}
        <header className="text-center mb-16 sm:mb-20">
          <h1 
            className="text-4xl sm:text-5xl md:text-6xl font-serif font-bold text-black leading-tight mb-6"
            style={{ fontFamily: 'Playfair Display, Cormorant Garamond, serif' }}
          >
            Love is a key for all
          </h1>
          <div className="space-y-1">
            <p className="text-xl sm:text-2xl font-serif font-semibold text-gray-900">
              Anton Merkurov
            </p>
            <p className="text-base sm:text-lg text-gray-600 font-light">
              Artist. Digital Architect. Humanist.
            </p>
          </div>
        </header>

        {/* Biography Content */}
        <article className="prose prose-lg sm:prose-xl max-w-none">
          <div className="space-y-6 text-gray-800 leading-relaxed">
            <p className="text-lg sm:text-xl">
              Anton Merkurov is an artist operating at the intersection of legacy and future. 
              A descendant of the monumental sculptor Sergey Merkurov, Anton spent two decades 
              mastering the digital realm—from the early days of the runet to the complexities 
              of Web3 and decentralized communications.
            </p>

            <p>
              His career has been a relentless pursuit of the "new"—founding tech startups in 
              the 90s, advising corporations, and bridging the gap between East and West in 
              London's intellectual circles. He has curated the physical legacy of his family 
              (The Sergey Merkurov Museum) while simultaneously pioneering the digital one 
              (NFTs, media analysis).
            </p>

            <p>
              However, the turbulence of recent history led to a radical shift. Realizing that 
              digital complexity cannot save us from existential voids, Merkurov turned to 
              radical simplicity.
            </p>

            <blockquote className="border-l-4 border-black pl-6 py-2 my-8 italic text-xl sm:text-2xl font-serif text-gray-900">
              "Why do you need technology if you don't have love?"
            </blockquote>

            <p>
              Since 2015, Merkurov has been developing his own artistic language. His work is 
              a rejection of cynicism. Using simple symbols—the Heart, the Angel—he bypasses 
              the noise of modern media to speak directly to the viewer.
            </p>

            <p>
              Merkurov's art is not just decoration; it is a utility. It is an attempt to 
              distribute emotional capital in a bankrupt world. Whether through canvas or code, 
              his message is singular and absolute:
            </p>

            <p className="text-center text-xl sm:text-2xl font-serif font-bold text-black mt-8 pt-8 border-t border-gray-200">
              Love is a key for all.
            </p>
          </div>
        </article>
      </div>
    </main>
  );
}
