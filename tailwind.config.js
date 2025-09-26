/** @type {import('tailwindcss').Config} */
module.exports = {
  // Оптимизированный массив content для App Router
  content: [
    "./{app,components}/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: '#2563eb', // Твой кастомный цвет
      },
    },
  },
  darkMode: 'class',
  safelist: [
    // Оставьте safelist пустым или добавьте классы, которые генерируются динамически
  ],
  plugins: [require('@tailwindcss/typography')],
};
