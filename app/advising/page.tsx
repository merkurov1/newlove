export default function AdvisingPage() {
  return (
    <main style={{ color: '#000', fontSize: 18, fontFamily: 'Inter, Helvetica, Arial, sans-serif', background: '#fff', minHeight: '100vh' }}>
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '48px 16px 32px 16px' }}>
        <h1 style={{
          fontSize: 36,
          fontWeight: 600,
          fontFamily: 'Cormorant Garamond, Playfair Display, Georgia, Times, serif',
          marginBottom: 36,
          letterSpacing: '-0.02em',
          lineHeight: 1.1,
        }}>Advising</h1>
        <p style={{ fontSize: '1.5rem', fontStyle: 'italic', fontFamily: 'Georgia, Times, serif', marginBottom: 28 }}>
          The art world is full of noise.
        </p>
        <p style={{ marginBottom: 24 }}>
          Algorithms manipulate tastes. Galleries sell inventory, not value. Auctions are theatre.
        </p>
        <p style={{ marginBottom: 24 }}>
          I offer silence and clarity.
        </p>
        <p style={{ marginBottom: 24 }}>
          I guide a closed circle of clients through the chaos of the market — from post-war modernism to the algorithmic avant-garde.
        </p>
        <p style={{ marginBottom: 24 }}>
          My approach is rooted in two worlds: the classical heritage of the 20th century and the digital complexity of the 21st. I see the connections others miss.
        </p>
        <div style={{ margin: '36px 0 36px 0' }}>
          <p style={{ fontWeight: 700, margin: 0, fontSize: 18 }}>
            No public portfolio.<br />
            No social media hype.<br />
            Only direct access to what matters.
          </p>
        </div>
        <p style={{ marginBottom: 24 }}>
          If you are looking for a trophy, go to an auction house.<br />
          If you are building a legacy or seeking intellectual assets, we should talk.
        </p>
        <p style={{ marginBottom: 24 }}>
          Conditions: Strictly confidential. Success-based fee structure.
        </p>
        <div style={{ marginTop: 40, textAlign: 'left' }}>
          <a
            href="mailto:your-email"
            style={{
              fontFamily: 'Georgia, Times, serif',
              fontStyle: 'italic',
              textDecoration: 'underline',
              fontSize: 20,
              color: '#000',
            }}
          >
            Start a conversation →
          </a>
        </div>
      </div>
    </main>
  );
}
