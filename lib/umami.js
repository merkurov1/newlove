// lib/umami.js
// Утилита для вставки Umami analytics в Next.js (app router)

export function UmamiScript({ websiteId }) {
  if (!websiteId) return null;
  return (
    <script
      async
      defer
      data-website-id={websiteId}
      src="https://analytics.umami.is/script.js"
    />
  );
}
