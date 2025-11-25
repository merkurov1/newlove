import { createClient } from '@supabase/supabase-js'
import { notFound } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'

// Инициализация Supabase для серверного компонента
// (Используем публичный ключ для чтения, если включен RLS на чтение для всех)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export const runtime = 'edge' // Для скорости (или nodejs, если будут ошибки с базой)

// Функция получения полного URL картинки
const getImageUrl = (path: string | null) => {
  if (!path) return null
  const { data } = supabase.storage.from('artifacts').getPublicUrl(path)
  return data.publicUrl
}

export default async function LotPage({ params }: { params: { id: string } }) {
  // 1. Загружаем данные из "Сейфа"
  const { data: lot, error } = await supabase
    .from('lots')
    .select('*')
    .eq('id', params.id)
    .single()

  if (error || !lot) {
    return notFound()
  }

  const imageUrl = getImageUrl(lot.image_path)
  
  // Достаем текст для сайта из JSON, который сгенерил Gemini
  // Предполагаем, что в ai_content лежит объект { website_formatted: "..." }
  // Если там сырой текст, нужно адаптировать.
  const content = lot.ai_content?.website_formatted || "No analysis data available."

  // Разбиваем текст на параграфы для красивой верстки
  const paragraphs = content.split('\n').filter((p: string) => p.trim().length > 0)

  return (
    <div className="min-h-screen bg-[#050505] text-[#e0e0e0] font-sans selection:bg-white selection:text-black">
      
      {/* HEADER: LOGO / NAV */}
      <nav className="fixed top-0 w-full p-6 flex justify-between items-center z-50 mix-blend-difference">
        <Link href="/" className="uppercase tracking-[0.2em] text-xs font-bold">Merkurov.love</Link>
        <div className="text-xs tracking-widest opacity-50">ARCHIVE REF: {lot.id.slice(0, 8)}</div>
      </nav>

      <main className="max-w-4xl mx-auto pt-20 pb-32 px-6">
        
        {/* 1. THE ARTIFACT (Image) */}
        <div className="relative w-full aspect-[4/5] md:aspect-[16/10] mb-16 grayscale hover:grayscale-0 transition-all duration-700 ease-in-out">
          {imageUrl ? (
            <Image 
              src={imageUrl} 
              alt={lot.title} 
              fill 
              className="object-contain" // object-contain чтобы видеть целиком, cover - чтобы заполнить
              priority
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center border border-gray-800 bg-zinc-900">
              <span className="text-xs tracking-widest">NO VISUAL DATA</span>
            </div>
          )}
        </div>

        {/* 2. THE GRANITE (Meta Data) */}
        <header className="text-center mb-16 space-y-4 border-b border-gray-900 pb-12">
            <h1 className="text-3xl md:text-5xl font-serif tracking-tight text-white">
                {lot.artist}
            </h1>
            <h2 className="text-xl md:text-2xl text-gray-400 font-serif italic">
                {lot.title} {lot.year ? `(${lot.year})` : ''}
            </h2>
            
            <div className="flex justify-center gap-8 text-xs font-mono uppercase tracking-widest text-gray-500 mt-8">
                <div>{lot.medium}</div>
                <div>{lot.dimensions}</div>
            </div>
        </header>

        {/* 3. THE VOICE (Analysis) */}
        <article className="prose prose-invert prose-lg mx-auto font-serif leading-relaxed text-gray-300">
            {/* Рендерим текст, сохраняя переносы строк */}
            <div className="whitespace-pre-wrap">
                {content}
            </div>
        </article>

        {/* 4. THE NUMBERS (Footer Stats) */}
        <div className="mt-24 border-t border-gray-900 pt-12 grid grid-cols-1 md:grid-cols-2 gap-8 font-mono text-sm">
            <div className="space-y-4">
                <h3 className="uppercase text-gray-600 tracking-widest text-xs">Provenance</h3>
                <p className="text-gray-400 leading-relaxed text-xs">
                    {lot.provenance || "Strictly confidential."}
                </p>
            </div>
            
            <div className="space-y-4 md:text-right">
                <h3 className="uppercase text-gray-600 tracking-widest text-xs">Market Estimate</h3>
                <div className="text-xl text-white">{lot.estimate || "Upon Request"}</div>
                
                {/* Кнопка действия */}
                <div className="pt-8">
                    <a 
                        href={`https://t.me/antomerkurov?text=I want to discuss lot ${lot.id}`}
                        target="_blank"
                        className="inline-block border border-white px-8 py-3 text-xs uppercase tracking-[0.2em] hover:bg-white hover:text-black transition-colors"
                    >
                        Acquire / Discuss
                    </a>
                </div>
            </div>
        </div>

      </main>
    </div>
  )
}