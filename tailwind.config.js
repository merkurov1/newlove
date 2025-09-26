/** @type {import('tailwindcss').Config} */
module.exports = {
  // ФИНАЛЬНЫЙ ФИКС: Явно указываем пути и добавляем safelist для Prose
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    // Добавьте сюда любые другие папки, где вы используете классы Tailwind
  ],
  theme: {
    extend: {
      colors: {
        primary: '#2563eb', // Твой кастомный цвет
      },
    },
  },
  darkMode: 'class',
  // САМЫЙ КРИТИЧНЫЙ ШАГ: Принудительно сохраняем все классы Typography, 
  // чтобы Vercel их не удалил.
  safelist: [
    {
      pattern: /prose-?(.+)?/,
      variants: ['sm', 'md', 'lg', 'xl', '2xl'],
    },
    'prose',
    'prose-lg',
  ],
  plugins: [require('@tailwindcss/typography')],
};

