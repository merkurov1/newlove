module.exports = {
  plugins: {
    // Enable CSS nesting support before Tailwind so third-party packages
    // (like Swiper) that use nested rules compile correctly.
    'postcss-nesting': {},
    tailwindcss: {},
    autoprefixer: {},
  },
};