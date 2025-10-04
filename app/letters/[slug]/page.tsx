import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import AuthGuard from '@/components/AuthGuard';
import Link from 'next/link';

interface Letter {
  id: string;
  title: string;
  slug: string;
  content: string;
  publishedAt: string;
  createdAt: string;
  author: {
    name: string;
    email: string;
  };
}

// Моковые данные для демонстрации (замените на API запрос)
const mockLetters: Letter[] = [
  {
    id: '1',
    title: 'Добро пожаловать в мир авторских открыток',
    slug: 'dobro-pozhalovat-v-mir-avtorskih-otkrytok',
    content: `
      <h2>Дорогие читатели!</h2>
      
      <p>Рад приветствовать вас в новом разделе нашего сайта — <strong>Letters</strong>. Здесь будут собираться все мои письма, размышления и анонсы новых проектов.</p>
      
      <p>Сегодня хочу поделиться с вами особенным проектом — коллекцией авторских открыток. Каждая открытка создается вручную, с особым вниманием к деталям и атмосфере.</p>
      
      <h3>Что делает эти открытки особенными?</h3>
      
      <ul>
        <li><strong>Уникальный дизайн</strong> — каждая открытка создается индивидуально</li>
        <li><strong>Качественные материалы</strong> — используем только лучшую бумагу</li>
        <li><strong>Персонализация</strong> — можете добавить свое сообщение</li>
        <li><strong>Международная доставка</strong> — отправляем по всему миру</li>
      </ul>
      
      <p>В следующих письмах расскажу больше о процессе создания и поделюсь историями, которые вдохновляют на новые работы.</p>
      
      <p>С теплотой,<br>Антон</p>
    `,
    publishedAt: '2024-10-01T10:00:00Z',
    createdAt: '2024-10-01T10:00:00Z',
    author: {
      name: 'Anton Merkurov',
      email: 'anton@merkurov.com'
    }
  },
  {
    id: '2',
    title: 'Процесс создания: от идеи до открытки',
    slug: 'process-sozdaniya-ot-idei-do-otkrytki',
    content: `
      <h2>За кулисами творчества</h2>
      
      <p>Многие спрашивают, как рождаются идеи для открыток. Сегодня приоткрою завесу тайны творческого процесса.</p>
      
      <h3>Этап 1: Вдохновение</h3>
      <p>Все начинается с момента. Это может быть:</p>
      <ul>
        <li>Утренний свет, падающий на стену</li>
        <li>Случайная встреча на улице</li>
        <li>Строчка из книги</li>
        <li>Мелодия, которая задела за живое</li>
      </ul>
      
      <h3>Этап 2: Скетч</h3>
      <p>Идея всегда начинается с быстрого наброска. Иногда это просто пятно или линия, но в них уже живет будущая открытка.</p>
      
      <h3>Этап 3: Воплощение</h3>
      <p>Самый долгий и кропотливый этап. Здесь важен каждый штрих, каждый оттенок.</p>
      
      <p>Каждая открытка — это маленькая история, которую я хочу рассказать миру.</p>
      
      <p>До встречи в следующем письме!</p>
    `,
    publishedAt: '2024-09-15T14:30:00Z',
    createdAt: '2024-09-15T14:30:00Z',
    author: {
      name: 'Anton Merkurov',
      email: 'anton@merkurov.com'
    }
  },
  {
    id: '3',
    title: 'Искусство персонализации: делаем открытки особенными',
    slug: 'iskusstvo-personalizatsii-delaem-otkrytki-osobennymi',
    content: `
      <h2>Личное прикосновение к каждой открытке</h2>
      
      <p>Что превращает обычную открытку в особенную? Персонализация — вот секрет, который делает каждую работу уникальной.</p>
      
      <h3>Индивидуальные сообщения</h3>
      <p>Каждое сообщение, которое вы добавляете к открытке, становится частью ее истории. Это может быть:</p>
      <ul>
        <li>Поздравление с особенной датой</li>
        <li>Признание в любви</li>
        <li>Слова поддержки в трудный момент</li>
        <li>Просто теплые пожелания</li>
      </ul>
      
      <h3>Особенная каллиграфия</h3>
      <p>Каждое сообщение пишется от руки, что добавляет человечности в наш цифровой мир.</p>
      
      <h3>Выбор цветовой палитры</h3>
      <p>В зависимости от повода и настроения, я подбираю цвета, которые лучше всего передадут ваши чувства.</p>
      
      <p>Помните: открытка — это не просто картинка, это способ передать частичку души.</p>
      
      <p>С уважением,<br>Антон</p>
    `,
    publishedAt: '2024-09-01T12:00:00Z',
    createdAt: '2024-09-01T12:00:00Z',
    author: {
      name: 'Anton Merkurov',
      email: 'anton@merkurov.com'
    }
  }
];

async function getLetter(slug: string): Promise<Letter | null> {
  // В реальном проекте здесь будет API запрос к базе данных
  // const letter = await prisma.letter.findUnique({
  //   where: { slug },
  //   include: { author: true }
  // });
  
  // Пока используем моковые данные
  return mockLetters.find(letter => letter.slug === slug) || null;
}

export default async function LetterPage({ params }: { params: { slug: string } }) {
  const letter = await getLetter(params.slug);

  if (!letter) {
    notFound();
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('ru-RU', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <AuthGuard>
      <div className="min-h-screen bg-gray-50">
        <div className="container mx-auto px-4 py-8">
          <div className="max-w-4xl mx-auto">
            {/* Навигация */}
            <nav className="mb-8">
              <Link 
                href="/letters" 
                className="inline-flex items-center text-blue-600 hover:text-blue-700 font-medium"
              >
                ← Вернуться к письмам
              </Link>
            </nav>

            {/* Содержимое письма */}
            <article className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              {/* Заголовок */}
              <header className="px-6 py-8 border-b border-gray-200">
                <h1 className="text-3xl font-bold text-gray-900 mb-4">
                  {letter.title}
                </h1>
                <div className="flex items-center justify-between text-sm text-gray-600">
                  <div className="flex items-center gap-4">
                    <span>✍️ {letter.author.name}</span>
                  </div>
                  <time dateTime={letter.publishedAt || letter.createdAt}>
                    {formatDate(letter.publishedAt || letter.createdAt)}
                  </time>
                </div>
              </header>

              {/* Основной контент */}
              <div className="px-6 py-8">
                <div 
                  className="prose prose-lg max-w-none prose-headings:text-gray-900 prose-p:text-gray-700 prose-ul:text-gray-700 prose-strong:text-gray-900"
                  dangerouslySetInnerHTML={{ __html: letter.content }}
                />
              </div>

              {/* Подвал */}
              <footer className="px-6 py-6 bg-gray-50 border-t border-gray-200">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-gray-600">
                    Понравилось письмо? Поделитесь с друзьями!
                  </div>
                  <div className="flex gap-2">
                    <button className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm">
                      Поделиться
                    </button>
                  </div>
                </div>
              </footer>
            </article>

            {/* Навигация по соседним письмам */}
            <div className="mt-8 flex justify-between">
              <div className="text-sm text-gray-500">
                {/* TODO: Добавить навигацию к предыдущему/следующему письму */}
              </div>
              <Link 
                href="/letters" 
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors text-sm"
              >
                Все письма
              </Link>
            </div>
          </div>
        </div>
      </div>
    </AuthGuard>
  );
}