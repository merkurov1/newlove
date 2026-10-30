import { ImageResponse } from 'next/og';
import { SITE_NAME, SITE_URL } from '@/lib/seo';

export const OG_SIZE = { width: 1200, height: 630 };

/**
 * Global social card. Per-page metadata points at /og?title=…&subtitle=…
 * so every page gets a title-specific image while sharing this renderer.
 */
export function renderOgImage(title: string, subtitle: string) {
  const cleanTitle = title.replace(/\s+/g, ' ').trim().slice(0, 110);
  const cleanSubtitle = subtitle.replace(/\s+/g, ' ').trim().slice(0, 120);
  const host = SITE_URL.replace(/^https?:\/\//, '');

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
          color: '#141210',
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
          <span>{SITE_NAME}</span>
          <span style={{ fontSize: 18, letterSpacing: '0.08em', color: '#A3A3A3' }}>{host}</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          <div
            style={{
              fontSize: cleanTitle.length > 60 ? 58 : 72,
              lineHeight: 1.05,
              fontWeight: 500,
              letterSpacing: '-0.035em',
              maxWidth: 1000,
            }}
          >
            {cleanTitle}
          </div>
          {cleanSubtitle ? (
            <div style={{ fontSize: 30, lineHeight: 1.3, color: '#666666', maxWidth: 900 }}>
              {cleanSubtitle}
            </div>
          ) : null}
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
          <span>Art · Heritage · Advising</span>
          <span>{host.toUpperCase()}</span>
        </div>
      </div>
    ),
    OG_SIZE,
  );
}
