import { ImageResponse } from 'next/og';
import { records } from '@/data/media';

export const runtime = 'edge';

export const alt = 'Media Archive — Anton Merkurov';
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';

export default async function Image() {
  const count = records.length;

  return new ImageResponse(
    (
      <div
        style={{
          background: '#0a0a0a',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '80px',
          fontFamily: 'sans-serif',
          color: '#f5f5f7',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div
            style={{
              fontSize: '20px',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: '#888888',
              fontWeight: 500,
            }}
          >
            Anton Merkurov
          </div>
          <div
            style={{
              fontSize: '18px',
              color: '#888888',
              border: '1px solid #333333',
              padding: '6px 16px',
              borderRadius: '20px',
            }}
          >
            {count} Publications
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div
            style={{
              fontSize: '64px',
              fontWeight: 600,
              letterSpacing: '-0.02em',
              lineHeight: 1.1,
            }}
          >
            Media Archive
          </div>
          <div
            style={{
              fontSize: '24px',
              color: '#a1a1a6',
              maxWidth: '800px',
              lineHeight: 1.4,
            }}
          >
            Interviews, expert commentaries, author columns, and media citations.
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            gap: '24px',
            fontSize: '16px',
            color: '#666666',
            borderTop: '1px solid #222222',
            paddingTop: '24px',
          }}
        >
          <span>Internet & Censorship</span>
          <span>•</span>
          <span>AI & Tech</span>
          <span>•</span>
          <span>Art & Culture</span>
          <span>•</span>
          <span>Fintech & Crypto</span>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
