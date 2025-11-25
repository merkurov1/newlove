import { createClient } from '@supabase/supabase-js'
import { notFound } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'

// Отключаем кеширование, чтобы всегда видеть свежие правки (особенно если ты меняешь статус)
export const revalidate = 0

// Инициализация Supabase
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Вспомогательная функция для получения публичной ссылки на картинку
const getImageUrl = (path: string | null) => {
  if (!path) return null
  // Если это внешний URL (например, мы не скачали, а сохранили ссылку), возвращаем как есть
  if (path.startsWith('http')) return path
  
  // Если это путь в нашем Storage
  const { data } = supabase.storage.from('artifacts').getPublicUrl(path)
  return data.publicUrl
}

export default async function LotPage({ params }: { params: { id: string } }) {
  const { id } = params
  
  console.log(`[LotPage] Loading ID: ${id}`) // ЛОГ 1: Проверка ID

  // 1. Загружаем данные из базы
  const { data: lot, error } = await supabase
    .from('lots')
    .select('*')
    .eq('id', id)
    .single()

  // ОБРАБОТКА ОШИБОК
  if (error) {
    console.error('[LotPage] DB Error:', error) // ЛОГ 2: Если ошибка доступа или базы
    return (
      <div className="min-h-screen bg-black text-red-500 font-mono flex items-center justify-center p-8">
        <div>
           <h1 className="text-2xl mb-4">ACCESS DENIED / ERROR</h1>
           <p className="text-xs text-gray-500">{error.message}</p>
           <p className="text-xs text-gray-700 mt-4">Code: {error.code}</p>
        </div>
      </div>
    )
  }

  if (!lot) {
    console.error('[LotPage] Not Found in DB') // ЛОГ 3: Если записи нет
    return notFound()
  }

  // 2. Подготовка контента
  const imageUrl = getImageUrl(lot.image_path)
  
  // Достаем текст. Если ai_content пустой, ставим заглушку.
  const aiData = lot.ai_content || {}
  const mainText = aiData.website_formatted || lot.raw_description || "Description confidential."

  return (
    <div className="min-h-screen bg-[#050505] text-[#e0e0e0] font-sans selection:bg-white selection:text-black">
      
      {/* NAVIGATION */}
      <nav className="fixed top-0 w-full p-6 flex justify-between items-center z-50 mix-blend-difference opacity-80 hover:opacity-100 transition-opacity">
        <Link href="/" className="uppercase tracking-[0.2em] text-[10px] md:text-xs font-bold border border-transparent hover:border-white px-2 py-1 transition-all">
          Merkurov.love
        </Link>
        <div className="text-[10px] md:text-xs tracking-widest font-mono">
            LOT: {lot.id.slice(0, 8).toUpperCase()}
        </div>
      </nav>

      <main className="max-w-5xl mx-auto pt-24 pb-32 px-6 md:px-12">
        
        {/* 1. THE VISUAL (IMAGE) */}
        <div className="relative w-full aspect-[3/4] md:aspect-[16/10] mb-12 md:mb-20 bg-zinc-900 group">
          {imageUrl ? (
            <Image 
              src={imageUrl} 
              alt={lot.title} 
              fill 
              className="object-contain md:object-cover transition-all duration-1000 ease-in-out grayscale group-hover:grayscale-0"
              priority
              sizes="(max-width: 768px) 100vw, 80vw"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center border border-gray-800">
              <span className="text-xs tracking-widest text-gray-600">IMAGE REDACTED</span>
            </div>
          )}
        </div>

        {/* 2. THE META (HEADER) */}
        <header className="text-center mb-16 space-y-6 border-b border-gray-900 pb-12 max-w-3xl mx-auto">
            <h1 className="text-3xl md:text-6xl font-serif tracking-tight text-white leading-tight">
                {lot.artist}
            </h1>
            <h2 className="text-lg md:text-2xl text-gray-400 font-serif italic font-light">
                {lot.title} <span className="text-gray-600 not-italic text-sm ml-2">{lot.year}</span>
            </h2>
            
            <div className="flex flex-wrap justify-center gap-4 md:gap-8 text-[10px] md:text-xs font-mono uppercase tracking-[0.15em] text-gray-500 mt-8">
                <div className="border border-gray-800 px-3 py-1 rounded-full">{lot.medium || 'Medium n/a'}</div>
                <div className="border border-gray-800 px-3 py-1 rounded-full">{lot.dimensions || 'Dim n/a'}</div>
            </div>
        </header>

        {/* 3. THE NARRATIVE (TEXT) */}
        <article className="prose prose-invert prose-lg md:prose-xl mx-auto font-serif leading-relaxed text-gray-300 max-w-2xl mb-24">
            <div className="whitespace-pre-wrap opacity-90 hover:opacity-100 transition-opacity">
                {mainText}
            </div>
        </article>

        {/* 4. THE MARKET (FOOTER) */}
        <div className="border-t border-gray-800 pt-12">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-12 font-mono text-sm max-w-4xl mx-auto">
                
                {/* Левая колонка: Провенанс */}
                <div className="space-y-4">
                    <h3 className="uppercase text-gray-600 tracking-widest text-[10px]">History / Provenance</h3>
                    <p className="text-gray-400 leading-relaxed text-xs border-l border-gray-800 pl-4">
                        {lot.provenance || "Provenance data is strictly confidential or currently under review."}
                    </p>
                </div>
                
                {/* Правая колонка: Цена и Действие */}
                <div className="space-y-6 md:text-right flex flex-col items-start md:items-end">
                    <div>
                        <h3 className="uppercase text-gray-600 tracking-widest text-[10px] mb-2">Estimate</h3>
                        <div className="text-2xl md:text-3xl text-white font-serif">{lot.estimate || "On Request"}</div>
                    </div>
                    
                    <a 
                        href={`https://t.me/antomerkurov?text=Interested in Lot Ref: ${lot.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-3 bg-white text-black px-8 py-4 text-xs font-bold uppercase tracking-[0.2em] hover:bg-gray-200 transition-colors"
                    >
                        <span>Acquire Object</span>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="7" y1="17" x2="17" y2="7"></line><polyline points="7 7 17 7 17 17"></polyline></svg>
                    </a>
                </div>
            </div>
        </div>

      </main>
      
      {/* FOOTER DECOR */}
      <footer className="w-full text-center py-8 text-[10px] text-gray-800 uppercase tracking-widest">
         Merkurov Digital Estate © 2025
      </footer>
    </div>
  )
}