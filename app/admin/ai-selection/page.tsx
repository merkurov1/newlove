'use client'
import { useState } from 'react'
import Image from 'next/image'

export default function CuratorTool() {
  // Добавили image_url в стейт
  const [input, setInput] = useState({ artist: '', title: '', link: '', raw: '', image_url: '', specs: {} as any })
  const [output, setOutput] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [saving, setSaving] = useState(false)

  // 1. ПАРСИНГ
  const handleAutoParse = async () => {
    if (!input.link) return alert('Paste link')
    setParsing(true)
    try {
        const res = await fetch('/api/admin/parse-url', {
            method: 'POST',
            body: JSON.stringify({ url: input.link })
        })
        const data = await res.json()
        
        setInput(prev => ({
            ...prev,
            artist: data.artist || prev.artist,
            title: data.title || prev.title,
            image_url: data.image_url || '', // Парсер должен вернуть это
            specs: {
                medium: data.medium,
                dimensions: data.dimensions,
                estimate: data.estimate,
                date: data.date,
                provenance: data.provenance
            },
            raw: `Medium: ${data.medium}\nDimensions: ${data.dimensions}\nEstimate: ${data.estimate}\nDate: ${data.date}\n\nProvenance:\n${data.provenance}\n\nOriginal Description:\n${data.raw_description}`
        }))
    } catch (e) { alert('Parse failed') } 
    finally { setParsing(false) }
  }

  // 2. ГЕНЕРАЦИЯ (Без изменений)
  const generate = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/generate_lot', {
        method: 'POST',
        body: JSON.stringify({
            artist: input.artist,
            title: input.title,
            link: input.link,
            rawText: input.raw
        })
      })
      const data = await res.json()
      setOutput(data)
    } catch (e) { alert('Gen failed') } 
    finally { setLoading(false) }
  }

  // 3. СОХРАНЕНИЕ (НОВОЕ)
  const saveToVault = async () => {
    if (!output) return alert('Generate content first')
    setSaving(true)
    try {
        const res = await fetch('/api/admin/save-lot', {
            method: 'POST',
            body: JSON.stringify({
                ...input,
                ...input.specs, // Разворачиваем спеки
                ai_content: output
            })
        })
        const data = await res.json()
        if (data.success) {
            alert(`Lot Saved! ID: ${data.id}`)
        } else {
            throw new Error('API Error')
        }
    } catch (e) {
        alert('Save Failed')
    } finally {
        setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-black text-white font-mono p-8 grid md:grid-cols-2 gap-8">
      {/* ЛЕВАЯ КОЛОНКА */}
      <div className="space-y-6 border-r border-gray-800 pr-8">
        <h1 className="text-xl tracking-widest text-gray-500">THE CURATOR ENGINE</h1>
        
        <div className="flex gap-2">
            <input 
              placeholder="Auction URL" 
              className="w-full bg-zinc-900 p-3 border border-gray-700"
              value={input.link}
              onChange={e => setInput({...input, link: e.target.value})}
            />
            <button onClick={handleAutoParse} disabled={parsing} className="bg-blue-900 px-4 text-xs hover:bg-blue-800">
                {parsing ? '...' : 'PARSE'}
            </button>
        </div>

        {/* ПРЕДПРОСМОТР КАРТИНКИ (ЕСЛИ НАШЛИ) */}
        {input.image_url && (
            <div className="relative h-48 w-full bg-zinc-900 border border-gray-800 overflow-hidden">
                <img src={input.image_url} className="object-contain w-full h-full opacity-80" alt="Preview" />
                <div className="absolute bottom-0 right-0 bg-black text-xs px-2 py-1 text-green-500">IMAGE FOUND</div>
            </div>
        )}

        <div className="grid grid-cols-2 gap-4">
            <input placeholder="Artist" className="bg-zinc-900 p-3 border border-gray-700" value={input.artist} onChange={e => setInput({...input, artist: e.target.value})} />
            <input placeholder="Title" className="bg-zinc-900 p-3 border border-gray-700" value={input.title} onChange={e => setInput({...input, title: e.target.value})} />
        </div>
        
        <textarea placeholder="Raw Data..." className="w-full h-64 bg-zinc-900 p-3 border border-gray-700 text-xs" value={input.raw} onChange={e => setInput({...input, raw: e.target.value})} />
        
        <button onClick={generate} disabled={loading} className="w-full bg-white text-black py-3 hover:bg-gray-200 font-bold">
            {loading ? 'SYNTHESIZING...' : 'GENERATE ASSETS'}
        </button>
      </div>

      {/* ПРАВАЯ КОЛОНКА */}
      <div className="space-y-8 overflow-y-auto h-screen pb-20">
        {output && (
            <>
                <div className="border border-green-900/50 p-4 bg-green-900/10">
                    <button 
                        onClick={saveToVault} 
                        disabled={saving}
                        className="w-full bg-green-700 text-white py-3 tracking-widest hover:bg-green-600 flex justify-center items-center gap-2"
                    >
                        {saving ? 'ENCRYPTING...' : '💾 SAVE TO VAULT'}
                    </button>
                </div>

                <div className="border border-gray-800 p-6 bg-zinc-900/30">
                    <h3 className="text-green-500 text-xs mb-4">WEBSITE</h3>
                    <div className="text-sm whitespace-pre-wrap text-gray-300 font-serif">{output.website_formatted}</div>
                </div>
                {/* Остальные блоки (Telegram, Socials) ... */}
            </>
        )}
      </div>
    </div>
  )
}