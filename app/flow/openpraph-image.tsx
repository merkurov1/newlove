import { ImageResponse } from 'next/og';

export const runtime = 'edge';

export const alt = 'Flow — Anton Merkurov';

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = 'image/png';

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          backgroundColor: '#FAF8F5',
          color: '#171717',
          padding: '64px 72px',
          fontFamily: 'sans-serif',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: 22,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: '#737373',
          }}
        >
          <span>Flow</span>

          <span
            style={{
              fontSize: 18,
              letterSpacing: '0.08em',
              color: '#A3A3A3',
            }}
          >
            MERKUROV.LOVE
          </span>
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 20,
          }}
        >
          <div
            style={{
              fontSize: 72,
              lineHeight: 1,
              fontWeight: 500,
              letterSpacing: '-0.035em',
            }}
          >
            Flow
          </div>

          <div
            style={{
              fontSize: 32,
              lineHeight: 1.25,
              color: '#666666',
              maxWidth: 850,
            }}
          >
            Personal publishing by Anton Merkurov.
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            borderTop: '1px solid #D6D3D1',
            paddingTop: 20,
            fontSize: 18,
            color: '#737373',
          }}
        >
          <span>Anton Merkurov</span>
          <span>MERKUROV.LOVE</span>
        </div>
      </div>
    ),
    {
      width: size.width,
      height: size.height,
    },
  );
}