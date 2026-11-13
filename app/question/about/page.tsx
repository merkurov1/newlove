import type { Metadata } from 'next';
import Link from 'next/link';

import { questionAboutMetadata } from '@/lib/question/metadata';
import styles from '@/components/question/question.module.css';

export const metadata: Metadata = questionAboutMetadata;

export default function QuestionAboutPage() {
  return (
    <main className={styles.page}>
      <div className={styles.inner}>
        <header className={styles.masthead}>
          <span className={styles.kicker}>Question</span>
          <Link href="/question" className={styles.mastheadLink}>
            К вопросу
          </Link>
        </header>

        <article className={styles.about}>
          <h1 className={styles.aboutTitle}>О проекте</h1>

          <p className={styles.aboutLead}>
            Question — это небольшое пространство, где все смотрят на один и тот же вопрос и
            отвечают на него своими словами. Не репликой в ленте, не голосованием, не реакцией.
            Текстом, в котором есть мысль, опыт и пауза.
          </p>

          <section className={styles.aboutSection} aria-labelledby="about-human-answers">
            <h2 id="about-human-answers" className={styles.aboutSectionTitle}>
              Почему человеческие ответы
            </h2>
            <p className={styles.aboutText}>
              Быстрые реакции хорошо показывают настроение, но почти ничего не говорят о том, как
              человек думает. Здесь важен именно сформулированный ответ. Поэтому у вопроса нет
              лайков и рейтинга: сравнивать нужно не популярность, а смысл. Ответ должен быть не
              короче двадцати пяти слов, и на один вопрос можно ответить только один раз.
            </p>
          </section>

          <section className={styles.aboutSection} aria-labelledby="about-pierrot">
            <h2 id="about-pierrot" className={styles.aboutSectionTitle}>
              Как появляется ответ Пьеро
            </h2>
            <p className={styles.aboutText}>
              Когда человеческие ответы появляются, Пьеро читает весь корпус. Он находит
              повторяющиеся мотивы, замечает противоречия и единичные позиции, отличает то, что
              действительно звучит у многих, от того, что сказано один раз. Затем он формулирует
              собственный синтез — не пересказ и не сумму мнений, а авторский текст, который думает
              вместе с людьми и честно говорит, если данных мало.
            </p>
            <p className={styles.aboutText}>
              Пьеро обновляет ответ, когда меняется корпус человеческих ответов. Если никто ещё не
              ответил, он молчит. При открытии страницы модель не вызывается: вы читаете то, что уже
              сохранено.
            </p>
          </section>

          <section className={styles.aboutSection} aria-labelledby="about-privacy">
            <h2 id="about-privacy" className={styles.aboutSectionTitle}>
              Почему ответы остаются приватными
            </h2>
            <p className={styles.aboutText}>
              Чужие ответы не показываются. Другие посетители не видят ни ваш текст, ни имена, ни
              профили. В синтезе могут появиться короткие цитаты, но только как смысловая опора —
              без автора и без деталей, по которым человека можно узнать.
            </p>
            <p className={styles.aboutText}>
              Это не социальная сеть и не форум. Здесь нет ленты, комментариев, рейтингов и
              подписок. Ответ остаётся разговором с вопросом, а не публикацией.
            </p>
          </section>

          <p className={styles.aboutClosing}>
            Вопрос выбирается случайно: при обновлении страницы появляется другой. Вход нужен только
            для того, чтобы ответить; смотреть и читать можно без регистрации. Всё остальное
            намеренно просто: один вопрос, ваш ответ, ответ Пьеро.
          </p>
        </article>
      </div>
    </main>
  );
}
