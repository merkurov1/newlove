/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  safelist: [
    'prose',
    'prose-lg',
    'prose-xl',
    'gallery-grid',
    'not-prose',
    'animate-fade-in-up',
  ],
  theme: {
    extend: {
      colors: {
        primary: '#2563eb',
        "rose-50-custom": '#fff0f6',
        "pink-50-soft": '#fff7fb',
        brand: {
          50: '#fff5f7',
          100: '#ffe9f0',
          200: '#ffcee2',
          300: '#f9a8d4',
          400: '#f472b6',
          500: '#ec4899',
          600: '#db2777',
          700: '#be185d',
        }
      },
      // --- НОВЫЙ БЛОК ДЛЯ НАСТРОЙКИ ТИПОГРАФИКИ ---
      typography: ({ theme }) => ({
        DEFAULT: {
          css: {
            '--tw-prose-body': theme('colors.gray[700]'),
            '--tw-prose-headings': theme('colors.gray[900]'),
            '--tw-prose-lead': theme('colors.gray[600]'),
            '--tw-prose-links': theme('colors.primary'),
            '--tw-prose-bold': theme('colors.gray[900]'),
            '--tw-prose-counters': theme('colors.gray[500]'),
            '--tw-prose-bullets': theme('colors.gray[300]'),
            '--tw-prose-hr': theme('colors.gray[200]'),
            '--tw-prose-quotes': theme('colors.gray[900]'),
            '--tw-prose-quote-borders': theme('colors.gray[200]'),
            '--tw-prose-captions': theme('colors.gray[500]'),
            '--tw-prose-code': theme('colors.gray[900]'),
            '--tw-prose-pre-code': theme('colors.gray[200]'),
            '--tw-prose-pre-bg': theme('colors.gray[800]'),
            '--tw-prose-th-borders': theme('colors.gray[300]'),
            '--tw-prose-td-borders': theme('colors.gray[200]'),
            
            // Убираем кавычки у цитат
            'blockquote p:first-of-type::before': { content: 'none' },
            'blockquote p:first-of-type::after': { content: 'none' },
          },
        },
      }),
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        float: {
          '0%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-8px)' },
          '100%': { transform: 'translateY(0px)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        gradientMove: {
          '0%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
          '100%': { backgroundPosition: '0% 50%' },
        },
      },
      animation: {
        fadeIn: 'fadeIn 400ms ease-out forwards',
        'fade-in-up': 'fadeIn 400ms cubic-bezier(.16,.84,.24,1) forwards',
        float: 'float 6s ease-in-out infinite',
        shimmer: 'shimmer 1.6s linear infinite',
        gradientMove: 'gradientMove 8s ease infinite',
      },
      backgroundImage: {
        'soft-gradient': 'linear-gradient(135deg, rgba(254, 215, 232, 0.6), rgba(237, 85, 156, 0.6))',
        'glass-shimmer': 'linear-gradient(90deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.12) 50%, rgba(255,255,255,0.06) 100%)'
      }
    },
  },
  darkMode: 'class',
  plugins: [require('@tailwindcss/typography')],
};
