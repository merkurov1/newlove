export default function HeritageResearchPage() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        :root{--bg:#070707;--card:#101010;--card-alt:#141414;--text:#f2eee3;--muted:#8c877b;--acid:#ccff00;--sig:#ff2200;--blue:#00e5ff;--border:#1f1f1f;--font-d:Impact,Haettenschweiler,"Arial Narrow Bold",sans-serif;--font-m:ui-monospace,Menlo,Consolas,monospace}
        *{box-sizing:border-box}
        body{margin:0;background:var(--bg);color:var(--text);font:17px/1.65 -apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
        a{color:inherit;text-decoration:none}
        header{padding:2rem 5vw;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;font:700 .75rem var(--font-m);letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
        header span{color:var(--acid)}
        
        .hero{padding:5vw 5vw 3vw;max-width:1450px;margin:0 auto}
        .hero-tag{font:700 .7rem var(--font-m);text-transform:uppercase;letter-spacing:.15em;color:var(--muted);margin-bottom:1.5rem;display:inline-block;background:var(--card-alt);padding:.35rem .8rem;border:1px solid var(--border)}
        .hero h1{margin:0 0 2rem;font:400 clamp(2.8rem,8vw,8.5rem)/.92 var(--font-d);text-transform:uppercase;letter-spacing:-.02em}
        .hero h1 span{display:block}
        .hero h1 .hl-acid{color:var(--acid)}
        .hero h1 .hl-sig{color:var(--sig)}
        .formula-bar{display:flex;flex-wrap:wrap;gap:.75rem;margin-top:2.5rem;font:700 .75rem var(--font-m);text-transform:uppercase;color:var(--muted)}
        .formula-bar span{background:var(--card-alt);border:1px solid var(--border);padding:.4rem .8rem;color:var(--text)}
        .formula-bar span b{color:var(--acid)}

        .section-wrap{max-width:1450px;margin:5rem auto 2rem;padding:0 5vw}
        .section-header{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:1px solid var(--border);padding-bottom:1rem;margin-bottom:2.5rem}
        .section-header h2{margin:0;font:400 clamp(2rem,4vw,3.5rem)/1 var(--font-d);text-transform:uppercase;letter-spacing:-.01em}
        .section-header span{font:700 .75rem var(--font-m);color:var(--muted);letter-spacing:.1em;text-transform:uppercase}

        /* БЛОК 1: СВЯЗКА ПОКОЛЕНИЙ */
        .lineage-grid{display:grid;grid-template-columns:1fr 1fr;gap:2rem;max-width:1450px;margin:0 auto;padding:0 5vw}
        .lineage-card{background:var(--card);border:1px solid var(--border);padding:3.5vw}
        .lineage-card h3{font:400 2.2rem var(--font-d);text-transform:uppercase;margin:0 0 1rem;color:var(--acid)}
        .lineage-card.modern h3{color:var(--blue)}
        .lineage-card p{margin:0 0 1.2rem;color:var(--muted);font-size:1.05rem}
        .lineage-card p b{color:var(--text)}

        /* БЛОК 2: МЕДИА И ЭКСПЕРТИЗА */
        .media-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:1.5rem;max-width:1450px;margin:0 auto;padding:0 5vw}
        .media-card{background:var(--card);border:1px solid var(--border);padding:2.5rem;display:flex;flex-direction:column;justify-content:space-between;transition:border-color .2s}
        .media-card:hover{border-color:#333}
        .media-meta{display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem;font:700 .75rem var(--font-m);color:var(--muted);text-transform:uppercase}
        .media-meta .outlet{color:var(--acid);background:rgba(204,255,0,.05);padding:.2rem .6rem;border:1px solid rgba(204,255,0,.15)}
        .media-card blockquote{margin:0 0 1.5rem;font-size:1.08rem;line-height:1.55;color:var(--text);font-style:italic}
        .media-card cite{font:700 .78rem var(--font-m);color:var(--muted);font-style:normal;text-transform:uppercase;letter-spacing:.05em}

        /* БЛОК 3: ТРИ ХАЙЛАЙТА (НАПРАВЛЕНИЯ) */
        .highlights-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(380px,1fr));gap:1.5rem;max-width:1450px;margin:0 auto;padding:0 5vw}
        .h-card{background:var(--card);border:1px solid var(--border);padding:3.5rem 3rem;display:flex;flex-direction:column;justify-content:space-between}
        .h-badge{font:700 .75rem var(--font-m);text-transform:uppercase;letter-spacing:.1em;color:var(--muted);margin-bottom:1rem;display:block}
        .h-card h3{margin:0 0 1rem;font:400 2.4rem/1 var(--font-d);text-transform:uppercase;color:var(--text)}
        .h-card p{margin:0 0 2rem;color:var(--muted);font-size:1.02rem}
        .h-card p b{color:var(--text)}
        .h-link{font:700 .78rem var(--font-m);text-transform:uppercase;color:var(--text);border-bottom:1px solid #444;display:inline-block;padding-bottom:2px;transition:border-color .2s}
        .h-link:hover{border-color:var(--acid);color:var(--acid)}

        /* БЛОК 4: ИСТОРИЧЕСКИЙ МАССИВ И ДИНАМО */
        .deep-archive{max-width:1450px;margin:0 auto;padding:0 5vw}
        .archive-box{background:var(--card);border:1px solid var(--border);padding:4vw;display:grid;grid-template-columns:1fr 1fr;gap:3rem}
        .archive-col h4{font:400 1.8rem var(--font-d);text-transform:uppercase;margin:0 0 1rem;color:var(--acid)}
        .archive-col p{margin:0 0 1.2rem;color:var(--muted);font-size:1.02rem}
        .archive-col p b{color:var(--text)}

        /* БЛОК 5: ХРОНОЛОГИЯ */
        .timeline-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:1.5rem;max-width:1450px;margin:0 auto;padding:0 5vw}
        .t-card{background:var(--card);border:1px solid var(--border);padding:2.5rem;display:flex;flex-direction:column;justify-content:space-between}
        .t-year{font:400 3.5rem/1 var(--font-d);color:var(--acid);margin-bottom:.8rem}
        .t-card.sig .t-year{color:var(--sig)}
        .t-card.blue .t-year{color:var(--blue)}
        .t-card h3{margin:0 0 .6rem;font:400 1.5rem/1.1 var(--font-d);text-transform:uppercase}
        .t-card p{margin:0 0 1.2rem;color:var(--muted);font-size:.98rem}
        .t-tag{display:inline-block;font:700 .68rem var(--font-m);text-transform:uppercase;background:var(--card-alt);color:var(--muted);padding:.25rem .6rem;border:1px solid var(--border)}

        /* СТАТИСТИКА И ФУТЕР */
        .stats-bar{background:var(--card);border-top:1px solid var(--border);border-bottom:1px solid var(--border);margin:6rem 0;padding:4vw 5vw}
        .stats-grid{max-width:1450px;margin:0 auto;display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:2.5rem}
        .stat-item b{display:block;font:400 clamp(2.5rem,5vw,4.5rem)/1 var(--font-d);color:var(--acid);margin-bottom:.3rem}
        .stat-item span{font:700 .75rem var(--font-m);text-transform:uppercase;color:var(--muted);letter-spacing:.05em}

        footer{max-width:1450px;margin:0 auto;padding:3rem 5vw;border-top:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:1.5rem;font:700 .75rem var(--font-m);color:var(--muted);text-transform:uppercase;letter-spacing:.05em}
        footer a:hover{color:var(--acid)}

        @media(max-width:768px){.lineage-grid,.archive-box{grid-template-columns:1fr}}
      `}} />

      <header>
        <div>Merkurov Research Dossier</div>
        <span>Archive &amp; Continuity</span>
      </header>

      {/* ГЕРОЙ-БЛОК С ЦЕНТРАЛЬНОЙ ФОРМУЛОЙ */}
      <section className="hero">
        <div className="hero-tag">Research &amp; Lineage Framework</div>
        <h1>
          <span>Monumental Roots</span>
          <span className="hl-acid">&amp; Digital Sovereignty</span>
        </h1>
        <div className="formula-bar">
          <span><b>01</b> Preserve</span>
          <span><b>02</b> Research</span>
          <span><b>03</b> Exhibit</span>
          <span><b>04</b> Reconstruct</span>
          <span><b>05</b> Digitise</span>
          <span><b>06</b> Reinterpret</span>
        </div>
      </section>

      {/* БЛОК 1: СВЯЗКА ПОКОЛЕНИЙ */}
      <div className="section-wrap">
        <div className="section-header">
          <h2>Династический срез</h2>
          <span>Lineage &amp; Contemporary Context</span>
        </div>
      </div>

      <section className="lineage-grid">
        <div className="lineage-card">
          <h3>Сергей Меркуров (1881–1952)</h3>
          <p><b>Монументальный базис:</b> Великий советский скульптор-монументалист, академик АХ СССР, народный художник СССР, директор Музея изобразительных искусств им. А.С. Пушкина (1944–1949), лауреат Сталинских премий. Ученик Огюста Родена.</p>
          <p>Создатель знаковых монументов эпохи, барельефов стадиона «Динамо» и непревзойденного собрания посмертных масок (Лев Толстой, Ленин, Маяковский, Горький, Эйзенштейн и др.). Мастер, превративший посмертную маску в суверенное произведение искусства.</p>
        </div>
        <div className="lineage-card modern">
          <h3>Антон Меркуров (род. 1974)</h3>
          <p><b>Цифровой синтез:</b> Медиаэксперт, публицист, колумнист «Новой газеты», исследователь аппаратной гегемонии, цифровых свобод и блокчейн-технологий.</p>
          <p>Системный интегратор родового наследия в глобальное поле: от спасения артефактов и музейной систематизации в Гюмри до цифрового сканирования, создания NFT-серий, арт-рынка и глубокой публицистической рефлексии современности.</p>
        </div>
      </section>

      {/* БЛОК 2: МЕДИА И ЭКСПЕРТНЫЙ РЕЗОНАНС */}
      <div className="section-wrap">
        <div className="section-header">
          <h2>Медиа-присутствие &amp; резонанс</h2>
          <span>Global Press &amp; Expert Citation</span>
        </div>
      </div>

      <section className="media-grid">
        <div className="media-card">
          <div>
            <div className="media-meta">
              <span className="outlet">Le Monde</span>
              <span>International Press</span>
            </div>
            <blockquote>«Экспертный анализ Антона Меркурова по вопросам аппаратного контроля, обхода блокировок, VPN и регуляторных барьеров в цифровой среде.»</blockquote>
          </div>
          <cite>— Международная аналитика</cite>
        </div>

        <div className="media-card">
          <div>
            <div className="media-meta">
              <span className="outlet">The Christian Science Monitor</span>
              <span>Global Monitoring</span>
            </div>
            <blockquote>«Комментарии ведущего медиаэксперта о глобальных сбоях связи, инфраструктурной изоляции и трансформации интернет-протоколов.»</blockquote>
          </div>
          <cite>— Экспертный комментарий</cite>
        </div>

        <div className="media-card">
          <div>
            <div className="media-meta">
              <span className="outlet">The Art Newspaper &amp; Коммерсантъ</span>
              <span>Art &amp; Heritage</span>
            </div>
            <blockquote>«Резонансные инициативы по спасению архитектурных барельефов стадиона «Динамо», выставочная работа и оцифровка музейных коллекций.»</blockquote>
          </div>
          <cite>— Кураторские проекты</cite>
        </div>
      </section>

      {/* БЛОК 3: ТРИ ХАЙЛАЙТА (НАПРАВЛЕНИЯ) */}
      <div className="section-wrap">
        <div className="section-header">
          <h2>Ключевые направления</h2>
          <span>Tri-Vector Initiative</span>
        </div>
      </div>

      <section className="highlights-grid">
        <div className="h-card">
          <div>
            <span className="h-badge">Direction 01 / Museum &amp; Archive</span>
            <h3>Дом-музей в Гюмри</h3>
            <p>Сохранение исторического семейного очага в Армении и экспозиции из <b>59 редких посмертных масок</b>. Систематизация архивов, Музеон, Измайлово и спасение монументальных артефактов от утраты.</p>
          </div>
          <a className="h-link" href="https://artessere.com/sd-merkurovs-house-museum" target="_blank" rel="noreferrer">Исследовать музей →</a>
        </div>

        <div className="h-card">
          <div>
            <span className="h-badge">Direction 02 / Web3 &amp; Digitisation</span>
            <h3>Ленин в 3D и NFT</h3>
            <p>Высокоточное цифровое сканирование канонической маски, метафорическая анимация (маска, зарастающая травой) и выпуск лимитированной блокчейн-серии <b>22 копии по 0.22 ETH</b>.</p>
          </div>
          <a className="h-link" href="https://www.kp.ru/daily/28353.5/4499365/" target="_blank" rel="noreferrer">Смотреть проект →</a>
        </div>

        <div className="h-card">
          <div>
            <span className="h-badge">Direction 03 / Research &amp; Reinterpretation</span>
            <h3>Советская эротическая азбука</h3>
            <p>Публикация и деконструкция уникальных графических листов из семейного архива 1931 года. Исследование границ советской приватности и цензуры на портале <b>merkurov.love/azbuka</b>.</p>
          </div>
          <a className="h-link" href="https://merkurov.love/azbuka/" target="_blank" rel="noreferrer">Открыть азбуку →</a>
        </div>
      </section>

      {/* БЛОК 4: ИСТОРИЧЕСКИЙ МАССИВ И ДИНАМО */}
      <div className="section-wrap">
        <div className="section-header">
          <h2>Архивный массив &amp; Эпопея «Динамо»</h2>
          <span>Deep Context &amp; Reconstruction</span>
        </div>
      </div>

      <section className="deep-archive">
        <div className="archive-box">
          <div className="archive-col">
            <h4>Стадион «Динамо»: от демонтажа до реставрации</h4>
            <p>Полная линия взаимодействия с монументальным наследием: спасение и судьба легендарных барельефов Сергея Меркурова на фасадах стадиона «Динамо», их демонтаж, хранение в Измайлово и Музеоне.</p>
            <p>Финал многолетней борьбы — создание постоянного арт-пространства площадью <b>1500 м² на ВТБ Арене</b>, где подлинные рельефы гармонично вписаны в современную архитектурную среду.</p>
          </div>
          <div className="archive-col">
            <h4>Маска Ленина и философия посмертного слепка</h4>
            <p>История создания канонического слепка в Горках ранним утром 1924 года. Переход от физического гипса к цифровой бессмертности через 3D-моделирование и Web3-трансформацию.</p>
            <p>Концепция объединения исторической памяти и передовых технологий без упрощения и спекуляций, с соблюдением строгого fact-checking стандарта.</p>
          </div>
        </div>
      </section>

      {/* БЛОК 5: ХРОНОЛОГИЯ 1881–2026 */}
      <div className="section-wrap">
        <div className="section-header">
          <h2>Хронология преемственности</h2>
          <span>1881 — 2026 Timeline</span>
        </div>
      </div>

      <section className="timeline-grid">
        <div className="t-card">
          <div>
            <div className="t-year">1881</div>
            <h3>Рождение Сергея Меркурова</h3>
            <p>Появление на свет в Александрополе (Гюмри). Годы учебы в Германии и у Огюста Родена в Париже.</p>
          </div>
          <span className="t-tag">Roots</span>
        </div>

        <div className="t-card sig">
          <div>
            <div className="t-year">1924</div>
            <h3>Маска Ленина в Горках</h3>
            <p>Создание канонического посмертного слепка, положившего начало уникальному собранию.</p>
          </div>
          <span className="t-tag">Collection</span>
        </div>

        <div className="t-card">
          <div>
            <div className="t-year">1931</div>
            <h3>Эротическая азбука</h3>
            <p>Создание графических листов и «любовных» зарисовок, составивших закрытую часть семейного архива.</p>
          </div>
          <span className="t-tag">Graphics</span>
        </div>

        <div className="t-card blue">
          <div>
            <div className="t-year">2012</div>
            <h3>Систематизация архива</h3>
            <p>Включение Антона Меркурова в активную работу с Музеем в Гюмри, каталогизация и издание мемуаров.</p>
          </div>
          <span className="t-tag">Preservation</span>
        </div>

        <div className="t-card sig">
          <div>
            <div className="t-year">2021</div>
            <h3>Ленин в 3D &amp; NFT</h3>
            <p>Первый крупный блокчейн-проект: оцифровка маски, анимация травы и релиз на маркетплейсах.</p>
          </div>
          <span className="t-tag">Digitisation</span>
        </div>

        <div className="t-card">
          <div>
            <div className="t-year">2026</div>
            <h3>Глобальный Синтез</h3>
            <p>Интеграция арт-рынка, мемуаров «UNFRAMED», аналитики аппаратной гегемонии и музейных проектов.</p>
          </div>
          <span className="t-tag">Reinterpretation</span>
        </div>
      </section>

      {/* СТАТИСТИКА */}
      <div className="stats-bar">
        <div className="stats-grid">
          <div className="stat-item">
            <b>1881</b>
            <span>Год основания династии</span>
          </div>
          <div className="stat-item">
            <b>59</b>
            <span>Масок в фонде Гюмри</span>
          </div>
          <div className="stat-item">
            <b>1500 м²</b>
            <span>Пространство на ВТБ Арене</span>
          </div>
          <div className="stat-item">
            <b>22</b>
            <span>NFT-копии маски Ленина</span>
          </div>
        </div>
      </div>

      <footer>
        <div>Антон Меркуров · Research &amp; Heritage Dossier</div>
        <div>
          <a href="https://merkurov.love/azbuka/" target="_blank" rel="noreferrer">merkurov.love/azbuka</a>
        </div>
      </footer>
    </>
  );
}
