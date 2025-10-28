// lib/umami.ts
// Утилита для вставки Umami analytics в Next.js (app router)

interface UmamiScriptProps {
  websiteId?: string;
}

export function UmamiScript({ websiteId }: UmamiScriptProps) {
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
