export default function AdvisingPage() {
  return (
    <main style={{ color: '#111', fontSize: 18, fontFamily: 'Inter, Helvetica, Arial, sans-serif', background: '#fff', minHeight: '100vh' }}>
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '48px 16px 32px 16px' }}>
        <h1 style={{
          fontSize: '2.2rem',
          fontWeight: 700,
          fontFamily: 'Cormorant Garamond, Playfair Display, Georgia, Times, serif',
          marginBottom: 36,
          letterSpacing: '-0.02em',
          lineHeight: 1.1,
        }}>THE PRIVATE OFFICE</h1>
        <p style={{ fontSize: '1.25rem', fontStyle: 'italic', fontFamily: 'Georgia, Times, serif', marginBottom: 24 }}>
          Heritage Architecture for the Post-Digital Age.
        </p>
        <p style={{ marginBottom: 24 }}>
          The art world is full of noise. Galleries sell inventory. Algorithms manipulate taste. Auctions are theatre.<br />
          <span style={{ fontWeight: 600 }}>I offer silence.</span>
        </p>
        <p style={{ marginBottom: 24 }}>
          I do not just "buy art" for you. I build Legacy Structures for individuals who plan in decades, not quarters.<br />
          My approach fuses two worlds: the Granite of the 20th century (Classical Heritage) and the Ether of the 21st (Digital Assets & Archives).
        </p>
        <h2 style={{ fontSize: '1.3rem', fontWeight: 600, margin: '32px 0 16px 0' }}>My Services:</h2>
        <ul style={{ marginBottom: 32, paddingLeft: 18 }}>
          <li style={{ marginBottom: 18 }}>
            <strong>The Audit (Digital Hygiene):</strong><br />
            You are vulnerable. I clean your digital footprint, remove the noise, and secure your perimeter.
          </li>
          <li style={{ marginBottom: 18 }}>
            <strong>The Acquisition (Selection):</strong><br />
            Curating assets that survive entropy. From post-war modernism to the algorithmic avant-garde. No fillers. Only signals.
          </li>
          <li style={{ marginBottom: 18 }}>
            <strong>The Archive (Immortality):</strong><br />
            Building your personal Digital Vatican. A system to preserve your collection, your name, and your intent forever.
          </li>
        </ul>
        <h2 style={{ fontSize: '1.3rem', fontWeight: 600, margin: '32px 0 16px 0' }}>The Rules:</h2>
        <ul style={{ marginBottom: 32, paddingLeft: 18 }}>
          <li>No public portfolio.</li>
          <li>No social media hype.</li>
          <li>Only direct access to what matters.</li>
        </ul>
        <h2 style={{ fontSize: '1.3rem', fontWeight: 600, margin: '32px 0 16px 0' }}>Status:</h2>
        <p style={{ marginBottom: 24 }}>
          I work with a strictly limited circle.<br />
          <span style={{ fontWeight: 700, color: '#0070f3' }}>[ 1 SLOT OPEN FOR 2025 ]</span>
        </p>
        <div style={{ marginTop: 40, textAlign: 'left' }}>
          <a
            href="mailto:merkurov@gmail.com"
            style={{
              fontFamily: 'Georgia, Times, serif',
              fontStyle: 'italic',
              textDecoration: 'underline',
              fontSize: 20,
              color: '#0070f3',
            }}
          >
            Start a conversation →
          </a>
        </div>
      </div>
      <style>{`
        @media (max-width: 600px) {
          main { font-size: 16px !important; }
          h1 { font-size: 1.4rem !important; }
          h2 { font-size: 1.1rem !important; }
          div { padding: 32px 6px 24px 6px !important; }
        }
      `}</style>
    </main>
  );
}
