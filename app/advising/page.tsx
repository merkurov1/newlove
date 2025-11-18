export default function AdvisingPage() {
  return (
    <main style={{ color: '#000', fontSize: 18, fontFamily: 'Inter, Helvetica, Arial, sans-serif', background: '#fff', minHeight: '100vh' }}>
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '48px 16px 32px 16px' }}>
        <h1 style={{ fontSize: 32, fontWeight: 800, fontFamily: 'Inter, Helvetica, Arial, sans-serif', marginBottom: 32, letterSpacing: -1 }}>Advising</h1>
        <p style={{ fontSize: '1.5rem', fontStyle: 'italic', fontFamily: 'Georgia, Times, serif', marginBottom: 24 }}>
          The art world is full of noise.
        </p>
        <p style={{ marginBottom: 18 }}>
          Algorithms manipulate tastes. Galleries sell inventory, not value. Auctions are theatre.
        </p>
        <p style={{ marginBottom: 18 }}>
          I offer silence and clarity.
        </p>
        <p style={{ marginBottom: 18 }}>
          I guide a closed circle of clients through the chaos of the market — from post-war modernism to the algorithmic avant-garde.
        </p>
        <p style={{ marginBottom: 18 }}>
          My approach is rooted in two worlds: the classical heritage of the 20th century and the digital complexity of the 21st. I see the connections others miss.
        </p>
        <div style={{ margin: '32px 0 32px 0' }}>
          <p style={{ fontWeight: 700, margin: 0 }}>
            No public portfolio.<br />
            No social media hype.<br />
            Only direct access to what matters.
          </p>
        </div>
        <p style={{ marginBottom: 18 }}>
          If you are looking for a trophy, go to an auction house.<br />
          If you are building a legacy or seeking intellectual assets, we should talk.
        </p>
        <p style={{ marginBottom: 18 }}>
          Conditions: Strictly confidential. Success-based fee structure.
        </p>
        <div style={{ marginTop: 40, textAlign: 'center' }}>
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
