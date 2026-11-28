import Link from 'next/link';

import { sanitizeMetadata } from '@/lib/metadataSanitize';
import { requireAdmin } from '@/lib/serverAuth';

export const dynamic = 'force-dynamic';

export const metadata = sanitizeMetadata({
  robots: { index: false, follow: false },
  title: 'Integrations',
});

const integrations = [
  {
    href: '/admin/integrations/telegram-instant-view',
    title: 'Telegram Instant View',
    description:
      'Официальная сессия редактора, состояние подключения и проверка шаблона/rhash для публичных Flow публикаций.',
  },
];

export default async function IntegrationsPage() {
  await requireAdmin();

  return (
    <div className="space-y-8">
      <header className="border-b border-[#D9D3CD] pb-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#990F3D]">
          Owner only
        </p>
        <h1 className="mt-2 font-serif text-3xl tracking-tight text-[#211F1F] sm:text-4xl">
          Integrations
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[#746D66]">
          Серверные подключения к внешним сервисам. Секреты и сессии остаются на сервере и не
          отображаются в браузере.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        {integrations.map((integration) => (
          <Link
            key={integration.href}
            href={integration.href}
            className="group border border-[#D9D3CD] bg-white p-5 transition hover:border-[#990F3D]"
          >
            <div className="flex items-start justify-between gap-3">
              <h2 className="font-serif text-xl text-[#211F1F] group-hover:text-[#990F3D]">
                {integration.title}
              </h2>
              <span className="text-[#A29B94] group-hover:text-[#990F3D]">↗</span>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-[#746D66]">{integration.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
