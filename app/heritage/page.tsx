export default function HeritagePage() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        :root{--bg:#070707;--card:#111111;--card-alt:#161616;--text:#f5f2eb;--muted:#949088;--acid:#d7ff1e;--sig:#ff2a00;--blue:#00f0ff;--font-d:Impact,Haettenschweiler,"Arial Narrow Bold",sans-serif;--font-m:ui-monospace,Menlo,Consolas,monospace}
        *{box-sizing:border-box}
        body{margin:0;background:var(--bg);color:var(--text);font:18px/1.6 -apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
        a{color:inherit;text-decoration:none}
        header{padding:3vw 6vw;border-bottom:1px solid #1f1f1f;display:flex;justify-content:space-between;align-items:center;font:700 .85rem var(--font-m);letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
        header span{color:var(--acid)}
        .hero{padding:6vw 6vw 4vw;max-width:1500px;margin:0 auto}
        .hero-tag{font:700 .75rem var(--font-m);text-transform:uppercase;letter-spacing:.15em;color:var(--sig);margin-bottom:1.5rem;display:inline-block;background:rgba(255,42,0,.08);padding:.35rem .9rem;border:1px solid rgba(255,42,0,.25)}
        .hero h1{margin:0 0 3rem;font:400 clamp(3.2rem,11vw,11.5rem)/.85 var(--font-d);text-transform:uppercase;letter-spacing:-.02em}
        .hero h1 span{display:block}
        .hero h1 .hl-acid{color:var(--acid)}
        .hero h1 .hl-sig{color:var(--sig)}
        .bio-section{max-width:1500px;margin:0 auto;padding:0 6vw 5vw}
        .bio-grid{display:grid;grid-template-columns:1fr 1fr;gap:3rem;background:var(--card);border:1px solid #222;padding:4vw}
        .bio-col h3{font:400 2.2rem var(--font-d);text-transform:uppercase;margin:0 0 1rem;color:var(--acid)}
        .bio-col:nth-child(2) h3{color:var(--blue)}
        .bio-col p{margin:0 0 1rem;color:var(--muted);font-size:1.08rem}
        .bio-col p b{color:var(--text)}
        .media-banner{background:linear-gradient(135deg, #151515 0%, #0d0d0d 100%);border-top:3px solid var(--acid);border-bottom:3px solid var(--acid);padding:6vw 6vw;margin:4rem 0;position:relative;overflow:hidden}
        .media-banner h2{margin:0 0 2rem;font:400 clamp(2.5rem,7vw,6.5rem)/.9 var(--font-d);text-transform:uppercase;letter-spacing:-.01em;color:var(--text)}
        .media-banner h2 span{color:var(--acid)}
        .media-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:2.5rem;margin-top:3rem}
        .media-item{background:var(--card-alt);border:1px solid #262626;padding:2.5rem;position:relative;transition:border-color .2s}
        .media-item:hover{border-color:var(--acid)}
        .media-item .m-num{font:700 .75rem var(--font-m);color:var(--sig);margin-bottom:1rem;display:block;letter-spacing:.1em}
        .media-item h4{margin:0 0 .8rem;font:400 1.6rem var(--font-d);text-transform:uppercase}
        .media-item p{margin:0;color:var(--muted);font-size:1rem}
        .section-title{max-width:1500px;margin:6rem auto 2.5rem;padding:0 6vw;font:400 clamp(2.2rem,5vw,4.5rem)/1 var(--font-d);text-transform:uppercase;letter-spacing:-.01em;display:flex;justify-content:space-between;align-items:flex-end}
        .section-title span{font:400 1rem var(--font-m);color:var(--sig)}
        .timeline{max-width:1500px;margin:0 auto;padding:0 6vw;display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:2rem}
        .t-card{background:var(--card);border:1px solid #222;padding:3rem;display:flex;flex-direction:column;justify-content:space-between;position:relative;transition:border-color .2s}
        .t-card:hover{border-color:var(--acid)}
        .t-year{font:400 4.5rem/1 var(--font-d);color:var(--acid);margin-bottom:1rem}
        .t-card.sig .t-year{color:var(--sig)}
        .t-card.blue .t-year{color:var(--blue)}
        .t-content h3{margin:0 0 1rem;font:400 1.8rem/1.1 var(--font-d);text-transform:uppercase}
        .t-content p{margin:0 0 1.2rem;color:var(--muted);font-size:1.02rem}
        .t-content p b{color:var(--text)}
        .t-tag{display:inline-block;font:700 .68rem var(--font-m);text-transform:uppercase;background:#1a1a1a;color:var(--text);padding:.25rem .7rem;border:1px solid #333;margin-top:1rem}
        .highlights{max-width:1500px;margin:6rem auto;padding:0 6vw}
        .h-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(360px,1fr));gap:2.5rem}
        .h-card{background:var(--card);border:1px solid #222;padding:3.5rem 3rem;position:relative}
        .h-card::before{content:'';position:absolute;top:0;left:0;width:5px;height:100%;background:var(--sig)}
        .h-card.acid::before{background:var(--acid)}
        .h-card.blue::before{background:var(--blue)}
        .h-card .h-badge{font:700 .75rem var(--font-m);text-transform:uppercase;letter-spacing:.1em;color:var(--muted);margin-bottom:1rem;display:block}
        .h-card h3{margin:0 0 1.2rem;font:400 2.4rem/1 var(--font-d);text-transform:uppercase}
        .h-card p{margin:0 0 1.8rem;color:var(--muted);font-size:1.05rem}
        .h-card p b{color:var(--text)}
        .h-link{font:700 .8rem var(--font-m);text-transform:uppercase;color:var(--text);border-bottom:1px solid currentColor;display:inline-block;padding-bottom:3px}
        .stats-bar{background:var(--card);border-top:2px solid #222;border-bottom:2px solid #222;margin:6rem 0;padding:4vw 6vw}
        .stats-grid{max-width:1500px;margin:0 auto;display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:3rem}
        .stat-item b{display:block;font:400 clamp(3rem,6vw,5.5rem)/1 var(--font-d);color:var(--acid);margin-bottom:.5rem}
        .stat-item span{font:700 .75rem var(--font-m);text-transform:uppercase;color:var(--muted)}
        footer{max-width:1500px;margin:0 auto;padding:4vw 6vw;border-top:1px solid #222;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:2rem;font:700 .85rem var(--font-m);color:var(--muted)}
        footer a:hover{color:var(--acid)}
        @media(max-width:768px){.bio-grid{grid-template-columns:1fr}}
      `}} />

      <header>
        <div>Merkurov Archive <span>// 01</span></div>
        <div>Tirana — Moscow</div>
      </header>

      {/* БЛОК 1: НАСЛЕДИЕ — СЕРГЕЙ МЕРКУРОВ + АНТОН МЕРКУРОВ */}
      <section className="hero">
        <div className="hero-tag">Cross-Generational Continuity</div>
        <h1>
          <span>Monumental</span>
          <span className="hl-acid">Legacy &amp;</span>
          <span className="hl-sig">Digital Future</span>
        </h1>
      </section>

      <section className="bio-section">
        <div className="bio-grid">
          <div className="bio-col">
            <h3>Сергей Меркуров</h3>
            <p><b>Монументальный масштаб:</b> Великий советский скульптор-монументалист, автор крупнейших монументов эпохи, мастер посмертных масок (включая Льва Толстого, Ленина, Владимира Маяковского).</p>
            <p>Сохранение культурного кода, мемориальная архитектура и историческая преемственность как фундамент для осмысления современности.</p>
          </div>
          <div className="bio-col">
            <h3>Антон Меркуров</h3>
            <p><b>Цифровая эпоха:</b> Медиаэксперт, публицист, колумнист «Новой газеты», исследователь аппаратной гегемонии и цифрового контроля.</p>
            <p>Соединение традиций академического искусства, коллекционирования, цифровых медиа (Web3, AI) и глубокого анализа технологических трансформаций.</p>
          </div>
        </div>
      </section>

      {/* БЛОК 2: МЕДИА — ЯРКО, КРУПНО, ЧТОБЫ БЫЛО ВИДНО ДЕЙСТВИЯ */}
      <section className="media-banner">
        <h2><span>Media, Art</span> &amp; Digital Sovereignty</h2>
        <div className="media-grid">
          <div className="media-item">
            <span className="m-num">01 // Column</span>
            <h4>Виртуальный Меркуров</h4>
            <p>Аналитические материалы и колонки на страницах «Новой газеты» об интернете, свободе слова и технологических трендах.</p>
          </div>
          <div className="media-item">
            <span className="m-num">02 // Substack</span>
            <h4>UNFRAMED</h4>
            <p>Международная англоязычная рассылка и мемуары об искусстве, технологиях и современности.</p>
          </div>
          <div className="media-item">
            <span className="m-num">03 // Research</span>
            <h4>Hardware Hegemony</h4>
            <p>Глубокие исследования систем цифрового контроля, цензуры и инфраструктурных ограничений.</p>
          </div>
        </div>
      </section>

      {/* БЛОК 3: ХРОНОЛОГИЯ (НАЧИНАЯ С ПРАДЕДА) */}
      <div className="section-title">
        <span>Chronology &amp; Lineage</span>
        <span>1881 — 2026</span>
      </div>

      <div className="timeline">
        <div className="t-card sig">
          <div className="t-year">1881</div>
          <div className="t-content">
            <h3>Рождение Сергея Меркурова</h3>
            <p>Начало истории династии, изменившей лицо монументального искусства XX века.</p>
            <span className="t-tag">Roots</span>
          </div>
        </div>
        <div className="t-card">
          <div className="t-year">2000s</div>
          <div className="t-content">
            <h3>Новые Медиа и Интернет</h3>
            <p>Становление экспертности в сфере интернет-технологий, медиа и новых форм коммуникации.</p>
            <span className="t-tag">Media</span>
          </div>
        </div>
        <div className="t-card blue">
          <div className="t-year">2026</div>
          <div className="t-content">
            <h3>Глобальный Синтез</h3>
            <p>Объединение культурного наследия, арт-рынка, Web3-инициатив и публицистики в единую экосистему.</p>
            <span className="t-tag">Future</span>
          </div>
        </div>
      </div>

      {/* БЛОК 4: ХАЙЛАЙТЫ — НА ЧЕМ НАДО РАБОТАТЬ (АЗБУКА, ЛЕНИН В 3D И NFT, ДОМ-МУЗЕЙ) */}
      <section className="highlights">
        <div className="h-grid">
          <div className="h-card sig">
            <span className="h-badge">Highlight 01</span>
            <h3>Ленин в 3D &amp; NFT</h3>
            <p>Цифровизация архивов и монументального наследия прадеда через призму современных технологий и Web3-форматов.</p>
            <a href="#" className="h-link">Explore Project</a>
          </div>
          <div className="h-card acid">
            <span className="h-badge">Highlight 02</span>
            <h3>Дом-Музей</h3>
            <p>Проекты по сохранению исторического пространства, систематизации архивов и мемориализации культурной памяти.</p>
            <a href="#" className="h-link">View Archives</a>
          </div>
        </div>
      </section>

      {/* СТАТИСТИКА */}
      <div className="stats-bar">
        <div className="stats-grid">
          <div className="stat-item">
            <b>140+</b>
            <span>Years of Legacy</span>
          </div>
          <div className="stat-item">
            <b>100s</b>
            <span>Articles &amp; Columns</span>
          </div>
          <div className="stat-item">
            <b>Global</b>
            <span>Reach &amp; Research</span>
          </div>
        </div>
      </div>

      <footer>
        <div>© 2026 Anton Merkurov. All rights reserved.</div>
        <div>
          <a href="https://merkurov.love" target="_blank" rel="noreferrer">merkurov.love</a>
        </div>
      </footer>
    </>
  );
}
