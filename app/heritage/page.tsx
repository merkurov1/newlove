export default function HeritageResearchDossier() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        :root {
          --bg: #050505;
          --card: #0e0e0e;
          --card-alt: #121212;
          --text: #f3efe6;
          --muted: #8c877b;
          --acid: #ccff00;
          --sig: #ff2200;
          --blue: #00e5ff;
          --border: #1a1a1a;
          --font-d: Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif;
          --font-m: ui-monospace, Menlo, Consolas, monospace;
        }
        * { box-sizing: border-box; }
        body { margin: 0; background: var(--bg); color: var(--text); font: 17px/1.65 -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
        a { color: inherit; text-decoration: none; }
        
        header {
          padding: 2rem 5vw;
          border-bottom: 1px solid var(--border);
          display: flex;
          justify-content: space-between;
          align-items: center;
          font: 700 .75rem var(--font-m);
          letter-spacing: .15em;
          text-transform: uppercase;
          color: var(--muted);
        }
        header span { color: var(--acid); }

        .hero { padding: 7vw 5vw 4vw; max-width: 1450px; margin: 0 auto; }
        .hero-tag { font: 700 .7rem var(--font-m); text-transform: uppercase; letter-spacing: .2em; color: var(--muted); margin-bottom: 1.5rem; display: inline-block; background: var(--card-alt); padding: .4rem .9rem; border: 1px solid var(--border); }
        .hero h1 { margin: 0 0 2rem; font: 400 clamp(2.8rem, 8vw, 8.5rem) / .92 var(--font-d); text-transform: uppercase; letter-spacing: -0.02em; }
        .hero h1 span { display: block; }
        .hero h1 .hl-acid { color: var(--acid); }
        .hero h1 .hl-sig { color: var(--sig); }
        .hero-lead { max-width: 950px; font-size: 1.25rem; color: var(--muted); margin-bottom: 3rem; line-height: 1.65; }
        .hero-lead b { color: var(--text); }

        .formula-bar { display: flex; flex-wrap: wrap; gap: .75rem; font: 700 .75rem var(--font-m); text-transform: uppercase; color: var(--muted); }
        .formula-bar span { background: var(--card-alt); border: 1px solid var(--border); padding: .4rem .8rem; color: var(--text); }
        .formula-bar span b { color: var(--acid); }

        .section-wrap { max-width: 1450px; margin: 6rem auto 2.5rem; padding: 0 5vw; }
        .section-header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 1px solid var(--border); padding-bottom: 1rem; }
        .section-header h2 { margin: 0; font: 400 clamp(2rem, 4vw, 3.5rem) / 1 var(--font-d); text-transform: uppercase; letter-spacing: -0.01em; }
        .section-header span { font: 700 .75rem var(--font-m); color: var(--muted); letter-spacing: .12em; text-transform: uppercase; }

        /* БЛОК 1: СВЯЗКА ПОКОЛЕНИЙ */
        .lineage-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; max-width: 1450px; margin: 0 auto; padding: 0 5vw; }
        .lineage-card { background: var(--card); border: 1px solid var(--border); padding: 4vw; }
        .lineage-card h3 { font: 400 2.4rem var(--font-d); text-transform: uppercase; margin: 0 0 1.2rem; color: var(--acid); letter-spacing: -0.01em; }
        .lineage-card.modern h3 { color: var(--blue); }
        .lineage-card p { margin: 0 0 1.4rem; color: var(--muted); font-size: 1.05rem; }
        .lineage-card p b { color: var(--text); }

        /* БЛОК 2: МЕДИА-АРХИВ С ИСТОЧНИКАМИ */
        .media-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(360px, 1fr)); gap: 1.5rem; max-width: 1450px; margin: 0 auto; padding: 0 5vw; }
        .media-card { background: var(--card); border: 1px solid var(--border); padding: 2.8rem; display: flex; flex-direction: column; justify-content: space-between; transition: border-color .2s; }
        .media-card:hover { border-color: #333; }
        .media-meta { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; font: 700 .75rem var(--font-m); color: var(--muted); text-transform: uppercase; }
        .media-meta .outlet { color: var(--acid); background: rgba(204,255,0,.04); padding: .25rem .65rem; border: 1px solid rgba(204,255,0,.15); }
        .media-card blockquote { margin: 0 0 1.5rem; font-size: 1.05rem; line-height: 1.6; color: var(--text); font-style: italic; }
        .media-card cite { font: 700 .75rem var(--font-m); color: var(--muted); font-style: normal; text-transform: uppercase; letter-spacing: .05em; display: block; border-top: 1px solid var(--border); padding-top: 1rem; }

        /* БЛОК 3: ТРИ ХАЙЛАЙТА */
        .highlights-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(380px, 1fr)); gap: 1.5rem; max-width: 1450px; margin: 0 auto; padding: 0 5vw; }
        .h-card { background: var(--card); border: 1px solid var(--border); padding: 3.5rem 3rem; display: flex; flex-direction: column; justify-content: space-between; transition: border-color .2s; }
        .h-card:hover { border-color: #333; }
        .h-badge { font: 700 .75rem var(--font-m); text-transform: uppercase; letter-spacing: .12em; color: var(--muted); margin-bottom: 1.2rem; display: block; }
        .h-card h3 { margin: 0 0 1rem; font: 400 2.4rem/1 var(--font-d); text-transform: uppercase; color: var(--text); }
        .h-card p { margin: 0 0 2rem; color: var(--muted); font-size: 1.02rem; }
        .h-card p b { color: var(--text); }
        .h-link { font: 700 .78rem var(--font-m); text-transform: uppercase; color: var(--text); border-bottom: 1px solid #444; display: inline-block; padding-bottom: 2px; transition: border-color .2s; }
        .h-link:hover { border-color: var(--acid); color: var(--acid); }

        /* БЛОК 4: ХРОНОЛОГИЯ */
        .timeline-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 1.5rem; max-width: 1450px; margin: 0 auto; padding: 0 5vw; }
        .t-card { background: var(--card); border: 1px solid var(--border); padding: 2.8rem; display: flex; flex-direction: column; justify-content: space-between; }
        .t-year { font: 400 3.5rem/1 var(--font-d); color: var(--acid); margin-bottom: .8rem; }
        .t-card.sig .t-year { color: var(--sig); }
        .t-card.blue .t-year { color: var(--blue); }
        .t-card h3 { margin: 0 0 .6rem; font: 400 1.5rem/1.1 var(--font-d); text-transform: uppercase; }
        .t-card p { margin: 0 0 1.2rem; color: var(--muted); font-size: .98rem; }
        .t-tag { display: inline-block; font: 700 .68rem var(--font-m); text-transform: uppercase; background: var(--card-alt); color: var(--muted); padding: .25rem .6rem; border: 1px solid var(--border); }

        /* БЛОК 5: САММАРИ И ИНСТИТУЦИОНАЛЬНЫЙ ФУТЕР */
        .summary-box { max-width: 1450px; margin: 0 auto; padding: 0 5vw; }
        .summary-content { background: var(--card); border: 1px solid var(--border); padding: 4.5vw; display: grid; grid-template-columns: 1.2fr .8fr; gap: 4rem; align-items: center; }
        .summary-content h3 { font: 400 clamp(2rem, 3.5vw, 3rem) / 1.05 var(--font-d); text-transform: uppercase; margin: 0 0 1.5rem; color: var(--acid); }
        .summary-content p { margin: 0 0 1.2rem; color: var(--muted); font-size: 1.08rem; }
        .summary-content p b { color: var(--text); }
        .summary-pillars { display: flex; flex-direction: column; gap: 1rem; font: 700 .78rem var(--font-m); text-transform: uppercase; letter-spacing: .05em; }
        .summary-pill { background: var(--card-alt); border: 1px solid var(--border); padding: 1.2rem 1.5rem; color: var(--text); display: flex; justify-content: space-between; align-items: center; }
        .summary-pill span { color: var(--acid); }

        footer { max-width: 1450px; margin: 6rem auto 3rem; padding: 3rem 5vw; border-top: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1.5rem; font: 700 .75rem var(--font-m); color: var(--muted); text-transform: uppercase; letter-spacing: .08em; }
        footer a:hover { color: var(--acid); }

        @media(max-width: 900px) { .lineage-grid, .summary-content { grid-template-columns: 1fr; } }
      `}} />

      <header>
        <div>Merkurov Research Dossier</div>
        <span>Institutional Record &amp; Archive</span>
      </header>

      {/* ГЕРОЙ-БЛОК */}
      <section className="hero">
        <div className="hero-tag">Research &amp; Media Dossier</div>
        <h1>
          <span>A family legacy,</span>
          <span className="hl-acid">continuously rewritten.</span>
        </h1>
        <p className="hero-lead">
          Наследие Сергея и Антона Меркуровых в публичном поле — это не статичная семейная легенда, а непрерывный процесс институционализации памяти через постоянную смену медиумов. За два десятилетия фамильный материал прошел путь от физической сохранности памятников и архивов до цифрового суверенитета, Web3-экспериментов и актуальной арт-практики.
        </p>
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
          <h3>Сергей Дмитриевич Меркуров (1881–1952)</h3>
          <p><b>Монументальный базис:</b> Выдающийся советский скульптор-монументалист, академик АХ СССР, народный художник СССР, директор Музея изобразительных искусств им. А.С. Пушкина (1944–1949). Родился в Александрополе (Гюмри). Учился в Германии и у Огюста Родена в Париже.</p>
          <p>Создатель знаковых монументов эпохи, барельефов канала Москва-Волга и стадиона «Динамо». Основатель уникального собрания посмертных масок (Ленин, Толстой, Маяковский, Горький, Эйзенштейн и др.), превративший слепок из ремесла в суверенное высказывание о границах жизни и памяти.</p>
        </div>
        <div className="lineage-card modern">
          <h3>Антон Павлович Меркуров (род. 1974)</h3>
          <p><b>Цифровой синтез:</b> Медиаэксперт, публицист, колумнист «Новой газеты», исследователь цифровых свобод, аппаратной гегемонии и блокчейн-технологий.</p>
          <p>Системный интегратор родового наследия в глобальное поле. Переводит материал из одного медиума в другой: от физической реставрации памятников и архивов в Гюмри и Москве до цифрового сканирования, NFT, выставочных проектов и глубокой аналитической рефлексии.</p>
        </div>
      </section>

      {/* БЛОК 2: МЕДИА И ИСТОЧНИКИ */}
      <div className="section-wrap">
        <div className="section-header">
          <h2>Медиаприсутствие &amp; источники</h2>
          <span>Verified Press &amp; Institutional Record</span>
        </div>
      </div>

      <section className="media-grid">
        <div className="media-card">
          <div>
            <div className="media-meta">
              <span className="outlet">Fakty.ua</span>
              <span>December 2005</span>
            </div>
            <blockquote>«Когда мой прадед снимал посмертную маску с Ленина, ему показалось, что у вождя двигались мышцы лица.»</blockquote>
          </div>
          <cite>— Первое публичное появление с архивами и письмами Сталина в Музее одной улицы (Киев).</cite>
        </div>

        <div className="media-card">
          <div>
            <div className="media-meta">
              <span className="outlet">The Moscow Times</span>
              <span>June 2014</span>
            </div>
            <blockquote>«Controversial Lenin Death Mask for Sale in U.S.»</blockquote>
          </div>
          <cite>— Жесткая публичная позиция против коммерческой продажи маски Ленина и защита статуса советского культурного наследия.</cite>
        </div>

        <div className="media-card">
          <div>
            <div className="media-meta">
              <span className="outlet">Russian Life</span>
              <span>September 2013</span>
            </div>
            <blockquote>«The Death Artist — большой очерк о практике создания посмертных масок и работе с фамильным архивом.»</blockquote>
          </div>
          <cite>— Англоязычная документация исторической глубины коллекции.</cite>
        </div>

        <div className="media-card">
          <div>
            <div className="media-meta">
              <span className="outlet">Regional Post</span>
              <span>February 2017</span>
            </div>
            <blockquote>«Anton Merkurov: ‘It’s a cool city, let’s work and develop it’»</blockquote>
          </div>
          <cite>— Профильный материал о системном развитии Дома-музея в Гюмри и превращении мемориала в живой культурный хаб.</cite>
        </div>

        <div className="media-card">
          <div>
            <div className="media-meta">
              <span className="outlet">The Art Newspaper &amp; РБК</span>
              <span>2012–2023</span>
            </div>
            <blockquote>Хроника борьбы за сохранение, реставрацию и возвращение монументальных барельефов стадиона «Динамо» в Москву.</blockquote>
          </div>
          <cite>— Многолетняя институциональная кампания, завершившаяся открытием пространства на ВТБ Арене.</cite>
        </div>

        <div className="media-card">
          <div>
            <div className="media-meta">
              <span className="outlet">Проверено.Медиа</span>
              <span>July 2021</span>
            </div>
            <blockquote>«Правда ли, что советскую эротическую азбуку нарисовал скульптор Меркуров?»</blockquote>
          </div>
          <cite>— Критический разбор провенанса и дискуссионной атрибуции графики 1931 года со строгим фактчекингом.</cite>
        </div>

        <div className="media-card">
          <div>
            <div className="media-meta">
              <span className="outlet">Комсомольская Правда</span>
              <span>November 2021</span>
            </div>
            <blockquote>«За что правнук Сталина обиделся на правнук любимого скульптора вождя»</blockquote>
          </div>
          <cite>— Освещение революционного блокчейн-эксперимента и выпуска 3D-оцифрованной маски Ленина в формат NFT.</cite>
        </div>

        <div className="media-card">
          <div>
            <div className="media-meta">
              <span className="outlet">The Art Newspaper</span>
              <span>March 2021</span>
            </div>
            <blockquote>Интеграция цифровых стратегий и арт-рынка онлайн-продаж в контексте актуальной технологической повестки.</blockquote>
          </div>
          <cite>— Фиксация междисциплинарной позиции на стыке искусства и Web3.</cite>
        </div>
      </section>

      {/* БЛОК 3: ТРИ ХАЙЛАЙТА */}
      <div className="section-wrap">
        <div className="section-header">
          <h2>Ключевые направления (Хайлайты)</h2>
          <span>Tri-Vector Initiative</span>
        </div>
      </div>

      <section className="highlights-grid">
        <div className="h-card">
          <div>
            <span className="h-badge">Direction 01 / Museum &amp; Gyumri</span>
            <h3>Дом-музей в Гюмри</h3>
            <p>Сохранение исторического семейного очага в Армении и экспозиции из <b>59 редких посмертных масок</b>. Превращение мемориального музея в динамичный культурный институт и центр притяжения диаспоры.</p>
          </div>
          <a className="h-link" href="https://regionalpost.org/en/articles/anton-merkurov.html" target="_blank" rel="noreferrer">Исследовать профиль →</a>
        </div>

        <div className="h-card">
          <div>
            <span className="h-badge">Direction 02 / Web3 &amp; 3D</span>
            <h3>Ленин в 3D и NFT</h3>
            <p>Высокоточное цифровое сканирование канонической маски и перевод исторического объекта в децентрализованную среду. Метафорическая анимация (маска, обрастающая цифровой травой) как мост между историей и криптоартом.</p>
          </div>
          <a className="h-link" href="https://www.kp.ru/daily/28353.5/4499365/" target="_blank" rel="noreferrer">Смотреть проект →</a>
        </div>

        <div className="h-card">
          <div>
            <span className="h-badge">Direction 03 / Research &amp; Erotic Alphabet</span>
            <h3>Советская эротическая азбука</h3>
            <p>Обнаружение, научная реконструкция и выставка уникальных графических листов 1931 года из семейного архива в Cube. Исследование границ советской приватности с открытым обсуждением дискуссионной атрибуции.</p>
          </div>
          <a className="h-link" href="https://merkurov.love/azbuka/" target="_blank" rel="noreferrer">Открыть азбуку →</a>
        </div>
      </section>

      {/* БЛОК 4: ХРОНОЛОГИЯ */}
      <div className="section-wrap">
        <div className="section-header">
          <h2>Хронологический массив</h2>
          <span>Chronology 1881–2026</span>
        </div>
      </div>

      <section className="timeline-grid">
        <div className="t-card">
          <div>
            <div className="t-year">1881</div>
            <h3>Рождение Сергея Меркурова</h3>
            <p>Появление мастера в Александрополе (Гюмри), учеба в Европе и у Огюста Родена в Париже.</p>
          </div>
          <span className="t-tag">Foundation</span>
        </div>

        <div className="t-card sig">
          <div>
            <div className="t-year">2005</div>
            <h3>Выставка в Киеве</h3>
            <p>Первое крупное публичное появление Антона с фамильными письмами Сталина и масками (*Fakty.ua*).</p>
          </div>
          <span className="t-tag">Public Record</span>
        </div>

        <div className="t-card">
          <div>
            <div className="t-year">2012</div>
            <h3>Музей в Гюмри &amp; Динамо</h3>
            <p>Старт системной работы с музеем в Армении и запуск кампании по защите барельефов стадиона «Динамо».</p>
          </div>
          <span className="t-tag">Preservation</span>
        </div>

        <div className="t-card blue">
          <div>
            <div className="t-year">2021</div>
            <h3>Азбука &amp; NFT-релиз</h3>
            <p>Выставка графики 1931 года в Cube и выпуск цифровой 3D-модели маски Ленина в блокчейн-формате.</p>
          </div>
          <span className="t-tag">Reinterpretation</span>
        </div>

        <div className="t-card sig">
          <div>
            <div className="t-year">2023</div>
            <h3>Открытие на ВТБ Арене</h3>
            <p>Торжественное открытие постоянного экспозиционного пространства барельефов Сергея Меркурова в Москве.</p>
          </div>
          <span className="t-tag">Restoration</span>
        </div>

        <div className="t-card">
          <div>
            <div className="t-year">2026</div>
            <h3>Синтез &amp; Публикации</h3>
            <p>Выход мемуаров «UNFRAMED», объединение музейного опыта, аналитики цифровой среды и арт-рынка.</p>
          </div>
          <span className="t-tag">Contemporary Arc</span>
        </div>
      </section>

      {/* БЛОК 5: САММАРИ */}
      <div className="section-wrap">
        <div className="section-header">
          <h2>Институциональное саммари</h2>
          <span>Methodology &amp; Impact</span>
        </div>
      </div>

      <section className="summary-box">
        <div className="summary-content">
          <div>
            <h3>Живой материал вместо мемориальной пыли</h3>
            <p>На примере многолетнего опыта доказано, что фамильное наследие может существовать не как музейный экспонат под стеклом, а как динамичная система смыслов.</p>
            <p>Соединение академического архивного аудита, гражданской защиты памятников и передовых цифровых технологий формирует уникальную модель работы с культурной памятью без упрощения и спекуляций.</p>
          </div>
          <div className="summary-pillars">
            <div className="summary-pill">Физическая сохранность <span>01</span></div>
            <div className="summary-pill">Архивный аудит <span>02</span></div>
            <div className="summary-pill">Гражданская защита <span>03</span></div>
            <div className="summary-pill">Цифровой суверенитет <span>04</span></div>
          </div>
        </div>
      </section>

      <footer>
        <div>Anton Merkurov · Heritage &amp; Media Dossier</div>
        <div>
          <a href="https://merkurov.love/azbuka/" target="_blank" rel="noreferrer">merkurov.love/azbuka</a>
        </div>
      </footer>
    </>
  );
}
