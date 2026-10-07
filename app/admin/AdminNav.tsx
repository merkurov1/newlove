const navItems = [
  { href: '/admin', label: 'Dashboard', icon: '01' },
  { href: '/admin/items', label: 'Items', icon: '02' },
  { href: '/admin/items/new', label: 'New Post', icon: '03' },
  { href: '/flow', label: 'Flow', icon: '04' },
  { href: '/admin/letters', label: 'Letters', icon: '05' },
  { href: '/admin/users', label: 'Users', icon: '06' },
  { href: '/admin/selection', label: 'Selection', icon: '07' },
  { href: '/admin/projects', label: 'Projects', icon: '08' },
  { href: '/admin/postcards', label: 'Postcards', icon: '09' },
  { href: '/admin/media', label: 'Media', icon: '10' },
];

export default function AdminNav() {
  const pathname = usePathname();
  const isActive = (href: string) => href === '/admin' ? pathname === href : Boolean(pathname?.startsWith(href));

  return (
    <aside className="w-full lg:w-64 lg:shrink-0">
      <div className="lg:sticky lg:top-28 space-y-4">
        <div className="hidden lg:block rounded-3xl border border-zinc-200/80 bg-white/80 p-6 shadow-sm backdrop-blur-xl">
          <Link href="/" className="block font-serif text-2xl tracking-tight text-zinc-900 hover:opacity-70 transition-opacity">
            merkurov<span className="text-zinc-400">.love</span>
          </Link>
          <div className="mt-2 font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-400">Private workspace</div>
        </div>

        <nav className="rounded-3xl border border-zinc-200/80 bg-white/80 p-2 shadow-sm backdrop-blur-xl">
          <div className="flex gap-1 overflow-x-auto lg:block lg:space-y-1 scrollbar-none">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`group flex min-w-max items-center gap-3 rounded-2xl px-4 py-3 font-mono text-[11px] uppercase tracking-[0.12em] transition-all lg:w-full ${
                  isActive(item.href) ? 'bg-zinc-900 text-white shadow-sm' : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900'
                }`}
              >
                <span className={`text-[10px] ${isActive(item.href) ? 'text-zinc-300' : 'text-zinc-400 group-hover:text-zinc-600'}`}>{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            ))}
          </div>
        </nav>

        <div className="hidden lg:block rounded-3xl border border-zinc-200/80 bg-zinc-900 p-5 text-white shadow-sm">
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-400">Public site</div>
          <Link href="/flow" className="mt-3 block font-serif text-lg hover:text-zinc-300 transition-colors">Open flow →</Link>
        </div>
      </div>
    </aside>
  );
}
