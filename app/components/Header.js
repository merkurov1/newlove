// app/components/Header.js
export default function Header({ pages, settings }) {
  const site_name = settings?.site_name || 'Anton Merkurov';
  return (
    <header className="bg-gray-800 text-white p-4">
      <h1>{site_name}</h1>
      <nav>
        {pages.map((page) => (
          <a key={page.id} href={`/projects/${page.slug}`} className="mr-4">
            {page.title}
          </a>
        ))}
      </nav>
    </header>
  );
}