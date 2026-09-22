import HeartPhysics from '@/components/HeartPhysics';

export default function Home() {
  // Прямые публичные ссылки на файлы в Supabase Storage
  const daemonUrl = 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/Daemon.png';
  const heartUrl = 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/Heart1.png';

  return (
    <main>
      <HeartPhysics daemonUrl={daemonUrl} heartUrl={heartUrl} />
    </main>
  );
}
